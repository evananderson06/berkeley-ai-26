'use client'

// Orchestrates the voice interview: mic → Deepgram STT (raw WS) → /api/interview/code
// → Deepgram Aura TTS (raw WS), with volume-threshold barge-in. The transcript is kept as
// Message[] and persisted to localStorage exactly like the text interview, so
// /api/generate-feedback is unchanged. State: idle → connecting → listening → thinking →
// speaking → listening, plus 'paused'. start() resumes (no reset) when a transcript exists.
// (CONTEXT.md §17.3)
//
// Coding answers: the model alternates [SPEAK] narration with [CODE]/[EDIT]/[DELETE]/[CLEAR]
// editor ops. A single ordered "action runner" plays them back so the candidate explains
// what it's doing LINE BY LINE — each line of code types out over the duration of the spoken
// explanation that introduces it (instead of the narration racing ahead of the typing). The
// editor is NOT wiped each turn, so follow-ups ("now handle the empty case") patch the
// existing file via find-and-replace edits rather than rewriting the whole solution.

import { useCallback, useEffect, useRef, useState } from 'react'
import { Candidate, Message } from '@/types'
import { VOICE, VoiceState, voiceForCandidate } from './config'
import { createMic, MicController } from './mic'
import { startStt, SttSession } from './stt'
import { createTts, TtsController } from './tts'
import { Action, ActionAssembler } from '@/lib/coding/parser'
import { ActionQueue, tokenizeCode } from '@/lib/coding/playback'
import { deleteSnippet, locate } from '@/lib/coding/edits'
import {
  BASE_TYPING_DELAY_MS,
  archetypeStyle,
  deriveArchetype,
  preferredLanguage,
} from '@/lib/coding/persona'

const SPEAKING_WATCHDOG_MS = 15000 // force back to listening if 'speaking' never ends
const LLM_TIMEOUT_MS = 30000
const MAX_TYPING_DELAY_MS = 150 // cap so a long explanation doesn't type absurdly slowly
const TYPING_PLACEHOLDER = 'Sorry, I had trouble responding there. Could you repeat the question?'

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
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, Math.max(0, ms)))

export function useVoiceInterview({ candidate, candidateId }: Args) {
  const [status, setStatusState] = useState<VoiceState>('idle')
  const [messages, setMessagesState] = useState<Message[]>([])
  const [interim, setInterim] = useState('')
  const [level, setLevel] = useState(0)
  const [threshold, setThresholdState] = useState<number>(VOICE.THRESHOLD)
  const [muted, setMutedState] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Always-present coding editor: code the candidate "types" (and edits) while they talk.
  const [code, setCode] = useState('')
  const [language, setLanguage] = useState('python')

  const statusRef = useRef<VoiceState>('idle')
  const messagesRef = useRef<Message[]>([])
  const thresholdRef = useRef<number>(VOICE.THRESHOLD)
  const mutedRef = useRef(false)
  const unlockHandlerRef = useRef<(() => void) | null>(null)
  const candidateRef = useRef<Candidate | null>(candidate)
  const pendingRef = useRef('')
  const processingRef = useRef(false)
  const sessionRef = useRef(0) // bumped on start()/pause()/stop() to invalidate stale async work
  const runIdRef = useRef(0) // bumped per turn / on barge-in to stop the playback runner

  const micRef = useRef<MicController | null>(null)
  const sttRef = useRef<SttSession | null>(null)
  const ttsRef = useRef<TtsController | null>(null)
  const ctxRef = useRef<AudioContext | null>(null)
  const rafRef = useRef<number | null>(null)
  const aboveSinceRef = useRef<number | null>(null)
  const lastLevelPaintRef = useRef(0)

  // Coding editor state (runs alongside voice). codeRef is the live editor buffer.
  const streamAbortRef = useRef<AbortController | null>(null)
  const codeRef = useRef('')
  const typingDelayRef = useRef(BASE_TYPING_DELAY_MS)

  useEffect(() => {
    candidateRef.current = candidate
    if (candidate) {
      setLanguage(preferredLanguage(candidate))
      typingDelayRef.current = archetypeStyle(deriveArchetype(candidate)).typingDelayMs
    }
  }, [candidate])

  // Load any existing transcript + editor contents on mount so navigating in/out
  // (or pausing) never wipes them, and follow-up edits keep working on the same file.
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
      const savedCode = localStorage.getItem(`interviewiq_code_${candidateId}`)
      if (savedCode) {
        codeRef.current = savedCode
        setCode(savedCode)
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

  const persistCode = useCallback(() => {
    try {
      localStorage.setItem(`interviewiq_code_${candidateId}`, codeRef.current)
    } catch {}
  }, [candidateId])

  const setThreshold = useCallback((n: number) => {
    thresholdRef.current = n
    setThresholdState(n)
  }, [])

  // Mute = silence the mic (the session stays fully live). Clears any half-captured
  // turn so it isn't committed when you mute mid-sentence.
  const setMuted = useCallback((m: boolean) => {
    mutedRef.current = m
    setMutedState(m)
    micRef.current?.setMuted(m)
    if (m) {
      pendingRef.current = ''
      setInterim('')
    }
  }, [])

  const toggleMute = useCallback(() => setMuted(!mutedRef.current), [setMuted])

  const applyCode = useCallback((next: string) => {
    codeRef.current = next
    setCode(next)
  }, [])

  // Cancel an in-flight candidate answer (typed interruption or voice barge-in):
  // stop the playback runner (its typing loop dumps the current line so the editor
  // stays coherent), abort the upstream stream, and drop the empty assistant bubble
  // while keeping any partial narration. Returns whether anything was actually cancelled.
  const interruptStream = useCallback((): boolean => {
    const active = processingRef.current || streamAbortRef.current !== null
    if (!active) return false
    runIdRef.current++ // signals the runner + typing loops to stop
    streamAbortRef.current?.abort()
    streamAbortRef.current = null
    commitMessages(messagesRef.current.filter((m) => m.content.trim()))
    return true
  }, [commitMessages])

  // Stream + play the candidate's reply. Narration ([SPEAK]) goes to the chat + TTS;
  // editor ops ([CODE]/[EDIT]/[DELETE]/[CLEAR]) are applied to the existing file. A single
  // runner consumes the ordered actions so each code line types out across the span of the
  // spoken line that explains it (line-by-line sync). The current editor contents are sent
  // as context so the model can edit them instead of rewriting from scratch.
  const sendToLLM = useCallback(
    async (userText: string) => {
      const cand = candidateRef.current
      if (!cand) return
      const mySession = sessionRef.current
      const myRun = ++runIdRef.current
      setStatus('thinking')

      const codeContext = codeRef.current

      // Add an empty assistant bubble we reveal line-by-line as each line is spoken.
      commitMessages([...messagesRef.current, { role: 'assistant', content: '', timestamp: now() }])
      const assistantIdx = messagesRef.current.length - 1

      let narration = ''

      const appendNarration = (text: string) => {
        narration += text
        const next = messagesRef.current.slice()
        next[assistantIdx] = { ...next[assistantIdx], content: normalizeNarration(narration) }
        // Update ref+state directly (avoid re-persisting on every token).
        messagesRef.current = next
        setMessagesState(next)
      }

      // Type `body` between a fixed prefix/suffix over `spanMs` — the *measured* spoken
      // duration of the line — so code lands in lockstep with the speech (no drift). If
      // the run is superseded (barge-in / interrupt) it dumps the rest so the line is whole.
      const typeBetween = async (prefix: string, body: string, suffix: string, spanMs: number) => {
        const tokens = tokenizeCode(body)
        const per = tokens.length
          ? Math.min(MAX_TYPING_DELAY_MS, Math.max(typingDelayRef.current, spanMs / tokens.length))
          : 0
        let typed = ''
        for (const tok of tokens) {
          if (myRun !== runIdRef.current) {
            applyCode(prefix + body + suffix) // dump remainder, keep it coherent
            return
          }
          typed += tok
          applyCode(prefix + typed + suffix)
          await sleep(per)
        }
      }

      // Apply one editor action, animating type/edit over spanMs (0 ⇒ natural pace).
      const applyCodeAction = async (a: Action, spanMs: number) => {
        if (a.kind === 'type') {
          await typeBetween(codeRef.current, a.text, '', spanMs)
        } else if (a.kind === 'edit') {
          const m = locate(codeRef.current, a.oldText)
          let prefix: string
          let suffix: string
          if (m) {
            prefix = codeRef.current.slice(0, m.start)
            suffix = codeRef.current.slice(m.end)
          } else {
            // Snippet not found in the editor — append the new code so the edit isn't lost.
            const base = codeRef.current
            prefix = base && !base.endsWith('\n') ? base + '\n' : base
            suffix = ''
          }
          applyCode(prefix + suffix) // remove the old snippet, then type the new in its place
          await typeBetween(prefix, a.newText, suffix, spanMs)
        } else if (a.kind === 'delete') {
          applyCode(deleteSnippet(codeRef.current, a.oldText))
        } else if (a.kind === 'clear') {
          applyCode('')
        }
      }

      const queue = new ActionQueue()
      const assembler = new ActionAssembler()

      // The runner: for each spoken line, FULLY synthesize its audio first (one contiguous
      // buffer ⇒ no stutter), reveal the text + play the buffer, and type the code that
      // follows it over the audio's *measured* duration ⇒ speech and code stay locked.
      const runner = (async () => {
        let la = await queue.next()
        while (la) {
          if (myRun !== runIdRef.current) return
          const a = la

          if (a.kind === 'speak') {
            const tts = ttsRef.current
            const buf = tts ? await tts.synthesize(a.text) : null
            if (myRun !== runIdRef.current) return
            appendNarration(a.text) // reveal the text together with its audio
            la = await queue.next() // the action right after this line (often its code)

            if (buf && tts) {
              if (statusRef.current !== 'speaking') setStatus('speaking')
              const { durationMs, ended } = tts.play(buf)
              if (la && la.kind !== 'speak') {
                await Promise.all([applyCodeAction(la, durationMs), ended])
                la = await queue.next()
              } else {
                await ended
              }
            } else if (la && la.kind !== 'speak') {
              await applyCodeAction(la, 0)
              la = await queue.next()
            }
          } else {
            // Editor action with no spoken line in front of it — type at a natural pace.
            await applyCodeAction(a, 0)
            la = await queue.next()
          }
        }
      })()

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
            if (payload.t) queue.push(...assembler.push(payload.t))
          }
        }
        queue.push(...assembler.flush())
      } catch (e) {
        if ((e as Error).name !== 'AbortError') {
          console.error('[voice] interview stream failed', e)
          failed = true
        }
      } finally {
        clearTimeout(timer)
        if (streamAbortRef.current === ctrl) streamAbortRef.current = null
        queue.close()
      }

      // Wait for playback to finish the actions it has (or to bail on interrupt).
      await runner

      // Stopped/torn down mid-flight, or superseded by an interruption (whose newer turn
      // owns the editor + transcript): leave the partial in place and bail. A *timeout*
      // abort is not a user action — fall through so we recover instead of hanging.
      if (sessionRef.current !== mySession) return
      if (myRun !== runIdRef.current) return

      // Error/timeout with nothing said: speak a short recovery line.
      if ((failed || timedOut) && !narration.trim()) {
        narration = TYPING_PLACEHOLDER
        appendNarration('') // flush the placeholder into the bubble
        const tts = ttsRef.current
        if (tts) {
          const buf = await tts.synthesize(narration)
          if (sessionRef.current !== mySession || myRun !== runIdRef.current) return
          if (buf) {
            setStatus('speaking')
            await tts.play(buf).ended
          }
        }
      }

      if (sessionRef.current !== mySession || myRun !== runIdRef.current) return

      // Persist the finished turn (drop the bubble if the candidate said nothing,
      // e.g. a pure-code answer with no narration) and the editor contents.
      const finalMsgs = messagesRef.current.slice()
      if (!narration.trim()) finalMsgs.splice(assistantIdx, 1)
      else finalMsgs[assistantIdx] = { ...finalMsgs[assistantIdx], content: normalizeNarration(narration) }
      commitMessages(finalMsgs)
      persistCode()

      // All audio already finished (we awaited each line's playback) — just listen.
      goListening()
    },
    [applyCode, commitMessages, goListening, language, persistCode, setStatus]
  )

  const sendTyped = useCallback(
    async (text: string) => {
      const trimmed = text.trim()
      if (!trimmed || !candidateRef.current) return

      // Mid-stream interruption: cancel the candidate's in-flight answer (keeping
      // the partial), then resume with the new message. If nothing's streaming
      // but a turn is still processing, ignore the send.
      if (!interruptStream() && processingRef.current) return

      ttsRef.current?.stop()
      processingRef.current = true
      commitMessages([...messagesRef.current, { role: 'user', content: trimmed, timestamp: now() }])
      await sendToLLM(trimmed).finally(() => {
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
            interruptStream() // also stop the runner + cancel any still-streaming answer
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

    // Always-on mode auto-starts without a click, so the AudioContext can begin
    // 'suspended' (autoplay policy). Resume it on the first user gesture anywhere
    // so the candidate's voice becomes audible. (Mic capture itself doesn't need this.)
    if (!unlockHandlerRef.current) {
      const unlock = () => ctxRef.current?.resume().catch(() => {})
      unlockHandlerRef.current = unlock
      window.addEventListener('pointerdown', unlock)
      window.addEventListener('keydown', unlock)
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
      mic.setMuted(mutedRef.current) // honor a mute toggled before/while connecting

      ttsRef.current = await createTts(
        accessToken,
        ctx,
        {
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
        // Synthesize the whole greeting, then play it (fire-and-forget → listen on end).
        const buf = await ttsRef.current.synthesize(greeting)
        if (sessionRef.current !== mySession) return
        if (buf) {
          setStatus('speaking')
          ttsRef.current.play(buf).ended.then(() => {
            if (sessionRef.current === mySession && statusRef.current === 'speaking') goListening()
          })
        } else {
          goListening()
        }
      }
    } catch (e) {
      console.error('[voice] start failed', e)
      if (sessionRef.current === mySession) {
        setError(e instanceof Error ? e.message : 'Failed to start voice')
        setStatus('error')
      }
    }
  }, [commitMessages, commitTurn, goListening, setStatus, tick])

  // Tear down live connections. Keeps the transcript + editor intact (resume continues them).
  const teardown = useCallback(
    (next: VoiceState) => {
      sessionRef.current++ // invalidate in-flight async work
      runIdRef.current++ // stop the playback runner + typing loops
      streamAbortRef.current?.abort()
      streamAbortRef.current = null
      if (unlockHandlerRef.current) {
        window.removeEventListener('pointerdown', unlockHandlerRef.current)
        window.removeEventListener('keydown', unlockHandlerRef.current)
        unlockHandlerRef.current = null
      }
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
    [setStatus]
  )

  const stop = useCallback(() => teardown('idle'), [teardown]) // full end (unmount / End Interview)

  // Always-on: connect automatically once the candidate is loaded — no Start/Pause.
  // start() guards on status so this never double-connects; the only control is mute.
  useEffect(() => {
    if (candidate && statusRef.current === 'idle') void start()
  }, [candidate, start])

  // Watchdog: never get permanently stuck in 'speaking' (empty/failed/zero-audio reply).
  useEffect(() => {
    if (status !== 'speaking') return
    const id = setTimeout(() => {
      // Don't yank a long but legitimately-playing coding answer off 'speaking'.
      if (statusRef.current === 'speaking' && !processingRef.current) goListening()
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
    muted,
    setMuted,
    toggleMute,
    error,
    start,
    stop,
    sendTyped,
    code,
    language,
  }
}
