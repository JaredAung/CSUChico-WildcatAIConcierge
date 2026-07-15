// ─── Chat & Messaging ─────────────────────────────────────────────────────────

/**
 * A single message in a conversation.
 * role: 'user' | 'assistant' mirrors the backend MessageRole enum.
 */
export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  /** Client-side only — ISO timestamp for display purposes */
  timestamp?: string
  /** Client-side only — unique message ID */
  id?: string
}

// ─── Source Citations ──────────────────────────────────────────────────────────

/**
 * A source document returned alongside an answer for attribution.
 * Mirrors the backend Source Pydantic model.
 */
export interface Source {
  title: string
  url: string
  /** Relevance score from the RAG retrieval step (0–1) */
  relevance_score?: number
  /** Short excerpt from the source document */
  excerpt?: string
}

// ─── Departments ──────────────────────────────────────────────────────────────

/**
 * A CSU Chico campus department.
 * Mirrors the backend Department Pydantic model.
 */
export interface Department {
  name: string
  description: string
  phone?: string
  email?: string
  website?: string
  location?: string
  hours?: string
}

// ─── Workflow Cards ────────────────────────────────────────────────────────────

/**
 * A single step in a multi-step workflow guide.
 * Mirrors the backend WorkflowStep Pydantic model.
 */
export interface WorkflowStep {
  step_number: number
  title: string
  description: string
  action_url?: string
  action_label?: string
  estimated_time?: string
  required_documents?: string[]
  tips?: string[]
}

/**
 * A workflow card containing a sequence of steps.
 * Mirrors the backend WorkflowCard Pydantic model.
 */
export interface WorkflowCard {
  workflow_type: string
  title: string
  description: string
  total_estimated_time?: string
  steps: WorkflowStep[]
  departments_involved?: Department[]
  notes?: string[]
}

// ─── API Request / Response ────────────────────────────────────────────────────

/**
 * Request body for POST /api/backend/chat.
 * Mirrors the backend ChatRequest Pydantic model.
 */
export interface ChatRequest {
  messages: ChatMessage[]
  session_id?: string
  /** Optional CSU Chico department context hint */
  department_context?: string
}

/**
 * Response from POST /api/backend/chat.
 * Mirrors the backend ChatResponse Pydantic model.
 */
export interface ChatResponse {
  answer: string
  sources: Source[]
  /** Populated when the query triggers a workflow */
  workflow_card?: WorkflowCard
  /** Related departments pulled from knowledge base */
  relevant_departments?: Department[]
  session_id: string
  /** Whether the response was generated in dev/mock mode */
  is_mock?: boolean
  /** Model identifier used for the response */
  model_used?: string
}

// ─── Knowledge Endpoints ───────────────────────────────────────────────────────

/**
 * Response from GET /api/backend/knowledge/suggested-questions
 */
export interface SuggestedQuestionsResponse {
  questions: string[]
}

/**
 * Response from GET /api/backend/knowledge/departments
 */
export interface DepartmentsResponse {
  departments: Department[]
}

// ─── UI State ─────────────────────────────────────────────────────────────────

/** Represents the loading/error state of an async operation */
export type AsyncStatus = 'idle' | 'loading' | 'success' | 'error'

/** Chat session state used by the UI */
export interface ChatSession {
  sessionId: string
  messages: ChatMessage[]
  status: AsyncStatus
  error?: string
}
