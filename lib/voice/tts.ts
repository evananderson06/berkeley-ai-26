// Deepgram Aura-2 TTS via a RAW browser WebSocket.
//
// Why raw (not @deepgram/sdk v5): the SDK's speak socket runs JSON.parse on EVERY
// incoming frame before your handler, so Aura's binary linear16 PCM throws inside the
// SDK and never reaches you. A raw WebSocket with binaryType='arraybuffer' gives us the
// audio directly. Auth is via the Sec-WebSocket-Protocol subprotocol. See CONTEXT.md §17.6.
//
// Playback model (CONTEXT.md §17.6/§17.7): synthesize a whole line into ONE complete
// AudioBuffer (collect every PCM frame until the server's "Flushed"), then play that
// single buffer. One contiguous buffer = no underruns/stutter, and a known exact
// duration the caller uses to pace code typing in lockstep with the speech.

import { VOICE } from './config'

export interface TtsController {
  /** Synthesize `text` fully and resolve with one AudioBuffer (or null if empty/stopped). */
  synthesize: (text: string) => Promise<AudioBuffer | null>
  /** Play a synthesized buffer. Returns its real (rate-adjusted) duration in ms and a
   *  promise that resolves when playback finishes (or is stopped). */
  play: (buffer: AudioBuffer) => { durationMs: number; ended: Promise<void>; stop: () => void }
  /** Barge-in: cancel any in-flight synthesis + stop current playback. */
  stop: () => void
  close: () => void
}

export interface TtsCallbacks {
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

    let generation = 0 // bumped on stop() to invalidate in-flight synthesis/playback
    let currentSource: AudioBufferSourceNode | null = null
    // The in-flight synthesis collecting PCM frames until the server's Flushed.
    let collector: {
      chunks: Float32Array[]
      len: number
      gen: number
      resolve: (b: AudioBuffer | null) => void
    } | null = null

    function finishCollect() {
      if (!collector) return
      const { chunks, len, gen, resolve: res } = collector
      collector = null
      if (gen !== generation || len === 0) {
        res(null)
        return
      }
      const merged = new Float32Array(len)
      let off = 0
      for (const c of chunks) {
        merged.set(c, off)
        off += c.length
      }
      const buffer = audioCtx.createBuffer(1, merged.length, VOICE.TTS_SAMPLE_RATE)
      buffer.getChannelData(0).set(merged)
      res(buffer)
    }

    const controller: TtsController = {
      synthesize: (text) => {
        const t = text.trim()
        if (!t || ws.readyState !== WebSocket.OPEN) return Promise.resolve(null)
        if (collector) {
          // Shouldn't happen (callers serialize), but never strand a pending promise.
          collector.resolve(null)
          collector = null
        }
        return new Promise<AudioBuffer | null>((res) => {
          collector = { chunks: [], len: 0, gen: generation, resolve: res }
          ws.send(JSON.stringify({ type: 'Speak', text: t }))
          ws.send(JSON.stringify({ type: 'Flush' })) // synthesize now
        })
      },

      play: (buffer) => {
        const gen = generation
        const src = audioCtx.createBufferSource()
        src.buffer = buffer
        src.playbackRate.value = VOICE.SPEECH_RATE // faster speech (Aura has no rate param)
        src.connect(audioCtx.destination)
        currentSource = src
        const ended = new Promise<void>((res) => {
          src.onended = () => {
            if (currentSource === src) currentSource = null
            res()
          }
        })
        if (gen !== generation) {
          // Barged-in between synth and play — don't start.
          try {
            src.disconnect()
          } catch {}
          if (currentSource === src) currentSource = null
          return { durationMs: 0, ended: Promise.resolve(), stop: () => {} }
        }
        src.start(audioCtx.currentTime + 0.04) // tiny lead; the buffer is contiguous
        return {
          durationMs: (buffer.duration / VOICE.SPEECH_RATE) * 1000,
          ended,
          stop: () => {
            try {
              src.stop()
            } catch {}
          },
        }
      },

      stop: () => {
        generation++ // invalidate in-flight synth + playback
        if (collector) {
          collector.resolve(null)
          collector = null
        }
        try {
          if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'Clear' }))
        } catch {}
        if (currentSource) {
          try {
            currentSource.stop()
          } catch {}
          currentSource = null
        }
      },

      close: () => {
        generation++
        if (collector) {
          collector.resolve(null)
          collector = null
        }
        if (currentSource) {
          try {
            currentSource.stop()
          } catch {}
          currentSource = null
        }
        try {
          if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'Close' }))
        } catch {}
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
      if (typeof ev.data === 'string') {
        // JSON control frame: Metadata / Flushed / Cleared / Warning
        try {
          const m = JSON.parse(ev.data)
          if (m.type === 'Flushed') finishCollect()
        } catch {}
        return
      }
      if (!collector) return
      const ab =
        ev.data instanceof ArrayBuffer
          ? ev.data
          : ArrayBuffer.isView(ev.data)
            ? ((ev.data as ArrayBufferView).buffer as ArrayBuffer)
            : null
      if (!ab) return
      const f32 = int16ToFloat32(ab)
      if (f32.length) {
        collector.chunks.push(f32)
        collector.len += f32.length
      }
    }
  })
}
