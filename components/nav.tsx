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
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto max-w-7xl px-6 h-14 flex items-center justify-between">
        <Link href="/" className="text-lg font-semibold text-slate-900 tracking-tight">
          Interview<span className="text-indigo-600">IQ</span>
        </Link>

        <nav className="flex items-center gap-1">
          {STEPS.map((step, i) => {
            const isActive = i === activeStep
            const isComplete = i < activeStep
            return (
              <div key={step.label} className="flex items-center">
                <span
                  className={cn(
                    'px-3 py-1 rounded text-xs font-medium transition-colors',
                    isActive && 'bg-indigo-50 text-indigo-700',
                    isComplete && 'text-slate-400',
                    !isActive && !isComplete && 'text-slate-400'
                  )}
                >
                  {isComplete && <span className="mr-1">✓</span>}
                  {step.label}
                </span>
                {i < STEPS.length - 1 && (
                  <span className="mx-1 text-slate-300 text-xs">›</span>
                )}
              </div>
            )
          })}
        </nav>
      </div>
    </header>
  )
}
