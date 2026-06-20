import { NextRequest, NextResponse } from 'next/server'
import { FeedbackReport } from '@/types'
import { PLACEHOLDER_FEEDBACK } from '@/lib/data'

interface GenerateFeedbackRequest {
  sessionId: string
  hiringDecision: string
  reasoning: string
}

export async function POST(req: NextRequest) {
  try {
    const body: GenerateFeedbackRequest = await req.json()

    if (!body.sessionId || typeof body.sessionId !== 'string') {
      return NextResponse.json({ error: 'sessionId is required' }, { status: 400 })
    }
    if (!body.hiringDecision || typeof body.hiringDecision !== 'string') {
      return NextResponse.json({ error: 'hiringDecision is required' }, { status: 400 })
    }
    if (typeof body.reasoning !== 'string') {
      return NextResponse.json({ error: 'reasoning must be a string' }, { status: 400 })
    }

    // TODO: Load full session from Redis, send to Claude for real analysis.
    // Claude should evaluate: question quality, red flag detection, time allocation.
    const feedback: FeedbackReport = {
      ...PLACEHOLDER_FEEDBACK,
      userPickedCorrectly: body.hiringDecision === PLACEHOLDER_FEEDBACK.correctHire,
    }

    return NextResponse.json({ feedback })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
