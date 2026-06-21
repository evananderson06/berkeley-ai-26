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
        <div className="h-96 flex items-center justify-center text-slate-400 text-sm">Loading…</div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <div className="mb-6">
        <Button asChild variant="ghost" size="sm" className="text-slate-500 hover:text-slate-700 -ml-2">
          <Link href="/candidates">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back to candidates
          </Link>
        </Button>
      </div>

      <div className="border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <ResumeDisplay candidate={candidate} />
      </div>

      {completed && summary && (
        <div className="mt-6 rounded-lg bg-slate-50 border border-slate-100 p-4">
          <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-1">
            Interview Summary
          </p>
          <SummaryNotes summary={summary} />
        </div>
      )}

      <div className="mt-6 flex justify-end">
        {completed ? (
          <div className="flex items-center gap-1.5 text-sm font-medium text-emerald-700">
            <CheckCircle2 className="h-4 w-4" />
            Interview completed
          </div>
        ) : (
          <Button asChild className="bg-indigo-600 hover:bg-indigo-700 text-white">
            <Link href={`/candidates/${id}/interview`}>Start Interview →</Link>
          </Button>
        )}
      </div>
    </div>
  )
}
