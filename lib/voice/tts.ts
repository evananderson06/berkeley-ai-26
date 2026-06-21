// Deepgram Aura-2 streaming TTS via a RAW browser WebSocket.
//
// Why raw (not @deepgram/sdk v5): the SDK's speak socket runs JSON.parse on EVERY
// incoming frame before your handler, so Aura's binary linear16 PCM throws inside the
// SDK and never reaches you. A raw WebSocket with binaryType='arraybuffer' gives us the
// audio directly. Auth is via the Sec-WebSocket-Protocol subprotocol. See CONTEXT.md §17.6.
//
// End-of-reply is gated on the server's "Flushed" control frame AND the local queue
// draining, so streaming gaps don't prematurely flip the state machine.

import { VOICE } from './config'
import { forSpeech } from './pronounce'

export interface TtsController {
  speak: (text: string) => void // one-shot reply (e.g. the greeting)
  feed: (text: string) => void // stream a clause of an in-progress reply
  finishReply: () => void // no more clauses coming — allow the reply to end
  stop: () => void // barge-in: drop queued audio + halt server synthesis
  close: () => void
}

export interface TtsCallbacks {
  onSpeakingStart?: () => void
  onSpeakingEnd?: () => void
  onError?: (e: unknown) => void
}

function int16ToFloat32(ab: ArrayBuffer): Float32Array {
  const view = new DataView(ab)
  const n = Math.floor(ab.byteLength / 2)
  const out = new Float32Array(n)
  for (let i = 0; i < n; i++) out[i] = view.getInt16(i * 2, true) / 32768 // little-endian
  return out
}

export function createTts(
  accessToken: string,
  audioCtx: AudioContext,
  cbs: TtsCallbacks = {},
  model: string = VOICE.TTS_MODEL
): Promise<TtsController> {
  return new Promise((resolve, reject) => {
    const params = new URLSearchParams({
      model,
      encoding: 'linear16',
      sample_rate: String(VOICE.TTS_SAMPLE_RATE),
    })
    const ws = new WebSocket(`wss://api.deepgram.com/v1/speak?${params.toString()}`, [
      VOICE.DG_AUTH_SCHEME,
      accessToken,
    ])
    ws.binaryType = 'arraybuffer'

    let nextStart = 0
    let active = false // currently playing a reply
    let flushed = false // server signalled end of the current reply's audio
    let expectingMore = false // more clauses of this reply are still coming
    let generation = 0 // bumped on stop() to invalidate in-flight audio
    const sources = new Set<AudioBufferSourceNode>()

    // Coalesce Aura's many small PCM frames into ~120ms buffers before scheduling.
    // Scheduling one node per tiny frame creates a boundary (and, with playbackRate,
    // a resampling seam) at every frame → audible stutter, worst at the start where
    // frames are smallest/burstiest. Fewer, larger buffers play smoothly.
    const MIN_BUFFER_SAMPLES = Math.round(VOICE.TTS_SAMPLE_RATE * 0.12)
    const TAIL_FLUSH_MS = 60 // flush a partial buffer if the stream pauses this long
    let pending: Float32Array[] = []
    let pendingLen = 0
    let flushTimer: ReturnType<typeof setTimeout> | null = null

    const clearPending = () => {
      if (flushTimer) {
        clearTimeout(flushTimer)
        flushTimer = null
      }
      pending = []
      pendingLen = 0
    }

    // A reply ends only once the caller has stopped feeding clauses
    // (expectingMore === false), the server has flushed, and the queue drained —
    // so inter-clause gaps in a streamed reply don't flip the state machine.
    function maybeEnd(gen: number) {
      if (active && flushed && !expectingMore && sources.size === 0 && gen === generation) {
        active = false
        cbs.onSpeakingEnd?.()
      }
    }

    function synth(text: string) {
      // Rewrite technical notation (O(n), a.b, n^2…) into its spoken form. Only
      // the audio is affected; the chat transcript keeps the original notation.
      const t = forSpeech(text).trim()
      if (!t || ws.readyState !== WebSocket.OPEN) return
      flushed = false
      ws.send(JSON.stringify({ type: 'Speak', text: t }))
      ws.send(JSON.stringify({ type: 'Flush' })) // synthesize now → low time-to-first-audio
    }

    // Concatenate everything buffered so far into one AudioBuffer and schedule it.
    function scheduleBuffer(gen: number) {
      if (flushTimer) {
        clearTimeout(flushTimer)
        flushTimer = null
      }
      if (gen !== generation || pendingLen === 0) return
      const merged = new Float32Array(pendingLen)
      let off = 0
      for (const c of pending) {
        merged.set(c, off)
        off += c.length
      }
      pending = []
      pendingLen = 0

      const buffer = audioCtx.createBuffer(1, merged.length, VOICE.TTS_SAMPLE_RATE)
      buffer.getChannelData(0).set(merged)
      const src = audioCtx.createBufferSource()
      src.buffer = buffer
      src.playbackRate.value = VOICE.SPEECH_RATE // faster speech (Aura has no rate param)
      src.connect(audioCtx.destination)
      if (!active) {
        active = true
        nextStart = audioCtx.currentTime + VOICE.PLAYBACK_LEAD_S // jitter headroom on first buffer
        cbs.onSpeakingStart?.()
      }
      // If we've fallen behind (underrun), don't just snap to "now" with zero slack —
      // that leaves us gap-prone for the rest of the reply. Rebuild the jitter buffer.
      if (nextStart < audioCtx.currentTime) nextStart = audioCtx.currentTime + VOICE.PLAYBACK_LEAD_S
      src.start(nextStart)
      nextStart += buffer.duration / VOICE.SPEECH_RATE // sped-up buffer plays for less time
      sources.add(src)
      src.onended = () => {
        sources.delete(src)
        maybeEnd(gen)
      }
    }

    function enqueue(pcm: ArrayBuffer, gen: number) {
      if (gen !== generation) return // stale chunk from a barged-in reply
      const f32 = int16ToFloat32(pcm)
      if (f32.length === 0) return
      pending.push(f32)
      pendingLen += f32.length
      if (pendingLen >= MIN_BUFFER_SAMPLES) {
        scheduleBuffer(gen)
      } else {
        // Not enough for a full buffer yet — flush the remainder if the stream stalls,
        // so trailing audio (end of a clause) isn't held back indefinitely.
        if (flushTimer) clearTimeout(flushTimer)
        flushTimer = setTimeout(() => {
          flushTimer = null
          scheduleBuffer(generation)
        }, TAIL_FLUSH_MS)
      }
    }

    const controller: TtsController = {
      speak: (text) => {
        expectingMore = false
        synth(text)
      },
      feed: (text) => {
        expectingMore = true
        synth(text)
      },
      finishReply: () => {
        expectingMore = false
        maybeEnd(generation)
      },
      stop: () => {
        generation++ // invalidate queued + in-flight chunks
        clearPending()
        try {
          if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'Clear' }))
        } catch {}
        sources.forEach((s) => {
          try {
            s.stop()
          } catch {}
        })
        sources.clear()
        active = false
        flushed = false
        expectingMore = false
        nextStart = audioCtx.currentTime
        // NB: we do NOT fire onSpeakingEnd here — the caller (hook) owns the
        // post-barge-in transition, avoiding a double state update.
      },
      close: () => {
        clearPending()
        try {
          if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'Close' }))
        } catch {}
        sources.forEach((s) => {
          try {
            s.stop()
          } catch {}
        })
        sources.clear()
        try {
          ws.close()
        } catch {}
      },
    }

    let opened = false
    ws.onopen = () => {
      opened = true
      resolve(controller)
    }
    ws.onerror = (e) => {
      if (!opened) reject(new Error('TTS websocket failed to connect (check DG_AUTH_SCHEME)'))
      else cbs.onError?.(e)
    }
    ws.onmessage = (ev) => {
      const gen = generation
      if (typeof ev.data === 'string') {
        // JSON control frame: Metadata / Flushed / Cleared / Warning
        try {
          const m = JSON.parse(ev.data)
          if (m.type === 'Flushed') {
            scheduleBuffer(gen) // play any sub-threshold tail before considering the reply done
            flushed = true
            maybeEnd(gen)
          }
        } catch {}
        return
      }
      if (ev.data instanceof ArrayBuffer) enqueue(ev.data, gen)
      else if (ArrayBuffer.isView(ev.data)) enqueue((ev.data as ArrayBufferView).buffer as ArrayBuffer, gen)
    }
  })
}
