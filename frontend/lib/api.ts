import type { ChatMessage, ChatRequest, ChatResponse } from '@/lib/types'

// ─── Base Configuration ────────────────────────────────────────────────────────

/**
 * Browser calls same-origin `/api/backend/*`, which Next.js rewrites to
 * `BACKEND_URL/api/v1/*` (API Gateway after deploy, or local SAM on :8001).
 */
const BASE_URL = '/api/backend'

/** Bedrock round-trips can approach API Gateway's ~29s limit. */
const DEFAULT_TIMEOUT_MS = 55_000

// ─── Internal Helpers ──────────────────────────────────────────────────────────

/**
 * Wraps fetch with a timeout. Throws a DOMException with name 'AbortError'
 * if the request exceeds timeoutMs.
 */
async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, { ...options, signal: controller.signal })
    return response
  } finally {
    clearTimeout(timeoutId)
  }
}

/**
 * Parses a Response as JSON. Throws a descriptive ApiError on non-2xx status.
 */
async function parseResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let detail = `HTTP ${response.status}: ${response.statusText}`
    try {
      const body = await response.json()
      if (body?.detail) detail = String(body.detail)
    } catch {
      // ignore parse errors on error body
    }
    throw new ApiError(detail, response.status)
  }
  return response.json() as Promise<T>
}

// ─── ApiError ─────────────────────────────────────────────────────────────────

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

// ─── Public API Functions ──────────────────────────────────────────────────────

/**
 * Sends a chat message (with full history) to the backend.
 *
 * @param messages  Full conversation history including the new user message.
 * @param sessionId Optional session ID for conversation continuity.
 * @returns         The assistant's ChatResponse.
 * @throws          ApiError on non-2xx responses, or Error on network failure.
 */
export async function sendMessage(
  messages: ChatMessage[],
  sessionId?: string,
): Promise<ChatResponse> {
  const body: ChatRequest = {
    messages,
    ...(sessionId ? { session_id: sessionId } : {}),
  }

  let response: Response
  try {
    response = await fetchWithTimeout(
      `${BASE_URL}/chat`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(body),
      },
      DEFAULT_TIMEOUT_MS,
    )
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new ApiError('Request timed out. Please try again.', 408)
    }
    throw new ApiError(
      'Unable to reach the server. Check your connection and try again.',
    )
  }

  return parseResponse<ChatResponse>(response)
}

/**
 * Checks backend health. Returns true if the backend is reachable and healthy.
 */
export async function checkHealth(): Promise<boolean> {
  try {
    const response = await fetchWithTimeout(
      `${BASE_URL}/health`,
      { method: 'GET' },
      5_000,
    )
    return response.ok
  } catch {
    return false
  }
}

/**
 * Fetches suggested questions from the backend.
 * Returns an empty array on failure (caller should fall back to defaults).
 */
export async function getSuggestedQuestions(): Promise<string[]> {
  try {
    const response = await fetchWithTimeout(
      `${BASE_URL}/suggested-questions`,
      { method: 'GET' },
      5_000,
    )
    if (!response.ok) return []
    const data = await response.json()
    return Array.isArray(data?.questions) ? data.questions : []
  } catch {
    return []
  }
}
