/**
 * Bug Condition Exploration Test — Citation Rendering Fix
 *
 * This test MUST FAIL on unfixed code. Failure confirms the bugs exist.
 * DO NOT attempt to fix the test or the code when it fails.
 *
 * Three properties:
 * 1. Trailing marker cluster: [N] markers should NOT pile up in the trailing 5% of text
 * 2. Reference section passthrough: reference sections should be stripped from output
 * 3. S3 URI priority: webLocation.url should be preferred over s3Location.uri
 *
 * Validates: Requirements 1.1, 1.2, 1.3, 1.4
 */

import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { extractCitationsFromRAG, stripReferenceSection } from './handler.mjs'

// ─── Property 1: Trailing marker cluster detection ────────────────────────────

/**
 * **Validates: Requirements 1.1**
 *
 * For any answer text (100-2000 chars) with 2+ citations having span.end
 * clustered at >= 95% of text length, assert that after extractCitationsFromRAG,
 * the annotated answer does NOT have [N] markers in the trailing 5%.
 *
 * Will FAIL on unfixed code because markers pile up at the end.
 */
describe('Bug Condition: Trailing marker cluster', () => {
  it('should NOT have [N] markers in the trailing 5% of the answer text', () => {
    // Generator: answer text 100-2000 chars, with 2+ citations at trailing positions
    const trailingClusterArb = fc
      .integer({ min: 100, max: 2000 })
      .chain((length) => {
        // Generate answer text of the desired length
        const answerArb = fc
          .stringMatching(/[A-Za-z0-9 .,!?]/)
          .map((s) => s.padEnd(length, 'a').slice(0, length))
          .filter((s) => s.length === length)

        // Threshold: 95% of text length
        const threshold = Math.floor(length * 0.95)

        // Generate 2-4 citations with span.end at >= 95% of length
        const citationArb = fc
          .integer({ min: threshold, max: length })
          .map((end) => ({
            generatedResponsePart: {
              textResponsePart: {
                span: { start: Math.max(0, end - 20), end },
              },
            },
            retrievedReferences: [
              {
                location: {
                  webLocation: { url: 'https://example.com/page' },
                },
                content: { text: 'Some reference content for citation' },
                metadata: { title: 'Test Source' },
              },
            ],
          }))

        return fc.tuple(answerArb, fc.array(citationArb, { minLength: 2, maxLength: 4 }))
      })

    fc.assert(
      fc.property(trailingClusterArb, ([answerText, citations]) => {
        const { annotatedAnswer } = extractCitationsFromRAG(answerText, citations)

        // The trailing 5% of the ORIGINAL text length should not have [N] markers
        const threshold = Math.floor(answerText.length * 0.95)

        // Check the tail of the annotated answer for marker patterns
        // The markers are injected at positions >= threshold in the original text,
        // so we check if the annotated answer ends with a cluster of [N] markers
        const trailingPortion = annotatedAnswer.slice(threshold)
        const markerPattern = /\[\d+\]/g
        const markers = trailingPortion.match(markerPattern) || []

        // Assert: no markers should be in the trailing 5%
        expect(markers.length).toBe(0)
      }),
      { numRuns: 100 },
    )
  })
})

// ─── Property 2: Reference section passthrough ────────────────────────────────

/**
 * **Validates: Requirements 1.2**
 *
 * Generate answer text followed by a reference section like
 * "\n\n📌 References\n1. Source A\n2. Source B".
 * Call extractCitationsFromRAG then verify the returned text does NOT contain
 * a reference section matching the pattern.
 *
 * Will FAIL on unfixed code because no stripping exists.
 */
describe('Bug Condition: Reference section passthrough', () => {
  it('should NOT contain a reference section in the output', () => {
    // Generate various reference section formats
    const refSectionVariants = [
      '\n\n📌 References\n1. Source A\n2. Source B',
      '\n\nReferences\n1. First source\n2. Second source',
      '\n\n## References\n1. Source One\n2. Source Two',
      '\n\nSources\n- Source A\n- Source B',
      '\n\n### Sources\n1. Source Alpha\n2. Source Beta',
      '\n\nReferencias\n1. Fuente A\n2. Fuente B',
    ]

    const refSectionArb = fc.constantFrom(...refSectionVariants)

    // Generate base answer text (no reference section in it)
    const baseAnswerArb = fc
      .string({ minLength: 50, maxLength: 500 })
      .filter((s) => !/(?:References|Sources|Referencias)/i.test(s))
      .map((s) => s.replace(/[\n\r]/g, ' ').trim() || 'This is a test answer about CSU Chico campus life and dining options nearby.')

    const inputArb = fc.tuple(baseAnswerArb, refSectionArb)

    fc.assert(
      fc.property(inputArb, ([baseAnswer, refSection]) => {
        const answerText = baseAnswer + refSection

        // Call with empty citations (reference section is in the text itself)
        const { annotatedAnswer } = extractCitationsFromRAG(answerText, [])

        // Apply stripReferenceSection as handleChat does after extractCitationsFromRAG
        const cleaned = stripReferenceSection(annotatedAnswer)

        // The reference section pattern should NOT be present in the output
        const refPattern = /\n#{0,3}\s*(?:📌\s*)?(?:References|Sources|Referencias)\s*[\n:]/i
        expect(refPattern.test(cleaned)).toBe(false)
      }),
      { numRuns: 100 },
    )
  })
})

// ─── Property 3: S3 URI priority over web URL ─────────────────────────────────

/**
 * **Validates: Requirements 1.3**
 *
 * Generate citation references with both s3Location.uri = "s3://bucket/path"
 * AND webLocation.url = "https://example.com/page". Assert that the source URL
 * in the result uses webLocation.url, not the S3 URI.
 *
 * Will FAIL on unfixed code because S3 is prioritized via || order.
 */
describe('Bug Condition: S3 URI priority over web URL', () => {
  it('should prefer webLocation.url over s3Location.uri in source URLs', () => {
    // Generate S3 bucket paths and web URLs
    const s3BucketArb = fc
      .tuple(
        fc.stringMatching(/[a-z][a-z0-9-]{2,20}/),
        fc.stringMatching(/[a-z0-9/]{3,30}/),
      )
      .map(([bucket, path]) => `s3://${bucket}/${path}.md`)

    const webUrlArb = fc.constantFrom(
      'https://www.csuchico.edu/page',
      'https://example.com/article',
      'https://library.csuchico.edu/resource',
      'https://www.chadathaicuisinechico.com/',
      'https://downtown.chico.org/dining',
    )

    const inputArb = fc.tuple(s3BucketArb, webUrlArb).chain(([s3Uri, webUrl]) => {
      const answerArb = fc
        .string({ minLength: 50, maxLength: 300 })
        .map((s) => s.replace(/[\n\r]/g, ' ').padEnd(50, 'x').slice(0, Math.max(50, s.length)))

      return fc.tuple(fc.constant(s3Uri), fc.constant(webUrl), answerArb)
    })

    fc.assert(
      fc.property(inputArb, ([s3Uri, webUrl, answerText]) => {
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
                  webLocation: { url: webUrl },
                },
                content: { text: 'Some chunk text from the knowledge base' },
                metadata: { title: 'Test Source' },
              },
            ],
          },
        ]

        const { sources } = extractCitationsFromRAG(answerText, citations)

        // Assert: source URL should use webLocation.url, NOT the S3 URI
        expect(sources.length).toBeGreaterThan(0)
        for (const source of sources) {
          // The URL should start with the web URL (may have text fragment appended)
          expect(source.url).not.toMatch(/^s3:\/\//)
          expect(source.url.startsWith(webUrl)).toBe(true)
        }
      }),
      { numRuns: 100 },
    )
  })
})
