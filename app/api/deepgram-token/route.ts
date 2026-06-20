import { NextResponse } from 'next/server'
import { DeepgramClient } from '@deepgram/sdk'

// Mints a short-lived (~30s) Deepgram access token for the browser, so the
// long-lived DEEPGRAM_API_KEY never leaves the server. The token is only needed
// to OPEN the STT/TTS sockets; once open they stay connected. See CONTEXT.md §17.2.
export const dynamic = 'force-dynamic' // never cache a token

export async function POST() {
  try {
    const apiKey = process.env.DEEPGRAM_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'DEEPGRAM_API_KEY is not set' }, { status: 500 })
    }

    const dg = new DeepgramClient({ apiKey })
    // v5: client.auth.v1.tokens.grant({ ttl_seconds }) -> { access_token, expires_in }
    const res = await dg.auth.v1.tokens.grant({ ttl_seconds: 30 })

    return NextResponse.json({
      accessToken: res.access_token,
      expiresIn: res.expires_in ?? 30,
    })
  } catch (err) {
    console.error('[deepgram-token]', err)
    return NextResponse.json({ error: 'Failed to mint Deepgram token' }, { status: 500 })
  }
}
