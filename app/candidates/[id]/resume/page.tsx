'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'
import { PLACEHOLDER_CANDIDATES } from '@/lib/data'
import { Candidate } from '@/types'
import { ResumeDisplay } from '@/components/resume-templates'

export default function ResumePage() {
  const params = useParams()
  const id = params.id as string
  const [candidate, setCandidate] = useState<Candidate | null>(null)

  useEffect(() => {
    const raw = localStorage.getItem('interviewiq_candidates')
    const candidates: Candidate[] = raw ? JSON.parse(raw) : PLACEHOLDER_CANDIDATES
    setCandidate(candidates.find((c) => c.id === id) ?? null)
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

      <div className="mt-6 flex justify-end">
        <Button asChild className="bg-indigo-600 hover:bg-indigo-700 text-white">
          <Link href={`/candidates/${id}/interview`}>Start Interview →</Link>
        </Button>
      </div>
    </div>
  )
}
