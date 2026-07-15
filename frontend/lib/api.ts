import type {
  ChatMessage,
  ChatRequest,
  ChatResponse,
  Department,
  DepartmentsResponse,
  SuggestedQuestionsResponse,
} from '@/lib/types'

// ─── Base Configuration ────────────────────────────────────────────────────────

const BASE_URL = '/api/backend'

const DEFAULT_TIMEOUT_MS = 30_000

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
 * Fetches suggested starter questions for the chat interface.
 *
 * @returns Array of question strings.
 * @throws  ApiError on non-2xx responses, or Error on network failure.
 */
export async function getSuggestedQuestions(): Promise<string[]> {
  let response: Response
  try {
    response = await fetchWithTimeout(
      `${BASE_URL}/knowledge/suggested-questions`,
      {
        method: 'GET',
        headers: { Accept: 'application/json' },
      },
    )
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new ApiError('Request timed out.', 408)
    }
    throw new ApiError('Unable to fetch suggested questions.')
  }

  const data = await parseResponse<SuggestedQuestionsResponse>(response)
  return data.questions
}

/**
 * Fetches the list of CSU Chico departments from the knowledge base.
 *
 * @returns Array of Department objects.
 * @throws  ApiError on non-2xx responses, or Error on network failure.
 */
export async function getDepartments(): Promise<Department[]> {
  let response: Response
  try {
    response = await fetchWithTimeout(
      `${BASE_URL}/knowledge/departments`,
      {
        method: 'GET',
        headers: { Accept: 'application/json' },
      },
    )
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new ApiError('Request timed out.', 408)
    }
    throw new ApiError('Unable to fetch departments.')
  }

  const data = await parseResponse<DepartmentsResponse>(response)
  return data.departments
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
