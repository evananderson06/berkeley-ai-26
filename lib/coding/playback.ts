// Small helpers the voice hook uses to play back a coding answer so the spoken
// explanation and the typed code stay in sync (CONTEXT.md §17.7).

import { Action } from './parser'

// A minimal async producer/consumer queue. The SSE reader pushes Actions as they
// stream in; the playback runner awaits next() and consumes them in order, so
// playback can start before the whole reply has arrived.
export class ActionQueue {
  private items: Action[] = []
  private wakers: Array<() => void> = []
  private closed = false

  push(...actions: Action[]) {
    this.items.push(...actions)
    this.wake()
  }

  close() {
    this.closed = true
    this.wake()
  }

  private wake() {
    const w = this.wakers
    this.wakers = []
    for (const r of w) r()
  }

  async next(): Promise<Action | null> {
    while (this.items.length === 0 && !this.closed) {
      await new Promise<void>((r) => this.wakers.push(r))
    }
    return this.items.shift() ?? null
  }
}

// Break a code chunk into "typing tokens" (words / whitespace runs / single
// punctuation) so the per-token delay reads as a natural keyboard rhythm.
export function tokenizeCode(text: string): string[] {
  return text.match(/\s+|\w+|[^\s\w]/g) ?? [text]
}

// Rough spoken duration of a narration chunk, used to pace the code typing so a
// line finishes typing about when its explanation finishes being spoken. Aura
// speaks ~180 wpm; we bias a little slow and floor it so short lines still land.
// `rate` mirrors the playback speed-up so faster speech ⇒ faster typing (stays in sync).
export function estimateSpeechMs(text: string, rate = 1): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length
  return Math.max(700, Math.round((words * 320) / rate))
}
