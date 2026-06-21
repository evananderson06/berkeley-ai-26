'use client'

interface LoadingScreenProps {
  message: string
  progress: number // 0–100
}

export function LoadingScreen({ message, progress }: LoadingScreenProps) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-ground">
      <div className="mb-10 flex items-center gap-2.5">
        <span className="relative flex h-6 w-6 items-center justify-center rounded-[6px] bg-pine">
          <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-brass animate-pulse" />
        </span>
        <p className="text-2xl font-semibold tracking-tight text-ink">
          Interview<span className="text-pine">IQ</span>
        </p>
      </div>

      {/* Progress bar */}
      <div className="w-72 h-1.5 bg-line/70 rounded-full overflow-hidden mb-5">
        <div
          className="h-full bg-pine rounded-full transition-all duration-500 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Message */}
      <p className="font-mono text-[12px] text-ink-2 transition-opacity duration-300">{message}</p>
    </div>
  )
}
