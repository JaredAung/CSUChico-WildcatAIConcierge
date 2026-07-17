import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useGeolocation } from './useGeolocation'

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value }),
    removeItem: vi.fn((key: string) => { delete store[key] }),
    clear: () => { store = {} },
  }
})()

Object.defineProperty(window, 'localStorage', { value: localStorageMock })

// Mock permission status
function createMockPermissionStatus(state: PermissionState) {
  const listeners: Array<() => void> = []
  return {
    state,
    addEventListener: vi.fn((_event: string, handler: () => void) => {
      listeners.push(handler)
    }),
    removeEventListener: vi.fn(),
    _setAndNotify(newState: PermissionState) {
      (this as any).state = newState
      listeners.forEach(fn => fn())
    },
  }
}

describe('useGeolocation', () => {
  let mockWatchPosition: ReturnType<typeof vi.fn>
  let mockClearWatch: ReturnType<typeof vi.fn>
  let mockPermissionQuery: ReturnType<typeof vi.fn>
  let mockPermissionStatus: ReturnType<typeof createMockPermissionStatus>

  beforeEach(() => {
    vi.useFakeTimers()
    localStorageMock.clear()

    mockWatchPosition = vi.fn()
    mockClearWatch = vi.fn()
    mockPermissionStatus = createMockPermissionStatus('prompt')
    mockPermissionQuery = vi.fn().mockResolvedValue(mockPermissionStatus)

    Object.defineProperty(navigator, 'geolocation', {
      value: {
        watchPosition: mockWatchPosition,
        clearWatch: mockClearWatch,
      },
      configurable: true,
    })

    Object.defineProperty(navigator, 'permissions', {
      value: { query: mockPermissionQuery },
      configurable: true,
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('should return initial state with all fields properly defaulted', () => {
    const { result } = renderHook(() => useGeolocation())

    expect(result.current.coords).toBeNull()
    expect(result.current.permissionState).toBe('prompt')
    expect(result.current.error).toBeNull()
    expect(result.current.isLoading).toBe(false)
    expect(result.current.isEnabled).toBe(false)
  })

  it('should start watching position when enabled and permission is granted', async () => {
    mockPermissionStatus = createMockPermissionStatus('granted')
    mockPermissionQuery.mockResolvedValue(mockPermissionStatus)
    mockWatchPosition.mockReturnValue(1)

    const { result } = renderHook(() => useGeolocation())

    await act(async () => {
      result.current.enable()
    })

    expect(mockWatchPosition).toHaveBeenCalled()
    expect(result.current.isEnabled).toBe(true)
    expect(localStorageMock.setItem).toHaveBeenCalledWith('wildcat-nav-location-enabled', 'true')
  })

  it('should update coords on position success callback', async () => {
    mockPermissionStatus = createMockPermissionStatus('granted')
    mockPermissionQuery.mockResolvedValue(mockPermissionStatus)
    mockWatchPosition.mockImplementation((success) => {
      success({ coords: { latitude: 39.7285, longitude: -121.7868 } })
      return 1
    })

    const { result } = renderHook(() => useGeolocation())

    await act(async () => {
      result.current.enable()
    })

    expect(result.current.coords).toEqual({ latitude: 39.7285, longitude: -121.7868 })
    expect(result.current.isLoading).toBe(false)
  })

  it('should replace coords on subsequent position updates (Req 7.3)', async () => {
    mockPermissionStatus = createMockPermissionStatus('granted')
    mockPermissionQuery.mockResolvedValue(mockPermissionStatus)

    let successCallback: (pos: any) => void = () => {}
    mockWatchPosition.mockImplementation((success) => {
      successCallback = success
      return 1
    })

    const { result } = renderHook(() => useGeolocation())

    await act(async () => {
      result.current.enable()
    })

    act(() => {
      successCallback({ coords: { latitude: 39.7285, longitude: -121.7868 } })
    })

    expect(result.current.coords).toEqual({ latitude: 39.7285, longitude: -121.7868 })

    act(() => {
      successCallback({ coords: { latitude: 39.7300, longitude: -121.7900 } })
    })

    expect(result.current.coords).toEqual({ latitude: 39.7300, longitude: -121.7900 })
  })

  it('should expose error and retain last good coords on PositionError (Req 7.6)', async () => {
    mockPermissionStatus = createMockPermissionStatus('granted')
    mockPermissionQuery.mockResolvedValue(mockPermissionStatus)

    let successCallback: (pos: any) => void = () => {}
    let errorCallback: (err: any) => void = () => {}
    mockWatchPosition.mockImplementation((success, error) => {
      successCallback = success
      errorCallback = error
      return 1
    })

    const { result } = renderHook(() => useGeolocation())

    await act(async () => {
      result.current.enable()
    })

    act(() => {
      successCallback({ coords: { latitude: 39.7285, longitude: -121.7868 } })
    })

    const mockError = { code: 2, message: 'GPS unavailable', PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 }
    act(() => {
      errorCallback(mockError)
    })

    expect(result.current.error).toBe(mockError)
    expect(result.current.coords).toEqual({ latitude: 39.7285, longitude: -121.7868 })
  })

  it('should expose error and maintain null coords when no prior coords (Req 7.7)', async () => {
    mockPermissionStatus = createMockPermissionStatus('granted')
    mockPermissionQuery.mockResolvedValue(mockPermissionStatus)

    let errorCallback: (err: any) => void = () => {}
    mockWatchPosition.mockImplementation((_success, error) => {
      errorCallback = error
      return 1
    })

    const { result } = renderHook(() => useGeolocation())

    await act(async () => {
      result.current.enable()
    })

    const mockError = { code: 2, message: 'GPS unavailable', PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 }
    act(() => {
      errorCallback(mockError)
    })

    expect(result.current.error).toBe(mockError)
    expect(result.current.coords).toBeNull()
  })

  it('should call clearWatch on disable (Req 7.5)', async () => {
    mockPermissionStatus = createMockPermissionStatus('granted')
    mockPermissionQuery.mockResolvedValue(mockPermissionStatus)
    mockWatchPosition.mockReturnValue(42)

    const { result } = renderHook(() => useGeolocation())

    await act(async () => {
      result.current.enable()
    })

    act(() => {
      result.current.disable()
    })

    expect(mockClearWatch).toHaveBeenCalledWith(42)
    expect(result.current.isEnabled).toBe(false)
    expect(localStorageMock.removeItem).toHaveBeenCalledWith('wildcat-nav-location-enabled')
  })

  it('should call clearWatch on unmount (Req 7.5)', async () => {
    mockPermissionStatus = createMockPermissionStatus('granted')
    mockPermissionQuery.mockResolvedValue(mockPermissionStatus)
    mockWatchPosition.mockReturnValue(99)

    const { result, unmount } = renderHook(() => useGeolocation())

    await act(async () => {
      result.current.enable()
    })

    unmount()

    expect(mockClearWatch).toHaveBeenCalledWith(99)
  })

  it('should not restore watch on mount when permission has been revoked (Req 1.5)', async () => {
    localStorageMock.setItem('wildcat-nav-location-enabled', 'true')
    mockPermissionStatus = createMockPermissionStatus('denied')
    mockPermissionQuery.mockResolvedValue(mockPermissionStatus)

    const { result } = renderHook(() => useGeolocation())

    // Allow the async restore to complete
    await act(async () => {
      await vi.runAllTimersAsync()
    })

    expect(result.current.isEnabled).toBe(false)
    expect(mockWatchPosition).not.toHaveBeenCalled()
    expect(localStorageMock.removeItem).toHaveBeenCalledWith('wildcat-nav-location-enabled')
  })

  it('should restore watch on mount when permission is still granted (Req 1.5)', async () => {
    localStorageMock.setItem('wildcat-nav-location-enabled', 'true')
    mockPermissionStatus = createMockPermissionStatus('granted')
    mockPermissionQuery.mockResolvedValue(mockPermissionStatus)
    mockWatchPosition.mockReturnValue(1)

    const { result } = renderHook(() => useGeolocation())

    await act(async () => {
      await vi.runAllTimersAsync()
    })

    expect(result.current.isEnabled).toBe(true)
    expect(mockWatchPosition).toHaveBeenCalled()
  })

  it('should revert to disabled when permission is denied on enable (Req 1.6)', async () => {
    mockPermissionStatus = createMockPermissionStatus('denied')
    mockPermissionQuery.mockResolvedValue(mockPermissionStatus)

    const { result } = renderHook(() => useGeolocation())

    await act(async () => {
      result.current.enable()
    })

    expect(result.current.isEnabled).toBe(false)
    expect(result.current.permissionState).toBe('denied')
    expect(result.current.isLoading).toBe(false)
  })

  it('should persist enabled state in localStorage on permission grant (Req 1.3)', async () => {
    mockPermissionStatus = createMockPermissionStatus('granted')
    mockPermissionQuery.mockResolvedValue(mockPermissionStatus)
    mockWatchPosition.mockReturnValue(1)

    const { result } = renderHook(() => useGeolocation())

    await act(async () => {
      result.current.enable()
    })

    expect(localStorageMock.setItem).toHaveBeenCalledWith('wildcat-nav-location-enabled', 'true')
  })

  it('should remove localStorage state on disable (Req 1.4)', async () => {
    mockPermissionStatus = createMockPermissionStatus('granted')
    mockPermissionQuery.mockResolvedValue(mockPermissionStatus)
    mockWatchPosition.mockReturnValue(1)

    const { result } = renderHook(() => useGeolocation())

    await act(async () => {
      result.current.enable()
    })

    act(() => {
      result.current.disable()
    })

    expect(localStorageMock.removeItem).toHaveBeenCalledWith('wildcat-nav-location-enabled')
  })

  it('should show loading state while awaiting initial position (Req 1.7)', async () => {
    mockPermissionStatus = createMockPermissionStatus('granted')
    mockPermissionQuery.mockResolvedValue(mockPermissionStatus)
    mockWatchPosition.mockReturnValue(1)

    const { result } = renderHook(() => useGeolocation())

    await act(async () => {
      result.current.enable()
    })

    // isLoading should be true since no position has been received yet
    expect(result.current.isLoading).toBe(true)
  })

  it('should stop loading after 10s timeout (Req 1.7)', async () => {
    mockPermissionStatus = createMockPermissionStatus('granted')
    mockPermissionQuery.mockResolvedValue(mockPermissionStatus)
    mockWatchPosition.mockReturnValue(1)

    const { result } = renderHook(() => useGeolocation())

    await act(async () => {
      result.current.enable()
    })

    expect(result.current.isLoading).toBe(true)

    await act(async () => {
      vi.advanceTimersByTime(10_000)
    })

    expect(result.current.isLoading).toBe(false)
  })

  it('should expose permissionState reflecting current API status (Req 7.4)', async () => {
    mockPermissionStatus = createMockPermissionStatus('granted')
    mockPermissionQuery.mockResolvedValue(mockPermissionStatus)
    mockWatchPosition.mockReturnValue(1)

    const { result } = renderHook(() => useGeolocation())

    await act(async () => {
      result.current.enable()
    })

    expect(result.current.permissionState).toBe('granted')
  })
})
