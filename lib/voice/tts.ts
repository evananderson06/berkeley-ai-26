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
      const t = text.trim()
      if (!t || ws.readyState !== WebSocket.OPEN) return
      flushed = false
      ws.send(JSON.stringify({ type: 'Speak', text: t }))
      ws.send(JSON.stringify({ type: 'Flush' })) // synthesize now → low time-to-first-audio
    }

    function enqueue(pcm: ArrayBuffer, gen: number) {
      if (gen !== generation) return // stale chunk from a barged-in reply
      const f32 = int16ToFloat32(pcm)
      if (f32.length === 0) return
      const buffer = audioCtx.createBuffer(1, f32.length, VOICE.TTS_SAMPLE_RATE)
      buffer.getChannelData(0).set(f32)
      const src = audioCtx.createBufferSource()
      src.buffer = buffer
      src.connect(audioCtx.destination)
      if (!active) {
        active = true
        nextStart = audioCtx.currentTime + VOICE.PLAYBACK_LEAD_S // jitter headroom on first chunk
        cbs.onSpeakingStart?.()
      }
      nextStart = Math.max(audioCtx.currentTime, nextStart)
      src.start(nextStart)
      nextStart += buffer.duration
      sources.add(src)
      src.onended = () => {
        sources.delete(src)
        maybeEnd(gen)
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
