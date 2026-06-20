// Deepgram live speech-to-text via a RAW browser WebSocket.
//
// We do NOT use the @deepgram/sdk high-level socket here: in v5 it (a) authenticates
// via an HTTP Authorization header that browsers silently drop on WebSocket, and
// (b) re-registers handlers if you call connect(). The documented browser pattern is a
// raw `new WebSocket(url, ['token', credential])`. We send webm/opus chunks (Deepgram
// auto-detects the container, so no encoding/sample_rate). See CONTEXT.md §17.5.

import { VOICE } from './config'

export interface SttHandlers {
  onInterim?: (text: string) => void
  onFinal?: (text: string) => void
  onTurnEnd?: () => void // speech_final or UtteranceEnd
  onSpeechStarted?: () => void
  onError?: (e: unknown) => void
  onClose?: () => void
}

export interface SttSession {
  sendAudio: (chunk: Blob | ArrayBuffer) => void
  close: () => void
}

export function startStt(accessToken: string, h: SttHandlers): Promise<SttSession> {
  return new Promise((resolve, reject) => {
    const params = new URLSearchParams({
      model: VOICE.STT_MODEL,
      interim_results: 'true',
      smart_format: 'true',
      punctuate: 'true',
      endpointing: String(VOICE.ENDPOINTING_MS),
      utterance_end_ms: String(VOICE.UTTERANCE_END_MS),
      vad_events: 'true',
    })
    const ws = new WebSocket(`wss://api.deepgram.com/v1/listen?${params.toString()}`, [
      VOICE.DG_AUTH_SCHEME,
      accessToken,
    ])

    const session: SttSession = {
      sendAudio: (chunk) => {
        if (ws.readyState === WebSocket.OPEN) ws.send(chunk)
      },
      close: () => {
        try {
          if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'CloseStream' }))
        } catch {}
        try {
          ws.close()
        } catch {}
      },
    }

    let opened = false
    ws.onopen = () => {
      opened = true
      resolve(session)
    }
    ws.onerror = (e) => {
      if (!opened) reject(new Error('STT websocket failed to connect (check DG_AUTH_SCHEME)'))
      else h.onError?.(e)
    }
    ws.onclose = () => h.onClose?.()
    ws.onmessage = (ev) => {
      if (typeof ev.data !== 'string') return // STT only sends JSON text frames
      let msg: {
        type?: string
        is_final?: boolean
        speech_final?: boolean
        channel?: { alternatives?: Array<{ transcript?: string }> }
      }
      try {
        msg = JSON.parse(ev.data)
      } catch {
        return
      }
      switch (msg.type) {
        case 'Results': {
          const text = msg.channel?.alternatives?.[0]?.transcript ?? ''
          if (text) {
            if (msg.is_final) h.onFinal?.(text)
            else h.onInterim?.(text)
          }
          if (msg.speech_final) h.onTurnEnd?.()
          break
        }
        case 'UtteranceEnd':
          h.onTurnEnd?.()
          break
        case 'SpeechStarted':
          h.onSpeechStarted?.()
          break
      }
    }
  })
}
