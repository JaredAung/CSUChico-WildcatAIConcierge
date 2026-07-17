/**
 * API Gateway → Lambda → Bedrock Knowledge Base (Node.js)
 *
 * GET  /api/v1/health
 * POST /api/v1/chat  (Retrieve + Converse — answer + citations; multi-turn via sessionId)
 */

import { randomUUID } from 'node:crypto'
import {
  BedrockAgentRuntimeClient,
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
 * Check whether a URL is a valid HTTP or HTTPS URL.
 * Used to filter out S3 URIs, empty strings, and other non-HTTP URLs from sources.
 * @param {string} url
 * @returns {boolean}
 */
export function isHttpUrl(url) {
  if (typeof url !== 'string') return false
  return url.startsWith('http://') || url.startsWith('https://')
}

/**
 * Strip trailing LLM-generated reference sections from the answer text.
 * Matches variants: "References", "Sources", "📌 References", "Referencias"
 * with optional heading markers (#, ##, ###).
 *
 * @param {string} answer - The answer text possibly containing a reference section
 * @returns {string} Answer with reference section removed
 */
export function stripReferenceSection(answer) {
  if (typeof answer !== 'string' || !answer) return answer || ''
  return answer.replace(/\n+#{0,3}\s*(?:📌\s*)?(?:References|Sources|Referencias)\s*[\n:].*/si, '').trimEnd()
}

/**
 * Extract the retrieval query from the conversation messages.
 * Uses only the latest user message content for the knowledge base search.
 *
 * @param {Array<{role: string, content: string}>} messages
 * @returns {string} The latest user message text, trimmed
 */
export function extractRetrievalQuery(messages) {
  if (!Array.isArray(messages)) return ''
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]
    if (msg?.role === 'user' && typeof msg.content === 'string') {
      return msg.content.trim()
    }
  }
  return ''
}

/**
 * Construct the numbered context string to inject into the Converse prompt.
 * Format: "[Source 1]: <chunk text>\n\n[Source 2]: <chunk text>\n\n..."
 *
 * @param {Array} chunks - Raw retrieval results from RetrieveCommand
 * @returns {string} Formatted context block (empty string if no chunks)
 */
export function buildContextBlock(chunks) {
  if (!Array.isArray(chunks) || chunks.length === 0) return ''
  return chunks
    .map((chunk, i) => `[Source ${i + 1}]: ${chunk.content?.text || ''}`)
    .join('\n\n')
}

/**
 * Build the sources array from retrieved KB chunks.
 * Deduplicates by normalized URL. Assigns citation_index matching the chunk's
 * 1-based position. Populates title, url, domain_label, chunk_text, excerpt.
 *
 * @param {Array} chunks - Raw retrieval results from RetrieveCommand
 * @returns {Array<Source>} Deduplicated, enriched source objects
 */
export function buildSources(chunks) {
  if (!Array.isArray(chunks) || chunks.length === 0) return []

  const seen = new Map() // normalizedUrl → source object
  const sources = []

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i]
    const citationIndex = i + 1

    // Resolve the URL: prefer web location, fall back to S3 metadata
    let url = ''
    const location = chunk?.location || {}
    if (location.type === 'WEB' && location.webLocation?.url) {
      url = location.webLocation.url
    } else if (location.type === 'S3' || location.s3Location?.uri) {
      // For S3 URIs, fall back to metadata web URL fields
      const metadata = chunk?.metadata || {}
      const metaSourceUrl = metadata.source_url || ''
      const metaBedrockUri = metadata['x-amz-bedrock-kb-source-uri'] || ''
      if (metaSourceUrl.startsWith('http')) {
        url = metaSourceUrl
      } else if (metaBedrockUri.startsWith('http')) {
        url = metaBedrockUri
      } else {
        url = location.s3Location?.uri || ''
      }
    } else {
      // Fallback: try metadata fields
      const metadata = chunk?.metadata || {}
      url = metadata.source_url || metadata['x-amz-bedrock-kb-source-uri'] || ''
    }

    // Filter out non-HTTP URLs (S3 URIs, empty strings, etc.)
    if (!isHttpUrl(url)) continue

    // Deduplicate by normalized URL — keep the first occurrence
    const normalized = normalizeUrl(url)
    if (normalized && seen.has(normalized)) continue
    if (normalized) seen.set(normalized, true)

    // Extract chunk text
    const chunkText = String(chunk?.content?.text || '').trim()
    const truncatedText = chunkText.slice(0, 400)

    // Resolve title: metadata title → last path segment → fallback
    const metadata = chunk?.metadata || {}
    const metaTitle = String(metadata.title || '').trim()
    let title = metaTitle
    if (!title && url) {
      try {
        const pathname = new URL(url).pathname
        const lastSegment = pathname.split('/').filter(Boolean).pop() || ''
        title = lastSegment
      } catch {
        title = ''
      }
    }
    if (!title) title = 'Campus document'

    // Derive domain label
    const domainLabel = deriveDomainLabel(url)

    // Relevance score
    const scoreRaw = metadata['x-amz-bedrock-kb-score'] ?? chunk?.score
    const score = Number(scoreRaw)

    sources.push({
      title,
      url,
      citation_index: citationIndex,
      chunk_text: truncatedText,
      domain_label: domainLabel,
      excerpt: truncatedText,
      ...(Number.isFinite(score) ? { relevance_score: score } : {}),
    })
  }

  return sources
}

/**
 * Transform the client message history into Bedrock Converse API format.
 * - Prior user/assistant turns become message objects with {role, content: [{text}]}
 * - The final user message is augmented with the KB context block
 * - Converse API requires messages to alternate user/assistant (we ensure this)
 *
 * @param {Array<{role: string, content: string}>} messages - Client message history
 * @param {string} contextBlock - Numbered context from KB retrieval
 * @returns {Array} Messages array conforming to Bedrock Converse API
 */
export function buildConverseMessages(messages, contextBlock) {
  if (!Array.isArray(messages) || messages.length === 0) return []

  // Filter to only user/assistant roles
  const filtered = messages.filter(
    (msg) => msg?.role === 'user' || msg?.role === 'assistant'
  )

  if (filtered.length === 0) return []

  // Ensure alternating roles by merging consecutive same-role messages
  const alternating = []
  for (const msg of filtered) {
    const last = alternating[alternating.length - 1]
    if (last && last.role === msg.role) {
      // Merge with previous message of the same role
      last.content = `${last.content}\n${String(msg.content || '')}`
    } else {
      alternating.push({ role: msg.role, content: String(msg.content || '') })
    }
  }

  // Transform into Converse API format
  return alternating.map((msg, i) => {
    const isLastUser = msg.role === 'user' && i === alternating.length - 1
    let text = msg.content

    // Augment the final user message with context block if available
    if (isLastUser && contextBlock) {
      text = `Context from knowledge base:\n${contextBlock}\n\nUser question: ${msg.content}`
    }

    return {
      role: msg.role,
      content: [{ text }],
    }
  })
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
      let uri =
        ref.location?.webLocation?.url ||
        ref.location?.confluenceLocation?.url ||
        ref.location?.salesforceLocation?.url ||
        ref.location?.sharePointLocation?.url ||
        ref.location?.s3Location?.uri ||
        ''

      // Metadata web URL fallback for S3 URIs
      if (uri.startsWith('s3://')) {
        const metaSourceUrl = ref.metadata?.source_url || ''
        const metaBedrockUri = ref.metadata?.['x-amz-bedrock-kb-source-uri'] || ''
        if (metaSourceUrl.startsWith('http')) {
          uri = metaSourceUrl
        } else if (metaBedrockUri.startsWith('http')) {
          uri = metaBedrockUri
        }
      }

      if (!isHttpUrl(uri)) continue

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

        sources.push({
          title,
          url: uri,
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

  // Detect trailing marker clusters BEFORE injecting
  const originalLength = answerText.length
  const threshold = Math.floor(originalLength * 0.95)
  const trailingInsertions = insertions.filter(ins => ins.end >= threshold)
  const skipTrailing = trailingInsertions.length >= 2

  // Sort insertions by end position descending (right-to-left preserves offsets)
  insertions.sort((a, b) => b.end - a.end)

  // Inject [N] markers into the answer text, skipping trailing cluster if detected
  let annotatedAnswer = answerText
  for (const { end, indices } of insertions) {
    // Skip markers in the trailing cluster zone when cluster is detected
    if (skipTrailing && end >= threshold) continue
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

/** Map KB citation refs → frontend Source[] with enriched fields. */
function referencesToSources(citations) {
  const sources = []
  const seen = new Set()
  let citationIndex = 0

  for (const citation of citations || []) {
    for (const ref of citation.retrievedReferences || []) {
      let uri =
        ref.location?.webLocation?.url ||
        ref.location?.confluenceLocation?.url ||
        ref.location?.salesforceLocation?.url ||
        ref.location?.sharePointLocation?.url ||
        ref.location?.s3Location?.uri ||
        ''

      // Metadata web URL fallback for S3 URIs
      if (uri.startsWith('s3://')) {
        const metaSourceUrl = ref.metadata?.source_url || ''
        const metaBedrockUri = ref.metadata?.['x-amz-bedrock-kb-source-uri'] || ''
        if (metaSourceUrl.startsWith('http')) {
          uri = metaSourceUrl
        } else if (metaBedrockUri.startsWith('http')) {
          uri = metaBedrockUri
        }
      }

      if (!isHttpUrl(uri)) continue

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

      sources.push({
        title,
        url: uri,
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

/**
 * Call Bedrock RetrieveCommand to get relevant KB chunks.
 *
 * @param {string} query - The retrieval search text
 * @param {object} [options] - Optional config { numberOfResults: number, abortSignal: AbortSignal }
 * @returns {Promise<Array>} Array of retrieval result objects from Bedrock
 */
export async function retrieveChunks(query, options = {}) {
  const numberOfResults = options.numberOfResults || 5
  const command = new RetrieveCommand({
    knowledgeBaseId: KNOWLEDGE_BASE_ID,
    retrievalQuery: { text: query },
    retrievalConfiguration: {
      vectorSearchConfiguration: { numberOfResults },
    },
  })
  const result = await getAgentRuntime().send(command, {
    abortSignal: options.abortSignal,
  })
  return result.retrievalResults || []
}

/**
 * Call Bedrock ConverseCommand with the prepared messages and system prompt.
 *
 * @param {Array} converseMessages - Messages array for Converse API
 * @param {AbortSignal} [abortSignal] - Optional abort signal for timeout
 * @returns {Promise<string>} The model's text response
 */
export async function converseWithModel(converseMessages, abortSignal) {
  const command = new ConverseCommand({
    modelId: CONVERSE_MODEL_ID,
    system: [{ text: AGENT_INSTRUCTIONS }],
    messages: converseMessages,
  })

  const result = await getBedrockRuntime().send(command, { abortSignal })

  return (
    result.output?.message?.content?.map(block => block.text || '').join('') || ''
  )
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
  if (!KNOWLEDGE_BASE_ID) {
    return response(500, {
      detail:
        'BEDROCK_KNOWLEDGE_BASE_ID must be set. Redeploy with the knowledge base parameter.',
    })
  }

  if (!hasUserText(body?.messages)) {
    return response(400, {
      detail: 'Request must include a non-empty user message.',
    })
  }

  const sessionId = body.session_id || randomUUID()

  // Route file uploads to handleFileChat unchanged
  if (body.file && body.file.content && body.file.mime_type) {
    const query = extractRetrievalQuery(body.messages)
    return handleFileChat(query, body.file, sessionId)
  }

  const TIMEOUT_MS = 30_000
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    // Step 1: Extract retrieval query from latest user message
    const query = extractRetrievalQuery(body.messages)

    // Step 2: Retrieve relevant KB chunks
    const chunks = await retrieveChunks(query, { abortSignal: controller.signal })

    // Step 3: Build sources and context block
    const sources = buildSources(chunks)
    const contextBlock = buildContextBlock(chunks)

    // Step 4: Build Converse messages with context
    const converseMessages = buildConverseMessages(body.messages, contextBlock)

    // Step 5: Call Converse model
    const rawAnswer = await converseWithModel(converseMessages, controller.signal)

    clearTimeout(timeout)

    // Step 6: Post-process - strip any reference section
    const answer = stripReferenceSection(rawAnswer)

    return response(200, {
      answer: answer || "I wasn't able to generate a response. Please try again.",
      sources,
      session_id: sessionId,
      model_used: `bedrock-converse:${CONVERSE_MODEL_ID}`,
      is_mock: false,
    })
  } catch (err) {
    clearTimeout(timeout)

    if (err.name === 'AbortError' || controller.signal.aborted) {
      console.error('Request timed out', err)
      return response(504, {
        detail: 'Request timed out. Please try again.',
      })
    }

    const code = err?.name || err?.Code || 'Error'
    const message = err?.message || String(err)
    console.error('Retrieve+Converse failed', code, err)
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
      status: KNOWLEDGE_BASE_ID ? 'ok' : 'misconfigured',
      region: BEDROCK_REGION,
      runtime: 'nodejs',
      knowledge_base_id: KNOWLEDGE_BASE_ID || null,
      converse_model_id: CONVERSE_MODEL_ID || null,
      mode: 'retrieve-and-converse',
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
