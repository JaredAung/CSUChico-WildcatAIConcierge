import { MapPin, Navigation } from 'lucide-react'
import { buildMapLinks } from '@/lib/mapLinks'
import { cn } from '@/lib/utils'

// ─── Props ─────────────────────────────────────────────────────────────────────

export interface DirectionsCardProps {
  /** Human-readable destination name (e.g., "Meriam Library") */
  destination: string
  /** Optional user coordinates — when provided, used as trip origin in map links */
  userLocation?: { latitude: number; longitude: number } | null
  /** Additional Tailwind class names */
  className?: string
}

// ─── DirectionsCard ───────────────────────────────────────────────────────────

/**
 * Compact card rendered below a chat message when navigation intent is detected.
 * Displays the destination name as a heading and provides Google Maps and Apple Maps
 * link buttons that open walking directions in a new tab.
 */
export function DirectionsCard({ destination, userLocation, className }: DirectionsCardProps) {
  const links = buildMapLinks(destination, userLocation)

  return (
    <div
      className={cn(
        'rounded-lg border border-border bg-card p-3 shadow-sm',
        className,
      )}
      role="region"
      aria-label={`Directions to ${destination}`}
    >
      {/* ── Heading ──────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 mb-2">
        <MapPin className="w-4 h-4 text-primary shrink-0" aria-hidden="true" />
        <h4 className="text-sm font-semibold leading-tight">{destination}</h4>
      </div>

      {/* ── Map Link Buttons ─────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2">
        <a
          href={links.google}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5',
            'text-xs font-medium transition-colors',
            'bg-blue-100 text-blue-800 hover:bg-blue-200',
            'dark:bg-blue-900/40 dark:text-blue-200 dark:hover:bg-blue-800/60',
            'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1',
          )}
          aria-label={`Open directions to ${destination} in Google Maps (opens in new tab)`}
        >
          <Navigation className="w-3.5 h-3.5" aria-hidden="true" />
          Google Maps
        </a>

        <a
          href={links.apple}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5',
            'text-xs font-medium transition-colors',
            'bg-gray-100 text-gray-800 hover:bg-gray-200',
            'dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700',
            'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1',
          )}
          aria-label={`Open directions to ${destination} in Apple Maps (opens in new tab)`}
        >
          <MapPin className="w-3.5 h-3.5" aria-hidden="true" />
          Apple Maps
        </a>
      </div>

      {/* ── Helper Text (no location) ────────────────────────────── */}
      {!userLocation && (
        <p className="mt-2 text-xs text-muted-foreground">
          Enable the location toggle for personalized directions from your current position.
        </p>
      )}
    </div>
  )
}
