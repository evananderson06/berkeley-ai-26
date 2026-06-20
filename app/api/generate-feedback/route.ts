import { NextRequest, NextResponse } from 'next/server'
import { Candidate, Message, FeedbackReport } from '@/types'
import { anthropic } from '@/lib/anthropic'

interface GenerateFeedbackRequest {
  candidates: Candidate[]
  interviews: Record<string, Message[]>
  notes: Record<string, string>
  jobTitle: string
  hiringDecision: string
  reasoning: string
}

const FEEDBACK_TOOL = {
  name: 'generate_feedback',
  description: 'Generate structured feedback on the interviewer\'s performance',
  input_schema: {
    type: 'object' as const,
    properties: {
      overallScore: {
        type: 'number',
        description: 'Score from 0–100 reflecting overall interviewing quality',
      },
      whatWentWell: {
        type: 'array',
        items: { type: 'string' },
        description: '3–5 specific things the interviewer did well, referencing actual moments where possible',
      },
      areasForImprovement: {
        type: 'array',
        items: { type: 'string' },
        description: '3–5 concrete areas to improve, referencing missed opportunities or weak questions',
      },
      correctHire: {
        type: 'string',
        description: 'The candidate ID of the objectively best hire based on qualityTier and greenFlags',
      },
      userPickedCorrectly: {
        type: 'boolean',
        description: 'Whether the user selected the correct hire',
      },
      keyMoments: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            quote: { type: 'string', description: 'A direct quote from the interview transcript' },
            commentary: { type: 'string', description: 'What this moment reveals about the interviewer or candidate' },
          },
          required: ['quote', 'commentary'],
        },
        description: '2–4 notable moments from the transcripts — good probes, missed red flags, or revealing candidate answers',
      },
    },
    required: ['overallScore', 'whatWentWell', 'areasForImprovement', 'correctHire', 'userPickedCorrectly', 'keyMoments'],
  },
}

function formatTranscripts(
  candidates: Candidate[],
  interviews: Record<string, Message[]>,
  notes: Record<string, string>
): string {
  return candidates.map((c) => {
    const msgs = interviews[c.id] ?? []
    const transcript = msgs.length > 1
      ? msgs.map((m) => `  ${m.role === 'user' ? 'INTERVIEWER' : c.name}: ${m.content}`).join('\n')
      : '  (No interview conducted)'
    const candidateNotes = notes[c.id] ? `  Notes: ${notes[c.id]}` : '  Notes: (none)'
    return `--- ${c.name} (${c.role}, ${c.yearsExperience} yrs) ---
Quality tier [HIDDEN FROM USER]: ${c.qualityTier}
Red flags [HIDDEN FROM USER]: ${c.redFlags.length ? c.redFlags.join('; ') : 'none'}
Green flags [HIDDEN FROM USER]: ${c.greenFlags.length ? c.greenFlags.join('; ') : 'none'}
${candidateNotes}
Transcript:
${transcript}`
  }).join('\n\n')
}

export async function POST(req: NextRequest) {
  try {
    const body: GenerateFeedbackRequest = await req.json()

    if (!Array.isArray(body.candidates) || body.candidates.length === 0) {
      return NextResponse.json({ error: 'candidates is required' }, { status: 400 })
    }
    if (!body.hiringDecision || typeof body.hiringDecision !== 'string') {
      return NextResponse.json({ error: 'hiringDecision is required' }, { status: 400 })
    }

    const chosenCandidate = body.candidates.find((c) => c.id === body.hiringDecision)
    const transcriptBlock = formatTranscripts(body.candidates, body.interviews ?? {}, body.notes ?? {})

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      tools: [FEEDBACK_TOOL],
      tool_choice: { type: 'tool', name: 'generate_feedback' },
      system: `You are an expert hiring coach evaluating an interviewer's performance in a simulated interview session.
You have access to the full candidate profiles (including hidden quality tiers and red/green flags that the interviewer could not see), all interview transcripts, and the interviewer's notes.
Be specific, honest, and constructive. Reference actual quotes and moments from the transcripts when possible.
The "correct hire" is always the candidate with qualityTier "strong". If no strong candidate exists, pick the best "adequate" one.`,
      messages: [
        {
          role: 'user',
          content: `Please evaluate my interviewing performance for this ${body.jobTitle ? `${body.jobTitle} ` : ''}hiring session.

INTERVIEWER'S HIRING DECISION: ${chosenCandidate?.name ?? body.hiringDecision}
INTERVIEWER'S REASONING: ${body.reasoning || '(no reasoning provided)'}

CANDIDATE PROFILES & TRANSCRIPTS:
${transcriptBlock}

Evaluate:
1. Overall quality of questions asked across interviews
2. Whether they surfaced red flags (especially for the deceptive candidate)
3. Whether they gave appropriate weight to strong vs. weak candidates
4. Specific moments that demonstrate good or poor interviewing technique
5. Whether they made the right hiring decision`,
        },
      ],
    })

    const toolUseBlock = message.content.find((b) => b.type === 'tool_use')
    if (!toolUseBlock || toolUseBlock.type !== 'tool_use') {
      throw new Error(`Claude did not return tool_use. stop_reason: ${message.stop_reason}`)
    }

    const feedback = toolUseBlock.input as FeedbackReport

    return NextResponse.json({ feedback })
  } catch (err) {
    console.error('[generate-feedback]', err)
    return NextResponse.json({ error: 'Failed to generate feedback' }, { status: 500 })
  }
}
