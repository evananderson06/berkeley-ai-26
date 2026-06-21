'use client'

import { useEffect, useState } from 'react'
import { flushSync } from 'react-dom'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Label } from '@/components/ui/label'
import { PLACEHOLDER_CANDIDATES } from '@/lib/data'
import { Candidate, Message } from '@/types'
import { LoadingScreen } from '@/components/loading-screen'
import { SummaryNotes } from '@/components/summary-notes'

export default function DecisionPage() {
  const router = useRouter()
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [interviews, setInterviews] = useState<Record<string, Message[]>>({})
  const [summaries, setSummaries] = useState<Record<string, string>>({})
  const [jobTitle, setJobTitle] = useState('')
  const [selected, setSelected] = useState('')
  const [reasoning, setReasoning] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadingMessage, setLoadingMessage] = useState('Reviewing your interviews…')
  const [loadingProgress, setLoadingProgress] = useState(5)

  useEffect(() => {
    const raw = localStorage.getItem('interviewiq_candidates')
    const loaded: Candidate[] = raw ? JSON.parse(raw) : PLACEHOLDER_CANDIDATES
    setCandidates(loaded)

    const job = localStorage.getItem('interviewiq_job')
    if (job) setJobTitle(JSON.parse(job).jobTitle)

    const notesMap: Record<string, string> = {}
    const interviewMap: Record<string, Message[]> = {}
    const summaryMap: Record<string, string> = {}
    for (const c of loaded) {
      const n = localStorage.getItem(`interviewiq_notes_${c.id}`)
      if (n) notesMap[c.id] = n
      const m = localStorage.getItem(`interviewiq_messages_${c.id}`)
      if (m) interviewMap[c.id] = JSON.parse(m)
      const s = localStorage.getItem(`interviewiq_summary_${c.id}`)
      if (s) summaryMap[c.id] = s
    }
    setNotes(notesMap)
    setInterviews(interviewMap)
    setSummaries(summaryMap)
  }, [])

  async function handleGetFeedback() {
    if (!selected) return
    setLoading(true)

    try {
      const res = await fetch('/api/generate-feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ candidates, interviews, notes, jobTitle, hiringDecision: selected, reasoning }),
      })

      if (!res.body) throw new Error('No response body')

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const parts = buffer.split('\n\n')
        buffer = parts.pop() ?? ''

        for (const part of parts) {
          const line = part.trim()
          if (!line.startsWith('data: ')) continue
          const event = JSON.parse(line.slice(6))

          if (event.type === 'progress') {
            flushSync(() => {
              setLoadingMessage(event.message)
              setLoadingProgress(event.progress)
            })
          } else if (event.type === 'done') {
            localStorage.setItem('interviewiq_feedback', JSON.stringify(event.feedback))
            router.push('/feedback')
          } else if (event.type === 'error') {
            throw new Error(event.message)
          }
        }
      }
    } catch {
      setLoading(false)
    }
  }

  if (loading) return <LoadingScreen message={loadingMessage} progress={loadingProgress} />

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <div className="mb-9">
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-pine mb-2">Hiring decision</p>
        <h1 className="font-display text-3xl tracking-tight text-ink">Who are you hiring?</h1>
        <p className="mt-2 text-ink-2 text-sm">
          Review what each interview surfaced and commit to a pick. The verdict comes next.
        </p>
      </div>

      <RadioGroup value={selected} onValueChange={setSelected} className="space-y-4">
        {candidates.map((candidate) => (
          <div key={candidate.id} className="relative">
            <RadioGroupItem value={candidate.id} id={candidate.id} className="peer sr-only" />
            <Label htmlFor={candidate.id} className="cursor-pointer block">
              <Card
                className={`border-line bg-surface shadow-soft rounded-xl transition-all ${
                  selected === candidate.id ? 'border-pine ring-1 ring-pine' : 'hover:border-ink-2/30'
                }`}
              >
                <CardContent className="py-4 px-5 flex items-start gap-4">
                  <Avatar className="h-10 w-10 shrink-0 rounded-xl bg-pine-soft border border-line">
                    <AvatarFallback className="rounded-xl bg-pine-soft text-pine font-mono text-sm font-semibold">
                      {candidate.initials}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className="font-semibold text-ink text-sm">{candidate.name}</p>
                      <p className="font-mono text-[11px] text-ink-2/70">{candidate.role}</p>
                    </div>
                    {summaries[candidate.id] ? (
                      <SummaryNotes summary={summaries[candidate.id]} className="mt-2" />
                    ) : (
                      <p className="text-sm text-ink-2/60 mt-1 italic">Not interviewed yet.</p>
                    )}
                    {notes[candidate.id] && (
                      <p className="text-xs text-ink-2/70 mt-2">Your notes: {notes[candidate.id]}</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </Label>
          </div>
        ))}
      </RadioGroup>

      <div className="mt-8 space-y-2">
        <Label htmlFor="reasoning" className="text-ink">
          Your reasoning
        </Label>
        <Textarea
          id="reasoning"
          placeholder="Why did you choose this candidate? What made them stand out?"
          value={reasoning}
          onChange={(e) => setReasoning(e.target.value)}
          rows={4}
          className="border-line resize-none px-3 py-2.5"
        />
      </div>

      <div className="mt-6 flex justify-end">
        <Button
          onClick={handleGetFeedback}
          disabled={!selected || loading}
          className="bg-pine hover:bg-pine/90 text-white"
        >
          Reveal the verdict →
        </Button>
      </div>
    </div>
  )
}
