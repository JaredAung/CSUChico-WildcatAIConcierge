#!/usr/bin/env node
/**
 * seed-crawl-frontier.mjs
 *
 * Reads a Kendra-exported URL list, deduplicates, and sends each URL to the
 * SQS CrawlQueue so DownloaderFunction can fetch and store the content.
 *
 * Usage:
 *   node scripts/seed-crawl-frontier.mjs [kendra-urls.jsonl]
 *
 * If no file argument is supplied, only the high-value seed URLs are queued.
 *
 * The input file must be newline-delimited JSON, one URL string per line:
 *   "https://www.csuchico.edu/schedule/"
 *   "https://library.csuchico.edu/hours"
 *   ...
 *
 * OR an array exported from BatchGetDocumentStatus with objects like:
 *   { "DocumentId": "https://...", ... }
 *
 * Environment variables:
 *   AWS_REGION        — defaults to us-west-2
 *   CRAWL_QUEUE_URL   — SQS queue URL (required unless --dry-run)
 *   CRAWL_RUN_ID      — tag for this run, defaults to pilot-001
 *
 * Flags:
 *   --dry-run         — print URLs without sending to SQS
 */

import { createReadStream } from 'node:fs'
import { createInterface } from 'node:readline'
import { createHash } from 'node:crypto'
import { SQSClient, SendMessageBatchCommand } from '@aws-sdk/client-sqs'

// ── Configuration ─────────────────────────────────────────────────────────────

const REGION = process.env.AWS_REGION || 'us-west-2'
const QUEUE_URL = process.env.CRAWL_QUEUE_URL || ''
const CRAWL_RUN_ID = process.env.CRAWL_RUN_ID || 'pilot-001'
const DRY_RUN = process.argv.includes('--dry-run')
const INPUT_FILE = process.argv.find((a) => a.endsWith('.jsonl') || a.endsWith('.json') || a.endsWith('.txt'))

// High-value URLs to always include regardless of Kendra discovery
const HIGH_VALUE_URLS = [
  'https://www.csuchico.edu/schedule/_assets/documents/2025-26-student-academic-calendar.pdf',
  'https://www.csuchico.edu/_assets/documents/office/ecc/csci-flowchart-yr-5-25-26.pdf',
  'https://www.csuchico.edu/',
  'https://library.csuchico.edu/',
  'https://as.csuchico.edu/',
  'https://chicostatewildcat.bkstr.com/',
  'https://csuchico.campuslabs.com/engage/events',
]

// Authorized hosts — skip anything discovered outside the crawl scope
const AUTHORIZED_HOSTS = new Set([
  'www.csuchico.edu',
  'csuchico.edu',
  'library.csuchico.edu',
  'as.csuchico.edu',
  'chicostatewildcat.bkstr.com',
  'csuchico.campuslabs.com',
])

// URL patterns to skip (mirrors Kendra exclusion filters)
const SKIP_PATTERNS = [
  /\?.+/,              // query strings
  /\/login/i,
  /\/signin/i,
  /\/search/i,
  /\/calendar/i,
  /\/directory\/students\//i,
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function canonicalize(raw) {
  try {
    const u = new URL(raw.trim())
    // lowercase scheme + host
    u.hostname = u.hostname.toLowerCase()
    u.protocol = u.protocol.toLowerCase()
    // remove fragment
    u.hash = ''
    // strip utm_* and fbclid tracking params
    for (const key of [...u.searchParams.keys()]) {
      if (/^utm_|^fbclid$|^ref$/.test(key)) {
        u.searchParams.delete(key)
      }
    }
    return u.toString()
  } catch {
    return null
  }
}

function shouldSkip(url) {
  let parsed
  try {
    parsed = new URL(url)
  } catch {
    return true
  }
  if (!AUTHORIZED_HOSTS.has(parsed.hostname)) return true
  const full = parsed.pathname + parsed.search
  return SKIP_PATTERNS.some((p) => p.test(full))
}

function urlId(url) {
  return createHash('sha256').update(url).digest('hex').slice(0, 16)
}

/**
 * Read URLs from a .jsonl file.
 * Handles:
 *   - plain URL strings (one per line)
 *   - JSON objects with a "DocumentId" or "url" key
 *   - A JSON array on a single line
 */
async function readUrlsFromFile(filePath) {
  const urls = []
  const rl = createInterface({
    input: createReadStream(filePath),
    crlfDelay: Infinity,
  })

  for await (const line of rl) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue

    if (trimmed.startsWith('[')) {
      // Whole-file JSON array
      try {
        const arr = JSON.parse(trimmed)
        for (const item of arr) {
          const url = typeof item === 'string' ? item : item?.DocumentId || item?.url
          if (url) urls.push(url)
        }
      } catch {
        console.warn('could not parse JSON array line:', trimmed.slice(0, 80))
      }
      continue
    }

    if (trimmed.startsWith('{')) {
      try {
        const obj = JSON.parse(trimmed)
        const url = obj?.DocumentId || obj?.url || obj?.URI
        if (url) urls.push(url)
      } catch {
        console.warn('could not parse JSON object line:', trimmed.slice(0, 80))
      }
      continue
    }

    // Plain URL string
    if (trimmed.startsWith('http')) {
      urls.push(trimmed)
    }
  }

  return urls
}

/**
 * Send URLs to SQS in batches of 10 (API max).
 * Rate-limits to ~100 messages/sec to stay well within SQS limits.
 */
async function sendBatches(urls, queueUrl, runId) {
  const client = new SQSClient({ region: REGION })
  let sent = 0
  let failed = 0

  for (let i = 0; i < urls.length; i += 10) {
    const batch = urls.slice(i, i + 10)
    const entries = batch.map((url) => ({
      Id: urlId(url),
      MessageBody: JSON.stringify({ url, crawl_run_id: runId }),
    }))

    try {
      const res = await client.send(
        new SendMessageBatchCommand({ QueueUrl: queueUrl, Entries: entries }),
      )
      sent += res.Successful?.length ?? 0
      const failures = res.Failed ?? []
      if (failures.length) {
        failed += failures.length
        for (const f of failures) {
          console.error('SQS batch send failure', f.Id, f.Code, f.Message)
        }
      }
    } catch (err) {
      console.error('SQS send error', err.message)
      failed += batch.length
    }

    // Log progress every 100 messages
    if ((i + 10) % 100 === 0 || i + 10 >= urls.length) {
      console.log(`progress: ${Math.min(i + 10, urls.length)}/${urls.length} (${sent} sent, ${failed} failed)`)
    }

    // Brief pause every 10 batches to avoid SQS throttling
    if (i > 0 && i % 100 === 0) {
      await new Promise((r) => setTimeout(r, 200))
    }
  }

  return { sent, failed }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== seed-crawl-frontier.mjs ===')
  console.log({ REGION, QUEUE_URL: QUEUE_URL || '(not set — use --dry-run or set CRAWL_QUEUE_URL)', CRAWL_RUN_ID, DRY_RUN, INPUT_FILE })
  console.log()

  if (!DRY_RUN && !QUEUE_URL) {
    console.error('ERROR: CRAWL_QUEUE_URL environment variable is required.')
    console.error('  Export it from the SAM stack outputs or the AWS Console, e.g.:')
    console.error('  export CRAWL_QUEUE_URL=$(aws cloudformation describe-stacks \\')
    console.error('    --stack-name wildcat-ai-concierge --region us-west-2 \\')
    console.error('    --query "Stacks[0].Outputs[?OutputKey==\'CrawlQueueUrl\'].OutputValue" \\')
    console.error('    --output text)')
    process.exit(1)
  }

  // Collect raw URLs from file + high-value list
  let rawUrls = [...HIGH_VALUE_URLS]

  if (INPUT_FILE) {
    console.log(`reading URLs from ${INPUT_FILE}...`)
    const fromFile = await readUrlsFromFile(INPUT_FILE)
    console.log(`  found ${fromFile.length} URLs in file`)
    rawUrls = rawUrls.concat(fromFile)
  } else {
    console.log('no input file supplied — queueing high-value URLs only')
  }

  // Canonicalize + deduplicate + filter
  const seen = new Set()
  const validUrls = []

  for (const raw of rawUrls) {
    const url = canonicalize(raw)
    if (!url) continue
    if (seen.has(url)) continue
    seen.add(url)

    if (shouldSkip(url)) {
      console.log('skipped', url)
      continue
    }

    validUrls.push(url)
  }

  console.log()
  console.log(`deduplication: ${rawUrls.length} raw → ${validUrls.length} unique, authorized, clean URLs`)
  console.log()

  if (DRY_RUN) {
    console.log('DRY RUN — URLs that would be queued:')
    for (const url of validUrls) {
      console.log(' ', url)
    }
    console.log(`\n${validUrls.length} URLs total (not sent)`)
    return
  }

  console.log(`sending ${validUrls.length} URLs to CrawlQueue (${QUEUE_URL})...`)
  const { sent, failed } = await sendBatches(validUrls, QUEUE_URL, CRAWL_RUN_ID)

  console.log()
  console.log('=== DONE ===')
  console.log(`sent: ${sent}  failed: ${failed}  total: ${validUrls.length}`)

  if (failed > 0) {
    console.warn(`WARNING: ${failed} messages failed to send. Check logs above.`)
    process.exit(1)
  }
}

main().catch((err) => {
  console.error('fatal error:', err)
  process.exit(1)
})
