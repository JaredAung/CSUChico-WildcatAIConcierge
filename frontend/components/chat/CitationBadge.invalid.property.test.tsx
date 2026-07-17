import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import * as fc from 'fast-check'
import { CitationBadge } from './CitationBadge'

/**
 * Feature: inline-citation-badges, Property 11: Invalid Citation Index Rejection
 *
 * For any source object where `citation_index` is not a positive integer
 * (e.g., 0, -1, 1.5, NaN, null), the system SHALL treat that source as having
 * no citation_index and SHALL NOT render a citation badge for it.
 *
 * **Validates: Requirements 2.5**
 */
describe('Property 11: Invalid Citation Index Rejection', () => {
  it('does not render a badge for zero index', () => {
    fc.assert(
      fc.property(fc.constant(0), (index) => {
        const { container } = render(<CitationBadge index={index} />)
        expect(container.innerHTML).toBe('')
      }),
      { numRuns: 100 },
    )
  })

  it('does not render a badge for negative integer indices', () => {
    fc.assert(
      fc.property(
        fc.integer({ max: -1 }),
        (index) => {
          const { container } = render(<CitationBadge index={index} />)
          expect(container.innerHTML).toBe('')
        },
      ),
      { numRuns: 100 },
    )
  })

  it('does not render a badge for non-integer (fractional) indices', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -1000, max: 1000, noNaN: true, noDefaultInfinity: true }).filter(
          (n) => !Number.isInteger(n),
        ),
        (index) => {
          const { container } = render(<CitationBadge index={index} />)
          expect(container.innerHTML).toBe('')
        },
      ),
      { numRuns: 100 },
    )
  })

  it('does not render a badge for NaN', () => {
    fc.assert(
      fc.property(fc.constant(NaN), (index) => {
        const { container } = render(<CitationBadge index={index} />)
        expect(container.innerHTML).toBe('')
      }),
      { numRuns: 100 },
    )
  })

  it('does not render a badge for Infinity or -Infinity', () => {
    fc.assert(
      fc.property(
        fc.oneof(fc.constant(Infinity), fc.constant(-Infinity)),
        (index) => {
          const { container } = render(<CitationBadge index={index} />)
          expect(container.innerHTML).toBe('')
        },
      ),
      { numRuns: 100 },
    )
  })

  it('does not render a badge for any invalid numeric value (combined)', () => {
    // Generate a variety of invalid values: 0, negatives, fractionals, NaN, Infinity
    const invalidIndex = fc.oneof(
      fc.constant(0),
      fc.integer({ max: -1 }),
      fc.double({ min: 0.01, max: 1000, noNaN: true, noDefaultInfinity: true }).filter(
        (n) => !Number.isInteger(n),
      ),
      fc.double({ min: -1000, max: -0.01, noNaN: true, noDefaultInfinity: true }).filter(
        (n) => !Number.isInteger(n),
      ),
      fc.constant(NaN),
      fc.constant(Infinity),
      fc.constant(-Infinity),
    )

    fc.assert(
      fc.property(invalidIndex, (index) => {
        const { container } = render(<CitationBadge index={index} />)
        expect(container.innerHTML).toBe('')
      }),
      { numRuns: 100 },
    )
  })

  it('DOES render a badge for valid positive integer indices (sanity check)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 50 }),
        (index) => {
          const { container } = render(<CitationBadge index={index} />)
          expect(container.innerHTML).not.toBe('')
        },
      ),
      { numRuns: 100 },
    )
  })
})
