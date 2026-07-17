/**
 * Integration tests for DirectionsCard rendering in the navigation flow.
 * Tests that DirectionsCard renders correctly when navigation intent is detected.
 *
 * Validates: Requirements 2.2, 3.3, 4.1
 */
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { DirectionsCard } from './DirectionsCard'

afterEach(() => {
  cleanup()
})

describe('DirectionsCard Integration — navigation intent rendering', () => {
  it('renders DirectionsCard with destination and user location', () => {
    render(
      <DirectionsCard
        destination="Meriam Library"
        userLocation={{ latitude: 39.73, longitude: -121.79 }}
      />
    )

    // Destination heading is rendered
    expect(screen.getByText('Meriam Library')).toBeInTheDocument()

    // Google Maps link contains destination and origin
    const googleLink = screen.getByRole('link', { name: /google maps/i })
    const googleHref = googleLink.getAttribute('href')!
    expect(googleHref).toContain('https://www.google.com/maps/dir/?api=1&destination=')
    expect(googleHref).toContain(encodeURIComponent('Meriam Library, Chico, CA'))
    expect(googleHref).toContain('origin=39.73,-121.79')

    // Apple Maps link contains destination and saddr
    const appleLink = screen.getByRole('link', { name: /apple maps/i })
    const appleHref = appleLink.getAttribute('href')!
    expect(appleHref).toContain('https://maps.apple.com/?daddr=')
    expect(appleHref).toContain(encodeURIComponent('Meriam Library, Chico, CA'))
    expect(appleHref).toContain('saddr=39.73,-121.79')

    // Helper text should NOT appear since location is provided
    expect(screen.queryByText(/enable the location toggle/i)).not.toBeInTheDocument()
  })

  it('renders DirectionsCard with destination but no user location', () => {
    render(<DirectionsCard destination="Bell Memorial Union" userLocation={null} />)

    // Destination heading is rendered
    expect(screen.getByText('Bell Memorial Union')).toBeInTheDocument()

    // Google Maps link has destination but no origin
    const googleLink = screen.getByRole('link', { name: /google maps/i })
    const googleHref = googleLink.getAttribute('href')!
    expect(googleHref).toContain(encodeURIComponent('Bell Memorial Union, Chico, CA'))
    expect(googleHref).not.toContain('origin=')

    // Apple Maps link has destination but no saddr
    const appleLink = screen.getByRole('link', { name: /apple maps/i })
    const appleHref = appleLink.getAttribute('href')!
    expect(appleHref).toContain(encodeURIComponent('Bell Memorial Union, Chico, CA'))
    expect(appleHref).not.toContain('saddr=')

    // Helper text should appear since no location
    expect(screen.getByText(/enable the location toggle/i)).toBeInTheDocument()
  })

  it('links open in new tab with correct rel attributes', () => {
    render(
      <DirectionsCard
        destination="Meriam Library"
        userLocation={{ latitude: 39.73, longitude: -121.79 }}
      />
    )

    const googleLink = screen.getByRole('link', { name: /google maps/i })
    const appleLink = screen.getByRole('link', { name: /apple maps/i })

    expect(googleLink).toHaveAttribute('target', '_blank')
    expect(googleLink).toHaveAttribute('rel', 'noopener noreferrer')
    expect(appleLink).toHaveAttribute('target', '_blank')
    expect(appleLink).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('appends Chico disambiguation when destination does not contain "Chico"', () => {
    render(<DirectionsCard destination="Selvester's Cafe" />)

    const googleLink = screen.getByRole('link', { name: /google maps/i })
    expect(googleLink.getAttribute('href')).toContain(
      encodeURIComponent("Selvester's Cafe, Chico, CA")
    )
  })

  it('does NOT append Chico disambiguation when destination already contains "Chico"', () => {
    render(<DirectionsCard destination="Chico State BMU" />)

    const googleLink = screen.getByRole('link', { name: /google maps/i })
    const href = googleLink.getAttribute('href')!
    // Should contain the destination encoded directly without extra ", Chico, CA"
    expect(href).toContain(encodeURIComponent('Chico State BMU'))
    expect(href).not.toContain(encodeURIComponent('Chico State BMU, Chico, CA'))
  })
})
