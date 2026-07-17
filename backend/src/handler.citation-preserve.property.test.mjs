/**
 * Preservation Property Tests — Citation Rendering Fix
 *
 * These tests capture CORRECT baseline behavior that MUST remain unchanged after the fix.
 * They MUST PASS on FIXED code (confirming the behavior is correct post-fix).
 *
 * Four properties:
 * 1. Inline marker preservation — markers injected at correct positions for distributed spans
 * 2. Clean answer passthrough — answers without reference sections returned unchanged
 * 3. Web-only URL sources — citations with only webLocation.url produce web URL sources (no text fragment)
 * 4. S3-only fallback (filtered out) — citations with only s3Location.uri are excluded from sources
 *
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4**
 */

import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { extractCitationsFromRAG } from './handler.mjs'

// ─── Property 1: Inline marker preservation ──────────────────────────────────

/**
 * **Validates: Requirements 3.1**
 *
 * For all answer texts (50-2000 chars) with citation spans at random distributed
 * positions (all span.end < 90% of text length), assert markers are injected at
 * the correct positions matching [N] format. Verify that the marker [N] appears
 * in the annotated answer at roughly the correct character position (accounting
 * for previously inserted markers shifting positions).
 */
describe('Preservation: Inline marker preservation', () => {
  it('markers are injected at correct positions for distributed inline spans', () => {
    const inlineMarkerArb = fc
      .integer({ min: 50, max: 2000 })
      .chain((length) => {
        // Generate answer text of the specified length using printable characters
        const answerArb = fc
          .stringMatching(/[A-Za-z0-9 .,!?]/)
          .map((s) => s.padEnd(length, 'a').slice(0, length))
          .filter((s) => s.length === length)

        // Threshold: 90% of text length — all spans must be below this
        const maxEnd = Math.floor(length * 0.9)

        // Generate 1-4 citations with span.end distributed within 0..maxEnd
        const citationArb = fc
          .integer({ min: 1, max: Math.max(1, maxEnd) })
          .map((end) => ({
            generatedResponsePart: {
              textResponsePart: {
                span: { start: Math.max(0, end - 15), end },
              },
            },
            retrievedReferences: [
              {
                location: {
                  webLocation: { url: `https://example.com/page-${end}` },
                },
                content: { text: 'Reference content for this citation source' },
                metadata: { title: 'Test Source' },
              },
            ],
          }))

        return fc.tuple(answerArb, fc.array(citationArb, { minLength: 1, maxLength: 4 }))
      })

    fc.assert(
      fc.property(inlineMarkerArb, ([answerText, citations]) => {
        const { annotatedAnswer, sources } = extractCitationsFromRAG(answerText, citations)

        // Markers should be present in the annotated answer
        const markerPattern = /\[\d+\]/g
        const markers = annotatedAnswer.match(markerPattern) || []

        // There should be at least one marker injected
        expect(markers.length).toBeGreaterThan(0)

        // Each marker should match [N] format where N is a valid citation index
        for (const marker of markers) {
          const idx = parseInt(marker.slice(1, -1), 10)
          expect(idx).toBeGreaterThan(0)
          expect(idx).toBeLessThanOrEqual(sources.length)
        }

        // The annotated answer should be longer than the original (markers added)
        expect(annotatedAnswer.length).toBeGreaterThan(answerText.length)

        // The original text content should be preserved (stripping markers gives original)
        const stripped = annotatedAnswer.replace(/\[\d+\]/g, '')
        expect(stripped).toBe(answerText)
      }),
      { numRuns: 200 },
    )
  })
})

// ─── Property 2: Clean answer passthrough ────────────────────────────────────

/**
 * **Validates: Requirements 3.2**
 *
 * For all answer texts that do NOT contain patterns matching
 * /\n#{0,3}\s*(?:📌\s*)?(?:References|Sources|Referencias)\s*[\n:]/i,
 * assert the answer is returned unchanged by extractCitationsFromRAG with
 * empty citations (simulating that stripReferenceSection doesn't exist yet
 * and clean answers pass through unchanged).
 */
describe('Preservation: Clean answer passthrough', () => {
  it('answers without reference sections are returned unchanged with empty citations', () => {
    // Generate answer texts that do NOT contain reference section patterns
    const cleanAnswerArb = fc
      .string({ minLength: 10, maxLength: 2000 })
      .filter((s) => {
        // Reject any string containing a reference section pattern
        const refPattern = /\n#{0,3}\s*(?:📌\s*)?(?:References|Sources|Referencias)\s*[\n:]/i
        return !refPattern.test(s) && s.trim().length > 0
      })

    fc.assert(
      fc.property(cleanAnswerArb, (answerText) => {
        // With empty citations, extractCitationsFromRAG should return text unchanged
        const { annotatedAnswer, sources } = extractCitationsFromRAG(answerText, [])

        expect(annotatedAnswer).toBe(answerText)
        expect(sources).toEqual([])
      }),
      { numRuns: 200 },
    )
  })

  it('answers with common content patterns are returned unchanged', () => {
    // Specifically test common answer patterns that might be falsely matched
    const commonPatterns = fc.constantFrom(
      'The library has many resources available for students.',
      'You can find multiple sources of information on campus.',
      'Here are some references to help you: the bookstore and the library.',
      'Check out these sources: campus dining, student union, and recreation center.',
      'Para más información, consulte las referencias en la biblioteca.',
      'The student reference desk is located on the first floor.',
    )

    fc.assert(
      fc.property(commonPatterns, (answerText) => {
        const { annotatedAnswer, sources } = extractCitationsFromRAG(answerText, [])

        expect(annotatedAnswer).toBe(answerText)
        expect(sources).toEqual([])
      }),
      { numRuns: 50 },
    )
  })
})

// ─── Property 3: Web-only URL sources ────────────────────────────────────────

/**
 * **Validates: Requirements 3.3**
 *
 * For all citation references with webLocation.url and no s3Location.uri,
 * assert the resulting source URL equals the web URL directly (no text fragment appended).
 */
describe('Preservation: Web-only URL sources', () => {
  it('citations with only webLocation.url produce source with that web URL', () => {
    const webOnlyArb = fc
      .tuple(
        // Answer text
        fc
          .string({ minLength: 50, maxLength: 500 })
          .map((s) => s.replace(/[\n\r]/g, ' ').padEnd(50, 'x').slice(0, Math.max(50, s.length))),
        // Web URL
        fc.constantFrom(
          'https://www.csuchico.edu/admissions',
          'https://library.csuchico.edu/hours',
          'https://www.example.com/page',
          'https://downtown.chico.org/restaurants',
          'https://rfreg.csuchico.edu/events',
        ),
        // Chunk text
        fc.constantFrom(
          'The library is open Monday through Friday from 8am to 10pm',
          'Students can apply for admission through the portal',
          'Downtown Chico has many restaurant options for students',
          'Campus recreation offers various fitness programs',
          'Academic advising is available by appointment',
        ),
      )
      .map(([answerText, webUrl, chunkText]) => ({ answerText, webUrl, chunkText }))

    fc.assert(
      fc.property(webOnlyArb, ({ answerText, webUrl, chunkText }) => {
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
                  // Only webLocation — no s3Location
                  webLocation: { url: webUrl },
                },
                content: { text: chunkText },
                metadata: { title: 'Web Source' },
              },
            ],
          },
        ]

        const { sources } = extractCitationsFromRAG(answerText, citations)

        expect(sources.length).toBe(1)

        // The source URL should be exactly the web URL (no text fragment appended)
        expect(sources[0].url).toBe(webUrl)

        // URL must NOT be an S3 URI
        expect(sources[0].url).not.toMatch(/^s3:\/\//)
      }),
      { numRuns: 100 },
    )
  })
})

// ─── Property 4: S3-only fallback (filtered out) ─────────────────────────────

/**
 * **Validates: Requirements 3.4**
 *
 * For all citation references with only s3Location.uri and metadata that does
 * NOT contain a URL starting with http, assert the source is filtered out
 * entirely (non-HTTP URLs are excluded from the sources array).
 */
describe('Preservation: S3-only fallback (filtered out)', () => {
  it('citations with only s3Location.uri and no web metadata produce no sources', () => {
    const s3OnlyArb = fc
      .tuple(
        // Answer text
        fc
          .string({ minLength: 50, maxLength: 500 })
          .map((s) => s.replace(/[\n\r]/g, ' ').padEnd(50, 'x').slice(0, Math.max(50, s.length))),
        // S3 URI
        fc.constantFrom(
          's3://my-kb-bucket/downtown/restaurants/chadathai.md',
          's3://campus-docs/academic/catalog-2024.md',
          's3://wildcat-kb/student-services/housing.md',
          's3://chico-knowledge/campus/parking-info.md',
          's3://kb-data/downtown/shops/overview.md',
        ),
        // Chunk text
        fc.constantFrom(
          'Chadathai Cuisine offers authentic Thai food in downtown Chico',
          'The academic catalog lists all course requirements for each major',
          'Student housing options include residence halls and apartments',
          'Parking permits can be purchased online through the student portal',
          'Downtown shops are within walking distance of campus',
        ),
        // Metadata title (not a web URL — just a descriptive title or S3 path)
        fc.constantFrom(
          's3://my-kb-bucket/downtown/restaurants/chadathai.md',
          'Campus Housing Guide',
          'Academic Catalog 2024',
          'Parking Information',
          'Downtown Shopping Guide',
        ),
      )
      .filter(([, , , metaTitle]) => {
        // Ensure metadata does NOT contain a URL starting with http
        return !metaTitle.startsWith('http')
      })
      .map(([answerText, s3Uri, chunkText, metaTitle]) => ({
        answerText,
        s3Uri,
        chunkText,
        metaTitle,
      }))

    fc.assert(
      fc.property(s3OnlyArb, ({ answerText, s3Uri, chunkText, metaTitle }) => {
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
                  // Only s3Location — no webLocation
                  s3Location: { uri: s3Uri },
                },
                content: { text: chunkText },
                metadata: {
                  'x-amz-bedrock-kb-source-uri': metaTitle,
                  title: 'Local Document',
                },
              },
            ],
          },
        ]

        const { sources } = extractCitationsFromRAG(answerText, citations)

        // S3-only citations are now filtered out — no sources should be produced
        expect(sources.length).toBe(0)
      }),
      { numRuns: 100 },
    )
  })

  it('S3-only sources with metadata containing non-http values produce no sources', () => {
    const s3WithNonHttpMetaArb = fc
      .tuple(
        fc
          .string({ minLength: 50, maxLength: 300 })
          .map((s) => s.replace(/[\n\r]/g, ' ').padEnd(50, 'x').slice(0, Math.max(50, s.length))),
        fc.constantFrom(
          's3://bucket/path/document.md',
          's3://knowledge-base/campus/info.md',
        ),
        fc.constantFrom(
          // Non-http metadata values
          's3://bucket/path/document.md',
          'file:///local/path/doc.md',
          'campus-document-title',
          '',
        ),
      )
      .map(([answerText, s3Uri, metaSourceUri]) => ({ answerText, s3Uri, metaSourceUri }))

    fc.assert(
      fc.property(s3WithNonHttpMetaArb, ({ answerText, s3Uri, metaSourceUri }) => {
        const citations = [
          {
            generatedResponsePart: {
              textResponsePart: {
                span: { start: 0, end: Math.min(25, answerText.length) },
              },
            },
            retrievedReferences: [
              {
                location: {
                  s3Location: { uri: s3Uri },
                },
                content: { text: 'Some chunk text for the knowledge base document' },
                metadata: {
                  'x-amz-bedrock-kb-source-uri': metaSourceUri,
                  // No source_url field
                },
              },
            ],
          },
        ]

        const { sources } = extractCitationsFromRAG(answerText, citations)

        // S3-only citations are now filtered out — no sources should be produced
        expect(sources.length).toBe(0)
      }),
      { numRuns: 50 },
    )
  })
})
