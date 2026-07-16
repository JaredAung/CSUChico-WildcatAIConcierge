/**
 * generate-metadata.mjs
 *
 * Generates .metadata.json files for each .md document in S3 so that
 * Bedrock KB citations show the real source URL instead of s3:// paths.
 *
 * Usage:
 *   1. Set AWS credentials in env (or use `aws sso login` first)
 *   2. Set S3_BUCKET to the bucket containing the .md files
 *   3. Run: node generate-metadata.mjs
 *
 * The script will:
 *   - List all .md files in the bucket
 *   - Match each filename to the JSON data to find the real URL
 *   - Create <filename>.metadata.json with x-amz-bedrock-kb-source-uri
 *   - Upload the metadata files to S3
 *
 * After running, re-sync the KB data source to pick up the metadata.
 */

import { readFileSync } from 'node:fs'
import { S3Client, ListObjectsV2Command, PutObjectCommand } from '@aws-sdk/client-s3'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

// ─── Configuration ────────────────────────────────────────────────────────────

const S3_BUCKET = process.env.S3_BUCKET || 'downtowninfo'
const REGION = process.env.AWS_REGION || 'us-west-2'

// ─── Load downtown-chico.json ─────────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url))
const dataPath = join(__dirname, '..', '..', 'resources', 'downtown-chico.json')
const data = JSON.parse(readFileSync(dataPath, 'utf-8'))

// Build a lookup: slugified title → best URL
function slugify(text) {
  return text
    .toLowerCase()
    .replace(/['']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

const urlLookup = new Map()
for (const item of data.items) {
  const slug = slugify(item.title)
  // Prefer the restaurant/event's own website, fall back to downtownchico.com listing page
  const url = item.website || item.url || ''
  if (url) {
    urlLookup.set(slug, url)
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const s3 = new S3Client({ region: REGION })

  // List all objects in the bucket
  console.log(`Listing objects in s3://${S3_BUCKET}/ ...`)
  let allKeys = []
  let continuationToken

  do {
    const resp = await s3.send(new ListObjectsV2Command({
      Bucket: S3_BUCKET,
      ContinuationToken: continuationToken,
    }))
    allKeys.push(...(resp.Contents || []).map(obj => obj.Key))
    continuationToken = resp.IsTruncated ? resp.NextContinuationToken : undefined
  } while (continuationToken)

  // Filter to .md files (exclude existing .metadata.json)
  const mdFiles = allKeys.filter(k => k.endsWith('.md') && !k.includes('.metadata.json'))
  console.log(`Found ${mdFiles.length} .md files`)

  let uploaded = 0
  let skipped = 0

  for (const key of mdFiles) {
    // Extract slug from filename: "restaurants/chada-thai.md" → "chada-thai"
    const filename = key.split('/').pop().replace('.md', '')
    const slug = filename // filenames should already be slugified

    const sourceUrl = urlLookup.get(slug)
    if (!sourceUrl) {
      console.log(`  SKIP ${key} — no URL match for slug "${slug}"`)
      skipped++
      continue
    }

    const metadataKey = `${key}.metadata.json`
    const metadataBody = JSON.stringify({
      metadataAttributes: {
        'x-amz-bedrock-kb-source-uri': sourceUrl,
      },
    }, null, 2)

    await s3.send(new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: metadataKey,
      Body: metadataBody,
      ContentType: 'application/json',
    }))

    console.log(`  ✓ ${metadataKey} → ${sourceUrl}`)
    uploaded++
  }

  console.log(`\nDone. Uploaded: ${uploaded}, Skipped: ${skipped}`)
  console.log('Next: re-sync the KB data source to pick up the new metadata.')
}

main().catch(err => {
  console.error('ERROR:', err.message)
  process.exit(1)
})
