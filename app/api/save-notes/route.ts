import { NextRequest, NextResponse } from 'next/server'

interface SaveNotesRequest {
  sessionId: string
  candidateId: string
  notes: string
}

export async function POST(req: NextRequest) {
  try {
    const body: SaveNotesRequest = await req.json()

    if (!body.sessionId || typeof body.sessionId !== 'string') {
      return NextResponse.json({ error: 'sessionId is required' }, { status: 400 })
    }
    if (!body.candidateId || typeof body.candidateId !== 'string') {
      return NextResponse.json({ error: 'candidateId is required' }, { status: 400 })
    }
    if (typeof body.notes !== 'string') {
      return NextResponse.json({ error: 'notes must be a string' }, { status: 400 })
    }

    // TODO: Persist to Redis via lib/redis.ts
    // await saveSession(body.sessionId, updatedSession)

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
