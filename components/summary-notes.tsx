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
    <ul className={cn('space-y-2', className)}>
      {items.map((it, i) => (
        <li key={i} className="flex gap-2.5 text-xs text-ink-2 leading-[1.5]">
          <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-pine/50" />
          <span>{it}</span>
        </li>
      ))}
    </ul>
  )
}
