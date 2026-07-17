'use client'

import Image from 'next/image'
import { useState, useMemo } from 'react'
import ReactMarkdown from 'react-markdown'
import rehypeRaw from 'rehype-raw'
import { Copy, Check, ThumbsUp, ThumbsDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn, formatTime } from '@/lib/utils'
import { CitationBadge } from './CitationBadge'
import type { ChatMessage, Source } from '@/lib/types'

// ─── Props ─────────────────────────────────────────────────────────────────────

interface MessageBubbleProps {
  message: ChatMessage
  /** Optional: sources array for inline citation badge rendering */
  sources?: Source[]
  /** Optional: detected language for display */
  detectedLanguage?: 'en' | 'es'
  /** Optional: fired when user clicks thumbs-up */
  onThumbsUp?: (messageId?: string) => void
  /** Optional: fired when user clicks thumbs-down */
  onThumbsDown?: (messageId?: string) => void
  className?: string
}

// ─── Copy Button ──────────────────────────────────────────────────────────────

function CopyButton({ text, messageId }: { text: string; messageId?: string }) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback for environments without clipboard API
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={handleCopy}
      aria-label={copied ? 'Copied to clipboard' : 'Copy answer to clipboard'}
      title={copied ? 'Copied!' : 'Copy answer'}
      className="text-muted-foreground hover:text-foreground"
    >
      {copied ? (
        <Check className="w-3.5 h-3.5 text-green-500" aria-hidden="true" />
      ) : (
        <Copy className="w-3.5 h-3.5" aria-hidden="true" />
      )}
    </Button>
  )
}

// ─── Feedback Buttons ─────────────────────────────────────────────────────────

function FeedbackButtons({
  messageId,
  onThumbsUp,
  onThumbsDown,
}: {
  messageId?: string
  onThumbsUp?: (id?: string) => void
  onThumbsDown?: (id?: string) => void
}) {
  const [feedback, setFeedback] = useState<'up' | 'down' | null>(null)

  function handleUp() {
    if (feedback === 'up') return
    setFeedback('up')
    onThumbsUp?.(messageId)
  }

  function handleDown() {
    if (feedback === 'down') return
    setFeedback('down')
    onThumbsDown?.(messageId)
  }

  return (
    <div
      className="flex items-center gap-1"
      role="group"
      aria-label="Was this answer helpful?"
    >
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={handleUp}
        aria-label="Helpful"
        aria-pressed={feedback === 'up'}
        title="Helpful"
        disabled={feedback !== null}
        className={cn(
          'text-muted-foreground hover:text-green-500 transition-colors',
          feedback === 'up' && 'text-green-500',
        )}
      >
        <ThumbsUp className="w-3.5 h-3.5" aria-hidden="true" />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={handleDown}
        aria-label="Not helpful"
        aria-pressed={feedback === 'down'}
        title="Not helpful"
        disabled={feedback !== null}
        className={cn(
          'text-muted-foreground hover:text-red-500 transition-colors',
          feedback === 'down' && 'text-red-500',
        )}
      >
        <ThumbsDown className="w-3.5 h-3.5" aria-hidden="true" />
      </Button>
    </div>
  )
}

// ─── Citation Pre-Processor ───────────────────────────────────────────────────

/**
 * Pre-processes markdown content to replace valid `[N]` citation markers with
 * `<cite-badge data-index="N"></cite-badge>` custom HTML elements that ReactMarkdown
 * can render via a custom component map.
 *
 * Rules:
 * - Only converts `[N]` where N is an integer 1–20 AND a source with matching
 *   `citation_index` exists in the sources array.
 * - Protects markdown links `[text](url)` from false-positive matches.
 * - Passes through invalid patterns as plain text.
 */
export function preprocessCitationMarkers(content: string, sources: Source[]): string {
  if (!sources || sources.length === 0) return content

  // Build a set of valid citation indices present in the sources array
  const validIndices = new Set<number>()
  for (const source of sources) {
    if (
      typeof source.citation_index === 'number' &&
      Number.isFinite(source.citation_index) &&
      Number.isInteger(source.citation_index) &&
      source.citation_index >= 1 &&
      source.citation_index <= 20
    ) {
      validIndices.add(source.citation_index)
    }
  }

  if (validIndices.size === 0) return content

  // Replace valid [N] patterns while protecting markdown links.
  // Strategy: match [N] only when NOT followed by ( (which would indicate a markdown link)
  // The regex captures [integer] patterns not followed by (
  const result = content.replace(
    /\[(\d+)\](?!\()/g,
    (match, numStr) => {
      const n = parseInt(numStr, 10)
      if (n >= 1 && n <= 20 && validIndices.has(n)) {
        return `<cite-badge data-index="${n}"></cite-badge>`
      }
      // Invalid index — pass through as plain text
      return match
    }
  )

  return result
}

// ─── MessageBubble ────────────────────────────────────────────────────────────

export function MessageBubble({ message, sources = [], detectedLanguage, onThumbsUp, onThumbsDown, className }: MessageBubbleProps) {
  const isUser = message.role === 'user'
  const timeLabel = message.timestamp
    ? formatTime(message.timestamp)
    : undefined

  // Pre-process citation markers for assistant messages
  const processedContent = useMemo(() => {
    if (isUser) return message.content
    return preprocessCitationMarkers(message.content, sources)
  }, [message.content, sources, isUser])

  // Build a lookup map from citation_index to source
  const sourcesByIndex = useMemo(() => {
    const map = new Map<number, Source>()
    for (const source of sources) {
      if (
        typeof source.citation_index === 'number' &&
        Number.isFinite(source.citation_index) &&
        Number.isInteger(source.citation_index) &&
        source.citation_index >= 1
      ) {
        map.set(source.citation_index, source)
      }
    }
    return map
  }, [sources])

  return (
    <div
      className={cn(
        'flex w-full gap-2',
        isUser ? 'justify-end chat-bubble-user' : 'justify-start chat-bubble-assistant',
        className,
      )}
      role="article"
      aria-label={`${isUser ? 'Your message' : 'Assistant message'}${timeLabel ? ` at ${timeLabel}` : ''}`}
    >
      {/* ── Assistant Avatar ─────────────────────────────────────── */}
      {!isUser && (
        <div
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary overflow-hidden mt-1"
          aria-hidden="true"
        >
          <Image src="/Chico logo.png" alt="" width={32} height={32} className="h-8 w-8 object-contain" />
        </div>
      )}

      <div className={cn('flex flex-col gap-1 max-w-[85%] sm:max-w-[75%]', isUser && 'items-end')}>
        {/* ── Bubble ─────────────────────────────────────────────── */}
        <div
          className={cn(
            'rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm',
            isUser
              ? 'bg-primary text-primary-foreground rounded-tr-sm'
              : 'bg-card border border-border text-card-foreground rounded-tl-sm',
          )}
        >
          {isUser ? (
            // User messages: plain text
            <p className="whitespace-pre-wrap break-words">{message.content}</p>
          ) : (
            // Assistant messages: markdown with citation badges
            <div className="prose max-w-none">
              <ReactMarkdown
                rehypePlugins={[rehypeRaw]}
                components={{
                  // Open all links in new tab
                  a: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { node?: any }) => (
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={typeof children === 'string' ? `${children} (opens in new tab)` : undefined}
                      {...props}
                    >
                      {children}
                    </a>
                  ),
                  // Custom cite-badge component for inline citation rendering
                  ...({
                    'cite-badge': (props: any) => {
                      const dataIndex = props['data-index']
                      const index = typeof dataIndex === 'string' ? parseInt(dataIndex, 10) : Number(dataIndex)
                      if (!Number.isFinite(index) || index < 1) return null

                      const source = sourcesByIndex.get(index)
                      if (!source) return null

                      return (
                        <CitationBadge
                          index={index}
                          domainLabel={source.domain_label || undefined}
                          url={source.url || undefined}
                          className="mx-0.5"
                        />
                      )
                    },
                  } as any),
                }}
              >
                {processedContent}
              </ReactMarkdown>
            </div>
          )}
        </div>

        {/* ── Timestamp + Actions ─────────────────────────────────── */}
        <div
          className={cn(
            'flex items-center gap-1 px-1',
            isUser ? 'flex-row-reverse' : 'flex-row',
          )}
        >
          {timeLabel && (
            <time
              dateTime={message.timestamp}
              className="text-xs text-muted-foreground"
            >
              {timeLabel}
            </time>
          )}

          {!isUser && (
            <>
              <CopyButton text={message.content} messageId={message.id} />
              <FeedbackButtons
                messageId={message.id}
                onThumbsUp={onThumbsUp}
                onThumbsDown={onThumbsDown}
              />
            </>
          )}
        </div>
      </div>

      {/* ── User Avatar ──────────────────────────────────────────── */}
      {isUser && (
        <div
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary text-secondary-foreground text-xs font-bold select-none mt-1"
          aria-hidden="true"
        >
          You
        </div>
      )}
    </div>
  )
}
