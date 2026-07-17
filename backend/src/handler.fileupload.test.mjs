/**
 * Integration tests for the backend handleFileChat function (file upload flow).
 * Tests the full Retrieve + Converse flow with mocked AWS SDK clients.
 *
 * Validates: Requirements 6.4, 6.5, 6.7
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock the AWS SDK modules before importing handler
const mockAgentSend = vi.fn()
const mockBedrockSend = vi.fn()

vi.mock('@aws-sdk/client-bedrock-agent-runtime', () => ({
  BedrockAgentRuntimeClient: vi.fn().mockImplementation(() => ({
    send: mockAgentSend,
  })),
  RetrieveAndGenerateCommand: vi.fn(),
  RetrieveCommand: vi.fn().mockImplementation((params) => params),
}))

vi.mock('@aws-sdk/client-bedrock-runtime', () => ({
  BedrockRuntimeClient: vi.fn().mockImplementation(() => ({
    send: mockBedrockSend,
  })),
  ConverseCommand: vi.fn().mockImplementation((params) => params),
}))

// Set KNOWLEDGE_BASE_ID before importing the module
const originalEnv = { ...process.env }

describe('handleFileChat integration', () => {
  let handleFileChat

  beforeEach(async () => {
    vi.resetModules()
    mockAgentSend.mockReset()
    mockBedrockSend.mockReset()
  })

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  async function importHandler(envOverrides = {}) {
    // Set environment before importing module (module reads env at load time)
    process.env = {
      ...originalEnv,
      BEDROCK_REGION: 'us-west-2',
      BEDROCK_KNOWLEDGE_BASE_ID: 'test-kb-id',
      BEDROCK_MODEL_ARN: 'arn:aws:bedrock:us-west-2::foundation-model/test',
      CONVERSE_MODEL_ID: 'anthropic.claude-3-haiku-20240307-v1:0',
      ...envOverrides,
    }

    const mod = await import('./handler.mjs')
    handleFileChat = mod.handleFileChat
  }

  describe('returns 500 when KNOWLEDGE_BASE_ID is not set', () => {
    it('returns 500 with appropriate error message', async () => {
      await importHandler({ BEDROCK_KNOWLEDGE_BASE_ID: '' })

      const result = await handleFileChat(
        'What is in this image?',
        { content: 'dGVzdA==', mime_type: 'image/png', filename: 'test.png' },
        'session-abc'
      )

      expect(result.statusCode).toBe(500)
      const body = JSON.parse(result.body)
      expect(body.detail).toContain('BEDROCK_KNOWLEDGE_BASE_ID')
    })
  })

  describe('handles timeout (AbortError)', () => {
    it('returns 504 when the request times out', async () => {
      await importHandler()

      // Mock the agent send to reject with AbortError
      const abortError = new DOMException('The operation was aborted', 'AbortError')
      mockAgentSend.mockRejectedValueOnce(abortError)

      const result = await handleFileChat(
        'Analyze this document',
        { content: 'dGVzdA==', mime_type: 'application/pdf', filename: 'doc.pdf' },
        'session-timeout'
      )

      expect(result.statusCode).toBe(504)
      const body = JSON.parse(result.body)
      expect(body.detail).toContain('timed out')
    })
  })

  describe('handles general errors', () => {
    it('returns 502 when RetrieveCommand throws a generic error', async () => {
      await importHandler()

      // Mock the agent send to reject with a generic error
      const genericError = new Error('Service unavailable')
      genericError.name = 'ServiceUnavailableException'
      mockAgentSend.mockRejectedValueOnce(genericError)

      const result = await handleFileChat(
        'What does this say?',
        { content: 'dGVzdA==', mime_type: 'image/jpeg', filename: 'photo.jpg' },
        'session-error'
      )

      expect(result.statusCode).toBe(502)
      const body = JSON.parse(result.body)
      expect(body.detail).toContain('File analysis failed')
      expect(body.detail).toContain('ServiceUnavailableException')
    })

    it('returns 502 when ConverseCommand throws a generic error', async () => {
      await importHandler()

      // RetrieveCommand succeeds
      mockAgentSend.mockResolvedValueOnce({
        retrievalResults: [
          {
            content: { text: 'Some relevant KB content here' },
            location: { webLocation: { url: 'https://www.csuchico.edu/info' } },
          },
        ],
      })

      // ConverseCommand fails
      const converseError = new Error('Model throttled')
      converseError.name = 'ThrottlingException'
      mockBedrockSend.mockRejectedValueOnce(converseError)

      const result = await handleFileChat(
        'Explain this image',
        { content: 'dGVzdA==', mime_type: 'image/png', filename: 'chart.png' },
        'session-converse-error'
      )

      expect(result.statusCode).toBe(502)
      const body = JSON.parse(result.body)
      expect(body.detail).toContain('File analysis failed')
      expect(body.detail).toContain('ThrottlingException')
    })
  })

  describe('successful flow', () => {
    it('returns 200 with valid ChatResponse shape for image file', async () => {
      await importHandler()

      // Mock RetrieveCommand success
      mockAgentSend.mockResolvedValueOnce({
        retrievalResults: [
          {
            content: { text: 'CSU Chico offers many programs for students' },
            location: { webLocation: { url: 'https://www.csuchico.edu/programs' } },
            metadata: { title: 'Programs' },
          },
          {
            content: { text: 'The admissions office handles applications' },
            location: { webLocation: { url: 'https://www.csuchico.edu/admissions' } },
            metadata: { title: 'Admissions' },
          },
        ],
      })

      // Mock ConverseCommand success
      mockBedrockSend.mockResolvedValueOnce({
        output: {
          message: {
            content: [
              { text: 'Based on the image and knowledge base, CSU Chico has great programs.' },
            ],
          },
        },
      })

      const result = await handleFileChat(
        'What programs are shown in this image?',
        { content: 'aW1hZ2VkYXRh', mime_type: 'image/png', filename: 'programs.png' },
        'session-success'
      )

      expect(result.statusCode).toBe(200)
      const body = JSON.parse(result.body)

      // Verify ChatResponse shape
      expect(body).toHaveProperty('answer')
      expect(body.answer).toBe('Based on the image and knowledge base, CSU Chico has great programs.')
      expect(body).toHaveProperty('sources')
      expect(Array.isArray(body.sources)).toBe(true)
      expect(body).toHaveProperty('session_id', 'session-success')
      expect(body).toHaveProperty('model_used')
      expect(body.model_used).toContain('bedrock-converse:')
      expect(body).toHaveProperty('is_mock', false)

      // Sources should be populated from retrieved chunks
      expect(body.sources.length).toBeGreaterThan(0)
      expect(body.sources[0]).toHaveProperty('title')
      expect(body.sources[0]).toHaveProperty('url')
    })

    it('returns 200 with valid ChatResponse shape for PDF file', async () => {
      await importHandler()

      // Mock RetrieveCommand success
      mockAgentSend.mockResolvedValueOnce({
        retrievalResults: [
          {
            content: { text: 'Academic calendar information for fall semester' },
            location: { webLocation: { url: 'https://www.csuchico.edu/calendar' } },
            metadata: { title: 'Academic Calendar' },
          },
        ],
      })

      // Mock ConverseCommand success
      mockBedrockSend.mockResolvedValueOnce({
        output: {
          message: {
            content: [
              { text: 'The document shows the academic calendar for Fall 2024.' },
            ],
          },
        },
      })

      const result = await handleFileChat(
        'What dates are in this PDF?',
        { content: 'JVBERi0xLjQ=', mime_type: 'application/pdf', filename: 'calendar.pdf' },
        'session-pdf'
      )

      expect(result.statusCode).toBe(200)
      const body = JSON.parse(result.body)

      expect(body.answer).toBe('The document shows the academic calendar for Fall 2024.')
      expect(body.sources).toHaveLength(1)
      expect(body.sources[0].title).toBe('Academic Calendar')
      expect(body.session_id).toBe('session-pdf')
      expect(body.is_mock).toBe(false)
    })

    it('returns fallback answer when Converse returns empty content', async () => {
      await importHandler()

      // Mock RetrieveCommand success with empty results
      mockAgentSend.mockResolvedValueOnce({
        retrievalResults: [],
      })

      // Mock ConverseCommand with empty response
      mockBedrockSend.mockResolvedValueOnce({
        output: {
          message: {
            content: [],
          },
        },
      })

      const result = await handleFileChat(
        'What is this?',
        { content: 'dGVzdA==', mime_type: 'image/gif', filename: 'animation.gif' },
        'session-empty'
      )

      expect(result.statusCode).toBe(200)
      const body = JSON.parse(result.body)
      expect(body.answer).toContain("wasn't able to generate a response")
      expect(body.sources).toEqual([])
    })
  })
})
