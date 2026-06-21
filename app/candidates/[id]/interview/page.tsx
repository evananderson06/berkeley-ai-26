'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { PLACEHOLDER_CANDIDATES } from '@/lib/data'
import { Candidate } from '@/types'
import { cn } from '@/lib/utils'
import { useVoiceInterview } from '@/lib/voice/useVoiceInterview'
import { VOICE } from '@/lib/voice/config'
import { CodingInterview } from '@/components/coding-interview'

function formatTime(ts: string) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

const STATUS_LABEL: Record<string, string> = {
  idle: 'Not started',
  connecting: 'Connecting…',
  listening: 'Listening…',
  thinking: 'Thinking…',
  speaking: 'Speaking…',
  paused: 'Paused',
  error: 'Error',
}

export default function InterviewPage() {
  const params = useParams()
  const router = useRouter()
  const candidateId = params.id as string

  const [candidate, setCandidate] = useState<Candidate | null>(null)
  const [notes, setNotes] = useState('')
  const [notesSaved, setNotesSaved] = useState(false)
  const [ending, setEnding] = useState(false)
  const [codingMode, setCodingMode] = useState(false)
  const [typedMessage, setTypedMessage] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const raw = localStorage.getItem('interviewiq_candidates')
    const candidates: Candidate[] = raw ? JSON.parse(raw) : PLACEHOLDER_CANDIDATES
    setCandidate(candidates.find((c) => c.id === candidateId) ?? null)
  }, [candidateId])

  const { status, messages, interim, level, threshold, setThreshold, error, start, pause, stop, sendTyped } =
    useVoiceInterview({ candidate, candidateId })

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, interim])

  async function saveNotes() {
    localStorage.setItem(`interviewiq_notes_${candidateId}`, notes)
    await fetch('/api/save-notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: 'local', candidateId, notes }),
    })
    setNotesSaved(true)
    setTimeout(() => setNotesSaved(false), 2000)
  }

  async function handleSendTyped() {
    if (!typedMessage.trim() || ending) return
    const text = typedMessage
    setTypedMessage('')
    await sendTyped(text)
  }

  function handleTypedKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void handleSendTyped()
    }
  }

  async function endInterview() {
    if (ending) return
    setEnding(true)
    stop()
    const hadTurns = messages.some((m) => m.role === 'user')
    if (hadTurns && candidate) {
      try {
        localStorage.setItem(`interviewiq_completed_${candidateId}`, 'true')
        const res = await fetch('/api/interview-summary', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ candidate, messages }),
        })
        const data = await res.json()
        if (data.summary) localStorage.setItem(`interviewiq_summary_${candidateId}`, data.summary)
      } catch {
        /* still navigate — candidate is marked completed even if summary failed */
      }
    }
    router.push('/candidates')
  }

  function enterCodingMode() {
    stop() // pause the voice pipeline while the candidate codes
    setCodingMode(true)
  }

  const active =
    status === 'connecting' || status === 'listening' || status === 'thinking' || status === 'speaking'
  const meterPct = Math.min(100, (level / 0.3) * 100)
  const markerPct = Math.min(100, (threshold / 0.3) * 100)

  return (
    <div className="flex flex-col h-[calc(100vh-56px)]">
      {/* Header */}
      <div className="border-b border-slate-200 bg-white px-6 py-3 flex items-center justify-between shrink-0">
        <div>
          <p className="font-semibold text-slate-900 text-sm">{candidate?.name ?? '…'}</p>
          <p className="text-xs text-slate-400">
            {candidate?.role} · {candidate?.yearsExperience} yrs exp
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span
            className={cn(
              'text-xs font-medium px-2 py-1 rounded',
              status === 'listening' && 'bg-emerald-50 text-emerald-700',
              status === 'speaking' && 'bg-indigo-50 text-indigo-700',
              status === 'thinking' && 'bg-amber-50 text-amber-700',
              status === 'connecting' && 'bg-slate-100 text-slate-500',
              status === 'paused' && 'bg-slate-100 text-slate-600',
              status === 'error' && 'bg-red-50 text-red-700',
              status === 'idle' && 'bg-slate-100 text-slate-400'
            )}
          >
            {STATUS_LABEL[status]}
          </span>
          <Button
            onClick={() => (codingMode ? setCodingMode(false) : enterCodingMode())}
            variant="outline"
            size="sm"
            className={cn(
              'border-slate-200 hover:bg-slate-50',
              codingMode ? 'text-indigo-700 border-indigo-200 bg-indigo-50' : 'text-slate-600'
            )}
          >
            {codingMode ? '← Back to interview' : '💻 Coding question'}
          </Button>
          <Button
            onClick={endInterview}
            disabled={ending}
            variant="outline"
            size="sm"
            className="border-slate-200 text-slate-600 hover:bg-slate-50"
          >
            {ending ? 'Ending…' : 'End Interview'}
          </Button>
        </div>
      </div>

      {/* Body: the coding panel when a coding question is in progress, else the voice transcript + notes */}
      {codingMode && candidate ? (
        <CodingInterview candidate={candidate} candidateId={candidateId} />
      ) : (
      <div className="flex flex-1 overflow-hidden">
        {/* Transcript + voice controls */}
        <div className="flex flex-col flex-1 border-r border-slate-200">
          <div className="flex-1 overflow-y-auto px-6 py-6 space-y-4">
            {messages.map((msg, i) => (
              <div key={i} className={cn('flex gap-3', msg.role === 'user' ? 'flex-row-reverse' : 'flex-row')}>
                <div
                  className={cn(
                    'max-w-[70%] rounded-xl px-4 py-2.5 text-sm leading-relaxed',
                    msg.role === 'user'
                      ? 'bg-indigo-600 text-white'
                      : 'bg-white border border-slate-200 text-slate-800'
                  )}
                >
                  {msg.content}
                  <p
                    className={cn(
                      'text-[10px] mt-1',
                      msg.role === 'user' ? 'text-indigo-200' : 'text-slate-400'
                    )}
                  >
                    {formatTime(msg.timestamp)}
                  </p>
                </div>
              </div>
            ))}

            {interim && (
              <div className="flex gap-3 flex-row-reverse">
                <div className="max-w-[70%] rounded-xl px-4 py-2.5 text-sm leading-relaxed bg-indigo-50 text-indigo-400 italic">
                  {interim}
                </div>
              </div>
            )}

            {status === 'thinking' && (
              <div className="flex gap-3">
                <div className="bg-white border border-slate-200 rounded-xl px-4 py-2.5">
                  <span className="text-slate-400 text-sm">Thinking…</span>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Voice control bar */}
          <div className="border-t border-slate-200 bg-white px-4 py-3 space-y-3">
            {error && <p className="text-xs text-red-600">{error}</p>}

            <div className="flex items-center gap-4">
              {active ? (
                <Button onClick={pause} variant="outline" className="border-slate-300 text-slate-700">
                  ⏸ Pause
                </Button>
              ) : (
                <Button
                  onClick={() => start()}
                  disabled={!candidate || ending}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white"
                >
                  {status === 'paused' || messages.length > 0 ? '▶ Resume interview' : '🎙 Start voice interview'}
                </Button>
              )}

              <div className="flex-1">
                <div className="relative h-2 rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className={cn(
                      'h-full transition-[width] duration-75',
                      level > threshold ? 'bg-emerald-500' : 'bg-slate-300'
                    )}
                    style={{ width: `${meterPct}%` }}
                  />
                  <div
                    className="absolute top-[-2px] h-3 w-0.5 bg-red-500"
                    style={{ left: `${markerPct}%` }}
                    title="Barge-in threshold"
                  />
                </div>
                <div className="mt-1.5 flex items-center gap-2">
                  <span className="text-[10px] text-slate-400 w-28">Barge-in threshold</span>
                  <input
                    type="range"
                    min={0.01}
                    max={0.3}
                    step={0.005}
                    value={threshold}
                    onChange={(e) => setThreshold(parseFloat(e.target.value))}
                    className="flex-1"
                  />
                  <span className="text-[10px] text-slate-400 w-10 text-right">{threshold.toFixed(3)}</span>
                </div>
              </div>
            </div>

            <p className="text-[11px] text-slate-400">
              Speak naturally. Talk over the candidate (above the red marker) and it stops to listen. Pause and
              resume any time without losing the conversation. Default threshold {VOICE.THRESHOLD}; lower with
              headphones, raise on open speakers.
            </p>
          </div>

          {/* Text input bar */}
          <div className="border-t border-slate-200 bg-white px-4 py-3 flex gap-2 items-end">
            <Textarea
              value={typedMessage}
              onChange={(e) => setTypedMessage(e.target.value)}
              onKeyDown={handleTypedKeyDown}
              placeholder="Type a question… (Enter to send, Shift+Enter for newline)"
              rows={1}
              disabled={ending || !candidate}
              className="flex-1 resize-none text-sm min-h-[36px] max-h-32 py-2"
            />
            <Button
              onClick={handleSendTyped}
              disabled={!typedMessage.trim() || ending || !candidate}
              className="bg-indigo-600 hover:bg-indigo-700 text-white shrink-0"
              size="sm"
            >
              Send
            </Button>
          </div>
        </div>

        {/* Notes panel */}
        <div className="w-80 shrink-0 flex flex-col bg-slate-50">
          <div className="px-5 py-4 border-b border-slate-200">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Interview Notes</p>
          </div>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Jot down observations, red flags, follow-up questions…"
            className="flex-1 resize-none border-0 rounded-none bg-transparent text-sm text-slate-700 focus-visible:ring-0 p-5"
          />
          <div className="px-5 py-3 border-t border-slate-200">
            <Button
              onClick={saveNotes}
              variant="outline"
              size="sm"
              className="w-full border-slate-200 text-slate-700 hover:bg-white"
            >
              {notesSaved ? 'Saved ✓' : 'Save Notes'}
            </Button>
          </div>
        </div>
      </div>
      )}
    </div>
  )
}
