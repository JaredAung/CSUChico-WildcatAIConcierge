import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { DirectionsCard } from './DirectionsCard'

afterEach(() => {
  cleanup()
})

describe('DirectionsCard', () => {
  it('renders destination name as heading', () => {
    render(<DirectionsCard destination="Meriam Library" />)
    expect(screen.getByText('Meriam Library')).toBeInTheDocument()
  })

  it('renders Google Maps and Apple Maps links', () => {
    render(<DirectionsCard destination="Meriam Library" />)

    const googleLink = screen.getByRole('link', { name: /google maps/i })
    const appleLink = screen.getByRole('link', { name: /apple maps/i })

    expect(googleLink).toBeInTheDocument()
    expect(appleLink).toBeInTheDocument()
  })

  it('links open in new tab with noopener noreferrer', () => {
    render(<DirectionsCard destination="Meriam Library" />)

    const googleLink = screen.getByRole('link', { name: /google maps/i })
    const appleLink = screen.getByRole('link', { name: /apple maps/i })

    expect(googleLink).toHaveAttribute('target', '_blank')
    expect(googleLink).toHaveAttribute('rel', 'noopener noreferrer')
    expect(appleLink).toHaveAttribute('target', '_blank')
    expect(appleLink).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('includes origin in links when userLocation is provided', () => {
    render(
      <DirectionsCard
        destination="Meriam Library"
        userLocation={{ latitude: 39.7285, longitude: -121.7868 }}
      />
    )

    const googleLink = screen.getByRole('link', { name: /google maps/i })
    const appleLink = screen.getByRole('link', { name: /apple maps/i })

    expect(googleLink.getAttribute('href')).toContain('origin=39.7285,-121.7868')
    expect(appleLink.getAttribute('href')).toContain('saddr=39.7285,-121.7868')
  })

  it('shows helper text when userLocation is not provided', () => {
    render(<DirectionsCard destination="Meriam Library" />)

    expect(
      screen.getByText(/enable the location toggle/i)
    ).toBeInTheDocument()
  })

  it('does not show helper text when userLocation is provided', () => {
    render(
      <DirectionsCard
        destination="Meriam Library"
        userLocation={{ latitude: 39.7285, longitude: -121.7868 }}
      />
    )

    expect(
      screen.queryByText(/enable the location toggle/i)
    ).not.toBeInTheDocument()
  })

  it('shows helper text when userLocation is null', () => {
    render(<DirectionsCard destination="Meriam Library" userLocation={null} />)

    expect(
      screen.getByText(/enable the location toggle/i)
    ).toBeInTheDocument()
  })

  it('constructs correct Google Maps URL with destination', () => {
    render(<DirectionsCard destination="Bell Memorial Union" />)

    const googleLink = screen.getByRole('link', { name: /google maps/i })
    // "Bell Memorial Union" doesn't contain "Chico", so ", Chico, CA" is appended
    expect(googleLink.getAttribute('href')).toContain(
      'https://www.google.com/maps/dir/?api=1&destination='
    )
    expect(googleLink.getAttribute('href')).toContain(
      encodeURIComponent('Bell Memorial Union, Chico, CA')
    )
  })

  it('constructs correct Apple Maps URL with destination', () => {
    render(<DirectionsCard destination="Bell Memorial Union" />)

    const appleLink = screen.getByRole('link', { name: /apple maps/i })
    expect(appleLink.getAttribute('href')).toContain('https://maps.apple.com/?daddr=')
    expect(appleLink.getAttribute('href')).toContain(
      encodeURIComponent('Bell Memorial Union, Chico, CA')
    )
  })

  it('renders with long destination names without truncation', () => {
    const longName = 'The Extremely Long and Detailed Name of a Campus Building That Is Way Too Long for Normal Display Purposes'
    render(<DirectionsCard destination={longName} />)

    expect(screen.getByText(longName)).toBeInTheDocument()

    const googleLink = screen.getByRole('link', { name: /google maps/i })
    const appleLink = screen.getByRole('link', { name: /apple maps/i })

    // Long name does not contain "Chico", so ", Chico, CA" is appended
    expect(googleLink.getAttribute('href')).toContain(
      encodeURIComponent(longName + ', Chico, CA')
    )
    expect(appleLink.getAttribute('href')).toContain(
      encodeURIComponent(longName + ', Chico, CA')
    )
  })

  it('has accessible region role with destination label', () => {
    render(<DirectionsCard destination="Meriam Library" />)

    expect(
      screen.getByRole('region', { name: /directions to meriam library/i })
    ).toBeInTheDocument()
  })
})
