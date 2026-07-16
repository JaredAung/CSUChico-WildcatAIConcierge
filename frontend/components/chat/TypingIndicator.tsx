'use client'

// ─── TypingIndicator ──────────────────────────────────────────────────────────
// Animated three-dot typing indicator shown while the assistant is responding.

export function TypingIndicator() {
  return (
    <div
      role="status"
      aria-label="Wildcat Navigator is typing"
      aria-live="polite"
      className="flex items-center gap-1 px-4 py-3"
    >
      <span className="sr-only">Wildcat Navigator is typing…</span>
      <span className="typing-dot" aria-hidden="true" />
      <span className="typing-dot" aria-hidden="true" />
      <span className="typing-dot" aria-hidden="true" />
    </div>
  )
}
