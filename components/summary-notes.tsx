import { cn } from '@/lib/utils'

// Renders an interview summary (newline-separated jot notes) as a bullet list.
// Tolerant of any leading bullet characters the model emits ("- ", "• ", "* ").
export function SummaryNotes({ summary, className }: { summary: string; className?: string }) {
  const items = summary
    .split('\n')
    .map((l) => l.replace(/^[\s\-•*]+/, '').trim())
    .filter(Boolean)
  if (items.length === 0) return null
  return (
    <ul className={cn('space-y-1', className)}>
      {items.map((it, i) => (
        <li key={i} className="flex gap-2 text-xs text-slate-600 leading-relaxed">
          <span className="text-slate-300 shrink-0 mt-0.5">•</span>
          <span>{it}</span>
        </li>
      ))}
    </ul>
  )
}
