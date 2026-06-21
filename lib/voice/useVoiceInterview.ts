'use client'

// Orchestrates the voice interview: mic → Deepgram STT (raw WS) → existing /api/interview
// → Deepgram Aura TTS (raw WS), with volume-threshold barge-in. The transcript is kept as
// Message[] and persisted to localStorage exactly like the text interview, so
// /api/generate-feedback is unchanged. State: idle → connecting → listening → thinking →
// speaking → listening, plus 'paused'. start() resumes (no reset) when a transcript exists.
// (CONTEXT.md §17.3)

import { useCallback, useEffect, useRef, useState } from 'react'
import { Candidate, Message } from '@/types'
import { VOICE, VoiceState } from './config'
import { createMic, MicController } from './mic'
import { startStt, SttSession } from './stt'
import { createTts, TtsController } from './tts'

const SPEAKING_WATCHDOG_MS = 15000 // force back to listening if 'speaking' never ends
const LLM_TIMEOUT_MS = 30000
const TYPING_PLACEHOLDER = 'Sorry, I had trouble responding there. Could you repeat the question?'

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

  useEffect(() => {
    candidateRef.current = candidate
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

  const sendToLLM = useCallback(
    async (userText: string, fallbackStatus: VoiceState = 'idle') => {
      const cand = candidateRef.current
      if (!cand) return
      const mySession = sessionRef.current
      setStatus('thinking')

      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), LLM_TIMEOUT_MS)
      let reply: string | null = null
      try {
        const res = await fetch('/api/interview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ candidate: cand, messages: messagesRef.current, newMessage: userText }),
          signal: ctrl.signal,
        })
        const data = await res.json()
        reply = (data.reply || '').trim() || null
      } catch (e) {
        console.error('[voice] interview call failed', e)
      } finally {
        clearTimeout(timer)
      }

      if (sessionRef.current !== mySession) return // interview was paused/stopped mid-flight

      if (!reply) reply = TYPING_PLACEHOLDER
      commitMessages([...messagesRef.current, { role: 'assistant', content: reply, timestamp: now() }])
      if (ttsRef.current) {
        setStatus('speaking')
        ttsRef.current.speak(reply)
      } else {
        setStatus(fallbackStatus)
      }
    },
    [commitMessages, setStatus]
  )

  const sendTyped = useCallback(
    async (text: string) => {
      const trimmed = text.trim()
      if (!trimmed || !candidateRef.current || processingRef.current) return
      processingRef.current = true
      const prevStatus = statusRef.current
      if (prevStatus === 'speaking') ttsRef.current?.stop()
      commitMessages([...messagesRef.current, { role: 'user', content: trimmed, timestamp: now() }])
      await sendToLLM(trimmed, prevStatus === 'speaking' ? 'listening' : prevStatus).finally(() => {
        processingRef.current = false
      })
    },
    [commitMessages, sendToLLM]
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
      processingRef.current = false
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
  }, [goListening])

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

      ttsRef.current = await createTts(accessToken, ctx, {
        onSpeakingStart: () => setStatus('speaking'),
        onSpeakingEnd: () => goListening(),
        onError: (e) => {
          console.error('[voice] tts error', e)
          goListening()
        },
      })

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

  const pause = useCallback(() => teardown('paused'), [teardown]) // → button shows "Resume"
  const stop = useCallback(() => teardown('idle'), [teardown]) // full end (unmount / End Interview)

  // Watchdog: never get permanently stuck in 'speaking' (empty/failed/zero-audio reply).
  useEffect(() => {
    if (status !== 'speaking') return
    const id = setTimeout(() => {
      if (statusRef.current === 'speaking') goListening()
    }, SPEAKING_WATCHDOG_MS)
    return () => clearTimeout(id)
  }, [status, goListening])

  useEffect(() => () => stop(), [stop])

  return { status, messages, interim, level, threshold, setThreshold, error, start, pause, stop, sendTyped }
}
