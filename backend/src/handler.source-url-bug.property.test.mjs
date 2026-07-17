/**
 * Bug Condition Exploration Test — Source URL Filtering
 *
 * This test MUST FAIL on unfixed code. Failure confirms the bugs exist.
 * DO NOT attempt to fix the test or the code when it fails.
 *
 * Five scoped properties:
 * 1. S3 URI chunks in buildSources → should NOT appear in sources
 * 2. Empty URL chunks in buildSources → should NOT appear in sources
 * 3. Valid HTTP URL chunks with 3+ word text in buildSources → URL should NOT contain #:~:text=
 * 4. S3 URI citations in extractCitationsFromRAG → should NOT appear in sources
 * 5. S3 URI citations in referencesToSources (via extractCitationsFromRAG) → should NOT appear in sources
 *
 * Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5
 */

import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { buildSources, extractCitationsFromRAG } from './handler.mjs'

// ─── Property 1: S3 URI chunks in buildSources ───────────────────────────────

/**
 * **Validates: Requirements 1.1**
 *
 * WHEN a retrieved chunk resolves to an S3 URI (e.g., `s3://bucket/key`)
 * because no HTTP metadata fallback exists, THEN the system should NOT
 * include a source object with an un-clickable S3 URL in the response.
 *
 * Will FAIL on unfixed code because S3 URIs are included in sources.
 */
describe('Bug Condition: S3 URI chunks in buildSources', () => {
  it('should NOT include S3 URIs in sources when no HTTP metadata exists', () => {
    // Generator: S3 bucket/key paths with no HTTP metadata fallback
    const s3UriArb = fc
      .tuple(
        fc.stringMatching(/[a-z][a-z0-9-]{2,15}/),
        fc.stringMatching(/[a-z0-9/]{1,20}/),
      )
      .map(([bucket, key]) => `s3://${bucket}/${key}.md`)

    const chunkTextArb = fc.string({ minLength: 10, maxLength: 200 })
      .map((s) => s.replace(/[\n\r]/g, ' ').padEnd(10, 'x'))

    const inputArb = fc.tuple(s3UriArb, chunkTextArb)

    fc.assert(
      fc.property(inputArb, ([s3Uri, chunkText]) => {
        // Build a chunk with only S3 location and NO HTTP metadata
        const chunk = {
          location: {
            type: 'S3',
            s3Location: { uri: s3Uri },
          },
          content: { text: chunkText },
          metadata: {},
        }

        const sources = buildSources([chunk])

        // Assert: No source should have an S3 URI
        for (const source of sources) {
          expect(source.url).not.toMatch(/^s3:\/\//)
        }
        // Assert: Sources should be empty since no valid HTTP URL exists
        expect(sources.length).toBe(0)
      }),
      { numRuns: 100 },
    )
  })
})

// ─── Property 2: Empty URL chunks in buildSources ────────────────────────────

/**
 * **Validates: Requirements 1.2**
 *
 * WHEN a retrieved chunk resolves to an empty string URL (no location
 * or metadata URLs available), THEN the system should NOT include a source
 * object with an empty or invalid `url` field in the response.
 *
 * Will FAIL on unfixed code because empty URLs are included in sources.
 */
describe('Bug Condition: Empty URL chunks in buildSources', () => {
  it('should NOT include sources with empty URLs when no location/metadata exists', () => {
    const chunkTextArb = fc.string({ minLength: 10, maxLength: 200 })
      .map((s) => s.replace(/[\n\r]/g, ' ').padEnd(10, 'x'))

    fc.assert(
      fc.property(chunkTextArb, (chunkText) => {
        // Build a chunk with NO location and NO metadata URLs
        const chunk = {
          location: {},
          content: { text: chunkText },
          metadata: {},
        }

        const sources = buildSources([chunk])

        // Assert: No source should have an empty URL
        for (const source of sources) {
          expect(source.url).not.toBe('')
          expect(source.url.startsWith('http://') || source.url.startsWith('https://')).toBe(true)
        }
        // Assert: Sources should be empty since no valid URL exists
        expect(sources.length).toBe(0)
      }),
      { numRuns: 100 },
    )
  })
})

// ─── Property 3: Text fragments on HTTP URLs in buildSources ─────────────────

/**
 * **Validates: Requirements 1.3**
 *
 * WHEN a retrieved chunk has a valid HTTP URL and chunk text with 3+ words,
 * THEN the system should NOT append a `#:~:text=...` text fragment to the URL.
 *
 * Will FAIL on unfixed code because buildTextFragment appends text fragments.
 */
describe('Bug Condition: Text fragments on HTTP URLs in buildSources', () => {
  it('should NOT append #:~:text= to HTTP URLs in sources', () => {
    // Generator: valid HTTP URLs
    const httpUrlArb = fc.constantFrom(
      'https://www.csuchico.edu/admissions',
      'https://library.csuchico.edu/research',
      'https://example.com/campus/dining',
      'http://www.csuchico.edu/housing/options',
      'https://catalog.csuchico.edu/programs',
    )

    // Generator: chunk text with 3+ words (triggers text fragment generation)
    const multiWordTextArb = fc
      .array(fc.stringMatching(/[A-Za-z]{3,10}/), { minLength: 3, maxLength: 12 })
      .map((words) => words.join(' '))

    const inputArb = fc.tuple(httpUrlArb, multiWordTextArb)

    fc.assert(
      fc.property(inputArb, ([httpUrl, chunkText]) => {
        const chunk = {
          location: {
            type: 'WEB',
            webLocation: { url: httpUrl },
          },
          content: { text: chunkText },
          metadata: { title: 'Test Page' },
        }

        const sources = buildSources([chunk])

        // Assert: source URL should NOT contain text fragments
        expect(sources.length).toBeGreaterThan(0)
        for (const source of sources) {
          expect(source.url).not.toContain('#:~:text=')
          // URL should be the base HTTP URL as-is
          expect(source.url).toBe(httpUrl)
        }
      }),
      { numRuns: 100 },
    )
  })
})

// ─── Property 4: S3 URI citations in extractCitationsFromRAG ─────────────────

/**
 * **Validates: Requirements 1.4**
 *
 * WHEN extractCitationsFromRAG processes citations containing S3 URIs
 * with no HTTP fallback, THEN those citations should NOT appear in sources.
 *
 * Will FAIL on unfixed code because S3 URIs are included.
 */
describe('Bug Condition: S3 URI citations in extractCitationsFromRAG', () => {
  it('should NOT include S3 URI sources in extractCitationsFromRAG output', () => {
    const s3UriArb = fc
      .tuple(
        fc.stringMatching(/[a-z][a-z0-9-]{2,15}/),
        fc.stringMatching(/[a-z0-9/]{1,20}/),
      )
      .map(([bucket, key]) => `s3://${bucket}/${key}.pdf`)

    const answerTextArb = fc.string({ minLength: 50, maxLength: 300 })
      .map((s) => s.replace(/[\n\r]/g, ' ').padEnd(50, 'x'))

    const inputArb = fc.tuple(s3UriArb, answerTextArb)

    fc.assert(
      fc.property(inputArb, ([s3Uri, answerText]) => {
        const citations = [
          {
            generatedResponsePart: {
              textResponsePart: {
                span: { start: 0, end: Math.min(30, answerText.length) },
              },
            },
            retrievedReferences: [
              {
                location: {
                  s3Location: { uri: s3Uri },
                },
                content: { text: 'Some chunk text from the knowledge base' },
                metadata: {},
              },
            ],
          },
        ]

        const { sources } = extractCitationsFromRAG(answerText, citations)

        // Assert: No source should have an S3 URI
        for (const source of sources) {
          expect(source.url).not.toMatch(/^s3:\/\//)
        }
        // Assert: Sources should be empty since no valid HTTP URL exists
        expect(sources.length).toBe(0)
      }),
      { numRuns: 100 },
    )
  })
})

// ─── Property 5: S3 URI citations in referencesToSources (via extractCitationsFromRAG) ──

/**
 * **Validates: Requirements 1.5**
 *
 * WHEN referencesToSources processes citations containing S3 URIs
 * with no HTTP fallback, THEN those citations should NOT appear in sources.
 *
 * Since referencesToSources is NOT exported, we test it indirectly via
 * extractCitationsFromRAG which has the same S3 URI handling logic.
 * The same bug pattern exists in both functions.
 *
 * Will FAIL on unfixed code because S3 URIs are included.
 */
describe('Bug Condition: S3 URI citations in referencesToSources (tested via extractCitationsFromRAG)', () => {
  it('should NOT include S3 URI sources when citation has S3 location only', () => {
    // Generate multiple S3-only citations to increase confidence
    const s3UriArb = fc
      .tuple(
        fc.stringMatching(/[a-z][a-z0-9-]{2,10}/),
        fc.stringMatching(/[a-z0-9]{1,15}/),
      )
      .map(([bucket, key]) => `s3://${bucket}/${key}.txt`)

    const excerptArb = fc
      .array(fc.stringMatching(/[A-Za-z]{3,8}/), { minLength: 4, maxLength: 10 })
      .map((words) => words.join(' '))

    const answerTextArb = fc.string({ minLength: 80, maxLength: 400 })
      .map((s) => s.replace(/[\n\r]/g, ' ').padEnd(80, 'x'))

    const inputArb = fc.tuple(
      fc.array(s3UriArb, { minLength: 1, maxLength: 3 }),
      fc.array(excerptArb, { minLength: 1, maxLength: 3 }),
      answerTextArb,
    )

    fc.assert(
      fc.property(inputArb, ([s3Uris, excerpts, answerText]) => {
        // Build citations with only S3 locations (no HTTP fallback)
        const citations = s3Uris.map((uri, i) => ({
          generatedResponsePart: {
            textResponsePart: {
              span: { start: i * 10, end: Math.min((i + 1) * 20, answerText.length) },
            },
          },
          retrievedReferences: [
            {
              location: {
                s3Location: { uri },
              },
              content: { text: excerpts[i % excerpts.length] },
              metadata: {},
            },
          ],
        }))

        const { sources } = extractCitationsFromRAG(answerText, citations)

        // Assert: No source should have an S3 URI
        for (const source of sources) {
          expect(source.url).not.toMatch(/^s3:\/\//)
          expect(source.url.startsWith('http://') || source.url.startsWith('https://')).toBe(true)
        }
        // Assert: Sources should be empty since all citations resolve to S3 URIs only
        expect(sources.length).toBe(0)
      }),
      { numRuns: 100 },
    )
  })
})
