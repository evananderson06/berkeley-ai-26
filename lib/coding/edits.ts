// Pure helpers for applying the candidate's in-place code edits to the editor
// buffer. The model emits find-and-replace style edits ([EDIT]old[NEW]new[/EDIT],
// [DELETE]old[/DELETE]) — the same paradigm a real code-editing tool uses — so a
// follow-up ("now handle the empty case") patches the existing file instead of
// rewriting it from scratch.

export interface Match {
  start: number // char offset (inclusive)
  end: number // char offset (exclusive)
}

// Locate `snippet` inside `code`. Tries an exact substring match first, then falls
// back to a line-based match that ignores each line's leading/trailing whitespace
// — LLMs routinely get indentation slightly wrong when echoing back a snippet.
export function locate(code: string, snippet: string): Match | null {
  const s = snippet.replace(/^\n+/, '').replace(/\n+$/, '')
  if (!s) return null

  const exact = code.indexOf(s)
  if (exact !== -1) return { start: exact, end: exact + s.length }

  const codeLines = code.split('\n')
  const snipLines = s.split('\n').map((l) => l.trim())
  if (snipLines.length === 0) return null

  // Char offset of the start of each code line.
  const offsets: number[] = []
  let acc = 0
  for (const line of codeLines) {
    offsets.push(acc)
    acc += line.length + 1 // + '\n'
  }

  for (let i = 0; i + snipLines.length <= codeLines.length; i++) {
    let ok = true
    for (let j = 0; j < snipLines.length; j++) {
      if (codeLines[i + j].trim() !== snipLines[j]) {
        ok = false
        break
      }
    }
    if (ok) {
      const last = i + snipLines.length - 1
      return { start: offsets[i], end: offsets[last] + codeLines[last].length }
    }
  }
  return null
}

// Remove the matched range and any single trailing newline it leaves behind, so a
// deleted line doesn't leave a blank gap.
export function deleteSnippet(code: string, oldText: string): string {
  const m = locate(code, oldText)
  if (!m) return code
  let end = m.end
  if (code[end] === '\n') end += 1
  return code.slice(0, m.start) + code.slice(end)
}
