'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import { CheckCircle2, AlertCircle, Quote } from 'lucide-react'
import { PLACEHOLDER_FEEDBACK, PLACEHOLDER_CANDIDATES } from '@/lib/data'
import { FeedbackReport, Candidate } from '@/types'
import { cn } from '@/lib/utils'

export default function FeedbackPage() {
  const [report, setReport] = useState<FeedbackReport | null>(null)
  const [candidates, setCandidates] = useState<Candidate[]>([])

  useEffect(() => {
    const rawFeedback = localStorage.getItem('interviewiq_feedback')
    setReport(rawFeedback ? JSON.parse(rawFeedback) : PLACEHOLDER_FEEDBACK)

    const rawCandidates = localStorage.getItem('interviewiq_candidates')
    setCandidates(rawCandidates ? JSON.parse(rawCandidates) : PLACEHOLDER_CANDIDATES)
  }, [])

  if (!report) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-10">
        <div className="h-96 flex items-center justify-center text-ink-2 text-sm">Loading…</div>
      </div>
    )
  }

  const correctCandidate = candidates.find((c) => c.id === report.correctHire)
  const scoreColor =
    report.overallScore >= 80 ? 'text-good' : report.overallScore >= 60 ? 'text-brass' : 'text-bad'

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <div className="mb-8">
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-pine mb-2">The verdict</p>
        <h1 className="font-display text-3xl tracking-tight text-ink">How you did as an interviewer</h1>
      </div>

      {/* The ruling */}
      <div className="relative overflow-hidden rounded-2xl bg-ink p-8 shadow-soft mb-7 animate-reveal-up">
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: 'radial-gradient(600px 320px at 82% -10%, rgba(198,138,46,.16), transparent 60%)' }}
        />
        <div className="relative space-y-4">
          <span
            className={cn(
              'inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.16em] px-3 py-1.5 rounded-full border',
              report.userPickedCorrectly
                ? 'bg-good/20 text-[#9FE3C0] border-good/40'
                : 'bg-bad/20 text-[#F0A893] border-bad/40'
            )}
          >
            {report.userPickedCorrectly ? (
              <>
                <CheckCircle2 className="h-3.5 w-3.5" /> Good call
              </>
            ) : (
              <>
                <AlertCircle className="h-3.5 w-3.5" /> Reconsider
              </>
            )}
          </span>
          <h2 className="font-display text-3xl sm:text-[40px] leading-[1.12] text-white max-w-2xl">
            {report.userPickedCorrectly ? (
              'You picked the right candidate.'
            ) : (
              <>
                The strongest hire was <em className="italic text-brass">{correctCandidate?.name ?? 'someone else'}</em>.
              </>
            )}
          </h2>
          {!report.userPickedCorrectly && correctCandidate && (
            <p className="text-[#C7D2CC] max-w-2xl leading-relaxed">{correctCandidate.summary}</p>
          )}
        </div>
      </div>

      {/* Score */}
      <Card className="border-line bg-surface shadow-soft rounded-xl mb-6">
        <CardContent className="px-6 py-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold text-ink">Overall score</p>
            <p className={cn('font-display text-3xl', scoreColor)}>
              {report.overallScore}
              <span className="font-mono text-sm font-normal text-ink-2 ml-1">/ 100</span>
            </p>
          </div>
          <Progress value={report.overallScore} className="h-2 bg-surface-2 [&>div]:bg-pine" />
        </CardContent>
      </Card>

      {/* What went well */}
      <Card className="border-line bg-surface shadow-soft rounded-xl mb-5">
        <CardHeader className="px-6 pt-5 pb-3">
          <CardTitle className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-2 font-medium">
            What you did well
          </CardTitle>
        </CardHeader>
        <CardContent className="px-6 pb-5 pt-0">
          <ul className="space-y-2.5">
            {report.whatWentWell.map((item, i) => (
              <li key={i} className="flex gap-2.5 text-sm text-ink leading-relaxed">
                <CheckCircle2 className="h-4 w-4 text-good shrink-0 mt-0.5" />
                {item}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {/* Areas for improvement */}
      <Card className="border-line bg-surface shadow-soft rounded-xl mb-5">
        <CardHeader className="px-6 pt-5 pb-3">
          <CardTitle className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-2 font-medium">
            Where to sharpen
          </CardTitle>
        </CardHeader>
        <CardContent className="px-6 pb-5 pt-0">
          <ul className="space-y-2.5">
            {report.areasForImprovement.map((item, i) => (
              <li key={i} className="flex gap-2.5 text-sm text-ink leading-relaxed">
                <AlertCircle className="h-4 w-4 text-brass shrink-0 mt-0.5" />
                {item}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {/* Key moments */}
      {report.keyMoments.length > 0 && (
        <Card className="border-line bg-surface shadow-soft rounded-xl mb-8">
          <CardHeader className="px-6 pt-5 pb-3">
            <CardTitle className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-2 font-medium">
              Key moments
            </CardTitle>
          </CardHeader>
          <CardContent className="px-6 pb-5 pt-0 space-y-5">
            {report.keyMoments.map((moment, i) => (
              <div key={i}>
                <blockquote className="flex gap-2.5 text-ink italic font-display text-[15px] leading-relaxed">
                  <Quote className="h-4 w-4 text-pine/40 shrink-0 mt-1.5" />
                  {moment.quote}
                </blockquote>
                <p className="text-[13px] text-ink-2 mt-1.5 pl-6 leading-relaxed">{moment.commentary}</p>
                {i < report.keyMoments.length - 1 && <Separator className="mt-4 bg-line" />}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="flex justify-center">
        <Button asChild variant="outline" className="border-line text-ink hover:bg-surface-2">
          <Link href="/">← Start over</Link>
        </Button>
      </div>
    </div>
  )
}
