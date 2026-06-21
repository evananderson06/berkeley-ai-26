// Maps a candidate's existing persona (qualityTier + red/green flags) onto a
// *coding* archetype that shapes how they answer a live coding question — how
// fast they type, how much they narrate, and whether their solution (and the
// complexity they claim for it) is actually correct. This is the same persona
// system the rest of the app uses (CONTEXT.md §7.2); we only re-express it for
// the editor experience. Nothing new is invented about a candidate.

import { Candidate } from '@/types'

export type CodingArchetype =
  | 'confident-exaggerator'
  | 'eager-struggler'
  | 'quiet-star'
  | 'articulate-ace'
  | 'steady-mid'

// The base "looks like typing" cadence the task calls for. Persona scales it.
// Deliberately slow so the candidate "types" at a calm, watchable pace rather
// than racing ahead of their spoken explanation.
export const BASE_TYPING_DELAY_MS = 45

const COMMUNICATION_HINTS = ['communicat', 'clarif', 'asks great', 'explains']

function isStrongCommunicator(candidate: Candidate): boolean {
  return candidate.greenFlags.some((f) =>
    COMMUNICATION_HINTS.some((h) => f.toLowerCase().includes(h))
  )
}

export function deriveArchetype(candidate: Candidate): CodingArchetype {
  switch (candidate.qualityTier) {
    case 'poor':
      // Hidden red flags → surface confidence that outruns ability.
      // Genuinely underqualified-but-honest → eager but lost.
      return candidate.redFlags.length > 0 ? 'confident-exaggerator' : 'eager-struggler'
    case 'strong':
      return isStrongCommunicator(candidate) ? 'articulate-ace' : 'quiet-star'
    case 'adequate':
    default:
      return 'steady-mid'
  }
}

interface ArchetypeStyle {
  label: string
  // Per-token delay in the editor. The exaggerator hammers it out; the
  // struggler hunts and pecks; the star is deliberate but efficient.
  typingDelayMs: number
  // Behavioral instructions appended to the candidate system prompt. These
  // describe *coding* behavior only — the resume/identity prompt is built
  // separately and stays consistent with the rest of the interview.
  promptInstructions: string
}

const STYLES: Record<CodingArchetype, ArchetypeStyle> = {
  'confident-exaggerator': {
    label: 'Confident & fast',
    typingDelayMs: 26,
    promptInstructions: `You are NOT actually a strong engineer, but you are sure you are. Code FAST with total confidence and almost no planning. Your finished solution MUST be wrong or badly suboptimal in a way you do NOT notice — pick at least one and commit to it: an off-by-one, a mishandled empty/edge case that actually breaks it, a brute-force O(n²) loop you proudly call O(n), or a subtle logic error. State the time/space complexity boldly and INCORRECTLY (too optimistic). Narrate breezily ("easy", "this is basically just…", "classic problem"). Do NOT arrive at the clean optimal answer, and do NOT catch or fix your own mistake unless the interviewer points directly at it. Staying in character as a mediocre-but-overconfident coder matters MORE than writing correct code.`,
  },
  'eager-struggler': {
    label: 'Eager but unsure',
    typingDelayMs: 90,
    promptInstructions: `You are genuinely out of your depth on this problem and CANNOT solve it well — that is the point, do not fight it. Type slowly and hesitantly with false starts (write a line, then change it). Think out loud with real uncertainty ("I think maybe…", "wait, does that even work?", "hmm, not sure about this part"). Ask the interviewer small clarifying or reassurance-seeking questions. Your code MUST stay incomplete or handle only the most trivial case — leave a TODO, stall partway, or write something that doesn't actually return the right answer. Do NOT produce a clean, complete, or optimal solution, and do NOT confidently state a correct complexity. If you find yourself heading toward the right answer, second-guess it and stall.`,
  },
  'quiet-star': {
    label: 'Quiet & precise',
    typingDelayMs: 42,
    promptInstructions: `You are a quiet, exceptional engineer. Narrate VERY sparingly — only a short sentence or two of [SPEAK], if any, between code. Let the code do the talking. Write the cleanest, most optimal solution directly, handling edge cases correctly. When you do state complexity, state it tersely and correctly. No filler, no hedging, no over-explaining.`,
  },
  'articulate-ace': {
    label: 'Strong & articulate',
    typingDelayMs: 45,
    promptInstructions: `You are a strong engineer who communicates clearly. Briefly restate the problem and ask a sharp clarifying question before diving in. Narrate your approach and tradeoffs in clear [SPEAK] segments, then implement an optimal, correct solution with good edge-case handling. State the time and space complexity accurately. Calm and precise, never arrogant.`,
  },
  'steady-mid': {
    label: 'Steady mid-level',
    typingDelayMs: 60,
    promptInstructions: `You are a solid but unremarkable mid-level engineer — competent, not impressive. Talk through a reasonable plan, then implement a solution that WORKS for the common case but is clearly NOT optimal: reach for the straightforward/brute-force approach even when a better one obviously exists, and don't use the elegant trick. Miss at least one edge case (empty input, duplicates, bounds) without noticing. Hedge on the exact time/space complexity or state it a little imprecisely. Pleasant and professional, never slick — do not produce a textbook-perfect optimal answer.`,
  },
}

export function archetypeStyle(archetype: CodingArchetype): ArchetypeStyle {
  return STYLES[archetype]
}

const KNOWN_LANGUAGES: Array<{ match: string; monaco: string }> = [
  { match: 'typescript', monaco: 'typescript' },
  { match: 'javascript', monaco: 'javascript' },
  { match: 'python', monaco: 'python' },
  { match: 'go', monaco: 'go' },
  { match: 'java', monaco: 'java' },
  { match: 'c++', monaco: 'cpp' },
  { match: 'c#', monaco: 'csharp' },
  { match: 'ruby', monaco: 'ruby' },
  { match: 'rust', monaco: 'rust' },
]

// Pick the editor language from the candidate's skills so the code they "type"
// matches who they say they are. Defaults to Python (the usual whiteboard lingua
// franca) when nothing matches.
export function preferredLanguage(candidate: Candidate): string {
  for (const skill of candidate.skills) {
    const s = skill.toLowerCase()
    const hit = KNOWN_LANGUAGES.find((l) => s.includes(l.match))
    if (hit) return hit.monaco
  }
  return 'python'
}
