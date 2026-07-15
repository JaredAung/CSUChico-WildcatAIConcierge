'use client'

import { useEffect, useRef, useState, useCallback, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { v4 as uuidv4 } from 'uuid'
import {
  Send,
  Menu,
  X,
  Home,
  MessageSquare,
  Info,
  ChevronRight,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { MessageBubble } from '@/components/chat/MessageBubble'
import { SourcePanel } from '@/components/chat/SourcePanel'
import { WorkflowCard } from '@/components/chat/WorkflowCard'
import { TypingIndicator } from '@/components/chat/TypingIndicator'
import { Sidebar } from '@/components/layout/Sidebar'
import { DarkModeToggle } from '@/components/layout/Header'
import { sendMessage, getSuggestedQuestions } from '@/lib/api'
import { cn } from '@/lib/utils'
import type { ChatMessage, ChatResponse, Source, Department, WorkflowCard as WorkflowCardType } from '@/lib/types'

// ─── Types ────────────────────────────────────────────────────────────────────

interface AssistantMeta {
  sources: Source[]
  departments: Department[]
  workflow?: WorkflowCardType
  confidence?: number
}

interface DisplayMessage extends ChatMessage {
  meta?: AssistantMeta
}

// ─── Welcome message ──────────────────────────────────────────────────────────

function buildWelcomeMessage(): DisplayMessage {
  return {
    id: 'welcome',
    role: 'assistant',
    content: 'Hi! I am the **Wildcat AI Concierge** 🐾\n\nHow can I help you today? You can ask me about parking, dining, campus events, facility rentals, disability accommodations, housing, and more.',
    timestamp: new Date().toISOString(),
    meta: { sources: [], departments: [] },
  }
}

// ─── Suggested question chips ─────────────────────────────────────────────────

const DEFAULT_CHIPS = [
  'Where do I park?',
  'Where do I eat?',
  'What events are happening?',
  'How do I get a parking permit?',
]

// ─── Chat Content (reads searchParams) ───────────────────────────────────────

function ChatContent() {
  const searchParams = useSearchParams()
  const router = useRouter()

  const [sessionId] = useState<string>(() => uuidv4())
  const [messages, setMessages] = useState<DisplayMessage[]>([buildWelcomeMessage()])
  const [inputValue, setInputValue] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [chips, setChips] = useState<string[]>(DEFAULT_CHIPS)

  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const autoSentRef = useRef(false)

  // Scroll to bottom whenever messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading])

  // Load suggested chips from API
  useEffect(() => {
    getSuggestedQuestions()
      .then((qs) => {
        if (qs.length > 0) setChips(qs.slice(0, 4))
      })
      .catch(() => {}) // keep defaults on failure
  }, [])

  // Auto-send ?q= param once
  useEffect(() => {
    const q = searchParams.get('q')
    if (q && !autoSentRef.current) {
      autoSentRef.current = true
      // Clear the param from URL without navigation (cosmetic)
      router.replace('/chat', { scroll: false })
      handleSend(q)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  // ── Core send logic ────────────────────────────────────────────────────────

  const handleSend = useCallback(
    async (text?: string) => {
      const content = (text ?? inputValue).trim()
      if (!content || isLoading) return

      setInputValue('')
      setError(null)

      const userMsg: DisplayMessage = {
        id: uuidv4(),
        role: 'user',
        content,
        timestamp: new Date().toISOString(),
      }

      setMessages((prev) => [...prev, userMsg])
      setIsLoading(true)

      // Build history for API (exclude welcome meta, strip display-only fields)
      const history: ChatMessage[] = messages
        .filter((m) => m.id !== 'welcome')
        .map(({ role, content }) => ({ role, content }))

      history.push({ role: 'user', content })

      try {
        const response: ChatResponse = await sendMessage(history, sessionId)

        const assistantMsg: DisplayMessage = {
          id: uuidv4(),
          role: 'assistant',
          content: response.answer,
          timestamp: new Date().toISOString(),
          meta: {
            sources: response.sources ?? [],
            departments: response.relevant_departments ?? [],
            workflow: response.workflow_card,
            // Derive confidence from highest source relevance score if present
            confidence: response.sources?.length
              ? Math.max(...response.sources.map((s) => s.relevance_score ?? 0))
              : undefined,
          },
        }

        setMessages((prev) => [...prev, assistantMsg])
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : 'Something went wrong. Please try again.'
        setError(msg)
      } finally {
        setIsLoading(false)
        // Refocus input after response
        setTimeout(() => inputRef.current?.focus(), 50)
      }
    },
    [inputValue, isLoading, messages, sessionId],
  )

  // ── Keyboard handler ───────────────────────────────────────────────────────

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  // ── Textarea auto-resize ───────────────────────────────────────────────────

  function handleInput(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInputValue(e.target.value)
    const ta = e.target
    ta.style.height = 'auto'
    ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`
  }

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">

      {/* ── Sidebar (desktop) ──────────────────────────────────────── */}
      <div className="hidden md:flex shrink-0">
        <Sidebar
          onSuggestedQuestion={(q) => handleSend(q)}
          className="h-full"
        />
      </div>

      {/* ── Mobile sidebar overlay ─────────────────────────────────── */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-50 flex md:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Navigation sidebar"
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setSidebarOpen(false)}
            aria-hidden="true"
          />
          {/* Panel */}
          <div className="relative z-10 flex flex-col">
            <Sidebar
              onSuggestedQuestion={(q) => {
                setSidebarOpen(false)
                handleSend(q)
              }}
              className="h-full"
            />
          </div>
          <button
            type="button"
            className="absolute top-3 right-3 z-20 flex h-8 w-8 items-center justify-center rounded-full bg-card text-foreground border border-border shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close sidebar"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      )}

      {/* ── Main Chat Area ─────────────────────────────────────────── */}
      <div className="flex flex-1 flex-col overflow-hidden">

        {/* ── Top Bar ─────────────────────────────────────────────── */}
        <header
          className="flex items-center justify-between gap-2 border-b border-border bg-card px-4 py-2.5 shrink-0"
          role="banner"
        >
          <div className="flex items-center gap-2">
            {/* Mobile hamburger */}
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open navigation sidebar"
              className="md:hidden"
            >
              <Menu className="w-5 h-5" aria-hidden="true" />
            </Button>
            <Link
              href="/"
              className="flex items-center gap-1.5 text-sm font-semibold rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Wildcat AI Concierge — Home"
            >
              <span aria-hidden="true">🐾</span>
              <span className="hidden sm:inline">Wildcat AI Concierge</span>
              <span className="sm:hidden">Wildcat AI</span>
            </Link>
          </div>

          <nav aria-label="Header navigation" className="hidden sm:flex items-center gap-1">
            <Button variant="ghost" size="sm" asChild className="text-muted-foreground">
              <Link href="/"><Home className="w-4 h-4 mr-1" aria-hidden="true" />Home</Link>
            </Button>
            <Button variant="ghost" size="sm" asChild className="text-muted-foreground">
              <Link href="/about"><Info className="w-4 h-4 mr-1" aria-hidden="true" />About</Link>
            </Button>
          </nav>

          <DarkModeToggle className="text-muted-foreground hover:text-foreground hover:bg-muted" />
        </header>

        {/* ── Messages ────────────────────────────────────────────── */}
        <ScrollArea className="flex-1 overflow-y-auto">
          <div
            className="flex flex-col gap-4 px-4 py-6 max-w-3xl mx-auto w-full"
            role="log"
            aria-live="polite"
            aria-label="Chat conversation"
            aria-relevant="additions"
          >
            {messages.map((msg) => (
              <div key={msg.id} className="flex flex-col gap-2">
                <MessageBubble
                  message={msg}
                  onThumbsUp={() => {}} // extend with analytics as needed
                  onThumbsDown={() => {}}
                />

                {/* Source panel + workflow — only for assistant messages with meta */}
                {msg.role === 'assistant' && msg.meta && (
                  <div className="ml-10 flex flex-col gap-2">
                    {(msg.meta.sources.length > 0 || msg.meta.departments.length > 0) && (
                      <SourcePanel
                        sources={msg.meta.sources}
                        departments={msg.meta.departments}
                        confidence={msg.meta.confidence}
                      />
                    )}
                    {msg.meta.workflow && (
                      <WorkflowCard workflow={msg.meta.workflow} />
                    )}
                  </div>
                )}
              </div>
            ))}

            {/* Typing indicator */}
            {isLoading && (
              <div className="flex items-start gap-2">
                <div
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-lg select-none"
                  aria-hidden="true"
                >
                  🐾
                </div>
                <div className="rounded-2xl rounded-tl-sm bg-card border border-border shadow-sm">
                  <TypingIndicator />
                </div>
              </div>
            )}

            {/* Error banner */}
            {error && !isLoading && (
              <div
                role="alert"
                className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive"
              >
                <strong className="font-semibold">Error: </strong>{error}
                <button
                  type="button"
                  onClick={() => setError(null)}
                  className="ml-2 underline underline-offset-2 hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                  aria-label="Dismiss error"
                >
                  Dismiss
                </button>
              </div>
            )}

            <div ref={bottomRef} aria-hidden="true" />
          </div>
        </ScrollArea>

        {/* ── Suggested Chips ─────────────────────────────────────── */}
        <div className="border-t border-border bg-background/80 backdrop-blur-sm px-4 pt-2 pb-1">
          <div
            className="flex gap-2 overflow-x-auto pb-1 max-w-3xl mx-auto scrollbar-none"
            role="list"
            aria-label="Suggested questions"
          >
            {chips.map((q) => (
              <button
                key={q}
                type="button"
                role="listitem"
                onClick={() => handleSend(q)}
                disabled={isLoading}
                className={cn(
                  'shrink-0 rounded-full border border-border bg-card px-3 py-1.5',
                  'text-xs text-foreground whitespace-nowrap',
                  'hover:border-primary/50 hover:bg-primary/5 hover:text-primary',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  'transition-colors disabled:opacity-50 disabled:pointer-events-none',
                )}
                aria-label={`Ask: ${q}`}
              >
                {q}
              </button>
            ))}
          </div>
        </div>

        {/* ── Input Area ──────────────────────────────────────────── */}
        <div className="border-t border-border bg-background px-4 pt-3 pb-4 shrink-0">
          <form
            onSubmit={(e) => { e.preventDefault(); handleSend() }}
            className="flex items-end gap-2 max-w-3xl mx-auto"
            aria-label="Send a message"
          >
            <label htmlFor="chat-input" className="sr-only">
              Type your message
            </label>
            <textarea
              id="chat-input"
              ref={inputRef}
              value={inputValue}
              onChange={handleInput}
              onKeyDown={handleKeyDown}
              placeholder="Ask me about parking, dining, events, accommodations…"
              disabled={isLoading}
              rows={1}
              aria-label="Message input"
              aria-describedby="chat-input-hint"
              className={cn(
                'flex-1 resize-none rounded-xl border border-input bg-background px-4 py-2.5',
                'text-sm placeholder:text-muted-foreground',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                'disabled:opacity-50 min-h-[44px] max-h-40 leading-relaxed',
              )}
              style={{ height: '44px' }}
            />
            <Button
              type="submit"
              size="icon"
              disabled={isLoading || !inputValue.trim()}
              aria-label="Send message"
              title="Send (Enter)"
              className="h-11 w-11 shrink-0 rounded-xl"
            >
              <Send className="w-4 h-4" aria-hidden="true" />
            </Button>
          </form>
          <p
            id="chat-input-hint"
            className="mt-1.5 text-center text-xs text-muted-foreground max-w-3xl mx-auto"
          >
            Press <kbd className="font-mono bg-muted px-1 rounded">Enter</kbd> to send,{' '}
            <kbd className="font-mono bg-muted px-1 rounded">Shift+Enter</kbd> for new line.
          </p>
        </div>
      </div>
    </div>
  )
}

// ─── Page (wraps in Suspense for useSearchParams) ─────────────────────────────

export default function ChatPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen items-center justify-center bg-background">
          <div className="flex flex-col items-center gap-3 text-muted-foreground">
            <span className="text-4xl animate-pulse-soft" aria-hidden="true">🐾</span>
            <p className="text-sm">Loading chat…</p>
          </div>
        </div>
      }
    >
      <ChatContent />
    </Suspense>
  )
}
