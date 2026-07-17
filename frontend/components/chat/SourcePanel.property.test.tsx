/**
 * Feature: inline-citation-badges, Property 7: Source Panel Display Truncation
 *
 * For any source with a `chunk_text` longer than 300 characters, the Source Panel
 * pull-quote display SHALL show at most 300 characters followed by an ellipsis character.
 * For chunk_text of 300 characters or fewer, it SHALL display the full text without ellipsis.
 *
 * Feature: inline-citation-badges, Property 8: Source Panel Ordering Invariant
 *
 * For any list of sources where at least two have a `citation_index`, the rendered
 * source cards in the Source Panel SHALL appear in strictly ascending `citation_index` order.
 *
 * Validates: Requirements 4.3, 4.5
 */
import { describe, it, expect } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import * as fc from 'fast-check'
import { SourcePanel } from './SourcePanel'
import type { Source } from '@/lib/types'

/**
 * Helper: build a Source object with a citation_index and chunk_text.
 */
function makeSource(overrides: Partial<Source> & { citation_index: number }): Source {
  return {
    title: `Source ${overrides.citation_index}`,
    url: `https://example.com/page-${overrides.citation_index}`,
    ...overrides,
  }
}

/**
 * Helper: expand the SourcePanel (it starts collapsed).
 */
function expandPanel(container: HTMLElement): void {
  const toggleButton = container.querySelector('button[aria-expanded]')
  if (toggleButton) {
    fireEvent.click(toggleButton)
  }
}

describe('Property 7: Source Panel Display Truncation', () => {
  it('chunk_text > 300 chars is truncated to at most 300 chars + ellipsis; chunk_text <= 300 chars is displayed in full without ellipsis', () => {
    fc.assert(
      fc.property(
        // Generate chunk_text of varying lengths around the 300-char boundary (200-500 chars)
        fc.integer({ min: 200, max: 500 }).chain((len) =>
          fc.string({ minLength: len, maxLength: len }).filter((s) => s.trim().length > 0)
        ),
        (chunkText) => {
          const source = makeSource({
            citation_index: 1,
            chunk_text: chunkText,
          })

          const { container } = render(<SourcePanel sources={[source]} />)
          expandPanel(container)

          // Find the blockquote element that displays the pull-quote
          const blockquote = container.querySelector('blockquote')
          expect(blockquote).not.toBeNull()

          const displayedText = blockquote!.textContent ?? ''
          const trimmedChunkText = chunkText.trim()

          if (trimmedChunkText.length > 300) {
            // Should be truncated with ellipsis
            expect(displayedText.endsWith('\u2026')).toBe(true)
            expect(displayedText.length).toBeLessThanOrEqual(301) // 300 chars + 1 ellipsis
          } else {
            // Should display full text without ellipsis
            expect(displayedText).toBe(trimmedChunkText)
            expect(displayedText.endsWith('\u2026')).toBe(false)
          }
        }
      ),
      { numRuns: 100 }
    )
  })
})

describe('Property 8: Source Panel Ordering Invariant', () => {
  it('sources with citation_index are rendered in strictly ascending order', () => {
    fc.assert(
      fc.property(
        // Generate 2-5 unique citation indices in range 1-50
        fc.integer({ min: 2, max: 5 }).chain((count) =>
          fc.uniqueArray(fc.integer({ min: 1, max: 50 }), {
            minLength: count,
            maxLength: count,
          })
        ),
        (indices) => {
          // Build sources with random ordering of indices
          const sources: Source[] = indices.map((idx) =>
            makeSource({
              citation_index: idx,
              chunk_text: `Content for source ${idx}`,
            })
          )

          const { container } = render(<SourcePanel sources={sources} />)
          expandPanel(container)

          // Find all citation number badges (the small circles with the index number)
          const badges = container.querySelectorAll(
            'span[aria-label^="Citation"]'
          )

          expect(badges.length).toBe(indices.length)

          // Extract the numeric values from the badges
          const renderedIndices = Array.from(badges).map((badge) =>
            parseInt(badge.textContent ?? '0', 10)
          )

          // Verify strictly ascending order
          for (let i = 1; i < renderedIndices.length; i++) {
            expect(renderedIndices[i]).toBeGreaterThan(renderedIndices[i - 1])
          }
        }
      ),
      { numRuns: 100 }
    )
  })
})
