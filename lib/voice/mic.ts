// Microphone capture for the voice interview (browser-only).
// One MediaStream feeds two consumers:
//   1) a MediaRecorder → opus chunks → Deepgram STT (lib/voice/stt.ts)
//   2) an AnalyserNode → RMS volume → barge-in detection (lib/voice/useVoiceInterview.ts)
// See CONTEXT.md §17.4–17.5.

import { VOICE } from './config'

export interface MicController {
  /** Current mic loudness, RMS in 0..1. */
  getRms(): number
  /** Begin emitting opus chunks (call after STT socket is open). */
  startRecording(onChunk: (blob: Blob) => void): void
  /** Stop emitting chunks (keeps the stream + analyser alive). */
  stopRecording(): void
  /** Mute/unmute capture. Muting silences the track (RMS → 0) but keeps the
   *  recorder emitting silent frames, so the STT socket stays alive. */
  setMuted(muted: boolean): void
  /** Tear everything down and release the mic. */
  close(): void
}

function pickMimeType(): string {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus']
  for (const t of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t)) return t
  }
  return '' // let the browser choose
}

export async function createMic(audioCtx: AudioContext): Promise<MicController> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true, // critical for open-speaker barge-in (§17.4)
      noiseSuppression: true,
      autoGainControl: true,
    },
  })

  // RMS meter
  const source = audioCtx.createMediaStreamSource(stream)
  const analyser = audioCtx.createAnalyser()
  analyser.fftSize = 1024
  source.connect(analyser)
  const buf = new Float32Array(analyser.fftSize)

  // Recorder (created lazily per recording session so we can restart cleanly)
  const mimeType = pickMimeType()
  let recorder: MediaRecorder | null = null

  return {
    getRms() {
      analyser.getFloatTimeDomainData(buf)
      let sum = 0
      for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i]
      return Math.sqrt(sum / buf.length)
    },

    startRecording(onChunk) {
      if (recorder && recorder.state === 'recording') return
      recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) onChunk(e.data)
      }
      recorder.start(VOICE.MIC_TIMESLICE_MS) // emit a chunk every ~250ms
    },

    stopRecording() {
      if (recorder && recorder.state !== 'inactive') recorder.stop()
      recorder = null
    },

    setMuted(muted) {
      // Disable the track rather than stop it: the recorder keeps producing
      // (silent) frames so Deepgram doesn't time out, and the analyser reads ~0.
      stream.getAudioTracks().forEach((t) => {
        t.enabled = !muted
      })
    },

    close() {
      try {
        recorder?.stop()
      } catch {}
      recorder = null
      source.disconnect()
      analyser.disconnect()
      stream.getTracks().forEach((t) => t.stop())
    },
  }
}
