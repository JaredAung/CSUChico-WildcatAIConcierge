/**
 * Integration tests for end-to-end navigation flow in handleChat.
 * Tests the full pipeline with mocked Bedrock clients.
 *
 * Validates: Requirements 2.2, 3.3, 4.1
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// We need to mock the AWS SDK clients before importing the handler.
// The handler creates clients lazily, so we mock at the module level.

// Mock the Bedrock Agent Runtime (RetrieveCommand)
vi.mock('@aws-sdk/client-bedrock-agent-runtime', () => {
  const mockSend = vi.fn()
  return {
    BedrockAgentRuntimeClient: vi.fn(() => ({ send: mockSend })),
    RetrieveCommand: vi.fn((params) => ({ _type: 'Retrieve', params })),
    __mockAgentSend: mockSend,
  }
})

// Mock the Bedrock Runtime (ConverseCommand)
vi.mock('@aws-sdk/client-bedrock-runtime', () => {
  const mockSend = vi.fn()
  return {
    BedrockRuntimeClient: vi.fn(() => ({ send: mockSend })),
    ConverseCommand: vi.fn((params) => ({ _type: 'Converse', params })),
    __mockBedrockSend: mockSend,
  }
})

// Import the mocks so we can configure them per-test
const { __mockAgentSend: mockAgentSend } = await import('@aws-sdk/client-bedrock-agent-runtime')
const { __mockBedrockSend: mockBedrockSend } = await import('@aws-sdk/client-bedrock-runtime')

describe('handleChat integration — navigation flow', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    // Set required env vars
    process.env.BEDROCK_KNOWLEDGE_BASE_ID = 'test-kb-123'
    process.env.CONVERSE_MODEL_ID = 'anthropic.claude-3-haiku-20240307-v1:0'
    process.env.BEDROCK_REGION = 'us-west-2'

    // Default mock: retrieveChunks returns some chunks
    mockAgentSend.mockResolvedValue({
      retrievalResults: [
        {
          content: { text: 'Meriam Library is located on the north side of campus.' },
          location: { type: 'WEB', webLocation: { url: 'https://www.csuchico.edu/library' } },
          metadata: { title: 'Meriam Library' },
        },
      ],
    })

    // Default mock: converseWithModel returns basic text
    mockBedrockSend.mockResolvedValue({
      output: {
        message: {
          content: [{ text: 'The library is open 7am-11pm.' }],
        },
      },
    })
  })

  afterEach(() => {
    process.env = { ...originalEnv }
    vi.clearAllMocks()
  })

  it('chat request with user_location includes proximity context in system prompt', async () => {
    // Import handler fresh to pick up mocked clients
    const { handler } = await import('./handler.mjs')

    const event = {
      httpMethod: 'POST',
      path: '/api/v1/chat',
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'Where is the nearest coffee shop?' }],
        user_location: { latitude: 39.73, longitude: -121.79 },
      }),
    }

    await handler(event)

    // The ConverseCommand should have been called with a system prompt
    // containing the user's lat/lng
    expect(mockBedrockSend).toHaveBeenCalled()
    const converseCall = mockBedrockSend.mock.calls[0][0]
    const systemPrompt = converseCall.params.system[0].text

    expect(systemPrompt).toContain('latitude 39.73')
    expect(systemPrompt).toContain('longitude -121.79')
    expect(systemPrompt).toContain('prefer nearby options')
  })

  it('LLM response with [[NAV:...]] returns navigation field and stripped text', async () => {
    // Mock the LLM to return a response with a navigation marker
    mockBedrockSend.mockResolvedValue({
      output: {
        message: {
          content: [{ text: 'The library is north of the student union.\n[[NAV:Meriam Library]]' }],
        },
      },
    })

    const { handler } = await import('./handler.mjs')

    const event = {
      httpMethod: 'POST',
      path: '/api/v1/chat',
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'How do I get to the library?' }],
      }),
    }

    const result = await handler(event)
    const body = JSON.parse(result.body)

    // Navigation field should have wants_directions: true
    expect(body.navigation).toEqual({
      wants_directions: true,
      destination_name: 'Meriam Library',
    })

    // Answer should not contain the marker
    expect(body.answer).not.toContain('[[NAV:')
    expect(body.answer).not.toContain(']]')
    expect(body.answer).toContain('The library is north of the student union.')
  })

  it('LLM response without marker returns wants_directions: false', async () => {
    // Mock the LLM to return a response without any navigation marker
    mockBedrockSend.mockResolvedValue({
      output: {
        message: {
          content: [{ text: 'Library hours are 7am-11pm.' }],
        },
      },
    })

    const { handler } = await import('./handler.mjs')

    const event = {
      httpMethod: 'POST',
      path: '/api/v1/chat',
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'What are the library hours?' }],
      }),
    }

    const result = await handler(event)
    const body = JSON.parse(result.body)

    // Navigation field should indicate no directions
    expect(body.navigation).toEqual({
      wants_directions: false,
      destination_name: '',
    })
  })

  it('chat request without user_location does not include proximity context', async () => {
    const { handler } = await import('./handler.mjs')

    const event = {
      httpMethod: 'POST',
      path: '/api/v1/chat',
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'Tell me about parking.' }],
      }),
    }

    await handler(event)

    // The system prompt should NOT contain proximity context
    const converseCall = mockBedrockSend.mock.calls[0][0]
    const systemPrompt = converseCall.params.system[0].text

    expect(systemPrompt).not.toContain('User\'s current location')
    expect(systemPrompt).not.toContain('latitude')
    expect(systemPrompt).not.toContain('longitude')
    expect(systemPrompt).not.toContain('prefer nearby options')
  })
})
