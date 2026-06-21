// Tunable knobs for the voice interview (voice-interview branch — see CONTEXT.md §17).
// THRESHOLD is the live default; the interview page exposes a slider that overrides it at runtime.

export const VOICE = {
  // ── Barge-in ──────────────────────────────────────────────────────────────
  // While the AI is speaking, the interviewer's mic RMS (0..1) must exceed
  // THRESHOLD continuously for DEBOUNCE_MS to count as a real interruption.
  // Open speakers leak the AI's own voice into the mic → keep THRESHOLD above
  // that echo floor (raise it if the AI interrupts itself). Headphones → can lower.
  THRESHOLD: 0.06,
  DEBOUNCE_MS: 200,

  // ── STT (Deepgram nova-3, browser) ────────────────────────────────────────
  STT_MODEL: 'nova-3',
  ENDPOINTING_MS: 300, // trailing silence (ms) that marks speech_final
  UTTERANCE_END_MS: 1000, // fallback turn-end if endpointing doesn't fire
  MIC_TIMESLICE_MS: 250, // MediaRecorder chunk cadence sent to Deepgram

  // ── TTS (Deepgram Aura-2, browser) ────────────────────────────────────────
  TTS_MODEL: 'aura-2-thalia-en', // default / fallback voice
  // Aura-2 English voices we rotate through so each candidate sounds distinct.
  TTS_VOICES: [
    'aura-2-thalia-en',
    'aura-2-andromeda-en',
    'aura-2-helena-en',
    'aura-2-hera-en',
    'aura-2-luna-en',
    'aura-2-cora-en',
    'aura-2-aurora-en',
    'aura-2-iris-en',
    'aura-2-apollo-en',
    'aura-2-arcas-en',
    'aura-2-atlas-en',
    'aura-2-orion-en',
    'aura-2-orpheus-en',
    'aura-2-zeus-en',
    'aura-2-jupiter-en',
    'aura-2-mars-en',
  ],
  TTS_SAMPLE_RATE: 24000, // linear16 mono; playback AudioBuffers use this rate
  PLAYBACK_LEAD_S: 0.08, // jitter headroom before the first audio chunk of a reply
  // Playback speed for the candidate's voice. Aura has no native rate param, so we
  // speed up the PCM via AudioBufferSourceNode.playbackRate (raises pitch a touch;
  // keep ≲1.25 to stay natural). Code-typing sync scales with this automatically.
  SPEECH_RATE: 1.2,

  // ── Browser WS auth ───────────────────────────────────────────────────────
  // We connect directly to Deepgram from the browser, authenticating via the
  // Sec-WebSocket-Protocol subprotocol: new WebSocket(url, [DG_AUTH_SCHEME, token]).
  // Deepgram docs show 'token'. If STT/TTS fail to connect (immediate close / 401
  // before 'open'), flip this to 'bearer' — granted tokens are JWTs and the bearer
  // scheme may be required. This is the single most likely thing to need a flip.
  DG_AUTH_SCHEME: 'bearer' as 'token' | 'bearer',
} as const

export type VoiceState = 'idle' | 'connecting' | 'listening' | 'thinking' | 'speaking' | 'paused' | 'error'

// Pick a stable voice for a candidate: random across candidates, consistent for
// the same one across turns/sessions (hash the id so it never drifts).
export function voiceForCandidate(seed: string): string {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0
  return VOICE.TTS_VOICES[Math.abs(h) % VOICE.TTS_VOICES.length]
}
