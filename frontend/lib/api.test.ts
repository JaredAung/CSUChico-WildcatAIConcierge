import { describe, it, expect, vi } from 'vitest'
import { sanitizeChatResponse } from '@/lib/api'
import type { ChatResponse } from '@/lib/types'

describe('sanitizeChatResponse', () => {
  it('returns empty array when sources is null', () => {
    const raw = { answer: 'Hello', sources: null, session_id: 'abc' } as unknown as Partial<ChatResponse>
    const result = sanitizeChatResponse(raw)
    expect(result.sources).toEqual([])
  })

  it('returns empty array when sources is undefined', () => {
    const raw = { answer: 'Hello', session_id: 'abc' } as Partial<ChatResponse>
    const result = sanitizeChatResponse(raw)
    expect(result.sources).toEqual([])
  })

  it('returns fallback message when answer is empty string', () => {
    const raw = { answer: '', sources: [], session_id: 'abc' } as Partial<ChatResponse>
    const result = sanitizeChatResponse(raw)
    expect(result.answer).toBe("I wasn't able to generate a response. Please try again.")
  })

  it('returns safe defaults when response is null', () => {
    const result = sanitizeChatResponse(null)
    expect(result.answer).toBe("I wasn't able to generate a response. Please try again.")
    expect(result.sources).toEqual([])
    expect(result.session_id).toBeTruthy()
    expect(typeof result.session_id).toBe('string')
    expect(result.session_id.length).toBeGreaterThan(0)
  })

  it('generates a local session_id when session_id is missing', () => {
    const raw = { answer: 'Hello', sources: [] } as Partial<ChatResponse>
    const result = sanitizeChatResponse(raw)
    expect(result.session_id).toBeTruthy()
    expect(typeof result.session_id).toBe('string')
    expect(result.session_id.length).toBeGreaterThan(0)
  })

  it('passes through a valid response unchanged', () => {
    const raw: ChatResponse = {
      answer: 'CSU Chico offers parking.',
      sources: [
        { title: 'Parking', url: 'https://csuchico.edu/parking', citation_index: 1, chunk_text: 'Parking info', domain_label: 'csuchico' },
      ],
      session_id: 'session-123',
    }
    const result = sanitizeChatResponse(raw)
    expect(result.answer).toBe('CSU Chico offers parking.')
    expect(result.sources).toEqual(raw.sources)
    expect(result.session_id).toBe('session-123')
  })
})
