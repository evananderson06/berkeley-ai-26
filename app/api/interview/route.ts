import { NextRequest, NextResponse } from 'next/server'
import { Message, Candidate } from '@/types'
import { anthropic } from '@/lib/anthropic'

interface InterviewRequest {
  candidate: Candidate
  messages: Message[]
  newMessage: string
}

function buildSystemPrompt(candidate: Candidate): string {
  const tierInstructions: Record<Candidate['qualityTier'], string> = {
    strong: `You are a genuinely strong candidate. Give specific, thoughtful answers backed by concrete examples and metrics from your resume. Ask clarifying questions when appropriate. Show intellectual curiosity. You are confident but not arrogant.`,
    adequate: `You are a competent but unremarkable candidate. Your answers are generally correct but lack depth or specificity. You sometimes miss the opportunity to give a strong concrete example — you speak in generalities. You're pleasant and professional.`,
    poor: `${candidate.redFlags.length > 0
      ? `You have hidden weaknesses that only emerge under careful questioning: ${candidate.redFlags.join('; ')}. On the surface you come across as confident, but when pressed for specifics you become vague, deflect, or slightly defensive. You claim ownership of things you didn't fully drive. Don't reveal these red flags openly — only let them slip through when the interviewer probes deeply.`
      : `You are enthusiastic but clearly underqualified for this role. You overestimate your readiness, give textbook answers without real depth, and struggle with questions that require experience you don't yet have. Be genuine and eager, not defensive.`
    }`,
  }

  return `You are ${candidate.name}, a ${candidate.role} candidate being interviewed for a job. You have ${candidate.yearsExperience} years of experience.

BACKGROUND:
${candidate.resume.summary}

YOUR RESUME EXPERIENCE:
${candidate.resume.experience.map(e => `- ${e.title} at ${e.company} (${e.startDate}–${e.endDate})`).join('\n')}

YOUR KEY SKILLS: ${candidate.skills.join(', ')}

YOUR GENUINE STRENGTHS (reflect these naturally when relevant):
${candidate.greenFlags.map(f => `- ${f}`).join('\n')}

BEHAVIORAL INSTRUCTIONS:
${tierInstructions[candidate.qualityTier]}

RULES:
- Stay in character as ${candidate.name} at all times — never break character or acknowledge being an AI
- Keep answers conversational and appropriately concise (2–4 sentences unless elaborating makes sense)
- Be consistent with every detail in your resume — don't invent new facts
- React naturally to follow-up questions; if the interviewer pushes back, respond as this candidate would
- Do not offer unsolicited red flag confessions — only let weaknesses emerge when genuinely probed`
}

export async function POST(req: NextRequest) {
  try {
    const body: InterviewRequest = await req.json()

    if (!body.candidate || typeof body.candidate !== 'object') {
      return NextResponse.json({ error: 'candidate is required' }, { status: 400 })
    }
    if (!body.newMessage || typeof body.newMessage !== 'string') {
      return NextResponse.json({ error: 'newMessage is required' }, { status: 400 })
    }
    if (!Array.isArray(body.messages)) {
      return NextResponse.json({ error: 'messages must be an array' }, { status: 400 })
    }

    // Build conversation history — Anthropic requires starting with a user message,
    // so we skip the initial assistant greeting which was rendered client-side.
    const history = body.messages
      .filter((m) => !(m.role === 'assistant' && body.messages.indexOf(m) === 0))
      .map((m) => ({ role: m.role, content: m.content }))

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: buildSystemPrompt(body.candidate),
      messages: [
        ...history,
        { role: 'user', content: body.newMessage },
      ],
    })

    const reply = response.content[0].type === 'text' ? response.content[0].text : ''

    return NextResponse.json({ reply })
  } catch (err) {
    console.error('[interview]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
