'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

const STEPS = [
  { label: 'Setup', href: '/' },
  { label: 'Candidates', href: '/candidates' },
  { label: 'Interview', href: '/candidates' },
  { label: 'Decide', href: '/decision' },
  { label: 'Feedback', href: '/feedback' },
]

function getActiveStep(pathname: string): number {
  if (pathname === '/') return 0
  if (pathname.startsWith('/candidates') && pathname.includes('/interview')) return 2
  if (pathname.startsWith('/candidates')) return 1
  if (pathname.startsWith('/decision')) return 3
  if (pathname.startsWith('/feedback')) return 4
  return 0
}

export function Nav() {
  const pathname = usePathname()
  const activeStep = getActiveStep(pathname)

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-surface/85 backdrop-blur">
      <div className="mx-auto max-w-7xl px-6 h-14 flex items-center justify-between">
        <Link href="/" className="group flex items-center gap-2">
          <span className="relative flex h-5 w-5 items-center justify-center rounded-[5px] bg-pine">
            <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-brass" />
          </span>
          <span className="text-lg font-semibold tracking-tight text-ink">
            Interview<span className="text-pine">IQ</span>
          </span>
        </Link>

        <nav className="flex items-center gap-1">
          {STEPS.map((step, i) => {
            const isActive = i === activeStep
            const isComplete = i < activeStep
            return (
              <div key={step.label} className="flex items-center">
                <span
                  className={cn(
                    'px-2.5 py-1 rounded-md font-mono text-[11px] uppercase tracking-[0.1em] transition-colors',
                    isActive && 'bg-pine-soft text-pine',
                    isComplete && 'text-ink-2',
                    !isActive && !isComplete && 'text-ink-2/45'
                  )}
                >
                  {isComplete && <span className="mr-1 text-good">✓</span>}
                  {step.label}
                </span>
                {i < STEPS.length - 1 && <span className="mx-0.5 text-line">›</span>}
              </div>
            )
          })}
        </nav>
      </div>
    </header>
  )
}
