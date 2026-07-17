import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { extractNavigation } from './handler.mjs'

// ─── Property 1: Navigation marker extraction round-trip ─────────────────────
// Feature: campus-navigation, Property 1: Navigation marker extraction round-trip
// For any string containing one or more [[NAV:destination]] markers with a non-empty,
// non-whitespace destination of ≤200 characters, extractNavigation SHALL return
// wants_directions: true with the first marker's trimmed destination, and the cleanText
// SHALL contain zero [[NAV:...]] occurrences.
// **Validates: Requirements 6.1, 6.2, 6.3, 6.5**

describe('Property Tests: extractNavigation — Navigation marker extraction round-trip', () => {
  it('extracts first valid marker and strips all markers from cleanText', () => {
    // Generator: non-empty destination strings (1-200 chars) that aren't whitespace-only
    // and don't contain [ or ] (to avoid breaking the marker format)
    const validDestination = fc
      .stringMatching(/^[a-zA-Z0-9 ',.\-()#&]{1,200}$/)
      .filter((s) => s.trim().length > 0 && s.trim().length <= 200)

    const textWithMarker = fc
      .tuple(
        // prefix text (no [[NAV: substring)
        fc.stringMatching(/^[a-zA-Z0-9 .,!?]{0,80}$/),
        // the primary destination
        validDestination,
        // number of additional markers (0-3)
        fc.array(validDestination, { minLength: 0, maxLength: 3 }),
        // suffix text (no [[NAV: substring)
        fc.stringMatching(/^[a-zA-Z0-9 .,!?]{0,80}$/)
      )
      .map(([prefix, dest, extraDests, suffix]) => {
        const mainMarker = `[[NAV:${dest}]]`
        const extraMarkers = extraDests.map((d) => `[[NAV:${d}]]`).join(' ')
        const text = extraMarkers
          ? `${prefix}${mainMarker} ${extraMarkers}${suffix}`
          : `${prefix}${mainMarker}${suffix}`
        return { text, expectedDest: dest.trim() }
      })

    fc.assert(
      fc.property(textWithMarker, ({ text, expectedDest }) => {
        const result = extractNavigation(text)

        // Should detect navigation intent
        expect(result.navigation.wants_directions).toBe(true)

        // Should extract the first marker's trimmed destination
        expect(result.navigation.destination_name).toBe(expectedDest)

        // cleanText should contain zero [[NAV:...]] occurrences
        expect(result.cleanText).not.toContain('[[NAV:')
        expect(result.cleanText).not.toMatch(/\[\[NAV:.+?\]\]/)
      }),
      { numRuns: 100 }
    )
  })
})

// ─── Property 2: Absent marker yields no navigation intent ───────────────────
// Feature: campus-navigation, Property 2: Absent marker yields no navigation intent
// For any string that does not match the pattern [[NAV:...]], extractNavigation SHALL
// return { wants_directions: false, destination_name: "" } and the cleanText SHALL
// equal the original input.
// **Validates: Requirements 6.4, 3.4**

describe('Property Tests: extractNavigation — Absent marker yields no navigation intent', () => {
  it('returns no intent and cleanText equals original for text without [[NAV:', () => {
    // Generate arbitrary strings that do NOT contain the substring [[NAV:
    const textWithoutMarker = fc
      .string({ minLength: 0, maxLength: 500 })
      .filter((s) => !s.includes('[[NAV:'))

    fc.assert(
      fc.property(textWithoutMarker, (text) => {
        const result = extractNavigation(text)

        // No navigation intent
        expect(result.navigation.wants_directions).toBe(false)
        expect(result.navigation.destination_name).toBe('')

        // cleanText equals the original input
        expect(result.cleanText).toBe(text)
      }),
      { numRuns: 100 }
    )
  })
})

// ─── Property 3: Invalid destination treated as no intent ────────────────────
// Feature: campus-navigation, Property 3: Invalid destination treated as no intent
// For any string containing a [[NAV:...]] marker where the captured destination is
// empty, whitespace-only, or exceeds 200 characters, extractNavigation SHALL return
// { wants_directions: false, destination_name: "" } and all markers SHALL still be
// stripped from cleanText.
// **Validates: Requirements 6.4, 3.5**

describe('Property Tests: extractNavigation — Invalid destination treated as no intent', () => {
  it('returns no intent for whitespace-only destination and strips markers', () => {
    // Generate text with markers containing whitespace-only destinations
    const whitespaceOnly = fc
      .stringMatching(/^[ \t]{1,20}$/)

    const textWithWhitespaceMarker = fc
      .tuple(
        fc.stringMatching(/^[a-zA-Z0-9 .,!?]{0,80}$/),
        whitespaceOnly,
        fc.stringMatching(/^[a-zA-Z0-9 .,!?]{0,80}$/)
      )
      .map(([prefix, ws, suffix]) => `${prefix}[[NAV:${ws}]]${suffix}`)

    fc.assert(
      fc.property(textWithWhitespaceMarker, (text) => {
        const result = extractNavigation(text)

        // Should be no intent
        expect(result.navigation.wants_directions).toBe(false)
        expect(result.navigation.destination_name).toBe('')

        // Markers should still be stripped
        expect(result.cleanText).not.toContain('[[NAV:')
        expect(result.cleanText).not.toMatch(/\[\[NAV:.+?\]\]/)
      }),
      { numRuns: 100 }
    )
  })

  it('returns no intent for destination exceeding 200 characters and strips markers', () => {
    // Generate destinations whose TRIMMED length exceeds 200 characters.
    // Use a non-whitespace character prefix/suffix to guarantee trim doesn't shrink below 201.
    const longDestination = fc
      .stringMatching(/^[a-zA-Z0-9]{201,250}$/)

    const textWithLongMarker = fc
      .tuple(
        fc.stringMatching(/^[a-zA-Z0-9 .,]{0,50}$/),
        longDestination,
        fc.stringMatching(/^[a-zA-Z0-9 .,]{0,50}$/)
      )
      .map(([prefix, dest, suffix]) => `${prefix}[[NAV:${dest}]]${suffix}`)

    fc.assert(
      fc.property(textWithLongMarker, (text) => {
        const result = extractNavigation(text)

        // Should be no intent
        expect(result.navigation.wants_directions).toBe(false)
        expect(result.navigation.destination_name).toBe('')

        // Markers should still be stripped
        expect(result.cleanText).not.toContain('[[NAV:')
        expect(result.cleanText).not.toMatch(/\[\[NAV:.+?\]\]/)
      }),
      { numRuns: 100 }
    )
  })
})
