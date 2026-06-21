'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { ArrowLeft, CheckCircle2 } from 'lucide-react'
import { PLACEHOLDER_CANDIDATES } from '@/lib/data'
import { Candidate } from '@/types'
import { SummaryNotes } from '@/components/summary-notes'
import { ResumeDisplay } from '@/components/resume-templates'

export default function ResumePage() {
  const params = useParams()
  const id = params.id as string
  const [candidate, setCandidate] = useState<Candidate | null>(null)
  const [completed, setCompleted] = useState(false)
  const [summary, setSummary] = useState('')

  useEffect(() => {
    const raw = localStorage.getItem('interviewiq_candidates')
    const candidates: Candidate[] = raw ? JSON.parse(raw) : PLACEHOLDER_CANDIDATES
    setCandidate(candidates.find((c) => c.id === id) ?? null)
    setCompleted(localStorage.getItem(`interviewiq_completed_${id}`) === 'true')
    setSummary(localStorage.getItem(`interviewiq_summary_${id}`) ?? '')
  }, [id])

  if (!candidate) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-10">
        <div className="h-96 flex items-center justify-center text-ink-2 text-sm">Loading…</div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <div className="mb-6">
        <Button asChild variant="ghost" size="sm" className="text-ink-2 hover:text-ink -ml-2">
          <Link href="/candidates">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back to candidates
          </Link>
        </Button>
      </div>

      {/* The candidate's actual résumé, rendered in one of several realistic formats
          based on candidate.resumeStyle (ResumeDisplay handles that dispatch). The
          templates are intentionally document-like, so only the card chrome is themed. */}
      <div className="border border-line rounded-xl shadow-soft overflow-hidden animate-reveal-up">
        <ResumeDisplay candidate={candidate} />
      </div>

      {completed && summary && (
        <div className="mt-6 rounded-xl bg-surface border border-line shadow-soft p-5">
          <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-2 mb-2">Interview summary</p>
          <SummaryNotes summary={summary} />
        </div>
      )}

      <div className="mt-6 flex justify-end">
        {completed ? (
          <div className="flex items-center gap-1.5 text-sm font-medium text-good">
            <CheckCircle2 className="h-4 w-4" />
            Interview completed
          </div>
        ) : (
          <Button asChild className="bg-pine hover:bg-pine/90 text-white">
            <Link href={`/candidates/${id}/interview`}>Start interview →</Link>
          </Button>
        )}
      </div>
    </div>
  )
}
