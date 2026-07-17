/**
 * Feature: inline-citation-badges, Property 5: Citation Marker Parsing Selectivity
 *
 * For any answer text and sources array, the citation badge renderer SHALL convert
 * a bracket pattern [N] to a badge if and only if N is an integer in the range [1, 20]
 * AND a source with citation_index === N exists in the sources array. All other bracket
 * patterns (markdown links, [0], [21], [text]) SHALL pass through as plain text.
 *
 * Validates: Requirements 3.1, 5.4
 */
import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { preprocessCitationMarkers } from './MessageBubble'
import type { Source } from '@/lib/types'

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Build a minimal Source object with a given citation_index */
function makeSource(citationIndex: number): Source {
  return {
    title: `Source ${citationIndex}`,
    url: `https://example.com/page${citationIndex}`,
    citation_index: citationIndex,
    domain_label: 'example',
  }
}

// ─── Arbitraries ──────────────────────────────────────────────────────────────

/** Generate a valid citation index (1-20) */
const validIndexArb = fc.integer({ min: 1, max: 20 })

/** Generate a source array with unique citation_index values in range 1-20 */
const sourcesArb = fc
  .uniqueArray(validIndexArb, { minLength: 1, maxLength: 10 })
  .map((indices) => indices.map(makeSource))

/** Generate surrounding text that does NOT contain bracket patterns */
const plainTextArb = fc
  .string({ minLength: 0, maxLength: 50 })
  .map((s) => s.replace(/[\[\]()]/g, ''))

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Property 5: Citation Marker Parsing Selectivity', () => {
  it('converts valid [N] markers (1-20 with matching source) to <cite-badge> elements', () => {
    fc.assert(
      fc.property(
        validIndexArb,
        plainTextArb,
        plainTextArb,
        (index, prefix, suffix) => {
          const sources = [makeSource(index)]
          const content = `${prefix}[${index}]${suffix}`
          const result = preprocessCitationMarkers(content, sources)

          expect(result).toContain(`<cite-badge data-index="${index}"></cite-badge>`)
          expect(result).not.toContain(`[${index}]`)
        },
      ),
      { numRuns: 100 },
    )
  })

  it('does NOT convert invalid patterns: [0], [21+], [text], and indices without matching sources', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          // [0] — below range
          fc.constant(0),
          // [21] to [100] — above range
          fc.integer({ min: 21, max: 100 }),
        ),
        plainTextArb,
        sourcesArb,
        (invalidIndex, surroundingText, sources) => {
          // Ensure invalidIndex is NOT in the sources array
          const filteredSources = sources.filter(
            (s) => s.citation_index !== invalidIndex,
          )
          // Use at least one source so the function doesn't short-circuit
          const finalSources =
            filteredSources.length > 0
              ? filteredSources
              : [makeSource(1)]

          const content = `${surroundingText}[${invalidIndex}]`
          const result = preprocessCitationMarkers(content, finalSources)

          // The invalid marker should remain unchanged
          expect(result).toContain(`[${invalidIndex}]`)
          expect(result).not.toContain(
            `<cite-badge data-index="${invalidIndex}"></cite-badge>`,
          )
        },
      ),
      { numRuns: 100 },
    )
  })

  it('does NOT convert markdown links [N](url) even when N matches a source index', () => {
    fc.assert(
      fc.property(
        validIndexArb,
        fc.webUrl(),
        plainTextArb,
        (index, url, prefix) => {
          const sources = [makeSource(index)]
          const content = `${prefix}[${index}](${url})`
          const result = preprocessCitationMarkers(content, sources)

          // Markdown links should pass through unchanged — no cite-badge generated
          expect(result).not.toContain(
            `<cite-badge data-index="${index}"></cite-badge>`,
          )
          // The original markdown link pattern should remain
          expect(result).toContain(`[${index}](${url})`)
        },
      ),
      { numRuns: 100 },
    )
  })

  it('correctly handles mixed content: only valid markers with matching sources are converted', () => {
    fc.assert(
      fc.property(
        sourcesArb,
        fc.array(fc.integer({ min: 21, max: 99 }), {
          minLength: 1,
          maxLength: 5,
        }),
        validIndexArb,
        fc.webUrl(),
        (sources, outOfRangeIndices, mdLinkIndex, mdLinkUrl) => {
          const validIndices = sources.map((s) => s.citation_index!)

          // Build mixed content:
          // 1. Valid markers that should be converted
          const validMarkers = validIndices.map((i) => `[${i}]`).join(' ')
          // 2. Out-of-range markers that should NOT be converted
          const invalidMarkers = outOfRangeIndices
            .map((i) => `[${i}]`)
            .join(' ')
          // 3. A markdown link that should NOT be converted
          const mdLink = `[${mdLinkIndex}](${mdLinkUrl})`
          // 4. A text bracket pattern
          const textBracket = '[hello]'

          const content = `${validMarkers} ${invalidMarkers} ${mdLink} ${textBracket}`
          const result = preprocessCitationMarkers(content, sources)

          // All valid markers should be converted
          for (const idx of validIndices) {
            expect(result).toContain(
              `<cite-badge data-index="${idx}"></cite-badge>`,
            )
          }

          // Out-of-range markers should remain unchanged
          for (const idx of outOfRangeIndices) {
            expect(result).toContain(`[${idx}]`)
            expect(result).not.toContain(
              `<cite-badge data-index="${idx}"></cite-badge>`,
            )
          }

          // Markdown link should remain unchanged
          expect(result).toContain(`[${mdLinkIndex}](${mdLinkUrl})`)

          // Text bracket should remain unchanged
          expect(result).toContain('[hello]')
        },
      ),
      { numRuns: 100 },
    )
  })

  it('does NOT convert [N] when N is valid range but no source has matching citation_index', () => {
    fc.assert(
      fc.property(
        validIndexArb,
        sourcesArb,
        plainTextArb,
        (orphanIndex, sources, prefix) => {
          // Ensure orphanIndex is NOT in the sources array
          const filteredSources = sources.filter(
            (s) => s.citation_index !== orphanIndex,
          )
          // Need at least one source so function doesn't short-circuit
          if (filteredSources.length === 0) return // skip this case

          const content = `${prefix}[${orphanIndex}]`
          const result = preprocessCitationMarkers(content, filteredSources)

          // Orphan marker should remain unchanged
          expect(result).toContain(`[${orphanIndex}]`)
          expect(result).not.toContain(
            `<cite-badge data-index="${orphanIndex}"></cite-badge>`,
          )
        },
      ),
      { numRuns: 100 },
    )
  })
})
