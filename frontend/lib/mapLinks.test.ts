import { describe, it, expect } from 'vitest'
import { buildMapLinks } from '@/lib/mapLinks'

describe('buildMapLinks', () => {
  it('appends ", Chico, CA" when destination does not contain "Chico"', () => {
    const result = buildMapLinks('Meriam Library')
    expect(result.google).toContain(encodeURIComponent('Meriam Library, Chico, CA'))
    expect(result.apple).toContain(encodeURIComponent('Meriam Library, Chico, CA'))
  })

  it('does not append ", Chico, CA" when destination already contains "Chico"', () => {
    const result = buildMapLinks('CSU Chico Campus')
    expect(result.google).toContain(encodeURIComponent('CSU Chico Campus'))
    expect(result.google).not.toContain(encodeURIComponent('CSU Chico Campus, Chico, CA'))
  })

  it('is case-insensitive when checking for "Chico"', () => {
    const result = buildMapLinks('Downtown chico Plaza')
    expect(result.google).toContain(encodeURIComponent('Downtown chico Plaza'))
    expect(result.google).not.toContain(encodeURIComponent(', Chico, CA'))
  })

  it('constructs correct Google Maps URL format', () => {
    const result = buildMapLinks('Meriam Library')
    expect(result.google).toBe(
      `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent('Meriam Library, Chico, CA')}`
    )
  })

  it('constructs correct Apple Maps URL format', () => {
    const result = buildMapLinks('Meriam Library')
    expect(result.apple).toBe(
      `https://maps.apple.com/?daddr=${encodeURIComponent('Meriam Library, Chico, CA')}`
    )
  })

  it('appends origin to Google Maps URL when origin is provided', () => {
    const result = buildMapLinks('Meriam Library', { latitude: 39.7285, longitude: -121.7868 })
    expect(result.google).toContain('&origin=39.7285,-121.7868')
  })

  it('appends saddr to Apple Maps URL when origin is provided', () => {
    const result = buildMapLinks('Meriam Library', { latitude: 39.7285, longitude: -121.7868 })
    expect(result.apple).toContain('&saddr=39.7285,-121.7868')
  })

  it('does not include origin/saddr when origin is null', () => {
    const result = buildMapLinks('Meriam Library', null)
    expect(result.google).not.toContain('&origin=')
    expect(result.apple).not.toContain('&saddr=')
  })

  it('does not include origin/saddr when origin is undefined', () => {
    const result = buildMapLinks('Meriam Library')
    expect(result.google).not.toContain('&origin=')
    expect(result.apple).not.toContain('&saddr=')
  })

  it('URL-encodes special characters in destination', () => {
    const result = buildMapLinks('Bell Memorial Union & Bookstore')
    const encoded = encodeURIComponent('Bell Memorial Union & Bookstore, Chico, CA')
    expect(result.google).toContain(encoded)
    expect(result.apple).toContain(encoded)
  })

  it('returns an object with google and apple keys', () => {
    const result = buildMapLinks('Meriam Library')
    expect(result).toHaveProperty('google')
    expect(result).toHaveProperty('apple')
    expect(typeof result.google).toBe('string')
    expect(typeof result.apple).toBe('string')
  })
})
