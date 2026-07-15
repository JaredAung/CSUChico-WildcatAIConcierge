/**
 * API Gateway → Lambda → Bedrock (Node.js)
 *
 * GET  /api/v1/health
 * POST /api/v1/chat
 */

import { randomUUID } from 'node:crypto'
import {
  BedrockRuntimeClient,
  ConverseCommand,
} from '@aws-sdk/client-bedrock-runtime'
import { SYSTEM_PROMPT } from './prompt.mjs'

// #Used_model_id — US inference profile (base anthropic.claude-sonnet-5 needs a profile)
const MODEL_ID = process.env.BEDROCK_MODEL_ID || 'us.anthropic.claude-sonnet-5'
const BEDROCK_REGION =
  process.env.BEDROCK_REGION || process.env.AWS_REGION || 'us-west-2'
const MAX_TOKENS = Number.parseInt(process.env.BEDROCK_MAX_TOKENS || '1024', 10)

if (process.env.BEDROCK_API_KEY && !process.env.AWS_BEARER_TOKEN_BEDROCK) {
  process.env.AWS_BEARER_TOKEN_BEDROCK = process.env.BEDROCK_API_KEY
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': process.env.CORS_ALLOW_ORIGIN || '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization,Accept',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Content-Type': 'application/json',
}

let bedrockClient

function getBedrock() {
  if (!bedrockClient) {
    bedrockClient = new BedrockRuntimeClient({ region: BEDROCK_REGION })
  }
  return bedrockClient
}

function response(statusCode, body) {
  return {
    statusCode,
    headers: CORS_HEADERS,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  }
}

function parseBody(event) {
  let raw = event.body || '{}'
  if (event.isBase64Encoded) {
    raw = Buffer.from(raw, 'base64').toString('utf8')
  }
  if (typeof raw === 'object' && raw !== null) return raw
  return raw ? JSON.parse(raw) : {}
}

function normalizePath(event) {
  let path = event.rawPath || event.path || '/'
  for (const prefix of ['/Prod', '/Stage', '/prod', '/stage']) {
    if (path === prefix || path.startsWith(`${prefix}/`)) {
      path = path.slice(prefix.length) || '/'
      break
    }
  }
  return path
}

function methodOf(event) {
  return (
    event.requestContext?.http?.method ||
    event.httpMethod ||
    'GET'
  ).toUpperCase()
}

function toBedrockMessages(messages) {
  const converted = []
  for (const msg of messages) {
    const role = msg?.role
    const content = String(msg?.content || '').trim()
    if ((role !== 'user' && role !== 'assistant') || !content) continue
    converted.push({
      role,
      content: [{ text: content }],
    })
  }

  while (converted.length && converted[0].role !== 'user') {
    converted.shift()
  }

  const merged = []
  for (const msg of converted) {
    const last = merged[merged.length - 1]
    if (last && last.role === msg.role) {
      last.content.push(...msg.content)
    } else {
      merged.push(msg)
    }
  }
  return merged
}

function extractText(converseResponse) {
  const parts = converseResponse?.output?.message?.content || []
  const texts = parts
    .filter((p) => p && typeof p.text === 'string')
    .map((p) => p.text)
  return (
    texts.join('\n').trim() ||
    "I wasn't able to generate a response. Please try again."
  )
}

async function handleChat(body) {
  const messages = body?.messages
  if (!Array.isArray(messages) || messages.length === 0) {
    return response(400, {
      detail: 'Request must include a non-empty messages array.',
    })
  }

  const sessionId = body.session_id || randomUUID()
  const bedrockMessages = toBedrockMessages(messages)
  if (!bedrockMessages.length) {
    return response(400, { detail: 'No valid user/assistant messages found.' })
  }

  try {
    const result = await getBedrock().send(
      new ConverseCommand({
        modelId: MODEL_ID,
        system: [{ text: SYSTEM_PROMPT }],
        messages: bedrockMessages,
        // Claude Sonnet 5 rejects temperature (deprecated for this model).
        inferenceConfig: {
          maxTokens: MAX_TOKENS,
        },
      }),
    )

    return response(200, {
      answer: extractText(result),
      sources: [],
      session_id: sessionId,
      model_used: MODEL_ID,
      is_mock: false,
    })
  } catch (err) {
    const code = err?.name || err?.Code || 'Error'
    const message = err?.message || String(err)
    console.error('Bedrock invocation failed', code, err)
    return response(502, {
      detail: `Bedrock request failed (${code}): ${message}`,
    })
  }
}

export async function handler(event) {
  const method = methodOf(event)
  const path = normalizePath(event)
  console.log('request', method, path)

  if (method === 'OPTIONS') {
    return response(200, { ok: true })
  }

  if (method === 'GET' && (path === '/api/v1/health' || path === '/health')) {
    return response(200, {
      status: 'ok',
      model: MODEL_ID,
      region: BEDROCK_REGION,
      runtime: 'nodejs',
    })
  }

  if (method === 'POST' && path.endsWith('/chat')) {
    try {
      const body = parseBody(event)
      return await handleChat(body)
    } catch (err) {
      if (err instanceof SyntaxError) {
        return response(400, { detail: 'Invalid JSON body.' })
      }
      throw err
    }
  }

  return response(404, { detail: `Not found: ${method} ${path}` })
}
