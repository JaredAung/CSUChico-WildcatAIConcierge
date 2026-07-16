'use client'

import { useState, useRef, useCallback } from 'react'

export interface UseMicrophoneReturn {
  isRecording: boolean
  transcript: string
  interimTranscript: string
  error: string | null
  isSupported: boolean
  startRecording: (languageCode: string) => Promise<void>
  stopRecording: () => void
}

// ─── Event-stream encoding/decoding helpers ──────────────────────────────────

function encodeAudioEvent(pcmBuffer: ArrayBuffer): ArrayBuffer {
  const headers = encodeHeaders({
    ':message-type': { type: 7, value: 'event' },
    ':event-type': { type: 7, value: 'AudioEvent' },
    ':content-type': { type: 7, value: 'application/octet-stream' },
  })

  const totalLength = 4 + 4 + 4 + headers.byteLength + pcmBuffer.byteLength + 4
  const message = new ArrayBuffer(totalLength)
  const view = new DataView(message)

  let offset = 0
  view.setUint32(offset, totalLength, false); offset += 4
  view.setUint32(offset, headers.byteLength, false); offset += 4
  view.setUint32(offset, 0, false); offset += 4 // prelude CRC

  new Uint8Array(message, offset, headers.byteLength).set(new Uint8Array(headers))
  offset += headers.byteLength

  new Uint8Array(message, offset, pcmBuffer.byteLength).set(new Uint8Array(pcmBuffer))
  offset += pcmBuffer.byteLength

  view.setUint32(offset, 0, false) // message CRC
  return message
}

function encodeHeaders(
  headers: Record<string, { type: number; value: string }>,
): ArrayBuffer {
  const parts: Uint8Array[] = []

  for (const [name, { type, value }] of Object.entries(headers)) {
    const nameBytes = new TextEncoder().encode(name)
    const valueBytes = new TextEncoder().encode(value)
    const headerLength = 1 + nameBytes.length + 1 + 2 + valueBytes.length
    const header = new ArrayBuffer(headerLength)
    const headerView = new DataView(header)
    const headerArray = new Uint8Array(header)

    let off = 0
    headerView.setUint8(off, nameBytes.length); off += 1
    headerArray.set(nameBytes, off); off += nameBytes.length
    headerView.setUint8(off, type); off += 1
    headerView.setUint16(off, valueBytes.length, false); off += 2
    headerArray.set(valueBytes, off)

    parts.push(new Uint8Array(header))
  }

  const totalLength = parts.reduce((sum, p) => sum + p.length, 0)
  const result = new ArrayBuffer(totalLength)
  const resultArray = new Uint8Array(result)
  let offset = 0
  for (const part of parts) {
    resultArray.set(part, offset)
    offset += part.length
  }
  return result
}

function parseTranscribeMessage(
  data: ArrayBuffer,
): { isPartial: boolean; transcript: string } | null {
  try {
    const view = new DataView(data)
    const totalLength = view.getUint32(0, false)
    const headersLength = view.getUint32(4, false)
    const payloadOffset = 4 + 4 + 4 + headersLength
    const payloadLength = totalLength - payloadOffset - 4

    if (payloadLength <= 0) return null

    const payloadBytes = new Uint8Array(data, payloadOffset, payloadLength)
    const payloadText = new TextDecoder().decode(payloadBytes)
    const payload = JSON.parse(payloadText)
    const results = payload?.Transcript?.Results
    if (!Array.isArray(results) || results.length === 0) return null

    const result = results[0]
    const transcript = result?.Alternatives?.[0]?.Transcript || ''
    const isPartial = result?.IsPartial ?? true
    return { isPartial, transcript }
  } catch {
    return null
  }
}

// ─── Audio conversion helpers ────────────────────────────────────────────────

function float32ToInt16(float32Array: Float32Array): Int16Array {
  const int16Array = new Int16Array(float32Array.length)
  for (let i = 0; i < float32Array.length; i++) {
    const s = Math.max(-1, Math.min(1, float32Array[i]))
    int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7fff
  }
  return int16Array
}

function downsample(
  buffer: Float32Array,
  sourceSampleRate: number,
  targetSampleRate: number,
): Float32Array {
  if (sourceSampleRate === targetSampleRate) return buffer
  const ratio = sourceSampleRate / targetSampleRate
  const newLength = Math.round(buffer.length / ratio)
  const result = new Float32Array(newLength)
  for (let i = 0; i < newLength; i++) {
    const index = Math.round(i * ratio)
    result[i] = buffer[index] ?? 0
  }
  return result
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useMicrophone(): UseMicrophoneReturn {
  const [isRecording, setIsRecording] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [interimTranscript, setInterimTranscript] = useState('')
  const [error, setError] = useState<string | null>(null)

  const wsRef = useRef<WebSocket | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const processorRef = useRef<ScriptProcessorNode | null>(null)

  const isSupported =
    typeof window !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices &&
    typeof navigator.mediaDevices.getUserMedia === 'function'

  const stopRecording = useCallback(() => {
    if (wsRef.current) {
      try {
        if (
          wsRef.current.readyState === WebSocket.OPEN ||
          wsRef.current.readyState === WebSocket.CONNECTING
        ) {
          wsRef.current.close()
        }
      } catch { /* ignore */ }
      wsRef.current = null
    }

    if (processorRef.current) {
      try { processorRef.current.disconnect() } catch { /* ignore */ }
      processorRef.current = null
    }

    if (audioContextRef.current) {
      try { audioContextRef.current.close() } catch { /* ignore */ }
      audioContextRef.current = null
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        try { track.stop() } catch { /* ignore */ }
      })
      streamRef.current = null
    }

    setIsRecording(false)
  }, [])

  const startRecording = useCallback(
    async (languageCode: string) => {
      if (!isSupported) {
        setError('Your browser does not support microphone input.')
        return
      }

      setError(null)
      setTranscript('')
      setInterimTranscript('')

      try {
        // 1. Get pre-signed URL
        const tokenResponse = await fetch(
          `/api/transcribe-token?language=${encodeURIComponent(languageCode)}`,
        )
        if (!tokenResponse.ok) {
          throw new Error(
            'Could not connect to transcription service. Please try again.',
          )
        }
        const { url } = await tokenResponse.json()

        // 2. Request microphone
        let stream: MediaStream
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: {
              sampleRate: 16000,
              channelCount: 1,
              echoCancellation: true,
              noiseSuppression: true,
            },
          })
        } catch (err) {
          const message =
            err instanceof DOMException && err.name === 'NotAllowedError'
              ? 'Microphone access was denied. Please allow microphone permission and try again.'
              : 'Could not access microphone. Please check your device settings.'
          throw new Error(message)
        }
        streamRef.current = stream

        // 3. AudioContext for PCM capture
        const audioContext = new AudioContext({ sampleRate: 16000 })
        audioContextRef.current = audioContext
        const actualSampleRate = audioContext.sampleRate

        const source = audioContext.createMediaStreamSource(stream)
        const processor = audioContext.createScriptProcessor(4096, 1, 1)
        processorRef.current = processor

        // 4. Open WebSocket to Transcribe
        const ws = new WebSocket(url)
        ws.binaryType = 'arraybuffer'
        wsRef.current = ws

        let wsOpen = false

        ws.onopen = () => {
          wsOpen = true
          setIsRecording(true)
        }

        ws.onmessage = (event) => {
          if (event.data instanceof ArrayBuffer) {
            const parsed = parseTranscribeMessage(event.data)
            if (parsed) {
              if (parsed.isPartial) {
                setInterimTranscript(parsed.transcript)
              } else {
                if (parsed.transcript) {
                  setTranscript(
                    (prev) => prev + (prev ? ' ' : '') + parsed.transcript,
                  )
                }
                setInterimTranscript('')
              }
            }
          }
        }

        ws.onerror = () => {
          setError(
            'Voice connection error. Your transcribed text is preserved — you can send it or try again.',
          )
          stopRecording()
        }

        ws.onclose = (event) => {
          if (!event.wasClean && wsOpen) {
            setError(
              'Voice connection was interrupted. Your transcribed text is preserved — you can send it or try again.',
            )
          }
          stopRecording()
        }

        // 5. Audio processing pipeline
        processor.onaudioprocess = (e) => {
          if (
            !wsOpen ||
            !wsRef.current ||
            wsRef.current.readyState !== WebSocket.OPEN
          )
            return

          const inputData = e.inputBuffer.getChannelData(0)
          const pcmFloat =
            actualSampleRate !== 16000
              ? downsample(inputData, actualSampleRate, 16000)
              : inputData
          const pcmInt16 = float32ToInt16(pcmFloat)
          const audioEvent = encodeAudioEvent(pcmInt16.buffer as ArrayBuffer)
          wsRef.current.send(audioEvent)
        }

        source.connect(processor)
        processor.connect(audioContext.destination)

        // Wait for WebSocket to open
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(
              new Error(
                'Could not connect to transcription service. Please try again.',
              ),
            )
          }, 10000)

          ws.addEventListener(
            'open',
            () => {
              clearTimeout(timeout)
              resolve()
            },
            { once: true },
          )

          ws.addEventListener(
            'error',
            () => {
              clearTimeout(timeout)
              reject(
                new Error(
                  'Could not connect to transcription service. Please try again.',
                ),
              )
            },
            { once: true },
          )
        })
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'An unexpected error occurred.'
        setError(message)
        setIsRecording(false)
        stopRecording()
      }
    },
    [isSupported, stopRecording],
  )

  return {
    isRecording,
    transcript,
    interimTranscript,
    error,
    isSupported,
    startRecording,
    stopRecording,
  }
}
