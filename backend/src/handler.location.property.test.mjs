import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { validateUserLocation } from './handler.mjs'

// ─── Feature: campus-navigation, Property 6: User location validation ────────
// For any user_location object where latitude is outside [−90, 90] or longitude
// is outside [−180, 180] or either value is non-numeric, the backend SHALL discard
// the location and omit proximity context, behaving identically to when user_location
// is absent.
// **Validates: Requirements 2.3, 2.4**

describe('Property 6: User location validation', () => {
  it('valid locations always accepted: for any latitude in [-90, 90] and longitude in [-180, 180], returns { latitude, longitude }', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -90, max: 90, noNaN: true, noDefaultInfinity: true }),
        fc.double({ min: -180, max: 180, noNaN: true, noDefaultInfinity: true }),
        (latitude, longitude) => {
          const result = validateUserLocation({ latitude, longitude })
          expect(result).not.toBeNull()
          expect(result).toEqual({ latitude, longitude })
        }
      ),
      { numRuns: 100 }
    )
  })

  it('invalid latitude rejected: for any latitude outside [-90, 90] (finite number), returns null', () => {
    const invalidLatitude = fc.oneof(
      fc.double({ min: 90.0001, max: 1e10, noNaN: true, noDefaultInfinity: true }),
      fc.double({ min: -1e10, max: -90.0001, noNaN: true, noDefaultInfinity: true })
    )
    const validLongitude = fc.double({ min: -180, max: 180, noNaN: true, noDefaultInfinity: true })

    fc.assert(
      fc.property(invalidLatitude, validLongitude, (latitude, longitude) => {
        const result = validateUserLocation({ latitude, longitude })
        expect(result).toBeNull()
      }),
      { numRuns: 100 }
    )
  })

  it('invalid longitude rejected: for any longitude outside [-180, 180] (finite number), returns null', () => {
    const validLatitude = fc.double({ min: -90, max: 90, noNaN: true, noDefaultInfinity: true })
    const invalidLongitude = fc.oneof(
      fc.double({ min: 180.0001, max: 1e10, noNaN: true, noDefaultInfinity: true }),
      fc.double({ min: -1e10, max: -180.0001, noNaN: true, noDefaultInfinity: true })
    )

    fc.assert(
      fc.property(validLatitude, invalidLongitude, (latitude, longitude) => {
        const result = validateUserLocation({ latitude, longitude })
        expect(result).toBeNull()
      }),
      { numRuns: 100 }
    )
  })

  it('non-numeric values rejected: for any non-number latitude or longitude, returns null', () => {
    const nonNumeric = fc.oneof(
      fc.string(),
      fc.constant(null),
      fc.constant(undefined),
      fc.constant(NaN),
      fc.constant(Infinity),
      fc.constant(-Infinity),
      fc.boolean(),
      fc.array(fc.integer()),
      fc.object()
    )

    // Invalid latitude with valid longitude
    fc.assert(
      fc.property(
        nonNumeric,
        fc.double({ min: -180, max: 180, noNaN: true, noDefaultInfinity: true }),
        (latitude, longitude) => {
          const result = validateUserLocation({ latitude, longitude })
          expect(result).toBeNull()
        }
      ),
      { numRuns: 100 }
    )

    // Valid latitude with invalid longitude
    fc.assert(
      fc.property(
        fc.double({ min: -90, max: 90, noNaN: true, noDefaultInfinity: true }),
        nonNumeric,
        (latitude, longitude) => {
          const result = validateUserLocation({ latitude, longitude })
          expect(result).toBeNull()
        }
      ),
      { numRuns: 100 }
    )

    // Both invalid
    fc.assert(
      fc.property(nonNumeric, nonNumeric, (latitude, longitude) => {
        const result = validateUserLocation({ latitude, longitude })
        expect(result).toBeNull()
      }),
      { numRuns: 100 }
    )
  })
})
