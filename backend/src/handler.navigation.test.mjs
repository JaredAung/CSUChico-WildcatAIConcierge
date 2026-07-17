import { describe, it, expect } from 'vitest'
import { extractNavigation } from './handler.mjs'

describe('extractNavigation', () => {
  it('returns no intent when text has no marker', () => {
    const result = extractNavigation('Meriam Library is open from 7am to 11pm.')
    expect(result).toEqual({
      cleanText: 'Meriam Library is open from 7am to 11pm.',
      navigation: { wants_directions: false, destination_name: '' },
    })
  })

  it('extracts destination from single marker', () => {
    const result = extractNavigation('Head north on Main St.\n[[NAV:Meriam Library]]')
    expect(result.navigation).toEqual({
      wants_directions: true,
      destination_name: 'Meriam Library',
    })
    expect(result.cleanText).not.toContain('[[NAV:')
  })

  it('extracts first marker when multiple are present', () => {
    const result = extractNavigation(
      'You can go here [[NAV:Meriam Library]] or here [[NAV:Bell Memorial Union]]'
    )
    expect(result.navigation.destination_name).toBe('Meriam Library')
    expect(result.navigation.wants_directions).toBe(true)
  })

  it('strips all markers from text even when multiple exist', () => {
    const result = extractNavigation(
      'Visit [[NAV:Meriam Library]] or [[NAV:Bell Memorial Union]] today'
    )
    expect(result.cleanText).not.toContain('[[NAV:')
    expect(result.cleanText).not.toContain(']]')
  })

  it('trims whitespace from extracted destination', () => {
    const result = extractNavigation('Go here [[NAV:  Meriam Library  ]]')
    expect(result.navigation.destination_name).toBe('Meriam Library')
  })

  it('returns no intent when destination is whitespace-only', () => {
    const result = extractNavigation('Go here [[NAV:   ]]')
    expect(result.navigation).toEqual({
      wants_directions: false,
      destination_name: '',
    })
    // Marker should still be stripped
    expect(result.cleanText).not.toContain('[[NAV:')
  })

  it('returns no intent when destination exceeds 200 characters', () => {
    const longDest = 'A'.repeat(201)
    const result = extractNavigation(`Go here [[NAV:${longDest}]]`)
    expect(result.navigation).toEqual({
      wants_directions: false,
      destination_name: '',
    })
    expect(result.cleanText).not.toContain('[[NAV:')
  })

  it('accepts destination of exactly 200 characters', () => {
    const dest = 'B'.repeat(200)
    const result = extractNavigation(`Go here [[NAV:${dest}]]`)
    expect(result.navigation).toEqual({
      wants_directions: true,
      destination_name: dest,
    })
  })

  it('handles non-string input gracefully', () => {
    expect(extractNavigation(null)).toEqual({
      cleanText: '',
      navigation: { wants_directions: false, destination_name: '' },
    })
    expect(extractNavigation(undefined)).toEqual({
      cleanText: '',
      navigation: { wants_directions: false, destination_name: '' },
    })
    expect(extractNavigation(123)).toEqual({
      cleanText: '',
      navigation: { wants_directions: false, destination_name: '' },
    })
  })

  it('handles empty string input', () => {
    expect(extractNavigation('')).toEqual({
      cleanText: '',
      navigation: { wants_directions: false, destination_name: '' },
    })
  })

  it('handles marker with special characters in destination', () => {
    const result = extractNavigation('Go to [[NAV:O\'Connell Hall (Building #5)]]')
    expect(result.navigation).toEqual({
      wants_directions: true,
      destination_name: "O'Connell Hall (Building #5)",
    })
  })
})
