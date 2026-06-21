// Splits a streamed candidate response into ordered "channels" as it arrives and
// assembles them into playback ACTIONS (speak / type / edit / delete / clear).
//
//   [SPEAK]…[/SPEAK]              → narration, routed to the chat + TTS
//   [CODE]…[/CODE]               → brand-new code, appended to the editor
//   [EDIT]old…[NEW]new…[/EDIT]   → in-place edit: find `old` in the editor, swap in `new`
//   [DELETE]old…[/DELETE]        → remove `old` from the editor
//   [CLEAR]                      → wipe the editor (starting a fresh problem)
//
// The catch is that a delimiter can be split across two network chunks
// ("…[CO" then "DE]…"), so we can't just .split() each chunk. DelimiterParser is
// an incremental scanner: it emits everything it's sure about and holds back only
// the trailing bytes that *might* be the start of a delimiter until the next
// push() (or flush()) resolves them.
//
// Narration is the default channel — any text outside a code/edit block (including
// stray text if the model forgets a delimiter) is treated as speech.

export type Channel = 'speak' | 'code' | 'editOld' | 'editNew' | 'delete' | 'clear'

export interface Segment {
  channel: Channel
  text: string
}

// A unit of playback. The runner in useVoiceInterview consumes these in order,
// pacing code typing to the spoken explanation so the candidate "explains what
// it's doing line by line" (CONTEXT.md §17.7).
export type Action =
  | { kind: 'speak'; text: string }
  | { kind: 'type'; text: string } // append brand-new code
  | { kind: 'edit'; oldText: string; newText: string } // patch existing code
  | { kind: 'delete'; oldText: string }
  | { kind: 'clear' }

const TOKENS: Array<{ tok: string; channel: Channel }> = [
  { tok: '[CODE]', channel: 'code' },
  { tok: '[/CODE]', channel: 'speak' },
  { tok: '[SPEAK]', channel: 'speak' },
  { tok: '[/SPEAK]', channel: 'speak' },
  { tok: '[EDIT]', channel: 'editOld' },
  { tok: '[NEW]', channel: 'editNew' },
  { tok: '[/EDIT]', channel: 'speak' },
  { tok: '[DELETE]', channel: 'delete' },
  { tok: '[/DELETE]', channel: 'speak' },
  { tok: '[CLEAR]', channel: 'clear' },
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

// Turns the channel stream into ordered Actions. It accumulates each contiguous
// "run" of a channel and emits an action when the run ends (the channel changes
// or the stream flushes), so a whole [SPEAK] sentence or [CODE] block becomes one
// action — which lets the runner pair an explanation with the code it describes.
export class ActionAssembler {
  private parser = new DelimiterParser()
  private runChannel: Channel = 'speak'
  private runBuf = ''
  private editOld = ''
  private editNew = ''

  push(text: string): Action[] {
    return this.consume(this.parser.push(text))
  }

  flush(): Action[] {
    const out = this.consume(this.parser.flush())
    out.push(...this.endRun())
    return out
  }

  private consume(segs: Segment[]): Action[] {
    const out: Action[] = []
    for (const seg of segs) {
      if (seg.channel !== this.runChannel) {
        out.push(...this.endRun())
        this.runChannel = seg.channel
        this.runBuf = ''
        if (seg.channel === 'clear') out.push({ kind: 'clear' })
        if (seg.channel === 'editOld') {
          this.editOld = ''
          this.editNew = ''
        }
      }
      this.runBuf += seg.text
    }
    // Stream narration out at sentence boundaries so speech starts quickly (low
    // time-to-first-audio) instead of waiting for the whole [SPEAK] run to close.
    // A terminator only counts if it's followed by whitespace/end (or is a
    // newline) — so a dot inside "a.b" or "3.14" doesn't split the clause, which
    // would make TTS speak a clause-final "a." with a full-stop pause.
    if (this.runChannel === 'speak') {
      const m = this.runBuf.match(/^[\s\S]*(?:[.!?](?=\s)|\n)/)
      if (m && m[0].trim()) {
        out.push({ kind: 'speak', text: m[0] })
        this.runBuf = this.runBuf.slice(m[0].length)
      }
    }
    return out
  }

  private endRun(): Action[] {
    const out: Action[] = []
    const buf = this.runBuf
    this.runBuf = ''
    switch (this.runChannel) {
      case 'speak':
        if (buf.trim()) out.push({ kind: 'speak', text: buf })
        break
      case 'code':
        if (buf.trim()) out.push({ kind: 'type', text: buf })
        break
      case 'editOld':
        // Old snippet captured; the edit is emitted when [NEW]'s run ends.
        this.editOld += buf
        break
      case 'editNew':
        this.editNew += buf
        if (this.editOld.trim() || this.editNew.trim()) {
          out.push({ kind: 'edit', oldText: this.editOld, newText: this.editNew })
        }
        break
      case 'delete':
        if (buf.trim()) out.push({ kind: 'delete', oldText: buf })
        break
      case 'clear':
        break
    }
    return out
  }
}
