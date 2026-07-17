import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react'
import { LocationToggle } from './LocationToggle'

// ─── Mock useGeolocation hook ─────────────────────────────────────────────────

const mockEnable = vi.fn()
const mockDisable = vi.fn()

interface MockHookReturn {
  coords: { latitude: number; longitude: number } | null
  permissionState: 'granted' | 'denied' | 'prompt'
  error: GeolocationPositionError | null
  isLoading: boolean
  enable: () => void
  disable: () => void
  isEnabled: boolean
}

const defaultHookReturn: MockHookReturn = {
  coords: null,
  permissionState: 'prompt',
  error: null,
  isLoading: false,
  enable: mockEnable,
  disable: mockDisable,
  isEnabled: false,
}

let hookReturn: MockHookReturn = { ...defaultHookReturn }

vi.mock('@/lib/hooks/useGeolocation', () => ({
  useGeolocation: () => hookReturn,
}))

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('LocationToggle', () => {
  beforeEach(() => {
    hookReturn = { ...defaultHookReturn }
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it('renders in disabled state by default', () => {
    render(<LocationToggle />)
    const button = screen.getByRole('button', { name: 'Enable location sharing' })
    expect(button).toBeInTheDocument()
    expect(button).toHaveAttribute('aria-pressed', 'false')
  })

  it('renders in enabled state when location is active', () => {
    hookReturn = {
      ...defaultHookReturn,
      isEnabled: true,
      permissionState: 'granted',
      coords: { latitude: 39.73, longitude: -121.84 },
    }
    render(<LocationToggle />)
    const button = screen.getByRole('button', { name: 'Disable location sharing' })
    expect(button).toBeInTheDocument()
    expect(button).toHaveAttribute('aria-pressed', 'true')
  })

  it('renders loading state with spinner while awaiting permission', () => {
    hookReturn = { ...defaultHookReturn, isLoading: true }
    render(<LocationToggle />)
    const button = screen.getByRole('button', { name: 'Acquiring location…' })
    expect(button).toBeInTheDocument()
    expect(button).toBeDisabled()
  })

  it('calls enable when clicked in disabled state', () => {
    render(<LocationToggle />)
    const button = screen.getByRole('button', { name: 'Enable location sharing' })
    fireEvent.click(button)
    expect(mockEnable).toHaveBeenCalledOnce()
  })

  it('calls disable when clicked in enabled state', () => {
    hookReturn = { ...defaultHookReturn, isEnabled: true, permissionState: 'granted' }
    render(<LocationToggle />)
    const button = screen.getByRole('button', { name: 'Disable location sharing' })
    fireEvent.click(button)
    expect(mockDisable).toHaveBeenCalledOnce()
  })

  it('does not call enable/disable when loading', () => {
    hookReturn = { ...defaultHookReturn, isLoading: true }
    render(<LocationToggle />)
    const button = screen.getByRole('button', { name: 'Acquiring location…' })
    fireEvent.click(button)
    expect(mockEnable).not.toHaveBeenCalled()
    expect(mockDisable).not.toHaveBeenCalled()
  })

  it('shows denial toast when permission is denied', () => {
    hookReturn = { ...defaultHookReturn, permissionState: 'denied' }
    render(<LocationToggle />)
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByText('Location permission denied')).toBeInTheDocument()
  })

  it('auto-dismisses denial toast after 5 seconds', () => {
    vi.useFakeTimers()
    hookReturn = { ...defaultHookReturn, permissionState: 'denied' }
    render(<LocationToggle />)
    expect(screen.getByRole('alert')).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(5000)
    })

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    vi.useRealTimers()
  })

  it('does not show denial toast when enabled', () => {
    hookReturn = { ...defaultHookReturn, isEnabled: true, permissionState: 'granted' }
    render(<LocationToggle />)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
