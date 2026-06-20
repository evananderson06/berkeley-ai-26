import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { PLACEHOLDER_CANDIDATES } from '@/lib/data'

const AVATAR_COLORS = [
  'bg-indigo-100 text-indigo-700',
  'bg-violet-100 text-violet-700',
  'bg-sky-100 text-sky-700',
  'bg-emerald-100 text-emerald-700',
  'bg-amber-100 text-amber-700',
]

export default function CandidatesPage() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Candidate Pool</h1>
        <p className="mt-1 text-slate-500 text-sm">Review resumes and conduct interviews. Take notes as you go.</p>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {PLACEHOLDER_CANDIDATES.map((candidate, i) => (
          <Card key={candidate.id} className="border-slate-200 shadow-sm flex flex-col">
            <CardContent className="pt-6 flex-1">
              <div className="flex items-start gap-4">
                <Avatar className={`h-12 w-12 shrink-0 ${AVATAR_COLORS[i % AVATAR_COLORS.length]}`}>
                  <AvatarFallback className={`text-sm font-semibold ${AVATAR_COLORS[i % AVATAR_COLORS.length]}`}>
                    {candidate.initials}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900 truncate">{candidate.name}</p>
                  <p className="text-sm text-slate-500 truncate">{candidate.role}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{candidate.yearsExperience} yrs experience</p>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-1.5">
                {candidate.skills.slice(0, 3).map((skill) => (
                  <Badge key={skill} variant="secondary" className="text-xs bg-slate-100 text-slate-600 font-normal">
                    {skill}
                  </Badge>
                ))}
                {candidate.skills.length > 3 && (
                  <Badge variant="secondary" className="text-xs bg-slate-100 text-slate-400 font-normal">
                    +{candidate.skills.length - 3}
                  </Badge>
                )}
              </div>
            </CardContent>
            <CardFooter className="gap-2 pt-0 pb-5 px-6">
              <Button asChild variant="outline" size="sm" className="flex-1 border-slate-200 text-slate-700 hover:bg-slate-50">
                <Link href={`/candidates/${candidate.id}/resume`}>View Resume</Link>
              </Button>
              <Button asChild size="sm" className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white">
                <Link href={`/candidates/${candidate.id}/interview`}>Interview</Link>
              </Button>
            </CardFooter>
          </Card>
        ))}
      </div>

      <div className="mt-10 flex justify-end">
        <Button asChild className="bg-indigo-600 hover:bg-indigo-700 text-white">
          <Link href="/decision">Make Hiring Decision →</Link>
        </Button>
      </div>
    </div>
  )
}
