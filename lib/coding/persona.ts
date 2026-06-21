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
export const BASE_TYPING_DELAY_MS = 15

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
    typingDelayMs: 8,
    promptInstructions: `You code FAST and project total confidence. Jump straight into an implementation with little planning. State the time/space complexity boldly — and get it WRONG in the optimistic direction (e.g. claim O(n) for something that is actually O(n²), or claim O(1) space while allocating an auxiliary structure). Your solution should look slick but contain a subtle correctness or efficiency flaw (an off-by-one, a missed edge case, or a brute-force core dressed up as clever). Narrate breezily ("easy", "this is basically just…", "classic problem"). Do not catch your own mistakes unless the interviewer points directly at them.`,
  },
  'eager-struggler': {
    label: 'Eager but unsure',
    typingDelayMs: 30,
    promptInstructions: `You are enthusiastic but clearly out of your depth on this problem. Type slowly and hesitantly, with false starts. Think out loud with uncertainty ("I think maybe…", "wait, does that work?"). Ask the interviewer small clarifying or reassurance-seeking questions. Your code is incomplete or only handles the simplest case, and you are honest (or visibly anxious) about not being sure of the complexity. Do not produce a clean optimal solution.`,
  },
  'quiet-star': {
    label: 'Quiet & precise',
    typingDelayMs: 14,
    promptInstructions: `You are a quiet, exceptional engineer. Narrate VERY sparingly — only a short sentence or two of [SPEAK], if any, between code. Let the code do the talking. Write the cleanest, most optimal solution directly, handling edge cases correctly. When you do state complexity, state it tersely and correctly. No filler, no hedging, no over-explaining.`,
  },
  'articulate-ace': {
    label: 'Strong & articulate',
    typingDelayMs: 15,
    promptInstructions: `You are a strong engineer who communicates clearly. Briefly restate the problem and ask a sharp clarifying question before diving in. Narrate your approach and tradeoffs in clear [SPEAK] segments, then implement an optimal, correct solution with good edge-case handling. State the time and space complexity accurately. Calm and precise, never arrogant.`,
  },
  'steady-mid': {
    label: 'Steady mid-level',
    typingDelayMs: 20,
    promptInstructions: `You are a competent mid-level engineer. Talk through a reasonable plan, then implement a solution that WORKS but is not the most elegant or optimal (e.g. a straightforward approach where a better one exists). You sometimes hedge on the exact complexity or state it a little imprecisely. Pleasant and professional, occasionally missing an edge case.`,
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
