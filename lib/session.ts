import { v4 as uuidv4 } from 'uuid'

const SESSION_KEY = 'interviewiq_session_id'

export function getOrCreateSessionId(): string {
  if (typeof window === 'undefined') return uuidv4()

  const existing = localStorage.getItem(SESSION_KEY)
  if (existing) return existing

  const newId = uuidv4()
  localStorage.setItem(SESSION_KEY, newId)
  return newId
}

export function clearSession(): void {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(SESSION_KEY)
  }
}
