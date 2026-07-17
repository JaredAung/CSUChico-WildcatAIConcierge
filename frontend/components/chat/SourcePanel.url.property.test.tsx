/**
 * Feature: inline-citation-badges, Property 10: Text Fragment URL Consistency
 *
 * For any source with a citation_index, the URL rendered in the inline CitationBadge
 * and the URL rendered in the SourcePanel external link SHALL be identical strings.
 *
 * Validates: Requirements 7.7
 */
import { describe, it, expect } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import * as fc from 'fast-check'
import { CitationBadge } from './CitationBadge'
import { SourcePanel } from './SourcePanel'
import type { Source } from '@/lib/types'

describe('Property 10: Text Fragment URL Consistency', () => {
  it('CitationBadge href and SourcePanel external link href are identical for the same source URL', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 20 }),
        fc.integer({ min: 1, max: 1000 }),
        fc.string({ minLength: 3, maxLength: 30 }).filter((s) => /^[a-z]+$/.test(s)),
        (citationIndex, seed, textFragment) => {
          const url = `https://example${seed}.com/page#:~:text=${encodeURIComponent(textFragment)}`
          const domainLabel = `example${seed}`
          const title = `Source Document ${citationIndex}`

          const source: Source = {
            title,
            url,
            citation_index: citationIndex,
            chunk_text: 'Some relevant chunk text for testing.',
            domain_label: domainLabel,
          }

          // Render CitationBadge with the source's URL
          const { container: badgeContainer } = render(
            <CitationBadge index={citationIndex} domainLabel={domainLabel} url={url} />
          )
          const badgeLink = badgeContainer.querySelector('a')
          expect(badgeLink).not.toBeNull()
          const badgeHref = badgeLink!.getAttribute('href')

          // Render SourcePanel with the source and expand it
          const { container: panelContainer } = render(
            <SourcePanel sources={[source]} />
          )

          // Click the toggle button to expand the panel
          const toggleButton = panelContainer.querySelector('button')
          expect(toggleButton).not.toBeNull()
          fireEvent.click(toggleButton!)

          // Find the external link in the expanded panel for the cited source
          const panelLink = panelContainer.querySelector(
            'a[target="_blank"][rel="noopener noreferrer"]'
          )
          expect(panelLink).not.toBeNull()
          const panelHref = panelLink!.getAttribute('href')

          // Both URLs must be identical strings
          expect(badgeHref).toBe(url)
          expect(panelHref).toBe(url)
          expect(badgeHref).toBe(panelHref)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('URL consistency holds for multiple sources with different citation indices', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 5 }),
        fc.integer({ min: 1, max: 500 }),
        (numSources, baseSeed) => {
          const sources: Source[] = Array.from({ length: numSources }, (_, i) => {
            const idx = i + 1
            const url = `https://example${baseSeed + i}.com/page#:~:text=some%20text%20${idx}`
            return {
              title: `Document ${idx}`,
              url,
              citation_index: idx,
              chunk_text: `Chunk text for source ${idx}`,
              domain_label: `example${baseSeed + i}`,
            }
          })

          // Render SourcePanel and expand it
          const { container: panelContainer } = render(
            <SourcePanel sources={sources} />
          )
          const toggleButton = panelContainer.querySelector('button')
          expect(toggleButton).not.toBeNull()
          fireEvent.click(toggleButton!)

          // Get all external links in the panel
          const panelLinks = panelContainer.querySelectorAll(
            'a[target="_blank"][rel="noopener noreferrer"]'
          )
          expect(panelLinks.length).toBe(numSources)

          // For each source, render the CitationBadge and verify URLs match
          sources.forEach((source, i) => {
            const { container: badgeContainer } = render(
              <CitationBadge
                index={source.citation_index!}
                domainLabel={source.domain_label}
                url={source.url}
              />
            )
            const badgeLink = badgeContainer.querySelector('a')
            expect(badgeLink).not.toBeNull()

            const badgeHref = badgeLink!.getAttribute('href')
            const panelHref = panelLinks[i].getAttribute('href')

            expect(badgeHref).toBe(source.url)
            expect(panelHref).toBe(source.url)
            expect(badgeHref).toBe(panelHref)
          })
        }
      ),
      { numRuns: 100 }
    )
  })
})
