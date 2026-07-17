import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { normalizeUrl, deriveDomainLabel, buildTextFragment, handleFileChat } from './handler.mjs'

describe('normalizeUrl', () => {
  it('trims a single trailing slash', () => {
    expect(normalizeUrl('https://example.com/')).toBe('https://example.com')
  })

  it('trims multiple trailing slashes', () => {
    expect(normalizeUrl('https://example.com///')).toBe('https://example.com')
  })

  it('returns URL unchanged when no trailing slash', () => {
    expect(normalizeUrl('https://example.com/path')).toBe('https://example.com/path')
  })

  it('handles URL with path and trailing slash', () => {
    expect(normalizeUrl('https://example.com/path/')).toBe('https://example.com/path')
  })

  it('returns empty string for non-string input', () => {
    expect(normalizeUrl(null)).toBe('')
    expect(normalizeUrl(undefined)).toBe('')
    expect(normalizeUrl(123)).toBe('')
  })

  it('returns empty string for empty string input', () => {
    expect(normalizeUrl('')).toBe('')
  })
})

describe('deriveDomainLabel', () => {
  it('extracts first segment after stripping www.', () => {
    expect(deriveDomainLabel('https://www.csuchico.edu/path')).toBe('csuchico')
  })

  it('extracts first segment for subdomain URL', () => {
    expect(deriveDomainLabel('https://library.csuchico.edu/page')).toBe('library')
  })

  it('extracts first segment when no www prefix', () => {
    expect(deriveDomainLabel('https://csuchico.edu/page')).toBe('csuchico')
  })

  it('handles URL with multiple subdomains', () => {
    expect(deriveDomainLabel('https://parking.services.csuchico.edu/info')).toBe('parking')
  })

  it('returns empty string for invalid URL', () => {
    expect(deriveDomainLabel('not-a-url')).toBe('')
  })

  it('returns empty string for empty input', () => {
    expect(deriveDomainLabel('')).toBe('')
    expect(deriveDomainLabel(null)).toBe('')
  })

  it('handles http protocol', () => {
    expect(deriveDomainLabel('http://www.csuchico.edu/')).toBe('csuchico')
  })
})

describe('buildTextFragment', () => {
  it('appends text fragment for chunk with >= 3 words', () => {
    const result = buildTextFragment(
      'https://www.csuchico.edu/parking',
      'CSU Chico offers several parking options for students and visitors'
    )
    expect(result).toBe(
      'https://www.csuchico.edu/parking#:~:text=CSU%20Chico%20offers%20several%20parking%20options%20for%20students'
    )
  })

  it('uses only first 8 words', () => {
    const text = 'one two three four five six seven eight nine ten eleven'
    const result = buildTextFragment('https://example.com/page', text)
    expect(result).toContain('#:~:text=')
    const fragment = decodeURIComponent(result.split('#:~:text=')[1])
    expect(fragment.split(' ').length).toBe(8)
  })

  it('returns base URL when chunk has fewer than 3 words', () => {
    expect(buildTextFragment('https://example.com', 'two words')).toBe('https://example.com')
    expect(buildTextFragment('https://example.com', 'one')).toBe('https://example.com')
  })

  it('returns base URL when chunk text is empty', () => {
    expect(buildTextFragment('https://example.com', '')).toBe('https://example.com')
  })

  it('returns base URL when URL already has a fragment', () => {
    expect(buildTextFragment('https://example.com/page#section', 'this is a test sentence')).toBe(
      'https://example.com/page#section'
    )
  })

  it('returns base URL for non-string chunk text', () => {
    expect(buildTextFragment('https://example.com', null)).toBe('https://example.com')
    expect(buildTextFragment('https://example.com', undefined)).toBe('https://example.com')
  })

  it('returns empty string for non-string base URL', () => {
    expect(buildTextFragment(null, 'some text here')).toBe('')
    expect(buildTextFragment(undefined, 'some text here')).toBe('')
  })

  it('handles chunk text with extra whitespace', () => {
    const result = buildTextFragment('https://example.com', '  word1  word2  word3  ')
    expect(result).toContain('#:~:text=')
    const fragment = decodeURIComponent(result.split('#:~:text=')[1])
    expect(fragment).toBe('word1 word2 word3')
  })

  it('falls back to base URL for invalid URL', () => {
    expect(buildTextFragment('not-a-url', 'three words here')).toBe('not-a-url')
  })

  it('handles exactly 3 words', () => {
    const result = buildTextFragment('https://example.com', 'three words here')
    expect(result).toContain('#:~:text=')
  })

  it('URL-encodes special characters in text', () => {
    const result = buildTextFragment('https://example.com', 'CSU Chico & "parking" options available')
    expect(result).toContain('#:~:text=')
    expect(result).not.toContain('&')
    expect(result).not.toContain('"')
  })
})

// ─── handleFileChat tests ────────────────────────────────────────────────────

describe('handleFileChat', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('returns 500 when BEDROCK_KNOWLEDGE_BASE_ID is not set', async () => {
    // Ensure BEDROCK_KNOWLEDGE_BASE_ID is empty
    process.env.BEDROCK_KNOWLEDGE_BASE_ID = ''

    const result = await handleFileChat(
      'What is this image?',
      { content: 'dGVzdA==', mime_type: 'image/png', filename: 'test.png' },
      'session-123',
    )

    expect(result.statusCode).toBe(500)
    const body = JSON.parse(result.body)
    expect(body.detail).toContain('BEDROCK_KNOWLEDGE_BASE_ID')
  })
})
