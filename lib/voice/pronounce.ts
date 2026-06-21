// Normalizes technical notation in narration into the way a person would SAY it,
// just before the text is handed to Deepgram Aura. Aura reads raw notation
// literally/oddly — "O(n)" comes out as the word "on", "a.b" gets a full-stop
// pause between the letters — so we rewrite the spoken form only. The chat
// transcript keeps the original notation; this is applied at the TTS boundary
// (see tts.ts `synth`), so display and speech can diverge.
//
// Deliberately narrow: it targets the patterns that actually mispronounce in an
// interview (big-O complexity and dotted identifiers), not a general math reader.

// "n^2" → "n squared", "2^n" → "2 to the n", plus the ² / ³ superscript forms.
function speakExponents(text: string): string {
  return text
    .replace(/²/g, ' squared')
    .replace(/³/g, ' cubed')
    .replace(/([A-Za-z0-9])\s*\^\s*([A-Za-z0-9]+)/g, (_m, base: string, exp: string) => {
      if (exp === '2') return `${base} squared`
      if (exp === '3') return `${base} cubed`
      return `${base} to the ${exp}`
    })
}

// Big-O notation: "O(n)" → "big O of n", "O(log n)" → "big O of log n".
// The capital O with a word boundary avoids matching the middle of words like
// "FOO(x)". Exponents inside have already been spoken out by the time we wrap.
function speakBigO(text: string): string {
  return text.replace(/\bO\s*\(([^()]+)\)/g, (_m, inner: string) => `big O of ${inner.trim()}`)
}

// Dotted identifiers: "a.b" / "obj.method" / "main.py" → "a dot b", etc.
// Lookarounds (not capture groups) so chained dots all convert: "a.b.c" →
// "a dot b dot c". Requires a LETTER after the dot, so decimals ("3.14") and
// sentence-ending periods are left alone.
function speakDots(text: string): string {
  return text.replace(/(?<=[A-Za-z0-9])\.(?=[A-Za-z])/g, ' dot ')
}

// Rewrite a clause of narration into its spoken form for TTS. Safe to run on any
// text (plain prose passes through unchanged).
export function forSpeech(text: string): string {
  return speakDots(speakBigO(speakExponents(text)))
}
