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
  detectedLanguage?: 'en' | 'es'
  onThumbsUp?: (messageId?: string) => void
  onThumbsDown?: (messageId?: string) => void
  className?: string
}

// ─── Copy Button ──────────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.cssText = 'position:fixed;opacity:0'
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label={copied ? 'Copied!' : 'Copy response'}
      title={copied ? 'Copied!' : 'Copy response'}
      className={cn(
        'flex h-6 w-6 items-center justify-center rounded-md transition-colors',
        'text-muted-foreground hover:text-foreground hover:bg-muted',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
      )}
    >
      {copied
        ? <Check className="w-3.5 h-3.5 text-green-500" aria-hidden="true" />
        : <Copy className="w-3.5 h-3.5" aria-hidden="true" />
      }
    </button>
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

  return (
    <div className="flex items-center gap-0.5" role="group" aria-label="Was this answer helpful?">
      <button
        type="button"
        onClick={() => { if (!feedback) { setFeedback('up'); onThumbsUp?.(messageId) } }}
        aria-label="Helpful"
        aria-pressed={feedback === 'up'}
        disabled={feedback !== null}
        className={cn(
          'flex h-6 w-6 items-center justify-center rounded-md transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          feedback === 'up'
            ? 'text-green-500'
            : 'text-muted-foreground hover:text-green-500 hover:bg-muted',
        )}
      >
        <ThumbsUp className="w-3.5 h-3.5" aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={() => { if (!feedback) { setFeedback('down'); onThumbsDown?.(messageId) } }}
        aria-label="Not helpful"
        aria-pressed={feedback === 'down'}
        disabled={feedback !== null}
        className={cn(
          'flex h-6 w-6 items-center justify-center rounded-md transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          feedback === 'down'
            ? 'text-red-500'
            : 'text-muted-foreground hover:text-red-500 hover:bg-muted',
        )}
      >
        <ThumbsDown className="w-3.5 h-3.5" aria-hidden="true" />
      </button>
    </div>
  )
}

// ─── MessageBubble ────────────────────────────────────────────────────────────

export function MessageBubble({
  message,
  detectedLanguage,
  onThumbsUp,
  onThumbsDown,
  className,
}: MessageBubbleProps) {
  const isUser = message.role === 'user'
  const timeLabel = message.timestamp ? formatTime(message.timestamp) : undefined
  const isSpanish = !isUser && detectedLanguage === 'es'

  return (
    <div
      className={cn(
        'flex w-full gap-3',
        isUser ? 'justify-end chat-bubble-user' : 'justify-start chat-bubble-assistant',
        className,
      )}
      role="article"
      aria-label={`${isUser ? 'Your message' : 'Assistant message'}${timeLabel ? ` at ${timeLabel}` : ''}`}
    >
      {/* ── AI Avatar ───────────────────────────────────────────── */}
      {!isUser && (
        <div className="avatar-ai mt-0.5" aria-hidden="true">
          🐾
        </div>
      )}

      <div className={cn('flex flex-col gap-1.5 max-w-[82%] sm:max-w-[72%]', isUser && 'items-end')}>
        {/* ── Sender label ────────────────────────────────────────── */}
        <span className={cn(
          'text-[11px] font-semibold tracking-wide uppercase px-1',
          isUser ? 'text-muted-foreground' : 'text-primary/80',
        )}>
          {isUser ? 'You' : 'Wildcat AI'}
        </span>

        {/* ── Bubble ──────────────────────────────────────────────── */}
        <div
          className={cn(
            'rounded-2xl px-4 py-3 text-sm leading-relaxed',
            isUser
              ? 'bubble-user rounded-tr-sm'
              : 'bubble-ai rounded-tl-sm',
          )}
        >
          {isUser ? (
            <p className="whitespace-pre-wrap break-words">{message.content}</p>
          ) : (
            <div className="prose max-w-none">
              <ReactMarkdown
                components={{
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
                  img: ({ src, alt, ...props }) => (
                    <img
                      src={src}
                      alt={alt || 'Campus map'}
                      className="rounded-lg border border-border shadow-sm max-w-full h-auto my-3 cursor-pointer"
                      loading="lazy"
                      onClick={() => src && window.open(src, '_blank')}
                      title="Click to view full size"
                      {...props}
                    />
                  ),
                }}
              >
                {message.content}
              </ReactMarkdown>
            </div>
          )}
        </div>

        {/* ── Timestamp + Actions ─────────────────────────────────── */}
        <div className={cn(
          'flex items-center gap-1.5 px-1',
          isUser ? 'flex-row-reverse' : 'flex-row',
        )}>
          {timeLabel && (
            <time dateTime={message.timestamp} className="text-[11px] text-muted-foreground">
              {timeLabel}
            </time>
          )}

          {!isUser && (
            <>
              {isSpanish && (
                <span
                  className="inline-flex items-center gap-1 rounded-full bg-green-100 dark:bg-green-900/30 px-2 py-0.5 text-[11px] font-medium text-green-700 dark:text-green-400"
                  aria-label="Response in Spanish"
                >
                  🇲🇽 ES
                </span>
              )}
              <CopyButton text={message.content} />
              <FeedbackButtons
                messageId={message.id}
                onThumbsUp={onThumbsUp}
                onThumbsDown={onThumbsDown}
              />
            </>
          )}
        </div>
      </div>

      {/* ── User Avatar ─────────────────────────────────────────── */}
      {isUser && (
        <div className="avatar-user mt-0.5" aria-hidden="true">
          You
        </div>
      )}
    </div>
  )
}
