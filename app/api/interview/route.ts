import { NextRequest, NextResponse } from 'next/server'
import { Message } from '@/types'

interface InterviewRequest {
  candidateId: string
  messages: Message[]
  newMessage: string
}

export async function POST(req: NextRequest) {
  try {
    const body: InterviewRequest = await req.json()

    if (!body.candidateId || typeof body.candidateId !== 'string') {
      return NextResponse.json({ error: 'candidateId is required' }, { status: 400 })
    }
    if (!body.newMessage || typeof body.newMessage !== 'string') {
      return NextResponse.json({ error: 'newMessage is required' }, { status: 400 })
    }
    if (!Array.isArray(body.messages)) {
      return NextResponse.json({ error: 'messages must be an array' }, { status: 400 })
    }

    // TODO: Replace with real Claude roleplay using lib/anthropic.ts
    // Pass candidate persona as system prompt, message history as context.
    const reply = `That's a great question. In my experience at my last role, I tackled something similar by breaking the problem down into smaller milestones and aligning early with stakeholders on success criteria. I'd love to tell you more about how that unfolded — what aspect are you most curious about?`

    return NextResponse.json({ reply })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
