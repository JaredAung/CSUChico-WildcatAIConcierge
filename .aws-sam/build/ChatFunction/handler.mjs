/**
 * API Gateway → Lambda → Bedrock Knowledge Base (Node.js)
 *
 * GET  /api/v1/health
 * POST /api/v1/chat  (RetrieveAndGenerate — answer + citations; multi-turn via sessionId)
 */

import { randomUUID } from 'node:crypto'
import {
  BedrockAgentRuntimeClient,
  RetrieveAndGenerateCommand,
} from '@aws-sdk/client-bedrock-agent-runtime'
import { AGENT_INSTRUCTIONS } from './prompt.mjs'

const BEDROCK_REGION =
  process.env.BEDROCK_REGION || process.env.AWS_REGION || 'us-west-2'
const KNOWLEDGE_BASE_ID = (process.env.BEDROCK_KNOWLEDGE_BASE_ID || '').trim()
const MODEL_ARN = (process.env.BEDROCK_MODEL_ARN || '').trim()

const RAG_PROMPT_TEMPLATE = `${AGENT_INSTRUCTIONS}

Use the search results below — and only the search results below — to answer the user's question.

$search_results$

$output_format_instructions$`

if (process.env.BEDROCK_API_KEY && !process.env.AWS_BEARER_TOKEN_BEDROCK) {
  process.env.AWS_BEARER_TOKEN_BEDROCK = process.env.BEDROCK_API_KEY
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': process.env.CORS_ALLOW_ORIGIN || '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization,Accept',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Content-Type': 'application/json',
}

let agentRuntimeClient

function getAgentRuntime() {
  if (!agentRuntimeClient) {
    agentRuntimeClient = new BedrockAgentRuntimeClient({ region: BEDROCK_REGION })
  }
  return agentRuntimeClient
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

/** Map KB citation refs → frontend Source[]. */
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

async function handleChat(body) {
  if (!KNOWLEDGE_BASE_ID || !MODEL_ARN) {
    return response(500, {
      detail:
        'BEDROCK_KNOWLEDGE_BASE_ID and BEDROCK_MODEL_ARN must be set. Redeploy with knowledge base parameters.',
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
      new RetrieveAndGenerateCommand({
        input: { text: query },
        // Omit sessionId on the first turn — Bedrock rejects a client-generated
        // sessionId it hasn't issued itself; it returns its own on first call.
        ...(body.session_id ? { sessionId: body.session_id } : {}),
        retrieveAndGenerateConfiguration: {
          type: 'KNOWLEDGE_BASE',
          knowledgeBaseConfiguration: {
            knowledgeBaseId: KNOWLEDGE_BASE_ID,
            modelArn: MODEL_ARN,
            generationConfiguration: {
              promptTemplate: { textPromptTemplate: RAG_PROMPT_TEMPLATE },
            },
          },
        },
      }),
    )

    const answer = String(result.output?.text || '').trim()
    const sources = referencesToSources(result.citations)

    return response(200, {
      answer:
        answer ||
        "I wasn't able to generate a response. Please try again.",
      sources,
      session_id: result.sessionId || sessionId,
      model_used: `bedrock-kb:${KNOWLEDGE_BASE_ID}`,
      is_mock: false,
    })
  } catch (err) {
    const code = err?.name || err?.Code || 'Error'
    const message = err?.message || String(err)
    console.error('RetrieveAndGenerate failed', code, err)
    return response(502, {
      detail: `Knowledge base request failed (${code}): ${message}`,
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
      status: KNOWLEDGE_BASE_ID && MODEL_ARN ? 'ok' : 'misconfigured',
      region: BEDROCK_REGION,
      runtime: 'nodejs',
      knowledge_base_id: KNOWLEDGE_BASE_ID || null,
      model_arn: MODEL_ARN || null,
      mode: 'retrieve-and-generate',
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
