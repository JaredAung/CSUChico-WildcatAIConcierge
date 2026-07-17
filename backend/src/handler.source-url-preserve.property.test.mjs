/**
 * Preservation Property Tests — Source URL Filtering
 *
 * These tests MUST PASS on the unfixed code. They verify behavior that should
 * be preserved (not broken) after the fix is applied.
 *
 * Properties tested:
 * 1. HTTP/HTTPS URL chunks in buildSources → source has correct title, domain_label, excerpt, citation_index
 * 2. Duplicate HTTP URLs in buildSources → only first occurrence kept
 * 3. buildTextFragment direct calls → still returns #:~:text= for 3+ word text
 *
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5**
 */

import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import {
  buildSources,
  buildTextFragment,
  normalizeUrl,
  deriveDomainLabel,
} from './handler.mjs'

// ─── Generators ──────────────────────────────────────────────────────────────

/** Generate valid HTTP/HTTPS URLs with realistic structure */
const httpUrlArb = fc
  .tuple(
    fc.constantFrom('http://', 'https://'),
    fc.constantFrom('www.', 'library.', 'catalog.', ''),
    fc.constantFrom('csuchico.edu', 'example.com', 'campus.org', 'university.edu'),
    fc.constantFrom('/admissions', '/research', '/dining', '/housing', '/programs', '/about'),
  )
  .map(([protocol, subdomain, domain, path]) => `${protocol}${subdomain}${domain}${path}`)

/** Generate chunk text with 3+ words (enough to trigger text fragment) */
const multiWordTextArb = fc
  .array(fc.stringMatching(/[A-Za-z]{3,10}/), { minLength: 3, maxLength: 15 })
  .map((words) => words.join(' '))

/** Generate realistic metadata titles */
const titleArb = fc.constantFrom(
  'Admissions Page',
  'Library Resources',
  'Campus Dining',
  'Housing Options',
  'Academic Programs',
  '',
)

// ─── Property 1: HTTP Sources Retained With Correct Fields ───────────────────

/**
 * **Validates: Requirements 3.1, 3.3**
 *
 * WHEN a retrieved chunk has a valid HTTP/HTTPS URL, THEN buildSources
 * SHALL include it in the sources array with:
 * - non-empty title
 * - correct domain_label (derived from URL)
 * - excerpt ≤ 400 chars
 * - citation_index = chunk's 1-based position
 */
describe('Preservation: HTTP sources retained with correct fields', () => {
  it('buildSources with valid HTTP URL chunks produces source with correct title, domain_label, excerpt, citation_index', () => {
    const inputArb = fc.tuple(httpUrlArb, multiWordTextArb, titleArb)

    fc.assert(
      fc.property(inputArb, ([httpUrl, chunkText, metaTitle]) => {
        const chunk = {
          location: {
            type: 'WEB',
            webLocation: { url: httpUrl },
          },
          content: { text: chunkText },
          metadata: metaTitle ? { title: metaTitle } : {},
        }

        const sources = buildSources([chunk])

        // Source should be included
        expect(sources.length).toBe(1)

        const source = sources[0]

        // title: non-empty (either metadata title, path segment, or fallback)
        expect(source.title).toBeTruthy()
        expect(typeof source.title).toBe('string')
        expect(source.title.length).toBeGreaterThan(0)

        // domain_label: matches deriveDomainLabel output
        const expectedDomainLabel = deriveDomainLabel(httpUrl)
        expect(source.domain_label).toBe(expectedDomainLabel)

        // excerpt: ≤ 400 chars
        expect(source.excerpt.length).toBeLessThanOrEqual(400)

        // citation_index: equals 1 (first chunk, 1-based)
        expect(source.citation_index).toBe(1)
      }),
      { numRuns: 100 },
    )
  })

  it('citation_index matches the chunk 1-based position in multi-chunk array', () => {
    // Generate 2-5 distinct HTTP URLs for multiple chunks
    const distinctUrlsArb = fc
      .uniqueArray(httpUrlArb, { minLength: 2, maxLength: 5, comparator: (a, b) => normalizeUrl(a) === normalizeUrl(b) })

    fc.assert(
      fc.property(distinctUrlsArb, multiWordTextArb, (urls, chunkText) => {
        const chunks = urls.map((url) => ({
          location: {
            type: 'WEB',
            webLocation: { url },
          },
          content: { text: chunkText },
          metadata: { title: 'Test Page' },
        }))

        const sources = buildSources(chunks)

        // Each source's citation_index should match its chunk's 1-based position
        // Since all URLs are unique, we expect one source per chunk
        expect(sources.length).toBe(urls.length)

        for (let i = 0; i < sources.length; i++) {
          expect(sources[i].citation_index).toBe(i + 1)
        }
      }),
      { numRuns: 100 },
    )
  })
})

// ─── Property 2: Deduplication by Normalized URL ─────────────────────────────

/**
 * **Validates: Requirements 3.2**
 *
 * WHEN multiple chunks share the same normalized HTTP URL, THEN buildSources
 * SHALL deduplicate them, keeping only the first occurrence.
 */
describe('Preservation: Deduplication by normalized URL', () => {
  it('duplicate HTTP URLs result in only first occurrence in sources', () => {
    const inputArb = fc.tuple(httpUrlArb, multiWordTextArb, multiWordTextArb)

    fc.assert(
      fc.property(inputArb, ([httpUrl, text1, text2]) => {
        // Create two chunks with the same URL but different text
        const chunks = [
          {
            location: {
              type: 'WEB',
              webLocation: { url: httpUrl },
            },
            content: { text: text1 },
            metadata: { title: 'First Occurrence' },
          },
          {
            location: {
              type: 'WEB',
              webLocation: { url: httpUrl },
            },
            content: { text: text2 },
            metadata: { title: 'Second Occurrence' },
          },
        ]

        const sources = buildSources(chunks)

        // Only first occurrence should remain
        expect(sources.length).toBe(1)
        expect(sources[0].title).toBe('First Occurrence')
        // citation_index is the first chunk's position (1-based)
        expect(sources[0].citation_index).toBe(1)
      }),
      { numRuns: 100 },
    )
  })

  it('URLs differing only by trailing slash are deduplicated', () => {
    fc.assert(
      fc.property(httpUrlArb, multiWordTextArb, (httpUrl, chunkText) => {
        // Ensure the URL doesn't already end with /
        const baseUrl = httpUrl.replace(/\/+$/, '')
        const trailingUrl = baseUrl + '/'

        const chunks = [
          {
            location: { type: 'WEB', webLocation: { url: baseUrl } },
            content: { text: chunkText },
            metadata: { title: 'No Trailing Slash' },
          },
          {
            location: { type: 'WEB', webLocation: { url: trailingUrl } },
            content: { text: chunkText },
            metadata: { title: 'With Trailing Slash' },
          },
        ]

        const sources = buildSources(chunks)

        // normalizeUrl strips trailing slashes, so these should deduplicate
        expect(sources.length).toBe(1)
        expect(sources[0].title).toBe('No Trailing Slash')
      }),
      { numRuns: 100 },
    )
  })
})

// ─── Property 3: buildTextFragment Direct Calls ──────────────────────────────

/**
 * **Validates: Requirements 3.4**
 *
 * WHEN buildTextFragment is called directly with a valid HTTP URL and
 * text with 3+ words, THEN it SHALL return a URL with `#:~:text=` fragment.
 * The function is preserved unchanged — just no longer called in source building.
 */
describe('Preservation: buildTextFragment direct calls', () => {
  it('returns URL with #:~:text= for 3+ word text', () => {
    const inputArb = fc.tuple(httpUrlArb, multiWordTextArb)

    fc.assert(
      fc.property(inputArb, ([httpUrl, chunkText]) => {
        const result = buildTextFragment(httpUrl, chunkText)

        // Should contain the text fragment
        expect(result).toContain('#:~:text=')
        // Should start with the original URL
        expect(result.startsWith(httpUrl)).toBe(true)
        // The fragment should be URL-encoded first 8 words
        const words = chunkText.trim().split(/\s+/).filter(Boolean)
        const expectedPhrase = words.slice(0, 8).join(' ')
        const expectedEncoded = encodeURIComponent(expectedPhrase)
        expect(result).toBe(`${httpUrl}#:~:text=${expectedEncoded}`)
      }),
      { numRuns: 100 },
    )
  })

  it('returns base URL unchanged for text with fewer than 3 words', () => {
    // Generate text that has strictly fewer than 3 whitespace-separated tokens
    const shortTextArb = fc
      .array(fc.stringMatching(/^[A-Za-z]{3,10}$/), { minLength: 1, maxLength: 2 })
      .map((words) => words.join(' '))

    const inputArb = fc.tuple(httpUrlArb, shortTextArb)

    fc.assert(
      fc.property(inputArb, ([httpUrl, shortText]) => {
        // Pre-condition: text should split to fewer than 3 tokens
        const tokens = shortText.trim().split(/\s+/).filter(Boolean)
        fc.pre(tokens.length < 3)

        const result = buildTextFragment(httpUrl, shortText)

        // Should return the URL unchanged (no fragment appended)
        expect(result).toBe(httpUrl)
        expect(result).not.toContain('#:~:text=')
      }),
      { numRuns: 100 },
    )
  })

  it('returns base URL unchanged when URL already has a fragment', () => {
    const urlWithFragmentArb = httpUrlArb.map((url) => `${url}#existing-section`)

    fc.assert(
      fc.property(urlWithFragmentArb, multiWordTextArb, (urlWithHash, chunkText) => {
        const result = buildTextFragment(urlWithHash, chunkText)

        // Should return URL unchanged since it already has a fragment
        expect(result).toBe(urlWithHash)
      }),
      { numRuns: 100 },
    )
  })
})
