import { describe, it, expect, vi, beforeEach } from 'vitest'
import fc from 'fast-check'

// Use vi.hoisted to ensure mock fns and env vars are set before handler module loads
const { mockAgentSend, mockBedrockSend } = vi.hoisted(() => {
  // Set env vars before handler.mjs is imported (KNOWLEDGE_BASE_ID is captured at module load)
  process.env.BEDROCK_KNOWLEDGE_BASE_ID = 'test-kb-id'
  process.env.CONVERSE_MODEL_ID = 'anthropic.claude-3-haiku-20240307-v1:0'
  return {
    mockAgentSend: vi.fn(),
    mockBedrockSend: vi.fn(),
  }
})

vi.mock('@aws-sdk/client-bedrock-agent-runtime', () => ({
  BedrockAgentRuntimeClient: class {
    send = mockAgentSend
  },
  RetrieveCommand: class {
    constructor(input) { this.input = input }
  },
}))

vi.mock('@aws-sdk/client-bedrock-runtime', () => ({
  BedrockRuntimeClient: class {
    send = mockBedrockSend
  },
  ConverseCommand: class {
    constructor(input) { this.input = input }
  },
}))

import { buildContextBlock, buildSources, extractRetrievalQuery, buildConverseMessages, handler } from './handler.mjs'

// Feature: retrieve-converse-citations
describe('Retrieve + Converse Property Tests', () => {

  // Property 1: Context Block Numbering Consistency
  // **Validates: Requirements 1.2**
  it('P1: context block contains sequential [Source N] labels starting at 1', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            content: fc.record({ text: fc.string({ minLength: 1, maxLength: 200 }) }),
          }),
          { minLength: 1, maxLength: 10 }
        ),
        (chunks) => {
          const block = buildContextBlock(chunks)
          for (let i = 0; i < chunks.length; i++) {
            expect(block).toContain(`[Source ${i + 1}]:`)
          }
          // Should NOT contain [Source 0] or [Source N+1]
          expect(block).not.toContain('[Source 0]')
          expect(block).not.toContain(`[Source ${chunks.length + 1}]`)
        }
      ),
      { numRuns: 100 }
    )
  })

  // Property 2: Source Deduplication by Normalized URL
  // **Validates: Requirements 2.1, 2.7**
  it('P2: buildSources deduplicates by normalized URL', () => {
    const urlArb = fc.webUrl().map(u => u.replace(/\/+$/, '')) // base URL without trailing slash
    const chunkWithUrl = (url) => ({
      content: { text: 'some chunk text here for testing' },
      location: { type: 'WEB', webLocation: { url } },
      metadata: { title: 'Test Page' },
    })

    fc.assert(
      fc.property(
        fc.array(urlArb, { minLength: 1, maxLength: 10 }),
        (urls) => {
          // Create chunks, some with trailing slashes (duplicates after normalization)
          const chunks = urls.flatMap(url => [
            chunkWithUrl(url),
            chunkWithUrl(url + '/'),  // duplicate with trailing slash
          ])
          const sources = buildSources(chunks)
          // Count unique normalized URLs in input
          const uniqueNormalized = new Set(urls.map(u => u.replace(/\/+$/, '')))
          // Sources count should equal unique normalized URL count
          expect(sources.length).toBe(uniqueNormalized.size)
          // No two sources should share the same normalized URL
          const sourceUrls = sources.map(s => s.url.split('#')[0].replace(/\/+$/, ''))
          const uniqueSourceUrls = new Set(sourceUrls)
          expect(uniqueSourceUrls.size).toBe(sources.length)
        }
      ),
      { numRuns: 100 }
    )
  })

  // Property 3: Citation Index Consistency Between Context and Sources
  // **Validates: Requirements 2.2**
  it('P3: citation_index in sources matches [Source N] label in context block', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            content: fc.record({ text: fc.string({ minLength: 1 }) }),
            location: fc.record({
              type: fc.constant('WEB'),
              webLocation: fc.record({ url: fc.webUrl() }),
            }),
            metadata: fc.record({ title: fc.string() }),
          }),
          { minLength: 1, maxLength: 8 }
        ),
        (chunks) => {
          // Use unique URLs to avoid dedup complications
          const uniqueChunks = chunks.map((c, i) => ({
            ...c,
            location: { type: 'WEB', webLocation: { url: `https://example${i}.com/page` } },
          }))
          const contextBlock = buildContextBlock(uniqueChunks)
          const sources = buildSources(uniqueChunks)

          // Each source's citation_index should correspond to its [Source N] in the context
          for (const source of sources) {
            const idx = source.citation_index
            const expectedLabel = `[Source ${idx}]`
            expect(contextBlock).toContain(expectedLabel)
          }
          // Number of sources should equal number of chunks (all unique URLs)
          expect(sources.length).toBe(uniqueChunks.length)
        }
      ),
      { numRuns: 100 }
    )
  })

  // Property 4: Chunk Text Truncation Invariant
  // **Validates: Requirements 2.5**
  it('P4: chunk_text is always ≤ 400 chars and is a prefix of original', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 0, maxLength: 1000 }),
        fc.integer({ min: 0, max: 9 }),
        (text, idx) => {
          const chunk = {
            content: { text },
            location: { type: 'WEB', webLocation: { url: `https://example${idx}.com/page` } },
            metadata: { title: 'Test' },
          }
          const sources = buildSources([chunk])
          if (sources.length > 0) {
            const source = sources[0]
            // chunk_text must be ≤ 400 characters
            expect(source.chunk_text.length).toBeLessThanOrEqual(400)
            // chunk_text must be a prefix of the trimmed original text
            const trimmedOriginal = text.trim()
            expect(trimmedOriginal.startsWith(source.chunk_text)).toBe(true)
            // excerpt must also be ≤ 400 chars
            expect(source.excerpt.length).toBeLessThanOrEqual(400)
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  // Property 5: Multi-Turn Message Formatting Preserves All Turns
  // **Validates: Requirements 4.1, 4.2**
  it('P5: buildConverseMessages preserves all alternating turns in Converse format', () => {
    // Generate alternating user/assistant messages
    const turnArb = fc.array(fc.string({ minLength: 1 }), { minLength: 1, maxLength: 5 })
      .map(texts => texts.flatMap((text, i) => [
        { role: 'user', content: text },
        { role: 'assistant', content: `reply to ${text}` },
      ]).concat([{ role: 'user', content: 'final question' }]))

    fc.assert(
      fc.property(turnArb, fc.string(), (messages, contextBlock) => {
        const result = buildConverseMessages(messages, contextBlock)
        // Result should not be empty
        expect(result.length).toBeGreaterThan(0)
        // All messages should have role and content[{text}] structure
        for (const msg of result) {
          expect(msg).toHaveProperty('role')
          expect(['user', 'assistant']).toContain(msg.role)
          expect(msg).toHaveProperty('content')
          expect(Array.isArray(msg.content)).toBe(true)
          expect(msg.content.length).toBeGreaterThan(0)
          expect(msg.content[0]).toHaveProperty('text')
        }
        // Messages should alternate roles
        for (let i = 1; i < result.length; i++) {
          expect(result[i].role).not.toBe(result[i - 1].role)
        }
      }),
      { numRuns: 100 }
    )
  })

  // Property 6: Retrieval Query Uses Only Latest User Message
  // **Validates: Requirements 4.3**
  it('P6: extractRetrievalQuery returns only the latest user message text', () => {
    fc.assert(
      fc.property(
        // Generate 1-5 prior messages with random roles and content
        fc.array(
          fc.record({
            role: fc.constantFrom('user', 'assistant'),
            content: fc.string({ minLength: 1, maxLength: 50 }),
          }),
          { minLength: 0, maxLength: 5 }
        ),
        // The final user message content (what we expect to get back)
        fc.string({ minLength: 1, maxLength: 100 }),
        (priorMessages, lastUserContent) => {
          const messages = [...priorMessages, { role: 'user', content: lastUserContent }]
          const result = extractRetrievalQuery(messages)
          // Should equal the last user message, trimmed
          expect(result).toBe(lastUserContent.trim())
          // Should NOT contain content from earlier messages
          for (const prior of priorMessages) {
            if (prior.content.trim() !== lastUserContent.trim() && prior.content.trim().length > 3) {
              expect(result).not.toContain(prior.content.trim())
            }
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  // Property 7: Error Responses Include Error Code
  // **Validates: Requirements 8.1, 8.2**
  it('P7: error responses include the error code in detail', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate error names (non-empty, no whitespace-only, exclude AbortError which triggers 504)
        fc.string({ minLength: 1, maxLength: 30 }).filter(s => s.trim().length > 0 && s !== 'AbortError'),
        fc.string({ minLength: 1, maxLength: 100 }),
        async (errorName, errorMessage) => {
          // Configure mock to throw an AWS-style error on the Retrieve step
          const awsError = new Error(errorMessage)
          awsError.name = errorName
          mockAgentSend.mockRejectedValue(awsError)
          mockBedrockSend.mockRejectedValue(awsError)

          // Create a valid chat event
          const event = {
            requestContext: { http: { method: 'POST' } },
            rawPath: '/api/v1/chat',
            body: JSON.stringify({
              messages: [{ role: 'user', content: 'test question' }],
            }),
          }

          const result = await handler(event)

          // The handler should return 502 with the error name in the detail
          expect(result.statusCode).toBe(502)
          const body = JSON.parse(result.body)
          expect(body.detail).toContain(errorName)
        }
      ),
      { numRuns: 100 }
    )
  })
})

// Feature: retrieve-converse-citations, Property 8: Session ID Passthrough
// **Validates: Requirements 9.1**
describe('P8: Session ID Passthrough', () => {
  beforeEach(() => {
    // Mock RetrieveCommand → returns valid chunks
    mockAgentSend.mockResolvedValue({
      retrievalResults: [
        {
          content: { text: 'Some campus info about CSU Chico dining options' },
          location: { type: 'WEB', webLocation: { url: 'https://www.csuchico.edu/dining' } },
          metadata: { title: 'Dining Services' },
        },
      ],
    })

    // Mock ConverseCommand → returns a text answer
    mockBedrockSend.mockResolvedValue({
      output: {
        message: {
          content: [{ text: 'CSU Chico has several dining options on campus [1].' }],
        },
      },
    })
  })

  it('response session_id matches input session_id for any UUID-like string', async () => {
    // Generator: UUID-like strings (8-4-4-4-12 hex pattern)
    const hexSegment = (len) => fc.stringMatching(new RegExp(`^[0-9a-f]{${len}}$`))
    const uuidArb = fc.tuple(
      hexSegment(8),
      hexSegment(4),
      hexSegment(4),
      hexSegment(4),
      hexSegment(12),
    ).map(([a, b, c, d, e]) => `${a}-${b}-${c}-${d}-${e}`)

    await fc.assert(
      fc.asyncProperty(uuidArb, async (sessionId) => {
        const event = {
          requestContext: { http: { method: 'POST' } },
          rawPath: '/api/v1/chat',
          body: JSON.stringify({
            messages: [{ role: 'user', content: 'What dining options are there?' }],
            session_id: sessionId,
          }),
        }

        const result = await handler(event)

        expect(result.statusCode).toBe(200)
        const body = JSON.parse(result.body)
        expect(body.session_id).toBe(sessionId)
      }),
      { numRuns: 100 }
    )
  })
})
