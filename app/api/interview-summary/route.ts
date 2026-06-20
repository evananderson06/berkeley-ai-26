import { NextRequest, NextResponse } from 'next/server'
import { Candidate, Message } from '@/types'
import { anthropic } from '@/lib/anthropic'

interface SummaryRequest {
  candidate: Candidate
  messages: Message[]
}

export async function POST(req: NextRequest) {
  try {
    const body: SummaryRequest = await req.json()
    if (!body.candidate || !Array.isArray(body.messages)) {
      return NextResponse.json({ error: 'candidate and messages are required' }, { status: 400 })
    }

    const c = body.candidate
    const transcript = body.messages
      .filter((m) => m.content?.trim())
      .map((m) => `${m.role === 'user' ? 'INTERVIEWER' : c.name}: ${m.content}`)
      .join('\n')

    if (!body.messages.some((m) => m.role === 'user')) {
      return NextResponse.json({ summary: 'No substantive interview was conducted with this candidate.' })
    }

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 400,
      system: `You write post-interview JOT NOTES for a hiring manager to review later.
Output 3–6 short bullet notes — terse, telegraphic fragments, NOT full sentences. One note per line,
each line starting with "- ". Capture: what was covered, how the candidate came across, specific
strengths shown, and any moments of hesitation, vagueness, or weakness. Ground every note in the
actual transcript.
You are given hidden notes about the candidate's true ability — use them ONLY to gauge how accurate the
candidate's answers were; do NOT state their quality tier or label them strong/weak/deceptive outright
(a separate final verdict does that). Read like an interviewer's own shorthand — neutral and specific.

Example format:
- Walked through the payments migration confidently; gave concrete metrics
- Vague on rollback strategy when pressed — deflected to "the team handled it"
- Strong on system design tradeoffs
- Didn't ask any clarifying questions`,
      messages: [
        {
          role: 'user',
          content: `Candidate: ${c.name} — ${c.role}, ${c.yearsExperience} yrs.
Hidden notes [DO NOT REVEAL]: tier=${c.qualityTier}; red flags=${c.redFlags?.join('; ') || 'none'}; green flags=${c.greenFlags?.join('; ') || 'none'}.

Transcript:
${transcript}

Write the jot notes now (3–6 bullets, one per line, each starting with "- ").`,
        },
      ],
    })

    const summary = message.content[0]?.type === 'text' ? message.content[0].text.trim() : ''
    return NextResponse.json({ summary: summary || 'Interview completed.' })
  } catch (err) {
    console.error('[interview-summary]', err)
    return NextResponse.json({ error: 'Failed to generate summary' }, { status: 500 })
  }
}
