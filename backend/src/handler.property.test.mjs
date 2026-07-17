import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { normalizeUrl, deriveDomainLabel, buildTextFragment } from './handler.mjs'

// ─── Property: normalizeUrl trailing slash removal ───────────────────────────
// Feature: inline-citation-badges, Property: normalizeUrl trailing slash removal
// For any URL string ending with one or more `/`, normalizeUrl should return a string not ending with `/`.
// Validates: Requirements 1.4

describe('Property Tests: normalizeUrl', () => {
  it('strips trailing slashes from any URL ending with one or more /', () => {
    fc.assert(
      fc.property(
        fc.webUrl().map((url) => url + '/'.repeat(fc.sample(fc.integer({ min: 1, max: 5 }), 1)[0])),
        (urlWithSlashes) => {
          const result = normalizeUrl(urlWithSlashes)
          expect(result).not.toMatch(/\/$/)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('returns a string not ending with / for URLs with trailing slashes (custom generator)', () => {
    const urlWithTrailingSlashes = fc
      .tuple(
        fc.constantFrom('http://', 'https://'),
        fc.domain(),
        fc.webPath(),
        fc.integer({ min: 1, max: 10 })
      )
      .map(([protocol, domain, path, slashCount]) => {
        return `${protocol}${domain}${path}${'/' .repeat(slashCount)}`
      })

    fc.assert(
      fc.property(urlWithTrailingSlashes, (url) => {
        const result = normalizeUrl(url)
        expect(result).not.toMatch(/\/$/)
      }),
      { numRuns: 100 }
    )
  })
})

// ─── Property 3: Domain Label Derivation ─────────────────────────────────────
// Feature: inline-citation-badges, Property 3: Domain Label Derivation
// For any valid URL with a hostname, deriveDomainLabel() SHALL return the first subdomain
// segment of the hostname after stripping the www. prefix.
// Validates: Requirements 1.4, 7.1, 7.2, 7.3, 7.8

describe('Property Tests: deriveDomainLabel', () => {
  it('returns the first subdomain segment after stripping www.', () => {
    // Generate valid URLs with various hostnames
    const validUrl = fc
      .tuple(
        fc.constantFrom('http://', 'https://'),
        fc.boolean(), // whether to prepend www.
        fc.stringMatching(/^[a-z][a-z0-9]{1,10}$/), // first segment (the expected label)
        fc.constantFrom('.edu', '.com', '.org', '.net', '.io', '.csuchico.edu', '.example.com'),
        fc.webPath()
      )
      .map(([protocol, hasWww, segment, tld, path]) => {
        const host = hasWww ? `www.${segment}${tld}` : `${segment}${tld}`
        return { url: `${protocol}${host}${path}`, expectedLabel: segment }
      })

    fc.assert(
      fc.property(validUrl, ({ url, expectedLabel }) => {
        const result = deriveDomainLabel(url)
        expect(result).toBe(expectedLabel)
      }),
      { numRuns: 100 }
    )
  })

  it('always returns a non-empty string for valid URLs with hostnames', () => {
    fc.assert(
      fc.property(fc.webUrl(), (url) => {
        const result = deriveDomainLabel(url)
        // webUrl always produces valid URLs with a hostname, so result should be non-empty
        expect(result.length).toBeGreaterThan(0)
      }),
      { numRuns: 100 }
    )
  })

  it('never contains a dot in the result', () => {
    fc.assert(
      fc.property(fc.webUrl(), (url) => {
        const result = deriveDomainLabel(url)
        expect(result).not.toContain('.')
      }),
      { numRuns: 100 }
    )
  })
})

// ─── Property 9: Text Fragment Construction ──────────────────────────────────
// Feature: inline-citation-badges, Property 9: Text Fragment Construction
// For any source URL without an existing fragment identifier and with chunk text containing
// 3 or more words, buildTextFragment() SHALL return a URL ending with #:~:text=<encoded>
// where <encoded> is the URL-encoded (RFC 3986) concatenation of the first 8 space-delimited
// words of the chunk text. For chunk text with fewer than 3 words, the original URL SHALL be
// returned unchanged.
// Validates: Requirements 1.4, 7.1, 7.2, 7.3, 7.8

describe('Property Tests: buildTextFragment', () => {
  it('appends #:~:text= fragment when chunk has >= 3 words and URL has no fragment', () => {
    // Generate URLs without fragments and text with at least 3 words
    const urlWithoutFragment = fc
      .tuple(
        fc.constantFrom('http://', 'https://'),
        fc.domain(),
        fc.webPath()
      )
      .map(([protocol, domain, path]) => `${protocol}${domain}${path}`)

    const textWith3PlusWords = fc
      .array(fc.stringMatching(/^[a-zA-Z]{1,10}$/), { minLength: 3, maxLength: 20 })
      .map((words) => words.join(' '))

    fc.assert(
      fc.property(urlWithoutFragment, textWith3PlusWords, (url, text) => {
        const result = buildTextFragment(url, text)
        expect(result).toContain('#:~:text=')
        // The result should start with the original URL
        expect(result.startsWith(url)).toBe(true)
      }),
      { numRuns: 100 }
    )
  })

  it('returns URL unchanged when chunk has fewer than 3 words', () => {
    const urlWithoutFragment = fc
      .tuple(
        fc.constantFrom('http://', 'https://'),
        fc.domain(),
        fc.webPath()
      )
      .map(([protocol, domain, path]) => `${protocol}${domain}${path}`)

    const textWithLessThan3Words = fc
      .array(fc.stringMatching(/^[a-zA-Z]{1,10}$/), { minLength: 0, maxLength: 2 })
      .map((words) => words.join(' '))

    fc.assert(
      fc.property(urlWithoutFragment, textWithLessThan3Words, (url, text) => {
        const result = buildTextFragment(url, text)
        expect(result).toBe(url)
      }),
      { numRuns: 100 }
    )
  })

  it('uses at most 8 words in the fragment', () => {
    const urlWithoutFragment = fc
      .tuple(
        fc.constantFrom('http://', 'https://'),
        fc.domain(),
        fc.webPath()
      )
      .map(([protocol, domain, path]) => `${protocol}${domain}${path}`)

    const textWithManyWords = fc
      .array(fc.stringMatching(/^[a-zA-Z]{1,10}$/), { minLength: 3, maxLength: 30 })
      .map((words) => words.join(' '))

    fc.assert(
      fc.property(urlWithoutFragment, textWithManyWords, (url, text) => {
        const result = buildTextFragment(url, text)
        if (result.includes('#:~:text=')) {
          const encodedPart = result.split('#:~:text=')[1]
          const decoded = decodeURIComponent(encodedPart)
          const wordCount = decoded.split(' ').length
          expect(wordCount).toBeLessThanOrEqual(8)
        }
      }),
      { numRuns: 100 }
    )
  })

  it('returns URL unchanged when URL already has a fragment', () => {
    const urlWithFragment = fc
      .tuple(
        fc.constantFrom('http://', 'https://'),
        fc.domain(),
        fc.webPath(),
        fc.stringMatching(/^[a-zA-Z]{1,10}$/)
      )
      .map(([protocol, domain, path, fragment]) => `${protocol}${domain}${path}#${fragment}`)

    const textWith3PlusWords = fc
      .array(fc.stringMatching(/^[a-zA-Z]{1,10}$/), { minLength: 3, maxLength: 10 })
      .map((words) => words.join(' '))

    fc.assert(
      fc.property(urlWithFragment, textWith3PlusWords, (url, text) => {
        const result = buildTextFragment(url, text)
        expect(result).toBe(url)
      }),
      { numRuns: 100 }
    )
  })

  it('encodes the fragment text per RFC 3986 (encodeURIComponent)', () => {
    const urlWithoutFragment = fc
      .tuple(
        fc.constantFrom('http://', 'https://'),
        fc.domain(),
        fc.webPath()
      )
      .map(([protocol, domain, path]) => `${protocol}${domain}${path}`)

    // Words that may contain special chars to test encoding
    const textWith3PlusWords = fc
      .array(fc.stringMatching(/^[a-zA-Z0-9&=!@#$%]{1,8}$/), { minLength: 3, maxLength: 10 })
      .map((words) => words.join(' '))

    fc.assert(
      fc.property(urlWithoutFragment, textWith3PlusWords, (url, text) => {
        const result = buildTextFragment(url, text)
        if (result.includes('#:~:text=')) {
          const encodedPart = result.split('#:~:text=')[1]
          const words = text.trim().split(/\s+/).filter(Boolean)
          const expectedPhrase = words.slice(0, 8).join(' ')
          const expectedEncoded = encodeURIComponent(expectedPhrase)
          expect(encodedPart).toBe(expectedEncoded)
        }
      }),
      { numRuns: 100 }
    )
  })
})


