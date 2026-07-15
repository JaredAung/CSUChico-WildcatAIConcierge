'use client'

import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { Copy, Check, ThumbsUp, ThumbsDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn, formatTime } from '@/lib/utils'
import type { ChatMessage } from '@/lib/types'

// ─── Props ─────────────────────────────────────────────────────────────────────

interface MessageBubbleProps {
  message: ChatMessage
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

// ─── MessageBubble ────────────────────────────────────────────────────────────

export function MessageBubble({ message, onThumbsUp, onThumbsDown, className }: MessageBubbleProps) {
  const isUser = message.role === 'user'
  const timeLabel = message.timestamp
    ? formatTime(message.timestamp)
    : undefined

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
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-lg select-none mt-1"
          aria-hidden="true"
        >
          🐾
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
            // Assistant messages: markdown
            <div className="prose max-w-none">
              <ReactMarkdown
                components={{
                  // Open all links in new tab
                  a: ({ href, children, ...props }) => (
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
                }}
              >
                {message.content}
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
