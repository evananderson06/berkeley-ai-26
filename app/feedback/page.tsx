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
        <div className="h-96 flex items-center justify-center text-slate-400 text-sm">Loading…</div>
      </div>
    )
  }

  const correctCandidate = candidates.find((c) => c.id === report.correctHire)
  const scoreColor =
    report.overallScore >= 80
      ? 'text-emerald-600'
      : report.overallScore >= 60
      ? 'text-amber-600'
      : 'text-red-600'

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Interview Feedback Report</h1>
        <p className="mt-1 text-slate-500 text-sm">Here&apos;s how you did as an interviewer.</p>
      </div>

      {/* Score */}
      <Card className="border-slate-200 shadow-sm mb-6">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold text-slate-700">Overall Score</p>
            <p className={`text-2xl font-bold ${scoreColor}`}>
              {report.overallScore}<span className="text-base font-normal text-slate-400">/100</span>
            </p>
          </div>
          <Progress value={report.overallScore} className="h-2 bg-slate-100 [&>div]:bg-indigo-500" />
        </CardContent>
      </Card>

      {/* Correct hire reveal */}
      <Card className={`border shadow-sm mb-6 ${report.userPickedCorrectly ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
        <CardContent className="pt-5 pb-5">
          <div className="flex items-start gap-3">
            {report.userPickedCorrectly ? (
              <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            )}
            <div>
              <p className={`font-semibold text-sm ${report.userPickedCorrectly ? 'text-emerald-800' : 'text-amber-800'}`}>
                {report.userPickedCorrectly ? 'You picked the right candidate!' : 'The strongest candidate was actually…'}
              </p>
              {!report.userPickedCorrectly && correctCandidate && (
                <p className="text-sm text-amber-700 mt-0.5">
                  <strong>{correctCandidate.name}</strong> — {correctCandidate.summary}
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* What went well */}
      <Card className="border-slate-200 shadow-sm mb-5">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-slate-700">What You Did Well</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <ul className="space-y-2">
            {report.whatWentWell.map((item, i) => (
              <li key={i} className="flex gap-2 text-sm text-slate-600">
                <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                {item}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {/* Areas for improvement */}
      <Card className="border-slate-200 shadow-sm mb-5">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-slate-700">Areas for Improvement</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <ul className="space-y-2">
            {report.areasForImprovement.map((item, i) => (
              <li key={i} className="flex gap-2 text-sm text-slate-600">
                <AlertCircle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                {item}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {/* Key moments */}
      {report.keyMoments.length > 0 && (
        <Card className="border-slate-200 shadow-sm mb-8">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-slate-700">Key Moments</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-5">
            {report.keyMoments.map((moment, i) => (
              <div key={i}>
                <blockquote className="flex gap-2 text-sm text-slate-600 italic">
                  <Quote className="h-4 w-4 text-indigo-300 shrink-0 mt-0.5" />
                  {moment.quote}
                </blockquote>
                <p className="text-xs text-slate-400 mt-1.5 pl-6">{moment.commentary}</p>
                {i < report.keyMoments.length - 1 && <Separator className="mt-4" />}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="flex justify-center">
        <Button asChild variant="outline" className="border-slate-200 text-slate-700 hover:bg-slate-50">
          <Link href="/">← Start Over</Link>
        </Button>
      </div>
    </div>
  )
}
