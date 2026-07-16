/**
 * API Gateway → Lambda → Bedrock Agent (Node.js)
 *
 * GET  /api/v1/health
 * POST /api/v1/chat  (InvokeAgent — answer + citations; multi-turn via sessionId)
*/

import { randomUUID } from 'node:crypto'
import {
  BedrockAgentRuntimeClient,
  InvokeAgentCommand,
} from '@aws-sdk/client-bedrock-agent-runtime'

const BEDROCK_REGION =
  process.env.BEDROCK_REGION || process.env.AWS_REGION || 'us-west-2'
const AGENT_ID = (process.env.BEDROCK_AGENT_ID || '').trim()
const AGENT_ALIAS_ID = (process.env.BEDROCK_AGENT_ALIAS_ID || '').trim()

if (process.env.BEDROCK_API_KEY && !process.env.AWS_BEARER_TOKEN_BEDROCK) {
  process.env.AWS_BEARER_TOKEN_BEDROCK = process.env.BEDROCK_API_KEY
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': process.env.CORS_ALLOW_ORIGIN || '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization,Accept',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Content-Type': 'application/json',
}

const textDecoder = new TextDecoder('utf-8')

let agentClient

function getAgentRuntime() {
  if (!agentClient) {
    agentClient = new BedrockAgentRuntimeClient({ region: BEDROCK_REGION })
  }
  return agentClient
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

function lastUserText(messages) {
  if (!Array.isArray(messages)) return ''
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]
    if (msg?.role === 'user') {
      const text = String(msg.content || '').trim()
      if (text) return text
    }
  }
  return ''
}

/**
 * Map Agent / KB citation refs → frontend Source[].
 * Handles refs from both chunk.attribution (managed KB) and
 * knowledgeBaseLookupOutput (unstructured KB via trace).
 */
function referencesToSources(citations) {
  const sources = []
  const seen = new Set()

  for (const citation of citations || []) {
    for (const ref of citation.retrievedReferences || []) {
      const uri =
        ref.location?.s3Location?.uri ||
        ref.location?.webLocation?.url ||
        ref.location?.confluenceLocation?.url ||
        ref.location?.salesforceLocation?.url ||
        ref.location?.sharePointLocation?.url ||
        ''
      const excerpt = String(ref.content?.text || '').trim()
      const metadataTitle =
        ref.metadata?.['x-amz-bedrock-kb-source-uri'] ||
        ref.metadata?.title ||
        ''
      const title =
        String(metadataTitle || '').trim() ||
        (uri ? uri.split('/').pop() : '') ||
        'Campus document'
      const key = `${uri}|${title}|${excerpt.slice(0, 80)}`
      if (seen.has(key)) continue
      seen.add(key)

      const scoreRaw = ref.metadata?.['x-amz-bedrock-kb-score']
      const score = Number(scoreRaw)
      sources.push({
        title,
        url: uri,
        excerpt: excerpt ? excerpt.slice(0, 400) : undefined,
        ...(Number.isFinite(score) ? { relevance_score: score } : {}),
      })
    }
  }
  return sources
}

/**
 * Consume InvokeAgent completion stream: answer bytes + citations from both
 * chunk.attribution (managed KB) and trace observation (unstructured KB).
 */
async function consumeAgentCompletion(completion) {
  let answer = ''
  const citations = []

  if (!completion) {
    return { answer, citations }
  }

  for await (const event of completion) {
    // ── Path 1: managed KB — citations embedded in chunk attribution ──────────
    const chunk = event.chunk
    if (chunk?.bytes) {
      answer += textDecoder.decode(chunk.bytes)
    }
    const chunkCitations = chunk?.attribution?.citations
    if (Array.isArray(chunkCitations) && chunkCitations.length) {
      citations.push(...chunkCitations)
    }

    // ── Path 2: unstructured KB — citations in orchestration trace ────────────
    // Requires enableTrace: true on the InvokeAgentCommand call.
    // Raw retrievedReferences are wrapped into a citation-shaped object so
    // referencesToSources() can process both paths uniformly.
    const kbRefs =
      event.trace?.orchestrationTrace?.observation
        ?.knowledgeBaseLookupOutput?.retrievedReferences
    if (Array.isArray(kbRefs) && kbRefs.length) {
      citations.push({ retrievedReferences: kbRefs })
    }
  }

  return { answer: answer.trim(), citations }
}

async function handleChat(body) {
  if (!AGENT_ID || !AGENT_ALIAS_ID) {
    return response(500, {
      detail:
        'BEDROCK_AGENT_ID and BEDROCK_AGENT_ALIAS_ID must be set. Redeploy with agent parameters.',
    })
  }

  const query = lastUserText(body?.messages)
  if (!query) {
    return response(400, {
      detail: 'Request must include a non-empty user message.',
    })
  }

  const sessionId = body.session_id || randomUUID()

  try {
    const result = await getAgentRuntime().send(
      new InvokeAgentCommand({
        agentId: AGENT_ID,
        agentAliasId: AGENT_ALIAS_ID,
        sessionId,
        inputText: query,
        // enableTrace must be true to receive knowledgeBaseLookupOutput
        // events in the stream — required for unstructured KB citations.
        enableTrace: true,
      }),
    )

    const { answer, citations } = await consumeAgentCompletion(result.completion)
    const sources = referencesToSources(citations)

    return response(200, {
      answer:
        answer ||
        "I wasn't able to generate a response. Please try again.",
      sources,
      session_id: sessionId,
      model_used: `bedrock-agent:${AGENT_ID}`,
      is_mock: false,
    })
  } catch (err) {
    const code = err?.name || err?.Code || 'Error'
    const message = err?.message || String(err)
    console.error('InvokeAgent failed', code, err)
    return response(502, {
      detail: `Agent request failed (${code}): ${message}`,
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
      status: AGENT_ID && AGENT_ALIAS_ID ? 'ok' : 'misconfigured',
      region: BEDROCK_REGION,
      runtime: 'nodejs',
      agent_id: AGENT_ID || null,
      agent_alias_id: AGENT_ALIAS_ID || null,
      mode: 'agent',
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
