import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { buildMapLinks } from '@/lib/mapLinks'

/**
 * Feature: campus-navigation, Property 4: Map link construction with Chico disambiguation
 * Validates: Requirements 5.6, 5.1, 5.2
 */
describe('Property 4: Map link construction with Chico disambiguation', () => {
  it('appends ", Chico, CA" when destination does not contain "Chico" (case-insensitive)', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 100 }).filter(
          (s) => !/chico/i.test(s) && s.trim().length > 0
        ),
        (destination) => {
          const result = buildMapLinks(destination)
          const expectedSuffix = ', Chico, CA'
          const expectedDestination = destination + expectedSuffix
          const encoded = encodeURIComponent(expectedDestination)

          // Google Maps URL contains the destination with ", Chico, CA" appended
          expect(result.google).toContain(encoded)
          expect(result.google).toBe(
            `https://www.google.com/maps/dir/?api=1&destination=${encoded}`
          )

          // Apple Maps URL contains the destination with ", Chico, CA" appended
          expect(result.apple).toContain(encoded)
          expect(result.apple).toBe(
            `https://maps.apple.com/?daddr=${encoded}`
          )
        }
      ),
      { numRuns: 100 }
    )
  })

  it('uses destination as-is when it already contains "Chico"', () => {
    fc.assert(
      fc.property(
        fc.tuple(
          fc.string({ minLength: 0, maxLength: 50 }),
          fc.constantFrom('Chico', 'chico', 'CHICO', 'ChIcO'),
          fc.string({ minLength: 0, maxLength: 50 })
        ),
        ([prefix, chicoVariant, suffix]) => {
          const destination = `${prefix}${chicoVariant}${suffix}`
          const result = buildMapLinks(destination)
          const encoded = encodeURIComponent(destination)

          // Should NOT have ", Chico, CA" appended
          expect(result.google).not.toContain(encodeURIComponent(destination + ', Chico, CA'))

          // Should use the destination as-is
          expect(result.google).toBe(
            `https://www.google.com/maps/dir/?api=1&destination=${encoded}`
          )
          expect(result.apple).toBe(
            `https://maps.apple.com/?daddr=${encoded}`
          )
        }
      ),
      { numRuns: 100 }
    )
  })
})

/**
 * Feature: campus-navigation, Property 5: Map link origin inclusion
 * Validates: Requirements 5.3
 */
describe('Property 5: Map link origin inclusion', () => {
  it('includes origin/saddr parameters when origin is provided', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 100 }).filter((s) => s.trim().length > 0),
        fc.double({ min: -90, max: 90, noNaN: true, noDefaultInfinity: true }),
        fc.double({ min: -180, max: 180, noNaN: true, noDefaultInfinity: true }),
        (destination, latitude, longitude) => {
          const origin = { latitude, longitude }
          const result = buildMapLinks(destination, origin)

          // Google Maps URL should contain the origin parameter
          expect(result.google).toContain(`&origin=${latitude},${longitude}`)

          // Apple Maps URL should contain the saddr parameter
          expect(result.apple).toContain(`&saddr=${latitude},${longitude}`)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('does not include origin/saddr parameters when origin is null', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 100 }).filter((s) => s.trim().length > 0),
        (destination) => {
          const result = buildMapLinks(destination, null)

          // Neither URL should contain origin/saddr parameters
          expect(result.google).not.toContain('&origin=')
          expect(result.apple).not.toContain('&saddr=')
        }
      ),
      { numRuns: 100 }
    )
  })

  it('does not include origin/saddr parameters when origin is undefined', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 100 }).filter((s) => s.trim().length > 0),
        (destination) => {
          const result = buildMapLinks(destination)

          // Neither URL should contain origin/saddr parameters
          expect(result.google).not.toContain('&origin=')
          expect(result.apple).not.toContain('&saddr=')
        }
      ),
      { numRuns: 100 }
    )
  })
})
