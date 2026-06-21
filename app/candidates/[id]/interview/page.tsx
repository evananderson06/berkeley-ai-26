'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { PLACEHOLDER_CANDIDATES } from '@/lib/data'
import { Candidate } from '@/types'
import { cn } from '@/lib/utils'
import { useVoiceInterview } from '@/lib/voice/useVoiceInterview'
import { CodeEditor } from '@/components/code-editor'
import { Dialog } from '@/components/ui/dialog'
import { ResumeDisplay } from '@/components/resume-templates'
import { LoadingScreen } from '@/components/loading-screen'

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
  const [generatingSummary, setGeneratingSummary] = useState(false)
  const [summaryProgress, setSummaryProgress] = useState(0)
  const [typedMessage, setTypedMessage] = useState('')
  const [resumeOpen, setResumeOpen] = useState(false)
  const [showTranscript, setShowTranscript] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const raw = localStorage.getItem('interviewiq_candidates')
    const candidates: Candidate[] = raw ? JSON.parse(raw) : PLACEHOLDER_CANDIDATES
    setCandidate(candidates.find((c) => c.id === candidateId) ?? null)
  }, [candidateId])

  const { status, messages, interim, level, threshold, setThreshold, muted, toggleMute, error, start, stop, sendTyped, code, language } =
    useVoiceInterview({ candidate, candidateId })

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, interim])

  // Creep the summary progress bar toward 90% while we wait on the API (there's no
  // real progress signal); endInterview snaps it to 100 before navigating.
  useEffect(() => {
    if (!generatingSummary) return
    const id = setInterval(() => {
      setSummaryProgress((p) => (p < 90 ? p + Math.max(1, (90 - p) * 0.08) : p))
    }, 200)
    return () => clearInterval(id)
  }, [generatingSummary])

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
      setGeneratingSummary(true) // show the loading screen while the summary is written
      setSummaryProgress(8)
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
      setSummaryProgress(100)
    }
    router.push('/candidates')
  }

  const meterPct = Math.min(100, (level / 0.3) * 100)
  const markerPct = Math.min(100, (threshold / 0.3) * 100)

  if (generatingSummary)
    return <LoadingScreen message="Writing up the interview summary…" progress={summaryProgress} />

  return (
    <div className="flex flex-col h-[calc(100vh-56px)] bg-ground">
      {/* Header */}
      <div className="border-b border-line bg-surface px-6 py-3 flex items-center justify-between shrink-0">
        <div>
          <p className="font-semibold text-ink text-sm">{candidate?.name ?? '…'}</p>
          <p className="font-mono text-[11px] text-ink-2/70">
            {candidate?.role} · {candidate?.yearsExperience} yrs
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span
            className={cn(
              'font-mono text-[11px] uppercase tracking-[0.1em] px-2.5 py-1 rounded-full border',
              muted && 'bg-bad/10 text-bad border-bad/25',
              !muted && status === 'listening' && 'bg-pine-soft text-pine border-pine/20',
              !muted && status === 'speaking' && 'bg-brass-soft text-brass border-brass/25',
              !muted && status === 'thinking' && 'bg-surface-2 text-ink-2 border-line',
              !muted && status === 'connecting' && 'bg-surface-2 text-ink-2 border-line',
              !muted && status === 'error' && 'bg-bad/10 text-bad border-bad/25',
              !muted && status === 'idle' && 'bg-surface-2 text-ink-2/60 border-line'
            )}
          >
            {muted ? '🔇 Mic muted' : STATUS_LABEL[status]}
          </span>
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-ink-2">Transcript</span>
            <button
              type="button"
              role="switch"
              aria-checked={showTranscript}
              aria-label="Show transcript"
              onClick={() => setShowTranscript((v) => !v)}
              className={cn(
                'relative inline-flex h-5 w-9 items-center rounded-full transition-colors',
                showTranscript ? 'bg-pine' : 'bg-line'
              )}
            >
              <span
                className={cn(
                  'inline-block h-4 w-4 transform rounded-full bg-surface shadow transition-transform',
                  showTranscript ? 'translate-x-4' : 'translate-x-0.5'
                )}
              />
            </button>
          </label>
          <Button
            onClick={() => setResumeOpen(true)}
            disabled={!candidate}
            variant="outline"
            size="sm"
            className="border-line text-ink-2 hover:bg-surface-2 hover:text-ink"
          >
            View résumé
          </Button>
          <Button
            onClick={endInterview}
            disabled={ending}
            variant="outline"
            size="sm"
            className="border-line text-ink-2 hover:bg-surface-2 hover:text-ink"
          >
            {ending ? 'Ending…' : 'End interview'}
          </Button>
        </div>
      </div>

      <Dialog
        open={resumeOpen}
        onClose={() => setResumeOpen(false)}
        title={candidate ? `${candidate.name} · résumé` : 'Résumé'}
      >
        {candidate && <ResumeDisplay candidate={candidate} />}
      </Dialog>

      {/* Body: voice transcript + always-on code editor + notes */}
      <div className="flex flex-1 overflow-hidden">
        {/* Voice call experience (transcript hidden by default; toggle in header) */}
        <div className="flex flex-col flex-1 border-r border-line">
          {showTranscript ? (
            /* Transcript view */
            <div className="flex-1 overflow-y-auto px-6 py-6 space-y-4">
              {messages.map((msg, i) => (
                <div key={i} className={cn('flex gap-3', msg.role === 'user' ? 'flex-row-reverse' : 'flex-row')}>
                  <div
                    className={cn(
                      'max-w-[70%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed',
                      msg.role === 'user'
                        ? 'bg-pine text-white rounded-br-md'
                        : 'bg-surface border border-line text-ink rounded-bl-md'
                    )}
                  >
                    {msg.content}
                    <p
                      className={cn(
                        'font-mono text-[10px] mt-1.5',
                        msg.role === 'user' ? 'text-white/55' : 'text-ink-2/55'
                      )}
                    >
                      {formatTime(msg.timestamp)}
                    </p>
                  </div>
                </div>
              ))}

              {interim && (
                <div className="flex gap-3 flex-row-reverse">
                  <div className="max-w-[70%] rounded-2xl rounded-br-md px-4 py-2.5 text-sm leading-relaxed bg-pine/10 text-pine/70 italic">
                    {interim}
                  </div>
                </div>
              )}

              {status === 'thinking' && (
                <div className="flex gap-3">
                  <div className="bg-surface border border-line rounded-2xl rounded-bl-md px-4 py-2.5">
                    <span className="text-ink-2 text-sm">Thinking…</span>
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>
          ) : (
            /* Voice-call view */
            <div className="flex-1 flex flex-col items-center justify-center gap-8 bg-gradient-to-b from-surface-2 to-ground">
              <div className="relative flex h-48 w-48 items-center justify-center">
                {/* Candidate speaking → expanding pulse rings */}
                {!muted && status === 'speaking' && (
                  <>
                    <span className="absolute h-44 w-44 rounded-full bg-brass/20 animate-ping" />
                    <span className="absolute h-36 w-36 rounded-full bg-brass/30 animate-pulse" />
                  </>
                )}
                {/* Interviewer talking → glow that grows with mic level */}
                {!muted && status === 'listening' && (
                  <span
                    className="absolute h-44 w-44 rounded-full bg-pine/20 transition-transform duration-100"
                    style={{ transform: `scale(${0.7 + Math.min(level / 0.3, 1) * 0.5})` }}
                  />
                )}
                <div
                  className={cn(
                    'relative flex h-32 w-32 items-center justify-center rounded-full font-display text-4xl font-semibold text-white shadow-lift ring-4 transition-colors',
                    muted && 'bg-gradient-to-br from-[#7d8a83] to-ink-2 ring-line',
                    !muted && status === 'speaking' && 'bg-gradient-to-br from-brass to-[#9a6a1f] ring-brass-soft',
                    !muted && status === 'listening' && 'bg-gradient-to-br from-pine to-[#0a3a30] ring-pine-soft',
                    !muted && status === 'thinking' && 'bg-gradient-to-br from-[#7d8a83] to-ink-2 ring-line',
                    !muted &&
                      status !== 'speaking' &&
                      status !== 'listening' &&
                      status !== 'thinking' &&
                      'bg-gradient-to-br from-[#7d8a83] to-ink-2 ring-line'
                  )}
                >
                  {candidate?.initials ?? '…'}
                </div>
              </div>

              <div className="text-center space-y-1.5">
                <p className="font-display text-2xl text-ink">{candidate?.name ?? 'Connecting…'}</p>
                {candidate && (
                  <p className="text-sm text-ink-2">
                    {candidate.role} · {candidate.yearsExperience} yrs exp
                  </p>
                )}
                <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink-2/70 pt-1">
                  {muted ? '🔇 Mic muted' : STATUS_LABEL[status]}
                </p>
              </div>

              <p className="font-mono text-[10px] text-ink-2/60 max-w-xs text-center px-4 leading-relaxed">
                Voice is always on — just talk. Toggle <span className="font-medium text-ink-2">Transcript</span> in
                the header to read the conversation.
              </p>
            </div>
          )}

          {/* Voice control bar (shared by both views) */}
          <div className="border-t border-line bg-surface px-4 py-3 space-y-3">
            {error && <p className="text-xs text-bad">{error}</p>}

            <div className="flex items-center gap-4">
              {status === 'error' ? (
                <Button
                  onClick={() => start()}
                  disabled={!candidate || ending}
                  className="bg-pine hover:bg-pine/90 text-white shrink-0 rounded-full h-12 w-12 p-0 text-lg"
                  title="Enable microphone"
                >
                  🎙
                </Button>
              ) : (
                <Button
                  onClick={toggleMute}
                  disabled={!candidate || ending}
                  title={muted ? 'Unmute mic' : 'Mute mic'}
                  className={cn(
                    'text-white shrink-0 rounded-full h-12 w-12 p-0 text-lg',
                    muted ? 'bg-bad hover:bg-bad/90' : 'bg-pine hover:bg-pine/90'
                  )}
                >
                  {muted ? '🔇' : '🎙'}
                </Button>
              )}

              <div className="flex-1">
                <div className="relative h-2 rounded-full bg-surface-2 border border-line overflow-hidden">
                  <div
                    className={cn(
                      'h-full transition-[width] duration-75',
                      level > threshold ? 'bg-brass' : 'bg-line'
                    )}
                    style={{ width: `${meterPct}%` }}
                  />
                  <div
                    className="absolute top-[-3px] h-3.5 w-0.5 bg-bad"
                    style={{ left: `${markerPct}%` }}
                    title="Barge-in threshold"
                  />
                </div>
                <div className="mt-1.5 flex items-center gap-2">
                  <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-2/70 w-28">Barge-in level</span>
                  <input
                    type="range"
                    min={0.01}
                    max={0.3}
                    step={0.005}
                    value={threshold}
                    onChange={(e) => setThreshold(parseFloat(e.target.value))}
                    className="flex-1 accent-pine"
                  />
                  <span className="font-mono text-[10px] text-ink-2/70 w-10 text-right">{threshold.toFixed(3)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Text input bar — only useful alongside the transcript */}
          {showTranscript && (
            <div className="border-t border-line bg-surface px-4 py-3 flex gap-2 items-end">
              <Textarea
                value={typedMessage}
                onChange={(e) => setTypedMessage(e.target.value)}
                onKeyDown={handleTypedKeyDown}
                placeholder="Type a question… (Enter to send, Shift+Enter for newline)"
                rows={1}
                disabled={ending || !candidate}
                className="flex-1 resize-none text-sm min-h-[36px] max-h-32 py-2 border-line"
              />
              <Button
                onClick={handleSendTyped}
                disabled={!typedMessage.trim() || ending || !candidate}
                className="bg-pine hover:bg-pine/90 text-white shrink-0"
                size="sm"
              >
                Send
              </Button>
            </div>
          )}
        </div>

        {/* Code editor — always present; the candidate types here on coding questions */}
        <div className="flex flex-col flex-1 min-w-[340px] border-r border-line bg-ink">
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-2">
            <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-white/50">
              {language} · candidate editor
            </span>
            <span
              className={cn(
                'rounded px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider',
                status === 'thinking' && 'bg-brass/20 text-brass',
                status === 'speaking' && 'bg-good/25 text-[#9FE3C0]',
                status !== 'thinking' && status !== 'speaking' && 'bg-white/10 text-white/45'
              )}
            >
              read-only
            </span>
          </div>
          <div className="flex-1">
            <CodeEditor value={code} language={language} />
          </div>
        </div>

        {/* Notes panel */}
        <div className="w-72 shrink-0 flex flex-col bg-surface-2">
          <div className="px-5 py-4 border-b border-line">
            <p className="font-mono text-[10px] font-semibold text-ink-2 uppercase tracking-[0.16em]">Interview notes</p>
          </div>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Jot down observations, red flags, follow-up questions…"
            className="flex-1 resize-none border-0 rounded-none bg-transparent text-sm text-ink focus-visible:ring-0 p-5"
          />
          <div className="px-5 py-3 border-t border-line">
            <Button
              onClick={saveNotes}
              variant="outline"
              size="sm"
              className="w-full border-line text-ink hover:bg-surface"
            >
              {notesSaved ? 'Saved ✓' : 'Save notes'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
