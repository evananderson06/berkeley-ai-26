'use client'

import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Candidate } from '@/types'
import { cn } from '@/lib/utils'
import { CodeEditor } from '@/components/code-editor'
import { useCodingInterview } from '@/lib/coding/useCodingInterview'

function formatTime(ts: string) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

interface CodingInterviewProps {
  candidate: Candidate
  candidateId: string
}

// Shown when the interviewer asks a coding question: chat on the left, a live
// (read-only) Monaco editor on the right. The interviewer types a question; the
// candidate narrates into the chat and types code into the editor. Sending a
// new message while the candidate is mid-answer interrupts and resumes them.
export function CodingInterview({ candidate, candidateId }: CodingInterviewProps) {
  const { messages, code, status, language, send } = useCodingInterview({ candidate, candidateId })
  const [draft, setDraft] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const busy = status !== 'idle'

  function submit() {
    const text = draft.trim()
    if (!text) return
    send(text)
    setDraft('')
  }

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Chat / narration */}
      <div className="flex w-[42%] min-w-[320px] flex-col border-r border-slate-200">
        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
          {messages.length === 0 && (
            <p className="text-sm text-slate-400">
              Ask {candidate.name.split(' ')[0]} a coding question below — for example,
              “Write a function to check if a string is a palindrome.” They’ll talk through it here
              while typing in the editor.
            </p>
          )}

          {messages.map((msg, i) => (
            <div
              key={i}
              className={cn('flex gap-3', msg.role === 'user' ? 'flex-row-reverse' : 'flex-row')}
            >
              <div
                className={cn(
                  'max-w-[80%] whitespace-pre-wrap rounded-xl px-4 py-2.5 text-sm leading-relaxed',
                  msg.role === 'user'
                    ? 'bg-indigo-600 text-white'
                    : 'border border-slate-200 bg-white text-slate-800'
                )}
              >
                {msg.content || (status !== 'idle' && i === messages.length - 1 ? '…' : '')}
                <p
                  className={cn(
                    'mt-1 text-[10px]',
                    msg.role === 'user' ? 'text-indigo-200' : 'text-slate-400'
                  )}
                >
                  {formatTime(msg.timestamp)}
                </p>
              </div>
            </div>
          ))}

          {status === 'thinking' && (
            <div className="flex gap-3">
              <div className="rounded-xl border border-slate-200 bg-white px-4 py-2.5">
                <span className="text-sm text-slate-400">Thinking…</span>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <div className="space-y-2 border-t border-slate-200 bg-white px-4 py-3">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                submit()
              }
            }}
            placeholder={
              busy
                ? 'Interrupt with a follow-up or hint…'
                : 'Ask a coding question (Enter to send, Shift+Enter for newline)'
            }
            className="min-h-[60px] resize-none border-slate-200 text-sm"
          />
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-slate-400">
              {busy ? 'Candidate is responding — sending interrupts and resumes them.' : 'Editor is read-only for you.'}
            </span>
            <Button
              onClick={submit}
              disabled={!draft.trim()}
              size="sm"
              className="bg-indigo-600 text-white hover:bg-indigo-700"
            >
              {busy ? 'Interject' : 'Send'}
            </Button>
          </div>
        </div>
      </div>

      {/* Editor */}
      <div className="flex flex-1 flex-col bg-[#1e1e1e]">
        <div className="flex items-center justify-between border-b border-slate-800 px-4 py-2">
          <span className="text-xs font-medium uppercase tracking-widest text-slate-400">
            {language} · candidate editor
          </span>
          <span
            className={cn(
              'rounded px-2 py-0.5 text-[10px] font-medium',
              status === 'streaming' && 'bg-emerald-900/40 text-emerald-300',
              status === 'thinking' && 'bg-amber-900/40 text-amber-300',
              status === 'idle' && 'bg-slate-800 text-slate-400'
            )}
          >
            {status === 'streaming' ? 'typing…' : status === 'thinking' ? 'thinking…' : 'read-only'}
          </span>
        </div>
        <div className="flex-1">
          <CodeEditor value={code} language={language} />
        </div>
      </div>
    </div>
  )
}
