'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Label } from '@/components/ui/label'
import { PLACEHOLDER_CANDIDATES } from '@/lib/data'
import { Candidate, Message } from '@/types'
import { SummaryNotes } from '@/components/summary-notes'

const AVATAR_COLORS = [
  'bg-indigo-100 text-indigo-700',
  'bg-violet-100 text-violet-700',
  'bg-sky-100 text-sky-700',
  'bg-emerald-100 text-emerald-700',
  'bg-amber-100 text-amber-700',
]

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
        body: JSON.stringify({
          candidates,
          interviews,
          notes,
          jobTitle,
          hiringDecision: selected,
          reasoning,
        }),
      })
      const data = await res.json()
      if (data.feedback) {
        localStorage.setItem('interviewiq_feedback', JSON.stringify(data.feedback))
      }
      router.push('/feedback')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Hiring Decision</h1>
        <p className="mt-1 text-slate-500 text-sm">Review your notes and choose who you&apos;d hire.</p>
      </div>

      <RadioGroup value={selected} onValueChange={setSelected} className="space-y-4">
        {candidates.map((candidate, i) => (
          <div key={candidate.id} className="relative">
            <RadioGroupItem value={candidate.id} id={candidate.id} className="peer sr-only" />
            <Label htmlFor={candidate.id} className="cursor-pointer block">
              <Card className={`border-slate-200 shadow-sm transition-all ${selected === candidate.id ? 'border-indigo-500 ring-1 ring-indigo-500' : ''}`}>
                <CardContent className="py-4 px-5 flex items-start gap-4">
                  <Avatar className={`h-10 w-10 shrink-0 ${AVATAR_COLORS[i % AVATAR_COLORS.length]}`}>
                    <AvatarFallback className={`text-sm font-semibold ${AVATAR_COLORS[i % AVATAR_COLORS.length]}`}>
                      {candidate.initials}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className="font-semibold text-slate-900 text-sm">{candidate.name}</p>
                      <p className="text-xs text-slate-400">{candidate.role}</p>
                    </div>
                    {summaries[candidate.id] ? (
                      <SummaryNotes summary={summaries[candidate.id]} className="mt-1.5" />
                    ) : (
                      <p className="text-sm text-slate-400 mt-1 italic">Not interviewed yet.</p>
                    )}
                    {notes[candidate.id] && (
                      <p className="text-xs text-slate-400 mt-2">Your notes: {notes[candidate.id]}</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </Label>
          </div>
        ))}
      </RadioGroup>

      <div className="mt-8 space-y-2">
        <Label htmlFor="reasoning" className="text-slate-700">Your Reasoning</Label>
        <Textarea
          id="reasoning"
          placeholder="Why did you choose this candidate? What made them stand out?"
          value={reasoning}
          onChange={(e) => setReasoning(e.target.value)}
          rows={4}
          className="border-slate-200 resize-none"
        />
      </div>

      <div className="mt-6 flex justify-end">
        <Button
          onClick={handleGetFeedback}
          disabled={!selected || loading}
          className="bg-indigo-600 hover:bg-indigo-700 text-white"
        >
          {loading ? 'Generating feedback…' : 'Get Feedback →'}
        </Button>
      </div>
    </div>
  )
}
