/**
 * Feature: inline-citation-badges, Property 6: Aria-Label Format Consistency
 *
 * For any rendered citation badge with index N and domain label D,
 * the `aria-label` attribute SHALL equal the string `Source ${N}: ${D}`.
 *
 * Validates: Requirements 3.5
 */
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import * as fc from 'fast-check'
import { CitationBadge } from './CitationBadge'

describe('Property 6: Aria-Label Format Consistency', () => {
  it('aria-label equals "Source ${index}: ${domainLabel}" for random index/domain combinations (span variant)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 50 }),
        fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0),
        (index, domainLabel) => {
          const { container } = render(
            <CitationBadge index={index} domainLabel={domainLabel} />
          )
          const el = container.querySelector('[aria-label]')
          expect(el).not.toBeNull()
          expect(el!.getAttribute('aria-label')).toBe(`Source ${index}: ${domainLabel}`)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('aria-label equals "Source ${index}: ${domainLabel}" for random index/domain combinations (link variant with url)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 50 }),
        fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0),
        fc.webUrl(),
        (index, domainLabel, url) => {
          const { container } = render(
            <CitationBadge index={index} domainLabel={domainLabel} url={url} />
          )
          const el = container.querySelector('[aria-label]')
          expect(el).not.toBeNull()
          expect(el!.getAttribute('aria-label')).toBe(`Source ${index}: ${domainLabel}`)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('aria-label falls back to "Source ${index}: unknown" when domainLabel is undefined', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 50 }),
        (index) => {
          const { container } = render(
            <CitationBadge index={index} />
          )
          const el = container.querySelector('[aria-label]')
          expect(el).not.toBeNull()
          expect(el!.getAttribute('aria-label')).toBe(`Source ${index}: unknown`)
        }
      ),
      { numRuns: 100 }
    )
  })
})
