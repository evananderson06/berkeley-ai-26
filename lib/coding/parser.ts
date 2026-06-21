// Splits a streamed candidate response into two channels as it arrives:
//   [SPEAK]…[/SPEAK]  → narration, routed to the chat
//   [CODE]…[/CODE]    → code, routed to the Monaco editor
//
// The catch is that a delimiter can be split across two network chunks
// ("…[CO" then "DE]…"), so we can't just .split() each chunk. This is an
// incremental scanner: it emits everything it's sure about and holds back only
// the trailing bytes that *might* be the start of a delimiter until the next
// push() (or flush()) resolves them.
//
// Narration is the default channel — any text outside a [CODE] block (including
// stray text if the model forgets a delimiter) is treated as speech, and a
// closing tag always returns us to narration. Only [CODE] diverts to the editor.

export type Channel = 'speak' | 'code'

export interface Segment {
  channel: Channel
  text: string
}

const TOKENS: Array<{ tok: string; channel: Channel }> = [
  { tok: '[CODE]', channel: 'code' },
  { tok: '[/CODE]', channel: 'speak' },
  { tok: '[SPEAK]', channel: 'speak' },
  { tok: '[/SPEAK]', channel: 'speak' },
]

// Longest suffix of `buf` that is a strict prefix of any delimiter token. Those
// bytes are ambiguous — they might complete into a delimiter — so we keep them
// buffered rather than emit them as content.
function danglingPrefixLen(buf: string): number {
  let max = 0
  for (const { tok } of TOKENS) {
    const limit = Math.min(tok.length - 1, buf.length)
    for (let n = limit; n > 0; n--) {
      if (buf.endsWith(tok.slice(0, n)) && n > max) max = n
    }
  }
  return max
}

export class DelimiterParser {
  private buffer = ''
  private channel: Channel = 'speak'

  push(text: string): Segment[] {
    this.buffer += text
    const out: Segment[] = []

    for (;;) {
      // Find the earliest delimiter anywhere in the buffer.
      let bestIdx = -1
      let best: (typeof TOKENS)[number] | null = null
      for (const t of TOKENS) {
        const i = this.buffer.indexOf(t.tok)
        if (i !== -1 && (bestIdx === -1 || i < bestIdx)) {
          bestIdx = i
          best = t
        }
      }

      if (best && bestIdx !== -1) {
        const before = this.buffer.slice(0, bestIdx)
        if (before) out.push({ channel: this.channel, text: before })
        this.channel = best.channel
        this.buffer = this.buffer.slice(bestIdx + best.tok.length)
        continue
      }

      // No complete delimiter left. Emit everything except a possible partial
      // delimiter at the tail.
      const hold = danglingPrefixLen(this.buffer)
      const emit = this.buffer.slice(0, this.buffer.length - hold)
      if (emit) out.push({ channel: this.channel, text: emit })
      this.buffer = this.buffer.slice(this.buffer.length - hold)
      break
    }

    return mergeAdjacent(out)
  }

  // Call when the stream ends (or is aborted) to release any held-back tail.
  flush(): Segment[] {
    const out: Segment[] = []
    if (this.buffer) out.push({ channel: this.channel, text: this.buffer })
    this.buffer = ''
    return out
  }
}

// Coalesce runs on the same channel so consumers get one segment per channel
// switch instead of many tiny ones.
function mergeAdjacent(segs: Segment[]): Segment[] {
  const out: Segment[] = []
  for (const s of segs) {
    const last = out[out.length - 1]
    if (last && last.channel === s.channel) last.text += s.text
    else out.push({ ...s })
  }
  return out
}
