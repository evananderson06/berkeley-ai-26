import { NextRequest, NextResponse } from 'next/server'
import { Candidate } from '@/types'
import { PLACEHOLDER_CANDIDATES } from '@/lib/data'

interface GenerateCandidatesRequest {
  jobTitle: string
  jobDescription: string
}

export async function POST(req: NextRequest) {
  try {
    const body: GenerateCandidatesRequest = await req.json()

    if (!body.jobTitle || typeof body.jobTitle !== 'string') {
      return NextResponse.json({ error: 'jobTitle is required' }, { status: 400 })
    }
    if (!body.jobDescription || typeof body.jobDescription !== 'string') {
      return NextResponse.json({ error: 'jobDescription is required' }, { status: 400 })
    }

    // TODO: Replace with real Claude generation using lib/anthropic.ts
    // The AI should tailor candidate backgrounds to the specific job title and description.
    const candidates: Candidate[] = PLACEHOLDER_CANDIDATES

    return NextResponse.json({ candidates })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
