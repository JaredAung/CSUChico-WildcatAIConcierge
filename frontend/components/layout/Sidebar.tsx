'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Home,
  MessageSquare,
  Info,
  Accessibility,
  ChevronRight,
  Loader2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { DarkModeToggle } from '@/components/layout/Header'
import { getSuggestedQuestions } from '@/lib/api'
import { cn } from '@/lib/utils'

// ─── Props ─────────────────────────────────────────────────────────────────────

interface SidebarProps {
  /** Called when a suggested question is clicked */
  onSuggestedQuestion?: (question: string) => void
  className?: string
}

// ─── Nav link definition ──────────────────────────────────────────────────────

const navLinks = [
  { href: '/', label: 'Home', Icon: Home },
  { href: '/chat', label: 'Chat', Icon: MessageSquare },
  { href: '/about', label: 'About', Icon: Info },
] as const

// ─── Sidebar ──────────────────────────────────────────────────────────────────

export function Sidebar({ onSuggestedQuestion, className }: SidebarProps) {
  const pathname = usePathname()
  const [questions, setQuestions] = useState<string[]>([])
  const [loadingQuestions, setLoadingQuestions] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const qs = await getSuggestedQuestions()
        if (!cancelled) setQuestions(qs)
      } catch {
        // Silently fall back — sidebar still usable without suggestions
        if (!cancelled) setQuestions([])
      } finally {
        if (!cancelled) setLoadingQuestions(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  return (
    <aside
      className={cn(
        'flex flex-col h-full w-64 bg-card border-r border-border py-4',
        className,
      )}
      aria-label="Application sidebar"
    >
      {/* ── Brand Mark ────────────────────────────────────────────── */}
      <div className="px-4 mb-4">
        <Link
          href="/"
          className="flex items-center gap-2 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Wildcat AI Concierge — Home"
        >
          <span className="text-xl select-none" aria-hidden="true">🐾</span>
          <div className="leading-none">
            <p className="font-semibold text-sm text-foreground">Wildcat AI</p>
            <p className="text-xs text-muted-foreground">CSU Chico</p>
          </div>
        </Link>
      </div>

      <Separator className="mb-3" />

      {/* ── Main Navigation ───────────────────────────────────────── */}
      <nav aria-label="Main navigation" className="px-2 mb-4">
        <ul className="space-y-0.5" role="list">
          {navLinks.map(({ href, label, Icon }) => {
            const isActive = pathname === href || (href !== '/' && pathname.startsWith(href))
            return (
              <li key={href}>
                <Button
                  variant="ghost"
                  size="sm"
                  asChild
                  className={cn(
                    'w-full justify-start gap-2.5 font-normal',
                    isActive
                      ? 'bg-primary/10 text-primary font-medium hover:bg-primary/15'
                      : 'text-foreground hover:bg-muted',
                  )}
                  aria-current={isActive ? 'page' : undefined}
                >
                  <Link href={href}>
                    <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                    {label}
                    {isActive && (
                      <ChevronRight className="w-3.5 h-3.5 ml-auto" aria-hidden="true" />
                    )}
                  </Link>
                </Button>
              </li>
            )
          })}
        </ul>
      </nav>

      <Separator className="mb-3" />

      {/* ── Suggested Questions ───────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-2 min-h-0">
        <p
          className="px-2 mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide"
          id="sidebar-suggestions-label"
        >
          Suggested Questions
        </p>

        {loadingQuestions ? (
          <div className="flex items-center gap-2 px-2 py-3 text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
            <span className="text-xs">Loading suggestions…</span>
          </div>
        ) : questions.length === 0 ? (
          <p className="px-2 text-xs text-muted-foreground italic">
            No suggestions available.
          </p>
        ) : (
          <ul
            className="space-y-0.5"
            role="list"
            aria-labelledby="sidebar-suggestions-label"
          >
            {questions.map((q, i) => (
              <li key={i}>
                <button
                  type="button"
                  onClick={() => onSuggestedQuestion?.(q)}
                  className={cn(
                    'w-full text-left text-xs text-foreground leading-snug',
                    'rounded-md px-2 py-2 hover:bg-muted hover:text-foreground',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    'transition-colors',
                  )}
                  aria-label={`Ask: ${q}`}
                >
                  {q}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Separator className="mt-3 mb-3" />

      {/* ── Bottom Controls ───────────────────────────────────────── */}
      <div className="px-2 space-y-1">
        <Button
          variant="ghost"
          size="sm"
          asChild
          className="w-full justify-start gap-2.5 font-normal text-muted-foreground hover:text-foreground"
        >
          <Link href="/about#accessibility">
            <Accessibility className="w-4 h-4 shrink-0" aria-hidden="true" />
            Accessibility Statement
          </Link>
        </Button>

        <div className="flex items-center justify-between px-2 py-1">
          <span className="text-xs text-muted-foreground">Theme</span>
          <DarkModeToggle className="text-muted-foreground hover:text-foreground hover:bg-muted" />
        </div>
      </div>
    </aside>
  )
}
