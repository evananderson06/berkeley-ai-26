'use client'

import { useState } from 'react'
import { flushSync } from 'react-dom'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { LoadingScreen } from '@/components/loading-screen'
import type { CandidateSpec } from '@/app/api/generate-candidate/route'
import type { Candidate } from '@/types'

const FIRST_NAMES = [
  'Amara', 'Anjali', 'Beatriz', 'Björn', 'Camille', 'Catalina', 'Chioma', 'Dae-Jung',
  'Dmitri', 'Elif', 'Emeka', 'Fatima', 'Florencia', 'Gustavo', 'Hana', 'Hector',
  'Imani', 'Ingrid', 'Jae-Won', 'Javier', 'Kemi', 'Kiran', 'Kwame', 'Layla',
  'Leila', 'Luciana', 'Magnus', 'Mahmoud', 'Makena', 'Mateus', 'Mei-Ling', 'Miriam',
  'Nadia', 'Ngozi', 'Nizhoni', 'Olumide', 'Penelope', 'Rashid', 'Ryo', 'Saoirse',
  'Seun', 'Siobhan', 'Sofía', 'Takoda', 'Tariq', 'Tomas', 'Uma', 'Vicente',
  'Wanjiku', 'Xochitl', 'Yael', 'Yosef', 'Zara', 'Zineb', 'Aleksei', 'Amani',
  'Chiamaka', 'Daria', 'Ekene', 'Fumiko', 'Geneviève', 'Hamid', 'Ifeoma', 'Joon-Ho',
]

const LAST_NAMES = [
  'Adeyemi', 'Al-Amin', 'Al-Hassan', 'Andersson', 'Brightwater', 'Castro', 'Chen',
  'Diallo', 'Ferreira', 'Flores', 'Gutierrez', 'Herrera', 'Huang', 'Kamau', 'Khalil',
  'Kim', 'Kowalski', 'Kumar', 'Laurent', 'Lindqvist', 'Mensah', 'Mizrahi', 'Morales',
  'Murphy', 'Nair', 'Nakamura', 'Nazari', 'Nguyen', 'Okafor', 'Okonkwo', 'Osei',
  'Patel', 'Petrov', 'Reyes', 'Santos', 'Singh', 'Svensson', 'Tremblay', 'Volkov',
  'Wanjiku', 'Whitehorse', 'Yamamoto', 'Yılmaz', 'Zuberi', 'Abebe', 'Boateng', 'Cardoso',
  'Delacroix', 'Esposito', 'Farouk', 'Gomez', 'Hashimoto', 'Ibrahim', 'Jensen', 'Kapoor',
  'Lindberg', 'Mwangi', 'Nkrumah', 'Okeke', 'Park', 'Quiroga', 'Rousseau', 'Suzuki',
]

function pickDistinctNames(count: number): string[] {
  const firsts = [...FIRST_NAMES].sort(() => Math.random() - 0.5)
  const lasts = [...LAST_NAMES].sort(() => Math.random() - 0.5)
  return Array.from({ length: count }, (_, i) => `${firsts[i]} ${lasts[i]}`)
}

const CANDIDATE_PIPELINE: Array<{
  spec: Omit<CandidateSpec, 'jobTitle' | 'jobDescription' | 'index'>
  message: string
  progress: number
}> = [
  { spec: { tierSpec: 'strong',               resumeStyle: 'executive' }, message: 'Creating the standout candidate…',   progress: 10 },
  { spec: { tierSpec: 'adequate_senior',       resumeStyle: 'modern'   }, message: 'Building a solid mid-level hire…',   progress: 28 },
  { spec: { tierSpec: 'adequate_junior',       resumeStyle: 'classic'  }, message: 'Adding a promising junior…',          progress: 46 },
  { spec: { tierSpec: 'poor_deceptive',        resumeStyle: 'flashy'   }, message: 'Hiding a few red flags…',            progress: 64 },
  { spec: { tierSpec: 'poor_underqualified',   resumeStyle: 'garish'   }, message: 'Finishing the candidate pool…',      progress: 82 },
]

export default function HomePage() {
  const router = useRouter()
  const [jobTitle, setJobTitle] = useState('')
  const [jobDescription, setJobDescription] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadingMessage, setLoadingMessage] = useState('')
  const [loadingProgress, setLoadingProgress] = useState(0)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!jobTitle.trim() || !jobDescription.trim()) {
      setError('Please fill in both fields.')
      return
    }
    setError('')

    flushSync(() => {
      setLoading(true)
      setLoadingMessage('Generating your candidate pool…')
      setLoadingProgress(5)
    })

    try {
      let completed = 0
      const names = pickDistinctNames(CANDIDATE_PIPELINE.length)

      const promises = CANDIDATE_PIPELINE.map(({ spec }, i) =>
        fetch('/api/generate-candidate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...spec, jobTitle, jobDescription, index: i, nameHint: names[i] }),
        }).then(async (res) => {
          if (!res.ok) throw new Error(`Failed on candidate ${i + 1}`)
          const data = await res.json()
          completed++
          const pipeline = CANDIDATE_PIPELINE[completed - 1]
          flushSync(() => {
            setLoadingMessage(pipeline?.message ?? 'Almost done…')
            setLoadingProgress(Math.round((completed / CANDIDATE_PIPELINE.length) * 88) + 5)
          })
          return { index: i, candidate: data.candidate as Candidate }
        })
      )

      const results = await Promise.all(promises)
      results.sort((a, b) => a.index - b.index)
      const candidates = results.map((r) => r.candidate)

      flushSync(() => {
        setLoadingMessage('Finalizing your candidate pool…')
        setLoadingProgress(97)
      })

      localStorage.setItem('interviewiq_candidates', JSON.stringify(candidates))
      localStorage.setItem('interviewiq_job', JSON.stringify({ jobTitle, jobDescription }))
      router.push('/candidates')
    } catch {
      setError('Something went wrong. Please try again.')
      setLoading(false)
    }
  }

  if (loading) return <LoadingScreen message={loadingMessage} progress={loadingProgress} />

  return (
    <div className="flex min-h-[calc(100vh-56px)] items-center justify-center px-4">
      <div className="w-full max-w-lg">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">
            Interview<span className="text-indigo-600">IQ</span>
          </h1>
          <p className="mt-2 text-slate-500 text-sm">
            Enter a role to generate AI candidates and practice your interviewing skills.
          </p>
        </div>

        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="pb-4">
            <CardTitle className="text-base font-semibold text-slate-800">New Interview Session</CardTitle>
            <CardDescription className="text-slate-500 text-sm">
              We&apos;ll create 5 realistic candidates — one standout, a few middle-of-the-pack, and one to test your judgment.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-1.5">
                <Label htmlFor="jobTitle" className="text-slate-700">Job Title</Label>
                <Input
                  id="jobTitle"
                  placeholder="e.g. Senior Software Engineer"
                  value={jobTitle}
                  onChange={(e) => setJobTitle(e.target.value)}
                  className="border-slate-200 focus:ring-indigo-500"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="jobDescription" className="text-slate-700">Job Description</Label>
                <Textarea
                  id="jobDescription"
                  placeholder="Paste the job description or key requirements..."
                  value={jobDescription}
                  onChange={(e) => setJobDescription(e.target.value)}
                  rows={6}
                  className="border-slate-200 focus:ring-indigo-500 resize-none"
                />
              </div>

              {error && <p className="text-sm text-red-600">{error}</p>}

              <Button
                type="submit"
                disabled={loading}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white"
              >
                Generate Candidates
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
