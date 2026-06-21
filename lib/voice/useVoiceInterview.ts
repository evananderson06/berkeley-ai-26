'use client'

// Orchestrates the voice interview: mic → Deepgram STT (raw WS) → existing /api/interview
// → Deepgram Aura TTS (raw WS), with volume-threshold barge-in. The transcript is kept as
// Message[] and persisted to localStorage exactly like the text interview, so
// /api/generate-feedback is unchanged. State: idle → connecting → listening → thinking →
// speaking → listening, plus 'paused'. start() resumes (no reset) when a transcript exists.
// (CONTEXT.md §17.3)

import { useCallback, useEffect, useRef, useState } from 'react'
import { Candidate, Message } from '@/types'
import { VOICE, VoiceState, voiceForCandidate } from './config'
import { createMic, MicController } from './mic'
import { startStt, SttSession } from './stt'
import { createTts, TtsController } from './tts'
import { DelimiterParser } from '@/lib/coding/parser'
import {
  BASE_TYPING_DELAY_MS,
  archetypeStyle,
  deriveArchetype,
  preferredLanguage,
} from '@/lib/coding/persona'

const SPEAKING_WATCHDOG_MS = 15000 // force back to listening if 'speaking' never ends
const LLM_TIMEOUT_MS = 30000
const TYPING_PLACEHOLDER = 'Sorry, I had trouble responding there. Could you repeat the question?'

// Break a code chunk into "typing tokens" (words / whitespace runs / single
// punctuation) so the per-token delay reads as a natural keyboard rhythm.
function tokenizeCode(text: string): string[] {
  return text.match(/\s+|\w+|[^\s\w]/g) ?? [text]
}

// Candidates narrate with stray newlines around the [SPEAK]/[CODE] delimiters;
// collapse blank-line runs and trim so the chat bubble isn't full of gaps.
function normalizeNarration(s: string): string {
  return s.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').replace(/^\s+/, '')
}

interface Args {
  candidate: Candidate | null
  candidateId: string
}

const now = () => new Date().toISOString()

export function useVoiceInterview({ candidate, candidateId }: Args) {
  const [status, setStatusState] = useState<VoiceState>('idle')
  const [messages, setMessagesState] = useState<Message[]>([])
  const [interim, setInterim] = useState('')
  const [level, setLevel] = useState(0)
  const [threshold, setThresholdState] = useState<number>(VOICE.THRESHOLD)
  const [error, setError] = useState<string | null>(null)
  // Always-present coding editor: code the candidate "types" while they talk.
  const [code, setCode] = useState('')
  const [language, setLanguage] = useState('python')

  const statusRef = useRef<VoiceState>('idle')
  const messagesRef = useRef<Message[]>([])
  const thresholdRef = useRef<number>(VOICE.THRESHOLD)
  const candidateRef = useRef<Candidate | null>(candidate)
  const pendingRef = useRef('')
  const processingRef = useRef(false)
  const sessionRef = useRef(0) // bumped on start()/pause()/stop() to invalidate stale async work

  const micRef = useRef<MicController | null>(null)
  const sttRef = useRef<SttSession | null>(null)
  const ttsRef = useRef<TtsController | null>(null)
  const ctxRef = useRef<AudioContext | null>(null)
  const rafRef = useRef<number | null>(null)
  const aboveSinceRef = useRef<number | null>(null)
  const lastLevelPaintRef = useRef(0)

  // Coding-stream plumbing (runs alongside voice).
  const streamAbortRef = useRef<AbortController | null>(null)
  const codeRef = useRef('')
  const typeQueueRef = useRef<string[]>([])
  const typeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const typingDelayRef = useRef(BASE_TYPING_DELAY_MS)

  useEffect(() => {
    candidateRef.current = candidate
    if (candidate) {
      setLanguage(preferredLanguage(candidate))
      typingDelayRef.current = archetypeStyle(deriveArchetype(candidate)).typingDelayMs
    }
  }, [candidate])

  // Load any existing transcript on mount so navigating in/out (or pausing) never wipes it.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(`interviewiq_messages_${candidateId}`)
      if (raw) {
        const loaded: Message[] = JSON.parse(raw)
        if (Array.isArray(loaded) && loaded.length) {
          messagesRef.current = loaded
          setMessagesState(loaded)
        }
      }
    } catch {}
  }, [candidateId])

  const setStatus = useCallback((s: VoiceState) => {
    statusRef.current = s
    setStatusState(s)
  }, [])

  // Enter 'listening' with a clean per-turn slate (does NOT touch the transcript).
  const goListening = useCallback(() => {
    pendingRef.current = ''
    aboveSinceRef.current = null
    setInterim('')
    setStatus('listening')
  }, [setStatus])

  const commitMessages = useCallback(
    (next: Message[]) => {
      messagesRef.current = next
      setMessagesState(next)
      try {
        localStorage.setItem(`interviewiq_messages_${candidateId}`, JSON.stringify(next))
      } catch {}
    },
    [candidateId]
  )

  const setThreshold = useCallback((n: number) => {
    thresholdRef.current = n
    setThresholdState(n)
  }, [])

  const setCodeBoth = useCallback((updater: (prev: string) => string) => {
    codeRef.current = updater(codeRef.current)
    setCode(codeRef.current)
  }, [])

  // Reveal queued code one token per tick so it looks like live typing.
  const pumpTyping = useCallback(() => {
    if (typeTimerRef.current) return
    const step = () => {
      const tok = typeQueueRef.current.shift()
      if (tok === undefined) {
        typeTimerRef.current = null
        return
      }
      setCodeBoth((prev) => prev + tok)
      typeTimerRef.current = setTimeout(step, typingDelayRef.current)
    }
    typeTimerRef.current = setTimeout(step, typingDelayRef.current)
  }, [setCodeBoth])

  const stopTyping = useCallback(() => {
    if (typeTimerRef.current) {
      clearTimeout(typeTimerRef.current)
      typeTimerRef.current = null
    }
    typeQueueRef.current = []
  }, [])

  // Cancel an in-flight candidate answer (typed interruption or voice barge-in):
  // abort the stream, keep the code typed so far in the editor, and drop the
  // empty assistant bubble while persisting any partial narration. Returns
  // whether a stream was actually in flight.
  const interruptStream = useCallback((): boolean => {
    if (!streamAbortRef.current) return false
    streamAbortRef.current.abort()
    streamAbortRef.current = null
    if (typeTimerRef.current) {
      clearTimeout(typeTimerRef.current)
      typeTimerRef.current = null
    }
    if (typeQueueRef.current.length) {
      const rest = typeQueueRef.current.join('')
      typeQueueRef.current = []
      setCodeBoth((prev) => prev + rest)
    }
    commitMessages(messagesRef.current.filter((m) => m.content.trim()))
    return true
  }, [commitMessages, setCodeBoth])

  // Stream the candidate's reply, splitting narration ([SPEAK] → chat + TTS)
  // from code ([CODE] → the editor, typed at ~15ms/token). The persona/qualityTier
  // prompt stays server-side. The current editor contents are sent as context and
  // the editor is cleared so the new answer types in fresh (e.g. "now optimize it"
  // rewrites the solution rather than appending below it).
  const sendToLLM = useCallback(
    async (userText: string, fallbackStatus: VoiceState = 'idle') => {
      const cand = candidateRef.current
      if (!cand) return
      const mySession = sessionRef.current
      setStatus('thinking')

      const codeContext = codeRef.current
      stopTyping()
      codeRef.current = ''
      setCode('')

      // Add an empty assistant bubble we fill as narration streams in.
      commitMessages([...messagesRef.current, { role: 'assistant', content: '', timestamp: now() }])
      const assistantIdx = messagesRef.current.length - 1
      const parser = new DelimiterParser()
      let narration = ''

      // Speak narration to Aura clause-by-clause as it streams, so the voice
      // starts immediately and runs alongside the code typing (instead of all at
      // once when the stream finishes). speakBuf holds text not yet at a clause
      // boundary; fedAny tracks whether we've started a spoken reply.
      let speakBuf = ''
      let fedAny = false
      const feedClauses = (final: boolean) => {
        const tts = ttsRef.current
        if (!tts) return
        if (final) {
          const rest = speakBuf.trim()
          if (rest) {
            tts.feed(rest)
            fedAny = true
          }
          speakBuf = ''
          return
        }
        // Flush everything up to the last sentence/line boundary.
        const m = speakBuf.match(/^[\s\S]*[.!?\n]/)
        if (m) {
          const clause = m[0].trim()
          if (clause) {
            tts.feed(clause)
            fedAny = true
          }
          speakBuf = speakBuf.slice(m[0].length)
        }
      }

      const updateNarration = (text: string) => {
        narration += text
        const next = messagesRef.current.slice()
        next[assistantIdx] = { ...next[assistantIdx], content: normalizeNarration(narration) }
        // Update ref+state directly (avoid re-persisting on every token).
        messagesRef.current = next
        setMessagesState(next)
        speakBuf += text
        feedClauses(false)
      }

      const consume = (segText: string, parserOut = parser.push(segText)) => {
        for (const seg of parserOut) {
          if (seg.channel === 'speak') updateNarration(seg.text)
          else {
            typeQueueRef.current.push(...tokenizeCode(seg.text))
            pumpTyping()
          }
        }
      }

      const ctrl = new AbortController()
      streamAbortRef.current = ctrl
      let timedOut = false
      const timer = setTimeout(() => {
        timedOut = true
        ctrl.abort()
      }, LLM_TIMEOUT_MS)
      let failed = false
      try {
        const res = await fetch('/api/interview/code', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            candidate: cand,
            messages: messagesRef.current.slice(0, -1), // exclude the empty assistant bubble
            newMessage: userText,
            code: codeContext,
            language,
          }),
          signal: ctrl.signal,
        })
        if (!res.body) throw new Error('No response body')

        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let sse = ''
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          sse += decoder.decode(value, { stream: true })
          const frames = sse.split('\n\n')
          sse = frames.pop() ?? ''
          for (const frame of frames) {
            const line = frame.split('\n').find((l) => l.startsWith('data: '))
            if (!line) continue
            const payload = JSON.parse(line.slice(6))
            if (payload.t) consume(payload.t)
          }
        }
        consume('', parser.flush())
      } catch (e) {
        if ((e as Error).name !== 'AbortError') {
          console.error('[voice] interview stream failed', e)
          failed = true
        }
      } finally {
        clearTimeout(timer)
        if (streamAbortRef.current === ctrl) streamAbortRef.current = null
      }

      // Paused/stopped mid-flight, or a typed interruption (the caller starts the
      // next turn): leave the partial in place and bail. A *timeout* abort is not
      // a user action — fall through so we recover instead of hanging on 'thinking'.
      if (sessionRef.current !== mySession) return
      if (ctrl.signal.aborted && !timedOut) return

      if ((failed || timedOut) && !narration.trim()) narration = TYPING_PLACEHOLDER
      // Persist the finished turn (drop the bubble if the candidate said nothing,
      // e.g. a pure-code answer with no narration).
      const finalMsgs = messagesRef.current.slice()
      if (!narration.trim()) finalMsgs.splice(assistantIdx, 1)
      else finalMsgs[assistantIdx] = { ...finalMsgs[assistantIdx], content: normalizeNarration(narration) }
      commitMessages(finalMsgs)

      if (ttsRef.current) {
        // A placeholder set only at the end (error/timeout) was never streamed —
        // speak it now; otherwise flush the trailing clause.
        if (!fedAny && narration.trim()) {
          ttsRef.current.feed(normalizeNarration(narration).trim())
          fedAny = true
        } else {
          feedClauses(true)
        }
        // onSpeakingStart/End (createTts callbacks) drive the speaking→listening
        // transition; if nothing was spoken (pure-code answer) just keep listening.
        if (fedAny) ttsRef.current.finishReply()
        else goListening()
      } else {
        setStatus(fallbackStatus)
      }
    },
    [commitMessages, goListening, language, pumpTyping, setStatus, stopTyping]
  )

  const sendTyped = useCallback(
    async (text: string) => {
      const trimmed = text.trim()
      if (!trimmed || !candidateRef.current) return
      const prevStatus = statusRef.current

      // Mid-stream interruption: cancel the candidate's in-flight answer (keeping
      // the partial), then resume with the new message. If nothing's streaming
      // but a turn is still processing, ignore the send.
      if (!interruptStream() && processingRef.current) return

      ttsRef.current?.stop()
      processingRef.current = true
      commitMessages([...messagesRef.current, { role: 'user', content: trimmed, timestamp: now() }])
      await sendToLLM(trimmed, prevStatus === 'speaking' ? 'listening' : prevStatus).finally(() => {
        // Only release if this turn wasn't superseded by an interruption (whose
        // new stream owns streamAbortRef); otherwise let the newer turn clear it.
        if (streamAbortRef.current === null) processingRef.current = false
      })
    },
    [commitMessages, interruptStream, sendToLLM]
  )

  const commitTurn = useCallback(() => {
    const text = pendingRef.current.trim()
    if (!text || processingRef.current) return
    if (statusRef.current !== 'listening') return
    processingRef.current = true
    pendingRef.current = ''
    setInterim('')
    commitMessages([...messagesRef.current, { role: 'user', content: text, timestamp: now() }])
    void sendToLLM(text).finally(() => {
      if (streamAbortRef.current === null) processingRef.current = false
    })
  }, [commitMessages, sendToLLM])

  const tick = useCallback(() => {
    const mic = micRef.current
    if (mic) {
      const rms = mic.getRms()
      const t = performance.now()
      if (t - lastLevelPaintRef.current > 100) {
        lastLevelPaintRef.current = t
        setLevel(rms)
      }
      if (statusRef.current === 'speaking') {
        if (rms > thresholdRef.current) {
          if (aboveSinceRef.current == null) aboveSinceRef.current = t
          else if (t - aboveSinceRef.current >= VOICE.DEBOUNCE_MS) {
            ttsRef.current?.stop()
            interruptStream() // also cancel the candidate's still-streaming answer
            goListening()
          }
        } else {
          aboveSinceRef.current = null
        }
      } else {
        aboveSinceRef.current = null
      }
    }
    rafRef.current = requestAnimationFrame(tick)
  }, [goListening, interruptStream])

  // start() handles BOTH a fresh start (seed greeting) and a resume (keep transcript).
  const start = useCallback(async () => {
    const s = statusRef.current
    if (s === 'connecting' || s === 'listening' || s === 'thinking' || s === 'speaking') return
    const cand = candidateRef.current
    if (!cand) {
      setError('Candidate not loaded yet.')
      return
    }
    const mySession = ++sessionRef.current
    setError(null)
    setStatus('connecting')

    // Create + resume the AudioContext SYNCHRONOUSLY (inside the click) BEFORE any await,
    // or the autoplay activation can expire and playback starts suspended.
    let ctx: AudioContext
    try {
      ctx = new AudioContext()
      ctxRef.current = ctx
      void ctx.resume()
    } catch {
      setError('Could not start audio.')
      setStatus('error')
      return
    }

    try {
      const tokRes = await fetch('/api/deepgram-token', { method: 'POST' })
      const tok = await tokRes.json()
      if (sessionRef.current !== mySession) return
      if (!tok.accessToken) throw new Error(tok.error || 'No access token')
      const accessToken: string = tok.accessToken

      const mic = await createMic(ctx)
      if (sessionRef.current !== mySession) {
        mic.close()
        return
      }
      micRef.current = mic

      ttsRef.current = await createTts(
        accessToken,
        ctx,
        {
          onSpeakingStart: () => setStatus('speaking'),
          onSpeakingEnd: () => goListening(),
          onError: (e) => {
            console.error('[voice] tts error', e)
            goListening()
          },
        },
        voiceForCandidate(cand.id)
      )

      sttRef.current = await startStt(accessToken, {
        onInterim: (txt) => {
          if (statusRef.current === 'listening') setInterim(txt)
        },
        onFinal: (txt) => {
          if (statusRef.current === 'listening') {
            pendingRef.current = (pendingRef.current ? pendingRef.current + ' ' : '') + txt
          }
        },
        onTurnEnd: () => commitTurn(),
        onError: (e) => console.error('[voice] stt error', e),
      })
      if (sessionRef.current !== mySession) return

      mic.startRecording((blob) => sttRef.current?.sendAudio(blob))
      rafRef.current = requestAnimationFrame(tick)

      if (messagesRef.current.length > 0) {
        // RESUME — keep the transcript + full LLM context; just listen for the next turn.
        goListening()
      } else {
        const greeting = `Hi, thanks for having me. I'm ${cand.name}. I'm excited to learn more about this opportunity.`
        commitMessages([{ role: 'assistant', content: greeting, timestamp: now() }])
        setStatus('speaking')
        ttsRef.current.speak(greeting)
      }
    } catch (e) {
      console.error('[voice] start failed', e)
      if (sessionRef.current === mySession) {
        setError(e instanceof Error ? e.message : 'Failed to start voice')
        setStatus('error')
      }
    }
  }, [commitMessages, commitTurn, goListening, setStatus, tick])

  // Tear down live connections. Keeps the transcript intact (resume continues it).
  const teardown = useCallback(
    (next: VoiceState) => {
      sessionRef.current++ // invalidate in-flight async work
      streamAbortRef.current?.abort()
      streamAbortRef.current = null
      stopTyping()
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
      rafRef.current = null
      micRef.current?.close()
      sttRef.current?.close()
      ttsRef.current?.close()
      ctxRef.current?.close().catch(() => {})
      micRef.current = sttRef.current = ttsRef.current = null
      ctxRef.current = null
      pendingRef.current = ''
      processingRef.current = false
      aboveSinceRef.current = null
      setInterim('')
      setStatus(next)
    },
    [setStatus, stopTyping]
  )

  const pause = useCallback(() => teardown('paused'), [teardown]) // → button shows "Resume"
  const stop = useCallback(() => teardown('idle'), [teardown]) // full end (unmount / End Interview)

  // Watchdog: never get permanently stuck in 'speaking' (empty/failed/zero-audio reply).
  useEffect(() => {
    if (status !== 'speaking') return
    const id = setTimeout(() => {
      // Don't yank a long but legitimately-streaming coding answer off 'speaking'.
      if (statusRef.current === 'speaking' && streamAbortRef.current === null) goListening()
    }, SPEAKING_WATCHDOG_MS)
    return () => clearTimeout(id)
  }, [status, goListening])

  useEffect(() => () => stop(), [stop])

  return {
    status,
    messages,
    interim,
    level,
    threshold,
    setThreshold,
    error,
    start,
    pause,
    stop,
    sendTyped,
    code,
    language,
  }
}
