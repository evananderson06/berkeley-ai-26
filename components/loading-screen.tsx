'use client'

interface LoadingScreenProps {
  message: string
  progress: number // 0–100
}

export function LoadingScreen({ message, progress }: LoadingScreenProps) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-white">
      <p className="text-2xl font-bold text-slate-900 tracking-tight mb-12">
        Interview<span className="text-indigo-600">IQ</span>
      </p>

      {/* Progress bar */}
      <div className="w-64 h-1.5 bg-slate-100 rounded-full overflow-hidden mb-6">
        <div
          className="h-full bg-indigo-500 rounded-full transition-all duration-500 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Message */}
      <p className="text-sm text-slate-500 transition-opacity duration-300">{message}</p>
    </div>
  )
}
