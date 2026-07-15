'use client'

import Link from 'next/link'
import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'
import { Sun, Moon, Monitor } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

// ─── Props ─────────────────────────────────────────────────────────────────────

interface HeaderProps {
  className?: string
  /** Show full nav links (default: false — just logo + toggle) */
  showNav?: boolean
}

// ─── DarkModeToggle ───────────────────────────────────────────────────────────

function DarkModeToggle({ className }: { className?: string }) {
  const { theme, setTheme, resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  // Avoid hydration mismatch — only render after mount
  useEffect(() => setMounted(true), [])

  if (!mounted) {
    return (
      <Button
        variant="ghost"
        size="icon"
        aria-label="Toggle dark mode"
        className={cn('text-primary-foreground hover:bg-primary/90', className)}
        disabled
      >
        <Monitor className="w-5 h-5" aria-hidden="true" />
      </Button>
    )
  }

  const isDark = resolvedTheme === 'dark'

  function cycle() {
    if (theme === 'system') setTheme('light')
    else if (theme === 'light') setTheme('dark')
    else setTheme('system')
  }

  const label =
    theme === 'system'
      ? 'Switch to light mode (currently following system)'
      : theme === 'light'
      ? 'Switch to dark mode'
      : 'Switch to system default'

  const Icon = theme === 'system' ? Monitor : isDark ? Sun : Moon

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={cycle}
      aria-label={label}
      title={label}
      className={cn('text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground', className)}
    >
      <Icon className="w-5 h-5" aria-hidden="true" />
    </Button>
  )
}

// ─── Header ───────────────────────────────────────────────────────────────────

export function Header({ className, showNav = false }: HeaderProps) {
  return (
    <header
      className={cn(
        'sticky top-0 z-40 w-full bg-primary text-primary-foreground shadow-md',
        className,
      )}
      role="banner"
    >
      <div className="container mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6">
        {/* ── Logo / Brand ───────────────────────────────────────────── */}
        <Link
          href="/"
          className="flex items-center gap-2.5 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-primary"
          aria-label="Wildcat AI Concierge — Home"
        >
          <span className="text-2xl select-none" aria-hidden="true">🐾</span>
          <div className="flex flex-col leading-none">
            <span className="font-bold text-base sm:text-lg tracking-tight">
              Wildcat AI Concierge
            </span>
            <span className="text-xs text-primary-foreground/80 font-medium tracking-wide hidden sm:block">
              CSU Chico
            </span>
          </div>
        </Link>

        {/* ── Right Side ─────────────────────────────────────────────── */}
        <div className="flex items-center gap-1">
          {showNav && (
            <nav
              aria-label="Main navigation"
              className="hidden sm:flex items-center gap-1 mr-2"
            >
              <Button
                variant="ghost"
                size="sm"
                asChild
                className="text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground"
              >
                <Link href="/">Home</Link>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                asChild
                className="text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground"
              >
                <Link href="/chat">Chat</Link>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                asChild
                className="text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground"
              >
                <Link href="/about">About</Link>
              </Button>
            </nav>
          )}

          <DarkModeToggle />
        </div>
      </div>
    </header>
  )
}

// Re-export the toggle for standalone use in other layouts
export { DarkModeToggle }
