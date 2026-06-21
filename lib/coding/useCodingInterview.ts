'use client'

// Drives the coding-question experience: the candidate streams one response that
// is split into narration (→ chat) and code (→ Monaco editor), with the code
// revealed token-by-token on a ~15ms cadence so it looks like live typing.
//
// Streaming, interruption, and resume all hang off a single AbortController:
// if the interviewer sends a message mid-answer we abort the in-flight stream,
// commit whatever the candidate had said/typed so far into history, inject the
// new message, and start a fresh stream that continues from the code on screen.

import { useCallback, useEffect, useRef, useState } from 'react'
import { Candidate, Message } from '@/types'
import { DelimiterParser } from './parser'
import {
  BASE_TYPING_DELAY_MS,
  archetypeStyle,
  deriveArchetype,
  preferredLanguage,
} from './persona'

interface Args {
  candidate: Candidate | null
  candidateId: string
}

export type CodingStatus = 'idle' | 'thinking' | 'streaming'

const now = () => new Date().toISOString()
const storageKey = (id: string) => `interviewiq_messages_${id}`

// Break a code chunk into "typing tokens" — words, whitespace runs, and single
// punctuation — so the per-token delay produces a natural keyboard rhythm
// rather than one character at a time.
function tokenizeCode(text: string): string[] {
  return text.match(/\s+|\w+|[^\s\w]/g) ?? [text]
}

export function useCodingInterview({ candidate, candidateId }: Args) {
  const [messages, setMessages] = useState<Message[]>([])
  const [code, setCode] = useState('')
  const [status, setStatus] = useState<CodingStatus>('idle')
  const [language, setLanguage] = useState('python')

  const messagesRef = useRef<Message[]>([])
  const abortRef = useRef<AbortController | null>(null)
  const parserRef = useRef<DelimiterParser | null>(null)

  // Index of the assistant message for the current turn (-1 = not created yet).
  const assistantIdxRef = useRef(-1)

  // Code typing queue + pacing.
  const typeQueueRef = useRef<string[]>([])
  const typeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const typingDelayRef = useRef(BASE_TYPING_DELAY_MS)
  const codeRef = useRef('')

  const commit = useCallback(
    (next: Message[]) => {
      messagesRef.current = next
      setMessages(next)
      try {
        localStorage.setItem(storageKey(candidateId), JSON.stringify(next))
      } catch {}
    },
    [candidateId]
  )

  // Load shared transcript + derive language/pace from the persona on mount.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey(candidateId))
      if (raw) {
        const loaded: Message[] = JSON.parse(raw)
        if (Array.isArray(loaded) && loaded.length) {
          messagesRef.current = loaded
          setMessages(loaded)
        }
      }
    } catch {}
  }, [candidateId])

  useEffect(() => {
    if (!candidate) return
    setLanguage(preferredLanguage(candidate))
    typingDelayRef.current = archetypeStyle(deriveArchetype(candidate)).typingDelayMs
  }, [candidate])

  const setCodeBoth = useCallback((updater: (prev: string) => string) => {
    codeRef.current = updater(codeRef.current)
    setCode(codeRef.current)
  }, [])

  // Drain the typing queue one token per tick so code appears to be typed live.
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

  // Immediately flush any queued code (used when interrupting, so the editor
  // reflects everything the candidate had typed before we cut them off).
  const flushTyping = useCallback(() => {
    if (typeTimerRef.current) {
      clearTimeout(typeTimerRef.current)
      typeTimerRef.current = null
    }
    if (typeQueueRef.current.length) {
      const rest = typeQueueRef.current.join('')
      typeQueueRef.current = []
      setCodeBoth((prev) => prev + rest)
    }
  }, [setCodeBoth])

  const appendNarration = useCallback((text: string) => {
    const idx = assistantIdxRef.current
    if (idx < 0) return
    const next = messagesRef.current.slice()
    next[idx] = { ...next[idx], content: next[idx].content + text }
    messagesRef.current = next
    setMessages(next)
  }, [])

  // Persist + drop an empty assistant bubble if the candidate said nothing.
  const finalizeTurn = useCallback(() => {
    const idx = assistantIdxRef.current
    if (idx >= 0) {
      let next = messagesRef.current
      if (!next[idx].content.trim()) next = next.filter((_, i) => i !== idx)
      commit(next)
    }
    assistantIdxRef.current = -1
    parserRef.current = null
  }, [commit])

  const runStream = useCallback(
    async (userText: string, keepCode: boolean) => {
      const cand = candidate
      if (!cand) return

      if (!keepCode) {
        // Fresh problem → clear the board.
        typeQueueRef.current = []
        codeRef.current = ''
        setCode('')
      }

      // Record the interviewer's message and an empty assistant bubble to fill.
      const withUser: Message[] = [
        ...messagesRef.current,
        { role: 'user', content: userText, timestamp: now() },
        { role: 'assistant', content: '', timestamp: now() },
      ]
      assistantIdxRef.current = withUser.length - 1
      commit(withUser)

      parserRef.current = new DelimiterParser()
      const ctrl = new AbortController()
      abortRef.current = ctrl
      setStatus('thinking')

      try {
        const res = await fetch('/api/interview/code', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            candidate: cand,
            // Prior history only: drop the empty assistant bubble AND this turn's
            // user message (it travels separately as newMessage, which the route
            // appends — sending it here too would duplicate the turn).
            messages: messagesRef.current.slice(0, -2),
            newMessage: userText,
            code: keepCode ? codeRef.current : '',
            language,
          }),
          signal: ctrl.signal,
        })
        if (!res.body) throw new Error('No response body')

        setStatus('streaming')
        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let sse = ''

        const handle = (segText: string) => {
          for (const seg of parserRef.current!.push(segText)) {
            if (seg.channel === 'speak') appendNarration(seg.text)
            else {
              typeQueueRef.current.push(...tokenizeCode(seg.text))
              pumpTyping()
            }
          }
        }

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
            if (payload.t) handle(payload.t)
          }
        }

        // Stream ended cleanly: release any held-back tail.
        if (parserRef.current) {
          for (const seg of parserRef.current.flush()) {
            if (seg.channel === 'speak') appendNarration(seg.text)
            else {
              typeQueueRef.current.push(...tokenizeCode(seg.text))
              pumpTyping()
            }
          }
        }
        finalizeTurn()
        setStatus('idle')
      } catch (err) {
        if ((err as Error).name === 'AbortError') {
          // Interrupted — caller is mid-way through starting the next stream.
          return
        }
        console.error('[coding] stream failed', err)
        if (assistantIdxRef.current >= 0 && !messagesRef.current[assistantIdxRef.current]?.content) {
          appendNarration('Sorry — I lost my train of thought there. Could you repeat that?')
        }
        finalizeTurn()
        setStatus('idle')
      } finally {
        if (abortRef.current === ctrl) abortRef.current = null
      }
    },
    [candidate, commit, language, appendNarration, pumpTyping, finalizeTurn]
  )

  // The single entry point the UI calls. Detects whether we're interrupting an
  // in-flight answer and, if so, aborts + commits the partial before resuming.
  const send = useCallback(
    (text: string) => {
      const trimmed = text.trim()
      if (!trimmed || !candidate) return

      const interrupting = abortRef.current !== null
      if (interrupting) {
        abortRef.current!.abort()
        abortRef.current = null
        flushTyping() // keep the code typed so far on screen
        finalizeTurn() // commit the partial narration into history
      }

      // Interruptions continue from the existing code; a fresh ask resets it.
      void runStream(trimmed, interrupting)
    },
    [candidate, flushTyping, finalizeTurn, runStream]
  )

  const reset = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    flushTyping()
    typeQueueRef.current = []
    codeRef.current = ''
    setCode('')
  }, [flushTyping])

  // Tear down on unmount so a stray stream/timer doesn't outlive the page.
  useEffect(
    () => () => {
      abortRef.current?.abort()
      if (typeTimerRef.current) clearTimeout(typeTimerRef.current)
    },
    []
  )

  return { messages, code, status, language, send, reset }
}
