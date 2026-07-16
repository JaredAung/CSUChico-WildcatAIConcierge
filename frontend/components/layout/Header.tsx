'use client'

import Link from 'next/link'
import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'
import { Sun, Moon, Monitor, MessageSquare } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface HeaderProps {
  className?: string
  showNav?: boolean
}

export function DarkModeToggle({ className }: { className?: string }) {
  const { theme, setTheme, resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  if (!mounted) {
    return (
      <Button variant="ghost" size="icon" aria-label="Toggle dark mode"
        className={cn('text-white hover:bg-white/10', className)} disabled>
        <Monitor className="w-4 h-4" aria-hidden="true" />
      </Button>
    )
  }

  const isDark = resolvedTheme === 'dark'
  function cycle() {
    if (theme === 'system') setTheme('light')
    else if (theme === 'light') setTheme('dark')
    else setTheme('system')
  }
  const label = theme === 'system' ? 'Switch to light mode' : theme === 'light' ? 'Switch to dark mode' : 'Switch to system'
  const Icon = theme === 'system' ? Monitor : isDark ? Sun : Moon

  return (
    <Button variant="ghost" size="icon" onClick={cycle} aria-label={label} title={label}
      className={cn('text-white hover:bg-white/10 hover:text-white', className)}>
      <Icon className="w-4 h-4" aria-hidden="true" />
    </Button>
  )
}

export function Header({ className, showNav = false }: HeaderProps) {
  return (
    <header
      className={cn('sticky top-0 z-40 w-full shadow-md', className)}
      role="banner"
    >
      {/* ── Scarlet brand bar ─────────────────────────────────────── */}
      <div className="bg-primary text-white">
        <div className="container mx-auto max-w-7xl px-4 sm:px-6 flex h-16 items-center justify-between gap-4">

          {/* Logo + wordmark */}
          <Link
            href="/"
            className="flex items-center gap-3 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-primary shrink-0"
            aria-label="Wildcat AI Concierge — Home"
          >
            <span className="text-2xl select-none" aria-hidden="true">🐾</span>
            <div className="flex flex-col leading-none">
              <span className="font-bold text-base sm:text-lg tracking-tight text-white">
                Wildcat AI Concierge
              </span>
              <span className="text-[11px] text-white/70 font-medium tracking-wide hidden sm:block">
                California State University, Chico
              </span>
            </div>
          </Link>

          {/* Nav + actions */}
          <div className="flex items-center gap-1">
            {showNav && (
              <nav aria-label="Main navigation" className="hidden sm:flex items-center gap-0.5 mr-2">
                {[
                  { label: 'Home', href: '/' },
                  { label: 'Chat', href: '/chat' },
                  { label: 'About', href: '/about' },
                ].map(({ label, href }) => (
                  <Button key={label} variant="ghost" size="sm" asChild
                    className="text-white hover:bg-white/10 hover:text-white text-sm font-medium px-3">
                    <Link href={href}>{label}</Link>
                  </Button>
                ))}
              </nav>
            )}

            {/* Chat CTA button */}
            <Button asChild size="sm"
              className="hidden sm:flex bg-[#FFC72C] text-[#1a1a1a] hover:bg-[#e6b228] font-bold text-xs mr-1">
              <Link href="/chat">
                <MessageSquare className="w-3.5 h-3.5" aria-hidden="true" />
                Ask a Question
              </Link>
            </Button>

            <DarkModeToggle />
          </div>
        </div>
      </div>
    </header>
  )
}
