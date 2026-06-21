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

type Archetype = CandidateSpec['tierSpec']
type Spec = Omit<CandidateSpec, 'jobTitle' | 'jobDescription' | 'index'>

const POOL_SIZE = 3

// The one guaranteed "good fit" slot draws from these — weighted toward strong, with adequate
// as the floor (never worse), so every pool has at least one genuinely hireable candidate.
const GOOD_FIT_ARCHETYPES: Archetype[] = [
  'exceptional_standout',
  'strong_solid',
  'strong_solid',
  'strong_understated',
  'adequate_senior',
  'adequate_junior',
]

// The remaining slots can be anyone — the full spread, good or bad.
const ALL_ARCHETYPES: Archetype[] = [
  'exceptional_standout',
  'strong_solid',
  'strong_understated',
  'adequate_senior',
  'adequate_junior',
  'mediocre_coaster',
  'poor_deceptive',
  'poor_underqualified',
]

const RESUME_STYLES: Spec['resumeStyle'][] = ['executive', 'modern', 'classic', 'flashy', 'garish']

// Generic loading flavor, shown in completion order — never maps to a specific candidate.
const GENERATION_MESSAGES = [
  'Reviewing the role…',
  'Sourcing candidates…',
  'Writing up résumés…',
  'Finishing the candidate pool…',
]

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// A fresh randomized slate: one guaranteed good-fit candidate plus the rest drawn from the full
// archetype spread, each with a distinct résumé style, then shuffled so the good fit isn't always
// in the same position.
function buildSlate(): Spec[] {
  const tiers: Archetype[] = [pickRandom(GOOD_FIT_ARCHETYPES)]
  while (tiers.length < POOL_SIZE) tiers.push(pickRandom(ALL_ARCHETYPES))
  const styles = shuffle(RESUME_STYLES)
  return shuffle(tiers).map((tierSpec, i) => ({ tierSpec, resumeStyle: styles[i % styles.length] }))
}

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
      const slate = buildSlate()
      const names = pickDistinctNames(slate.length)

      const promises = slate.map((spec, i) =>
        fetch('/api/generate-candidate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...spec, jobTitle, jobDescription, index: i, nameHint: names[i] }),
        }).then(async (res) => {
          if (!res.ok) throw new Error(`Failed on candidate ${i + 1}`)
          const data = await res.json()
          completed++
          flushSync(() => {
            setLoadingMessage(GENERATION_MESSAGES[completed - 1] ?? 'Almost done…')
            setLoadingProgress(Math.round((completed / slate.length) * 88) + 5)
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
              We&apos;ll create 3 realistic candidates with a random mix of strengths — always including at least
              one who&apos;s a genuine fit for the role.
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
