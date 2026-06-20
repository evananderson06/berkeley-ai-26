import { Redis } from '@upstash/redis'
import { InterviewSession } from '@/types'

export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
})

const SESSION_TTL_SECONDS = 60 * 60 * 24 // 24 hours

export async function saveSession(sessionId: string, session: InterviewSession): Promise<void> {
  await redis.set(`session:${sessionId}`, JSON.stringify(session), { ex: SESSION_TTL_SECONDS })
}

export async function getSession(sessionId: string): Promise<InterviewSession | null> {
  const data = await redis.get<string>(`session:${sessionId}`)
  if (!data) return null
  return typeof data === 'string' ? JSON.parse(data) : data
}
