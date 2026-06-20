import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { ArrowLeft } from 'lucide-react'
import { PLACEHOLDER_CANDIDATES } from '@/lib/data'

export default function ResumePage({ params }: { params: { id: string } }) {
  const candidate = PLACEHOLDER_CANDIDATES.find((c) => c.id === params.id)
  if (!candidate) notFound()

  const { resume, name, role, yearsExperience } = candidate

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

      <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-8">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900">{name}</h1>
          <p className="text-slate-500 mt-0.5">{role} · {yearsExperience} years experience</p>
        </div>

        <Separator className="mb-6" />

        {/* Summary */}
        <section className="mb-7">
          <h2 className="text-xs font-semibold text-indigo-600 uppercase tracking-widest mb-3">Summary</h2>
          <p className="text-slate-700 text-sm leading-relaxed">{resume.summary}</p>
        </section>

        {/* Experience */}
        <section className="mb-7">
          <h2 className="text-xs font-semibold text-indigo-600 uppercase tracking-widest mb-4">Experience</h2>
          <div className="space-y-6">
            {resume.experience.map((job, i) => (
              <div key={i}>
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-semibold text-slate-900 text-sm">{job.title}</p>
                    <p className="text-slate-500 text-sm">{job.company}</p>
                  </div>
                  <span className="text-xs text-slate-400 whitespace-nowrap ml-4">
                    {job.startDate} – {job.endDate}
                  </span>
                </div>
                <ul className="mt-2 space-y-1">
                  {job.bullets.map((bullet, j) => (
                    <li key={j} className="text-sm text-slate-600 flex gap-2">
                      <span className="text-slate-300 shrink-0 mt-0.5">•</span>
                      {bullet}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        {/* Education */}
        <section className="mb-7">
          <h2 className="text-xs font-semibold text-indigo-600 uppercase tracking-widest mb-4">Education</h2>
          <div className="space-y-3">
            {resume.education.map((edu, i) => (
              <div key={i} className="flex items-start justify-between">
                <div>
                  <p className="font-semibold text-slate-900 text-sm">{edu.degree}</p>
                  <p className="text-slate-500 text-sm">{edu.institution}</p>
                </div>
                <span className="text-xs text-slate-400 ml-4">{edu.year}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Skills */}
        <section>
          <h2 className="text-xs font-semibold text-indigo-600 uppercase tracking-widest mb-3">Skills</h2>
          <div className="flex flex-wrap gap-2">
            {resume.skills.map((skill) => (
              <Badge key={skill} variant="secondary" className="bg-slate-100 text-slate-700 font-normal">
                {skill}
              </Badge>
            ))}
          </div>
        </section>
      </div>

      <div className="mt-6 flex justify-end">
        <Button asChild className="bg-indigo-600 hover:bg-indigo-700 text-white">
          <Link href={`/candidates/${params.id}/interview`}>Start Interview →</Link>
        </Button>
      </div>
    </div>
  )
}
