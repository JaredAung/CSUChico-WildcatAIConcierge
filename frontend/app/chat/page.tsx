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
  detected_language?: 'en' | 'es'
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
  const lastAssistantRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const autoSentRef = useRef(false)

  // Scroll to the start of the latest assistant reply so the user can read from the top
  useEffect(() => {
    if (lastAssistantRef.current) {
      lastAssistantRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
    } else {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
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
            departments: response.departments ?? [],
            workflow: response.workflow ?? undefined,
            confidence: response.confidence,
            detected_language: response.detected_language,
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
    <div className="flex h-screen w-full overflow-hidden" style={{ background: 'hsl(var(--chat-bg))' }}>

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
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setSidebarOpen(false)}
            aria-hidden="true"
          />
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
            className="absolute top-3 right-3 z-20 flex h-8 w-8 items-center justify-center rounded-full bg-card text-foreground border border-border shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
          className="flex items-center justify-between gap-3 border-b border-border bg-card/95 backdrop-blur-sm px-4 py-3 shrink-0 shadow-sm"
          role="banner"
        >
          <div className="flex items-center gap-3">
            {/* Mobile hamburger */}
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open navigation sidebar"
              className="md:hidden -ml-1"
            >
              <Menu className="w-5 h-5" aria-hidden="true" />
            </Button>

            {/* Brand */}
            <Link
              href="/"
              className="flex items-center gap-2.5 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Wildcat AI Concierge — Home"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-scarlet-600 to-scarlet-800 text-white shadow-sm ring-2 ring-primary/20 text-sm select-none">
                🐾
              </div>
              <div className="hidden sm:flex flex-col leading-none">
                <span className="font-bold text-sm text-foreground tracking-tight">Wildcat AI Concierge</span>
                <span className="text-[10px] text-muted-foreground font-medium">CSU Chico</span>
              </div>
              <span className="sm:hidden font-bold text-sm text-foreground">Wildcat AI</span>
            </Link>

            {/* Online indicator */}
            <div className="hidden sm:flex items-center gap-1.5 rounded-full bg-green-500/10 border border-green-500/20 px-2.5 py-1">
              <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" aria-hidden="true" />
              <span className="text-[11px] font-medium text-green-600 dark:text-green-400">Online</span>
            </div>
          </div>

          <nav aria-label="Header navigation" className="hidden sm:flex items-center gap-0.5">
            <Button variant="ghost" size="sm" asChild className="text-muted-foreground hover:text-foreground text-xs">
              <Link href="/"><Home className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" />Home</Link>
            </Button>
            <Button variant="ghost" size="sm" asChild className="text-muted-foreground hover:text-foreground text-xs">
              <Link href="/about"><Info className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" />About</Link>
            </Button>
          </nav>

          <DarkModeToggle className="text-muted-foreground hover:text-foreground hover:bg-muted" />
        </header>

        {/* ── Messages ────────────────────────────────────────────── */}
        <ScrollArea className="flex-1 overflow-y-auto relative">
          {/* Campus photo background */}
          <div
            className="absolute inset-0 pointer-events-none campus-bg"
            aria-hidden="true"
          />
          <div
            className="relative flex flex-col gap-5 px-4 py-6 max-w-3xl mx-auto w-full"
            role="log"
            aria-live="polite"
            aria-label="Chat conversation"
            aria-relevant="additions"
          >
            {messages.map((msg, idx) => {
              // Determine if this is the last assistant message
              const lastAsstIdx = messages.reduce((acc, m, i) => m.role === 'assistant' ? i : acc, -1)
              const isLastAssistant = msg.role === 'assistant' && idx === lastAsstIdx

              return (
              <div key={msg.id} ref={isLastAssistant ? lastAssistantRef : undefined} className="flex flex-col gap-2">
                <MessageBubble
                  message={msg}
                  detectedLanguage={msg.meta?.detected_language}
                  onThumbsUp={() => {}}
                  onThumbsDown={() => {}}
                />

                {msg.role === 'assistant' && msg.meta && (
                  <div className="ml-11 flex flex-col gap-2">
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
            )})}

            {/* Typing indicator */}
            {isLoading && (
              <div className="flex items-start gap-3 chat-bubble-assistant">
                <div className="avatar-ai mt-0.5" aria-hidden="true">🐾</div>
                <div className="flex flex-col gap-1.5">
                  <span className="text-[11px] font-semibold tracking-wide uppercase text-primary/80 px-1">
                    Wildcat AI
                  </span>
                  <div className="bubble-ai rounded-2xl rounded-tl-sm">
                    <TypingIndicator />
                  </div>
                </div>
              </div>
            )}

            {/* Error banner */}
            {error && !isLoading && (
              <div
                role="alert"
                className="flex items-start gap-3 rounded-xl border border-destructive/40 bg-destructive/8 px-4 py-3 text-sm text-destructive"
              >
                <span className="font-semibold shrink-0">⚠️ Error:</span>
                <span className="flex-1">{error}</span>
                <button
                  type="button"
                  onClick={() => setError(null)}
                  className="shrink-0 text-xs underline underline-offset-2 hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded opacity-70 hover:opacity-100"
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
        <div className="bg-card/80 backdrop-blur-sm border-t border-border px-4 pt-2.5 pb-2">
          <div
            className="flex gap-2 overflow-x-auto scrollbar-none max-w-3xl mx-auto"
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
                className="chip"
                aria-label={`Ask: ${q}`}
              >
                {q}
              </button>
            ))}
          </div>
        </div>

        {/* ── Input Area ──────────────────────────────────────────── */}
        <div className="bg-card/95 backdrop-blur-sm border-t border-border px-4 pt-3 pb-4 shrink-0">
          <form
            onSubmit={(e) => { e.preventDefault(); handleSend() }}
            className="max-w-3xl mx-auto"
            aria-label="Send a message"
          >
            <label htmlFor="chat-input" className="sr-only">Type your message</label>

            <div className="input-card flex items-end gap-0 px-4 py-2">
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
                  'flex-1 resize-none bg-transparent text-sm placeholder:text-muted-foreground',
                  'focus:outline-none disabled:opacity-50',
                  'min-h-[40px] max-h-40 leading-relaxed py-1.5',
                )}
                style={{ height: '40px' }}
              />
              <button
                type="submit"
                disabled={isLoading || !inputValue.trim()}
                aria-label="Send message"
                title="Send (Enter)"
                className={cn(
                  'ml-2 mb-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-all',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  inputValue.trim() && !isLoading
                    ? 'bg-gradient-to-br from-scarlet-600 to-scarlet-800 text-white shadow-md hover:shadow-lg hover:scale-105 active:scale-95'
                    : 'bg-muted text-muted-foreground cursor-not-allowed',
                )}
              >
                <Send className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>

            <p
              id="chat-input-hint"
              className="mt-2 text-center text-[11px] text-muted-foreground"
            >
              <kbd className="font-mono bg-muted px-1 py-0.5 rounded text-[10px]">Enter</kbd> to send
              {' · '}
              <kbd className="font-mono bg-muted px-1 py-0.5 rounded text-[10px]">Shift+Enter</kbd> for new line
            </p>
          </form>
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
