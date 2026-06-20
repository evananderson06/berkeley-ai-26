'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { PLACEHOLDER_CANDIDATES } from '@/lib/data'
import { Candidate, Message } from '@/types'
import { cn } from '@/lib/utils'

function formatTime(ts: string) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export default function InterviewPage() {
  const params = useParams()
  const candidateId = params.id as string

  const [candidate, setCandidate] = useState<Candidate | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [notes, setNotes] = useState('')
  const [sending, setSending] = useState(false)
  const [notesSaved, setNotesSaved] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const raw = localStorage.getItem('interviewiq_candidates')
    const candidates: Candidate[] = raw ? JSON.parse(raw) : PLACEHOLDER_CANDIDATES
    const found = candidates.find((c) => c.id === candidateId) ?? null
    setCandidate(found)
    setMessages([
      {
        role: 'assistant',
        content: `Hi, thanks for having me. I'm ${found?.name ?? 'the candidate'}. I'm excited to learn more about this opportunity.`,
        timestamp: new Date().toISOString(),
      },
    ])
  }, [candidateId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function sendMessage() {
    if (!input.trim() || sending || !candidate) return

    const userMsg: Message = { role: 'user', content: input, timestamp: new Date().toISOString() }
    setMessages((prev) => [...prev, userMsg])
    const outgoing = input
    setInput('')
    setSending(true)

    try {
      const res = await fetch('/api/interview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          candidate,
          messages,
          newMessage: outgoing,
        }),
      })
      const data = await res.json()
      const assistantMsg: Message = { role: 'assistant', content: data.reply, timestamp: new Date().toISOString() }
      setMessages((prev) => {
        const next = [...prev, assistantMsg]
        localStorage.setItem(`interviewiq_messages_${candidateId}`, JSON.stringify(next))
        return next
      })
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: '(Error — could not reach candidate)', timestamp: new Date().toISOString() },
      ])
    } finally {
      setSending(false)
    }
  }

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

  return (
    <div className="flex flex-col h-[calc(100vh-56px)]">
      {/* Header */}
      <div className="border-b border-slate-200 bg-white px-6 py-3 flex items-center justify-between shrink-0">
        <div>
          <p className="font-semibold text-slate-900 text-sm">{candidate?.name ?? '…'}</p>
          <p className="text-xs text-slate-400">{candidate?.role} · {candidate?.yearsExperience} yrs exp</p>
        </div>
        <Button asChild variant="outline" size="sm" className="border-slate-200 text-slate-600 hover:bg-slate-50">
          <Link href="/candidates">End Interview</Link>
        </Button>
      </div>

      {/* Body: chat + notes */}
      <div className="flex flex-1 overflow-hidden">
        {/* Chat */}
        <div className="flex flex-col flex-1 border-r border-slate-200">
          <div className="flex-1 overflow-y-auto px-6 py-6 space-y-4">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={cn('flex gap-3', msg.role === 'user' ? 'flex-row-reverse' : 'flex-row')}
              >
                <div
                  className={cn(
                    'max-w-[70%] rounded-xl px-4 py-2.5 text-sm leading-relaxed',
                    msg.role === 'user'
                      ? 'bg-indigo-600 text-white'
                      : 'bg-white border border-slate-200 text-slate-800'
                  )}
                >
                  {msg.content}
                  <p className={cn('text-[10px] mt-1', msg.role === 'user' ? 'text-indigo-200' : 'text-slate-400')}>
                    {formatTime(msg.timestamp)}
                  </p>
                </div>
              </div>
            ))}
            {sending && (
              <div className="flex gap-3">
                <div className="bg-white border border-slate-200 rounded-xl px-4 py-2.5">
                  <span className="text-slate-400 text-sm">Typing…</span>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          <div className="border-t border-slate-200 bg-white px-4 py-3 flex gap-3">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  sendMessage()
                }
              }}
              placeholder="Ask a question… (Enter to send, Shift+Enter for newline)"
              rows={2}
              className="resize-none border-slate-200 text-sm"
            />
            <Button
              onClick={sendMessage}
              disabled={sending || !input.trim() || !candidate}
              className="self-end bg-indigo-600 hover:bg-indigo-700 text-white shrink-0"
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
    </div>
  )
}
