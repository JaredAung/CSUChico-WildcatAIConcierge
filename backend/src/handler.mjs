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

User question: $query$

$search_results$

$output_format_instructions$`

// Bedrock requires an orchestration template whenever the generation template is
// customized. It must contain $conversation_history$ and $output_format_instructions$.
const ORCHESTRATION_PROMPT_TEMPLATE = `Formulate a search query for the knowledge base based on the conversation history below, focused on retrieving information relevant to the latest message. If the user's message is not in English, translate the core intent into English for the search query.

$query$

$conversation_history$

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

function hasUserText(messages) {
  return (
    Array.isArray(messages) &&
    messages.some((msg) => msg?.role === 'user' && String(msg.content || '').trim())
  )
}

/**
 * Bedrock's RetrieveAndGenerate sessionId must be one Bedrock itself issued —
 * it rejects a client-generated ID. We don't track that server-side, so instead
 * fold the client's full message history into the query text on every call.
 */
function buildQueryText(messages) {
  if (!Array.isArray(messages)) return ''
  return messages
    .filter((msg) => msg?.role === 'user' || msg?.role === 'assistant')
    .map((msg) => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${String(msg.content || '').trim()}`)
    .filter((line) => line !== 'User:' && line !== 'Assistant:')
    .join('\n')
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

  if (!hasUserText(body?.messages)) {
    return response(400, {
      detail: 'Request must include a non-empty user message.',
    })
  }

  const sessionId = body.session_id || randomUUID()
  const query = buildQueryText(body.messages)

  try {
    const result = await getAgentRuntime().send(
      new RetrieveAndGenerateCommand({
        input: { text: query },
        retrieveAndGenerateConfiguration: {
          type: 'KNOWLEDGE_BASE',
          knowledgeBaseConfiguration: {
            knowledgeBaseId: KNOWLEDGE_BASE_ID,
            modelArn: MODEL_ARN,
            retrievalConfiguration: {
              vectorSearchConfiguration: {
                numberOfResults: 10,
              },
            },
            generationConfiguration: {
              promptTemplate: { textPromptTemplate: RAG_PROMPT_TEMPLATE },
            },
            orchestrationConfiguration: {
              promptTemplate: { textPromptTemplate: ORCHESTRATION_PROMPT_TEMPLATE },
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
      session_id: sessionId,
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
