'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { CheckCircle2, ArrowRight } from 'lucide-react'
import { PLACEHOLDER_CANDIDATES } from '@/lib/data'
import { Candidate } from '@/types'
import { SummaryNotes } from '@/components/summary-notes'

export default function CandidatesPage() {
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [jobTitle, setJobTitle] = useState<string>('')
  const [completed, setCompleted] = useState<Record<string, boolean>>({})
  const [summaries, setSummaries] = useState<Record<string, string>>({})

  useEffect(() => {
    const raw = localStorage.getItem('interviewiq_candidates')
    const loaded: Candidate[] = raw ? JSON.parse(raw) : PLACEHOLDER_CANDIDATES
    setCandidates(loaded)

    const job = localStorage.getItem('interviewiq_job')
    if (job) setJobTitle(JSON.parse(job).jobTitle)

    const done: Record<string, boolean> = {}
    const sums: Record<string, string> = {}
    for (const c of loaded) {
      if (localStorage.getItem(`interviewiq_completed_${c.id}`) === 'true') done[c.id] = true
      const s = localStorage.getItem(`interviewiq_summary_${c.id}`)
      if (s) sums[c.id] = s
    }
    setCompleted(done)
    setSummaries(sums)
  }, [])

  return (
    <div className="mx-auto max-w-6xl px-6 py-12">
      <div className="mb-9">
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-pine mb-2">Candidate pool</p>
        <h1 className="font-display text-3xl tracking-tight text-ink">Who do you want to talk to?</h1>
        <p className="mt-2 text-ink-2 text-sm">
          {jobTitle ? (
            <>
              For <span className="font-mono text-ink">{jobTitle}</span> · interview them by voice or text, then decide.
            </>
          ) : (
            'Review resumes and interview candidates. Take notes as you go.'
          )}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {candidates.map((candidate, i) => {
          const isDone = completed[candidate.id]
          return (
            <Card
              key={candidate.id}
              className="border-line bg-surface shadow-soft rounded-xl flex flex-col transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lift animate-reveal-up"
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <CardContent className="px-6 pt-6 flex-1">
                <div className="flex items-start gap-4">
                  <Avatar className="h-12 w-12 shrink-0 rounded-xl bg-pine-soft border border-line">
                    <AvatarFallback className="rounded-xl bg-pine-soft text-pine font-mono text-sm font-semibold">
                      {candidate.initials}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-ink truncate">{candidate.name}</p>
                      {isDone && (
                        <span className="shrink-0 inline-flex items-center gap-1 rounded-full border border-good/25 bg-good/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.1em] text-good">
                          <CheckCircle2 className="h-3 w-3" />
                          Interviewed
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-ink-2 truncate">{candidate.role}</p>
                    <p className="font-mono text-[11px] text-ink-2/70 mt-0.5">{candidate.yearsExperience} yrs experience</p>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-1.5">
                  {candidate.skills.slice(0, 3).map((skill) => (
                    <Badge
                      key={skill}
                      variant="secondary"
                      className="text-xs bg-surface-2 border border-line text-ink-2 font-normal"
                    >
                      {skill}
                    </Badge>
                  ))}
                  {candidate.skills.length > 3 && (
                    <Badge variant="secondary" className="text-xs bg-surface-2 border border-line text-ink-2/60 font-normal">
                      +{candidate.skills.length - 3}
                    </Badge>
                  )}
                </div>

                {isDone && summaries[candidate.id] && (
                  <div className="mt-4 rounded-lg bg-surface-2 border border-line px-3.5 py-3">
                    <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-2/80 mb-2.5">
                      Interview summary
                    </p>
                    <SummaryNotes summary={summaries[candidate.id]} />
                  </div>
                )}
              </CardContent>

              <CardFooter className="gap-2 pt-2 pb-5 px-6">
                <Button
                  asChild
                  variant="outline"
                  size="sm"
                  className="flex-1 border-line text-ink hover:bg-surface-2"
                >
                  <Link href={`/candidates/${candidate.id}/resume`}>View resume</Link>
                </Button>
                {isDone ? (
                  <div className="flex-1 flex items-center justify-center gap-1.5 text-sm font-medium text-good">
                    <CheckCircle2 className="h-4 w-4" />
                    Completed
                  </div>
                ) : (
                  <Button asChild size="sm" className="flex-1 bg-pine hover:bg-pine/90 text-white">
                    <Link href={`/candidates/${candidate.id}/interview`}>Interview</Link>
                  </Button>
                )}
              </CardFooter>
            </Card>
          )
        })}
      </div>

      <div className="mt-10 flex justify-end">
        <Button asChild className="bg-pine hover:bg-pine/90 text-white">
          <Link href="/decision" className="inline-flex items-center gap-1.5">
            Make hiring decision
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </div>
    </div>
  )
}
