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
  RetrieveCommand,
} from '@aws-sdk/client-bedrock-agent-runtime'
import {
  BedrockRuntimeClient,
  ConverseCommand,
} from '@aws-sdk/client-bedrock-runtime'
import { AGENT_INSTRUCTIONS } from './prompt.mjs'

const BEDROCK_REGION =
  process.env.BEDROCK_REGION || process.env.AWS_REGION || 'us-west-2'
const KNOWLEDGE_BASE_ID = (process.env.BEDROCK_KNOWLEDGE_BASE_ID || '').trim()
const MODEL_ARN = (process.env.BEDROCK_MODEL_ARN || '').trim()
const CONVERSE_MODEL_ID = (
  process.env.CONVERSE_MODEL_ID || 'anthropic.claude-3-haiku-20240307-v1:0'
).trim()

const RAG_PROMPT_TEMPLATE = `${AGENT_INSTRUCTIONS}

Use the search results below — and only the search results below — to answer the user's question.

User question: $query$

$search_results$

Respond directly with the answer in markdown. Do not include any confidence scores, metadata, or preamble — just the helpful answer.`

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
let bedrockRuntimeClient

function getAgentRuntime() {
  if (!agentRuntimeClient) {
    agentRuntimeClient = new BedrockAgentRuntimeClient({ region: BEDROCK_REGION })
  }
  return agentRuntimeClient
}

function getBedrockRuntime() {
  if (!bedrockRuntimeClient) {
    bedrockRuntimeClient = new BedrockRuntimeClient({ region: BEDROCK_REGION })
  }
  return bedrockRuntimeClient
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

// ─── Citation Helper Functions ────────────────────────────────────────────────

/**
 * Normalize a URL for deduplication: trim trailing slashes.
 * @param {string} url
 * @returns {string}
 */
export function normalizeUrl(url) {
  if (typeof url !== 'string') return ''
  return url.replace(/\/+$/, '')
}

/**
 * Derive a short domain label from a URL.
 * Extracts hostname, removes `www.` prefix, takes first segment before first dot.
 * "https://www.csuchico.edu/path" → "csuchico"
 * "https://library.csuchico.edu/page" → "library"
 * @param {string} url
 * @returns {string}
 */
export function deriveDomainLabel(url) {
  if (typeof url !== 'string' || !url) return ''
  try {
    const hostname = new URL(url).hostname
    const withoutWww = hostname.replace(/^www\./, '')
    const firstSegment = withoutWww.split('.')[0]
    return firstSegment || ''
  } catch {
    return ''
  }
}

/**
 * Construct a text fragment URL from base URL and chunk text.
 * Appends #:~:text=<first 8 words URL-encoded> if chunk has ≥ 3 words
 * and URL has no existing fragment.
 * Returns base URL unchanged if chunk text < 3 words or URL already has a fragment.
 * Falls back to base URL on any error.
 * @param {string} baseUrl
 * @param {string} chunkText
 * @returns {string}
 */
export function buildTextFragment(baseUrl, chunkText) {
  if (typeof baseUrl !== 'string' || !baseUrl) return baseUrl || ''
  if (typeof chunkText !== 'string' || !chunkText) return baseUrl

  try {
    const parsed = new URL(baseUrl)
    // If URL already has a fragment, return as-is
    if (parsed.hash) return baseUrl

    const trimmed = chunkText.trim()
    const words = trimmed.split(/\s+/).filter(Boolean)

    // Need at least 3 words
    if (words.length < 3) return baseUrl

    const phrase = words.slice(0, 8).join(' ')
    const encoded = encodeURIComponent(phrase)
    return `${baseUrl}#:~:text=${encoded}`
  } catch {
    // URL parse error or encoding error — fall back to base URL
    return baseUrl
  }
}

/**
 * Process RetrieveAndGenerate citations with span data to inject [N] markers
 * into the answer text at the exact positions where citations apply.
 *
 * @param {string} answerText - Raw answer text from result.output.text
 * @param {Array} citations - result.citations from RetrieveAndGenerateCommand
 * @returns {{ annotatedAnswer: string, sources: Array }}
 */
export function extractCitationsFromRAG(answerText, citations) {
  if (!answerText || !Array.isArray(citations) || citations.length === 0) {
    return { annotatedAnswer: answerText || '', sources: [] }
  }

  const urlToIndex = new Map() // normalizedUrl → citation_index
  let nextIndex = 1
  const sources = []
  const seen = new Set() // dedup key

  // Collect marker insertions: { end: number, indices: Set<number> }
  const insertions = []

  for (const citation of citations) {
    const span = citation?.generatedResponsePart?.textResponsePart?.span
    const refs = citation?.retrievedReferences || []
    const citationIndices = new Set()

    for (const ref of refs) {
      const uri =
        ref.location?.s3Location?.uri ||
        ref.location?.webLocation?.url ||
        ref.location?.confluenceLocation?.url ||
        ref.location?.salesforceLocation?.url ||
        ref.location?.sharePointLocation?.url ||
        ''
      if (!uri) continue

      const normalized = normalizeUrl(uri)
      let idx = urlToIndex.get(normalized)
      if (idx === undefined) {
        idx = nextIndex++
        urlToIndex.set(normalized, idx)
      }
      citationIndices.add(idx)

      // Build source entry (only first occurrence per URL)
      const dedupeKey = normalized
      if (!seen.has(dedupeKey)) {
        seen.add(dedupeKey)
        const excerpt = String(ref.content?.text || '').trim()
        const metadataTitle =
          ref.metadata?.['x-amz-bedrock-kb-source-uri'] ||
          ref.metadata?.title ||
          ''
        const title =
          String(metadataTitle || '').trim() ||
          (uri ? uri.split('/').pop() : '') ||
          'Campus document'
        const scoreRaw = ref.metadata?.['x-amz-bedrock-kb-score']
        const score = Number(scoreRaw)
        const domainLabel = deriveDomainLabel(uri)
        const fragmentUrl = buildTextFragment(uri, excerpt)

        sources.push({
          title,
          url: fragmentUrl || uri,
          excerpt: excerpt ? excerpt.slice(0, 400) : undefined,
          citation_index: idx,
          chunk_text: excerpt ? excerpt.slice(0, 400) : '',
          domain_label: domainLabel,
          ...(Number.isFinite(score) ? { relevance_score: score } : {}),
        })
      }
    }

    // Record insertion point if we have span data and valid indices
    if (span && typeof span.end === 'number' && citationIndices.size > 0) {
      insertions.push({ end: span.end, indices: citationIndices })
    }
  }

  // Sort insertions by end position descending (right-to-left preserves offsets)
  insertions.sort((a, b) => b.end - a.end)

  // Inject [N] markers into the answer text
  let annotatedAnswer = answerText
  for (const { end, indices } of insertions) {
    const sortedIndices = [...indices].sort((a, b) => a - b)
    const markers = sortedIndices.map(i => `[${i}]`).join('')
    // Insert markers at the span.end position
    annotatedAnswer = annotatedAnswer.slice(0, end) + markers + annotatedAnswer.slice(end)
  }

  // Sort sources by citation_index
  sources.sort((a, b) => a.citation_index - b.citation_index)

  return { annotatedAnswer, sources }
}

// ──────────────────────────────────────────────────────────────────────────────

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

/** Map KB citation refs → frontend Source[] with enriched fields. */
function referencesToSources(citations) {
  const sources = []
  const seen = new Set()
  let citationIndex = 0

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

      citationIndex++
      const scoreRaw = ref.metadata?.['x-amz-bedrock-kb-score']
      const score = Number(scoreRaw)
      const domainLabel = deriveDomainLabel(uri)
      const fragmentUrl = buildTextFragment(uri, excerpt)

      sources.push({
        title,
        url: fragmentUrl || uri,
        excerpt: excerpt ? excerpt.slice(0, 400) : undefined,
        citation_index: citationIndex,
        chunk_text: excerpt ? excerpt.slice(0, 400) : '',
        domain_label: domainLabel,
        ...(Number.isFinite(score) ? { relevance_score: score } : {}),
      })
    }
  }
  return sources
}

// ─── File Upload: Retrieve + Converse Flow ───────────────────────────────────

/**
 * Handle chat requests with a file attachment using the Retrieve + Converse flow.
 *
 * 1. Calls RetrieveCommand to get relevant KB chunks for the user's text query
 * 2. Calls ConverseCommand with the user query, file content (multimodal), and retrieved context
 * 3. Returns the response in the standard ChatResponse format
 *
 * @param {string} query - The user's text query
 * @param {object} file - The file attachment { content: base64, mime_type: string, filename: string }
 * @param {string} sessionId - The session ID for continuity
 * @returns {Promise<object>} Lambda response object
 */
export async function handleFileChat(query, file, sessionId) {
  if (!KNOWLEDGE_BASE_ID) {
    return response(500, {
      detail:
        'BEDROCK_KNOWLEDGE_BASE_ID must be set for file upload support. Redeploy with the knowledge base parameter.',
    })
  }

  const TIMEOUT_MS = 30_000
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    // Step 1: Retrieve relevant KB chunks using the text query
    const retrieveResult = await getAgentRuntime().send(
      new RetrieveCommand({
        knowledgeBaseId: KNOWLEDGE_BASE_ID,
        retrievalQuery: { text: query },
        retrievalConfiguration: {
          vectorSearchConfiguration: {
            numberOfResults: 5,
          },
        },
      }),
      { abortSignal: controller.signal },
    )

    const retrievedChunks = retrieveResult.retrievalResults || []

    // Build context string from retrieved KB chunks
    const contextText = retrievedChunks
      .map((chunk, i) => {
        const text = chunk.content?.text || ''
        return `[Source ${i + 1}]: ${text}`
      })
      .filter(Boolean)
      .join('\n\n')

    // Step 2: Build ConverseCommand content blocks
    const userContentBlocks = []

    // Add the text query with retrieved context
    const textWithContext = contextText
      ? `Context from knowledge base:\n${contextText}\n\nUser question: ${query}`
      : query
    userContentBlocks.push({ text: textWithContext })

    // Add file content as a multimodal block
    const fileBytes = Buffer.from(file.content, 'base64')

    // Determine if the file is an image or a document
    const imageTypes = ['image/png', 'image/jpeg', 'image/gif', 'image/webp']
    const documentTypes = ['application/pdf']

    if (imageTypes.includes(file.mime_type)) {
      // Map mime_type to the format enum expected by Bedrock
      const formatMap = {
        'image/png': 'png',
        'image/jpeg': 'jpeg',
        'image/gif': 'gif',
        'image/webp': 'webp',
      }
      userContentBlocks.push({
        image: {
          format: formatMap[file.mime_type],
          source: { bytes: fileBytes },
        },
      })
    } else if (documentTypes.includes(file.mime_type)) {
      userContentBlocks.push({
        document: {
          format: 'pdf',
          name: (file.filename || 'document').replace(/[^a-zA-Z0-9_\-.]/g, '_'),
          source: { bytes: fileBytes },
        },
      })
    }

    // Step 3: Call ConverseCommand
    const converseResult = await getBedrockRuntime().send(
      new ConverseCommand({
        modelId: CONVERSE_MODEL_ID,
        messages: [
          {
            role: 'user',
            content: userContentBlocks,
          },
        ],
        system: [
          {
            text: 'You are the Wildcat AI Concierge for CSU Chico. Answer questions using the provided context and file content. Be helpful, accurate, and cite the knowledge base context when relevant.',
          },
        ],
      }),
      { abortSignal: controller.signal },
    )

    clearTimeout(timeout)

    // Step 4: Process the Converse response into ChatResponse format
    const outputMessage = converseResult.output?.message
    const answerText =
      outputMessage?.content
        ?.map(block => block.text || '')
        .join('') || ''

    // Build sources from the retrieved KB chunks
    const sources = referencesToSources(
      retrievedChunks.map(chunk => ({
        retrievedReferences: [
          {
            location: chunk.location,
            content: chunk.content,
            metadata: chunk.metadata,
          },
        ],
      })),
    )

    return response(200, {
      answer:
        answerText ||
        "I wasn't able to generate a response from the file. Please try again.",
      sources,
      session_id: sessionId,
      model_used: `bedrock-converse:${CONVERSE_MODEL_ID}`,
      is_mock: false,
    })
  } catch (err) {
    clearTimeout(timeout)

    if (err.name === 'AbortError' || controller.signal.aborted) {
      console.error('File analysis timed out', err)
      return response(504, {
        detail: 'File analysis timed out. Please try again with a simpler query or smaller file.',
      })
    }

    const code = err?.name || err?.Code || 'Error'
    const message = err?.message || String(err)
    console.error('File analysis failed', code, err)
    return response(502, {
      detail: `File analysis failed (${code}): ${message}`,
    })
  }
}

// ──────────────────────────────────────────────────────────────────────────────

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

  // Route to file upload flow if a valid file attachment is present
  if (body.file && body.file.content && body.file.mime_type) {
    return handleFileChat(query, body.file, sessionId)
  }

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

    const rawAnswer = String(result.output?.text || '').trim()
    const { annotatedAnswer, sources } = extractCitationsFromRAG(rawAnswer, result.citations)
    const answer = annotatedAnswer

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
