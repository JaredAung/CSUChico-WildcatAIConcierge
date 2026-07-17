'use client'

import { useState, useEffect, useCallback } from 'react'
import { MapPin, Loader2 } from 'lucide-react'
import { useGeolocation } from '@/lib/hooks/useGeolocation'
import { cn } from '@/lib/utils'

// ─── LocationToggle ───────────────────────────────────────────────────────────
// Compact toggle button for opting in/out of browser geolocation sharing.
// Renders inline in the chat input bar, to the left of the language selector.

export function LocationToggle() {
  const { isEnabled, isLoading, permissionState, enable, disable } = useGeolocation()
  const [showDeniedToast, setShowDeniedToast] = useState(false)

  // Show inline denial toast when permission is denied after an enable attempt
  useEffect(() => {
    if (permissionState === 'denied' && !isEnabled && !isLoading) {
      setShowDeniedToast(true)
      const timer = setTimeout(() => setShowDeniedToast(false), 5000)
      return () => clearTimeout(timer)
    }
  }, [permissionState, isEnabled, isLoading])

  const handleClick = useCallback(() => {
    if (isLoading) return

    if (isEnabled) {
      disable()
    } else {
      enable()
    }
  }, [isEnabled, isLoading, enable, disable])

  return (
    <div className="relative flex items-center">
      <button
        type="button"
        onClick={handleClick}
        disabled={isLoading}
        aria-label={
          isLoading
            ? 'Acquiring location…'
            : isEnabled
              ? 'Disable location sharing'
              : 'Enable location sharing'
        }
        aria-pressed={isEnabled}
        title={
          isLoading
            ? 'Acquiring location…'
            : isEnabled
              ? 'Location sharing enabled'
              : 'Enable location sharing'
        }
        className={cn(
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-all',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          isLoading && 'cursor-wait opacity-70',
          !isLoading && !isEnabled && 'bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/80',
          !isLoading && isEnabled && 'bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400 shadow-sm',
        )}
      >
        {isLoading ? (
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
        ) : (
          <MapPin
            className={cn(
              'w-4 h-4',
              isEnabled && 'fill-blue-600/20 dark:fill-blue-400/20',
            )}
            aria-hidden="true"
          />
        )}
      </button>

      {/* Non-blocking inline toast for permission denial */}
      {showDeniedToast && (
        <div
          role="alert"
          aria-live="polite"
          className={cn(
            'absolute left-0 bottom-full mb-2 z-50',
            'whitespace-nowrap rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/80',
            'px-3 py-1.5 text-xs text-amber-800 dark:text-amber-200 shadow-md',
            'animate-in fade-in slide-in-from-bottom-2',
          )}
        >
          Location permission denied
        </div>
      )}
    </div>
  )
}
