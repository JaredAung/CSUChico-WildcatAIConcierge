/**
 * DownloaderFunction — SQS-triggered Lambda
 *
 * Reads one URL at a time from the CrawlQueue, fetches the content, and
 * deposits it into the KB S3 bucket with Bedrock-compatible metadata sidecars.
 *
 * Message payload:
 *   {
 *     "url": "https://www.csuchico.edu/schedule/",
 *     "crawl_run_id": "pilot-001",   // optional, defaults to "unknown"
 *     "depth": 1                      // optional, informational only
 *   }
 *
 * S3 layout:
 *   raw/html/{host}/{urlPath}.html           — raw HTML bytes
 *   normalized/{host}/{urlPath}.json         — plain text extraction
 *   raw/files/{host}/{urlPath}               — PDFs and other binary types
 *   {any above key}.metadata.json            — Bedrock sidecar
 */

import { createHash } from 'node:crypto'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'

const S3_BUCKET = process.env.S3_BUCKET || 'kendra-webcrawler-test'
const AWS_REGION = process.env.BEDROCK_REGION || process.env.AWS_REGION || 'us-west-2'
const FETCH_TIMEOUT_MS = 15_000
const POLITE_DELAY_MS = 1_000

// Authorized hosts — reject anything that wasn't in the crawl scope
const AUTHORIZED_HOSTS = new Set([
  'www.csuchico.edu',
  'csuchico.edu',
  'library.csuchico.edu',
  'as.csuchico.edu',
  'chicostatewildcat.bkstr.com',
  'csuchico.campuslabs.com',
])

let s3Client

function getS3() {
  if (!s3Client) {
    s3Client = new S3Client({ region: AWS_REGION })
  }
  return s3Client
}

/** Pause execution for ms milliseconds */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Build a safe, deterministic S3 key segment from a URL path.
 * Strips leading slash, collapses empty segments, limits total length.
 */
function urlPathToKey(urlPath, ext) {
  // Decode percent-encoding, then strip dangerous characters
  let safe
  try {
    safe = decodeURIComponent(urlPath)
  } catch {
    safe = urlPath
  }
  safe = safe
    .replace(/^\/+/, '')                // strip leading slashes
    .replace(/[^a-zA-Z0-9._\-/]/g, '_') // replace unsafe chars
    .replace(/\/+/g, '/')               // collapse double slashes
    .slice(0, 200)                      // cap length

  if (!safe || safe === '/') safe = 'index'

  // Strip or normalise extension
  const lastDot = safe.lastIndexOf('.')
  const hasExt = lastDot !== -1 && safe.length - lastDot <= 5
  if (!hasExt && ext) {
    safe = `${safe}${ext}`
  }
  return safe
}

/**
 * Very simple HTML → plain-text extractor.
 * Strips tags, collapses whitespace, trims.
 * Good enough for KB ingestion; not a full parser.
 */
function htmlToText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Write a Bedrock-compatible metadata sidecar next to an S3 object.
 * Bedrock KB expects the sidecar at exactly "{objectKey}.metadata.json".
 *
 * @see https://docs.aws.amazon.com/bedrock/latest/userguide/knowledge-base-ds.html#kb-ds-s3-metadata
 */
async function putSidecar(s3Key, attrs) {
  const sidecarKey = `${s3Key}.metadata.json`
  const sidecar = {
    metadataAttributes: attrs,
  }
  await getS3().send(
    new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: sidecarKey,
      Body: JSON.stringify(sidecar, null, 2),
      ContentType: 'application/json',
    }),
  )
  console.log('sidecar written', sidecarKey)
}

/**
 * Process a single URL message.
 * Returns true on success, throws on unrecoverable error.
 */
async function processUrl(url, crawlRunId) {
  const parsed = new URL(url)
  const host = parsed.hostname

  if (!AUTHORIZED_HOSTS.has(host)) {
    // Log and skip rather than fail — we don't want to DLQ auth failures
    console.warn('skipping unauthorized host', host, url)
    return true
  }

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  let fetchRes
  try {
    fetchRes = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent':
          'WildcatAIConcierge/1.0 (+https://github.com/CSUChico-WildcatAIConcierge; educational/research)',
        Accept: 'text/html,application/xhtml+xml,application/pdf,*/*',
      },
      redirect: 'follow',
    })
  } finally {
    clearTimeout(timer)
  }

  if (!fetchRes.ok) {
    // 4xx → non-retryable; 5xx → retryable (throw so SQS retries)
    if (fetchRes.status >= 400 && fetchRes.status < 500) {
      console.warn(`non-retryable HTTP ${fetchRes.status} for ${url}`)
      return true
    }
    throw new Error(`HTTP ${fetchRes.status} fetching ${url}`)
  }

  const rawContentType = fetchRes.headers.get('content-type') || 'application/octet-stream'
  const contentType = rawContentType.split(';')[0].trim()
  const bytes = Buffer.from(await fetchRes.arrayBuffer())
  const sha256 = createHash('sha256').update(bytes).digest('hex')
  const crawlTime = new Date().toISOString()

  console.log('fetched', { url, status: fetchRes.status, contentType, bytes: bytes.length })

  // ── Build S3 keys & store content ─────────────────────────────────────────
  const baseAttrs = {
    source_url: url,
    host,
    content_type: contentType,
    crawl_time: crawlTime,
    sha256,
    crawl_run_id: crawlRunId,
  }

  const urlPath = parsed.pathname

  if (contentType === 'text/html' || contentType === 'application/xhtml+xml') {
    // Store raw HTML
    const htmlKey = `raw/html/${host}/${urlPathToKey(urlPath, '.html')}`
    await getS3().send(
      new PutObjectCommand({
        Bucket: S3_BUCKET,
        Key: htmlKey,
        Body: bytes,
        ContentType: contentType,
        Metadata: { source_url: url },
      }),
    )
    console.log('raw html written', htmlKey, bytes.length, 'bytes')
    await putSidecar(htmlKey, baseAttrs)

    // Store normalized plain text so Bedrock can ingest it without parsing
    const text = htmlToText(bytes.toString('utf8'))
    if (text.length > 50) {
      const normalizedKey = `normalized/${host}/${urlPathToKey(urlPath, '.json')}`
      const normalizedBody = JSON.stringify({
        source_url: url,
        crawl_time: crawlTime,
        text,
      })
      await getS3().send(
        new PutObjectCommand({
          Bucket: S3_BUCKET,
          Key: normalizedKey,
          Body: normalizedBody,
          ContentType: 'application/json',
          Metadata: { source_url: url },
        }),
      )
      console.log('normalized text written', normalizedKey, normalizedBody.length, 'bytes')
      await putSidecar(normalizedKey, { ...baseAttrs, content_type: 'text/plain' })
    }
  } else {
    // PDFs and other binary types
    const fileKey = `raw/files/${host}/${urlPathToKey(urlPath, '')}`
    await getS3().send(
      new PutObjectCommand({
        Bucket: S3_BUCKET,
        Key: fileKey,
        Body: bytes,
        ContentType: contentType,
        Metadata: { source_url: url },
      }),
    )
    console.log('file written', fileKey, bytes.length, 'bytes')
    await putSidecar(fileKey, baseAttrs)
  }

  return true
}

/**
 * Lambda handler — SQS trigger (batch size 1).
 * Uses ReportBatchItemFailures so only failed items return to queue.
 */
export async function handler(event) {
  const batchItemFailures = []

  for (const record of event.Records) {
    const messageId = record.messageId
    let url = '(unknown)'
    let crawlRunId = 'unknown'

    try {
      const payload = JSON.parse(record.body)
      url = payload.url
      crawlRunId = payload.crawl_run_id || 'unknown'

      if (!url || typeof url !== 'string') {
        throw new Error('message missing required "url" field')
      }

      await processUrl(url, crawlRunId)
      // Be polite — wait 1s between fetches
      await sleep(POLITE_DELAY_MS)
    } catch (err) {
      console.error('failed to process message', { messageId, url, error: err.message })
      batchItemFailures.push({ itemIdentifier: messageId })
    }
  }

  return { batchItemFailures }
}
