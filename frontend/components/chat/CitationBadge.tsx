import { cn } from '@/lib/utils'

// ─── Props ─────────────────────────────────────────────────────────────────────

export interface CitationBadgeProps {
  /** 1-based citation index */
  index: number
  /** Short domain label derived from source URL (e.g. "csuchico") */
  domainLabel?: string
  /** Source URL — when present, badge renders as a clickable link */
  url?: string
  /** Additional Tailwind class names */
  className?: string
}

// ─── CitationBadge ────────────────────────────────────────────────────────────

/**
 * Pill-shaped inline citation badge that displays a domain label and optionally
 * links to the source URL. Renders as an `<a>` when a URL is provided,
 * otherwise as a non-clickable `<span>`.
 */
export function CitationBadge({ index, domainLabel, url, className }: CitationBadgeProps) {
  // Reject invalid citation indices: must be a positive integer (>= 1, no decimals, no NaN)
  if (typeof index !== 'number' || !Number.isFinite(index) || !Number.isInteger(index) || index < 1) {
    return null
  }

  const displayText = domainLabel || `[${index}]`
  const ariaLabel = `Source ${index}: ${domainLabel || 'unknown'}`

  const sharedClasses = cn(
    'inline-flex items-center rounded-full border px-2 py-0.5',
    'text-xs font-semibold transition-colors',
    'bg-blue-100 border-blue-300 text-blue-800',
    'dark:bg-blue-900/40 dark:border-blue-700 dark:text-blue-200',
    className,
  )

  if (url) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        role="link"
        aria-label={ariaLabel}
        className={cn(
          sharedClasses,
          'hover:bg-blue-200 dark:hover:bg-blue-800/60',
          'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1',
          'no-underline cursor-pointer',
        )}
      >
        {displayText}
      </a>
    )
  }

  return (
    <span
      aria-label={ariaLabel}
      className={cn(sharedClasses, 'cursor-default')}
    >
      {displayText}
    </span>
  )
}
