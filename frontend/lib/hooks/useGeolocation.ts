'use client'

import { useState, useEffect, useRef, useCallback } from 'react'

const STORAGE_KEY = 'wildcat-nav-location-enabled'
const POSITION_TIMEOUT_MS = 10_000

export interface UseGeolocationReturn {
  coords: { latitude: number; longitude: number } | null
  permissionState: 'granted' | 'denied' | 'prompt'
  error: GeolocationPositionError | null
  isLoading: boolean
  enable: () => void
  disable: () => void
  isEnabled: boolean
}

export function useGeolocation(): UseGeolocationReturn {
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null)
  const [permissionState, setPermissionState] = useState<'granted' | 'denied' | 'prompt'>('prompt')
  const [error, setError] = useState<GeolocationPositionError | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isEnabled, setIsEnabled] = useState(false)

  const watchIdRef = useRef<number | null>(null)
  const timeoutIdRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Query the current permission state from the Permissions API
  const queryPermission = useCallback(async (): Promise<'granted' | 'denied' | 'prompt'> => {
    try {
      const status = await navigator.permissions.query({ name: 'geolocation' })
      const state = status.state as 'granted' | 'denied' | 'prompt'
      setPermissionState(state)
      return state
    } catch {
      // Permissions API not supported — fall back to 'prompt'
      return 'prompt'
    }
  }, [])

  // Start watching position
  const startWatch = useCallback(() => {
    if (watchIdRef.current !== null) return

    setIsLoading(true)
    setError(null)

    // Set a 10s timeout for initial position fix
    timeoutIdRef.current = setTimeout(() => {
      // If we still haven't received a position, stop loading
      if (watchIdRef.current !== null && coords === null) {
        setIsLoading(false)
      }
    }, POSITION_TIMEOUT_MS)

    let receivedFirst = false

    const id = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude } = position.coords
        setCoords({ latitude, longitude })
        setError(null)

        if (!receivedFirst) {
          receivedFirst = true
          setIsLoading(false)
          if (timeoutIdRef.current !== null) {
            clearTimeout(timeoutIdRef.current)
            timeoutIdRef.current = null
          }
        }
      },
      (positionError) => {
        setError(positionError)
        if (!receivedFirst) {
          receivedFirst = true
          setIsLoading(false)
          if (timeoutIdRef.current !== null) {
            clearTimeout(timeoutIdRef.current)
            timeoutIdRef.current = null
          }
        }
      },
      {
        enableHighAccuracy: true,
        timeout: POSITION_TIMEOUT_MS,
        maximumAge: 0,
      }
    )

    watchIdRef.current = id
  }, [coords])

  // Stop watching position
  const stopWatch = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current)
      watchIdRef.current = null
    }
    if (timeoutIdRef.current !== null) {
      clearTimeout(timeoutIdRef.current)
      timeoutIdRef.current = null
    }
    setIsLoading(false)
  }, [])

  // Enable geolocation
  const enable = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    const state = await queryPermission()

    if (state === 'denied') {
      setPermissionState('denied')
      setIsLoading(false)
      setIsEnabled(false)
      localStorage.removeItem(STORAGE_KEY)
      return
    }

    // Set enabled state and persist
    setIsEnabled(true)
    localStorage.setItem(STORAGE_KEY, 'true')
    startWatch()

    // Listen for permission changes during this session
    try {
      const status = await navigator.permissions.query({ name: 'geolocation' })
      status.addEventListener('change', () => {
        const newState = status.state as 'granted' | 'denied' | 'prompt'
        setPermissionState(newState)
        if (newState === 'denied') {
          stopWatch()
          setIsEnabled(false)
          localStorage.removeItem(STORAGE_KEY)
        }
      })
    } catch {
      // Permissions API listener not supported — ignore
    }
  }, [queryPermission, startWatch, stopWatch])

  // Disable geolocation
  const disable = useCallback(() => {
    stopWatch()
    setIsEnabled(false)
    setCoords(null)
    localStorage.removeItem(STORAGE_KEY)
  }, [stopWatch])

  // On mount: check persisted state and restore if permission is still granted
  useEffect(() => {
    const persisted = localStorage.getItem(STORAGE_KEY)
    if (persisted !== 'true') return

    let cancelled = false

    const restore = async () => {
      const state = await queryPermission()

      if (cancelled) return

      if (state === 'granted') {
        setIsEnabled(true)
        startWatch()
      } else {
        // Permission revoked or prompt — revert to disabled
        localStorage.removeItem(STORAGE_KEY)
        setIsEnabled(false)
      }
    }

    restore()

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopWatch()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return {
    coords,
    permissionState,
    error,
    isLoading,
    enable,
    disable,
    isEnabled,
  }
}
