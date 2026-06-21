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
    <div className="flex min-h-[calc(100vh-56px)] items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg animate-reveal-up">
        <div className="mb-8 text-center">
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-pine mb-4">AI hiring simulator</p>
          <h1 className="font-display text-4xl sm:text-[44px] leading-[1.06] tracking-tight text-ink">
            Interview the candidates.
            <br />
            Learn who you <em className="italic text-pine">should</em> hire.
          </h1>
          <p className="mt-5 text-ink-2 text-[15px] max-w-md mx-auto leading-relaxed">
            Enter a role and we&apos;ll generate realistic candidates to interview by voice or text — then show you
            who you should have picked, and what you missed.
          </p>
        </div>

        <Card className="bg-surface shadow-soft rounded-xl">
          <CardHeader className="px-7 pt-7 pb-5">
            <CardTitle className="text-base font-semibold text-ink">New session</CardTitle>
            <CardDescription className="text-ink-2 text-sm leading-relaxed">
              We&apos;ll create 5 realistic candidates — one standout, a few middle-of-the-pack, and one to test your
              judgment.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-7 pb-7">
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="jobTitle" className="text-ink">
                  Job title
                </Label>
                <Input
                  id="jobTitle"
                  placeholder="e.g. Senior Software Engineer"
                  value={jobTitle}
                  onChange={(e) => setJobTitle(e.target.value)}
                  className="h-10 border-line px-3"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="jobDescription" className="text-ink">
                  Job description
                </Label>
                <Textarea
                  id="jobDescription"
                  placeholder="Paste the job description or key requirements…"
                  value={jobDescription}
                  onChange={(e) => setJobDescription(e.target.value)}
                  rows={6}
                  className="border-line resize-none min-h-[132px] px-3 py-2.5"
                />
              </div>

              {error && <p className="text-sm text-bad">{error}</p>}

              <Button type="submit" disabled={loading} className="h-10 w-full bg-pine hover:bg-pine/90 text-white">
                Generate candidates
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
