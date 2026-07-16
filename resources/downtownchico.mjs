#!/usr/bin/env node
/**
 * Scrape Downtown Chico listings (signature events or restaurants) → JSON.
 *
 * Usage:
 *   node resources/downtownchico.mjs
 *   node resources/downtownchico.mjs --source events
 *   node resources/downtownchico.mjs --source restaurants
 *   node resources/downtownchico.mjs --source restaurants --out resources/restaurants.json
 *   node resources/downtownchico.mjs --combine
 *   node resources/downtownchico.mjs --combine --out resources/downtown-chico.json
 *   node resources/downtownchico.mjs --to-md
 *   node resources/downtownchico.mjs --to-md --out backend/data/knowledge_base/downtown
 */

import { mkdir, readFile, readdir, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const ORIGIN = 'https://www.downtownchico.com'
const USER_AGENT =
  'Mozilla/5.0 (compatible; WildcatAIConcierge/1.0; +https://github.com/JaredAung/CSUChico-WildcatAIConcierge)'
const FETCH_DELAY_MS = 400

const SOURCES = {
  events: {
    url: `${ORIGIN}/signature-events.htm`,
    defaultOut: path.join(__dirname, 'signature-events.json'),
    listingFilter: /event-/i,
    payloadKey: 'signature_events',
  },
  restaurants: {
    url: `${ORIGIN}/restaurants.htm`,
    defaultOut: path.join(__dirname, 'restaurants.json'),
    listingFilter: /(?:restaurants_|coffee-juice-bars_|bakeries-|bars-|ice-cream-)/i,
    payloadKey: 'restaurants',
  },
}

const NAMED_ENTITIES = {
  nbsp: ' ',
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  ndash: '–',
  mdash: '—',
  hellip: '…',
  bull: '•',
  middot: '·',
  shy: '',
  ensp: ' ',
  emsp: ' ',
  thinsp: ' ',
  deg: '°',
  trade: '™',
  reg: '®',
  copy: '©',
  rsquo: '’',
  lsquo: '‘',
  rdquo: '”',
  ldquo: '“',
  eacute: 'é',
  egrave: 'è',
  ecirc: 'ê',
  euml: 'ë',
  aacute: 'á',
  agrave: 'à',
  acirc: 'â',
  auml: 'ä',
  iacute: 'í',
  icirc: 'î',
  iuml: 'ï',
  oacute: 'ó',
  ocirc: 'ô',
  ouml: 'ö',
  uacute: 'ú',
  ucirc: 'û',
  uuml: 'ü',
  ntilde: 'ñ',
  ccedil: 'ç',
}

function decodeEntities(text) {
  return String(text || '')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) =>
      String.fromCharCode(Number.parseInt(h, 16)),
    )
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&([a-zA-Z]+);/g, (whole, name) => {
      const key = name.toLowerCase()
      return key in NAMED_ENTITIES ? NAMED_ENTITIES[key] : whole
    })
}

function stripTags(html) {
  return decodeEntities(
    String(html || '')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, '\n')
      .replace(/<li[^>]*>/gi, '- ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[ \t]{2,}/g, ' ')
      .trim(),
  )
}

function absoluteUrl(href) {
  if (!href) return ''
  try {
    return new URL(href, ORIGIN).href
  } catch {
    return href
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function fetchHtml(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'text/html,application/xhtml+xml',
    },
  })
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${url}`)
  }
  return res.text()
}

function extractBetween(html, startRe, endRe) {
  const start = html.search(startRe)
  if (start < 0) return ''
  const rest = html.slice(start)
  const endMatch = rest.search(endRe)
  return endMatch < 0 ? rest : rest.slice(0, endMatch)
}

function parseListItemsAfterHeading(html, headingRe) {
  const match = html.match(
    new RegExp(
      `${headingRe.source}[\\s\\S]*?<ul>([\\s\\S]*?)<\\/ul>`,
      headingRe.flags.includes('i') ? 'i' : undefined,
    ),
  )
  if (!match) return []
  return [...match[1].matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)]
    .map((m) => stripTags(m[1]))
    .filter(Boolean)
}

function parseSocialLinks(block) {
  const social = {}
  for (const m of block.matchAll(
    /<a\s+href="([^"]+)"[^>]*title="[^"]* on (Facebook|Yelp|Instagram|TripAdvisor|YouTube|X \(Twitter\))"/gi,
  )) {
    const key = m[2].toLowerCase().replace(/[^a-z]/g, '')
    social[key === 'xtwitter' ? 'twitter' : key] = m[1]
  }
  return Object.keys(social).length ? social : undefined
}

/** Intro + listing cards from category pages (main column only). */
function parseListing(html, listingFilter) {
  const headerBlock = extractBetween(
    html,
    /<div class="headercontent">/i,
    /<div class="wrapper">/i,
  )
  const titleMatch = headerBlock.match(
    /class="headercontenthdr">([^<]+)</i,
  )
  const pageTitle = decodeEntities(
    titleMatch?.[1]?.trim() || 'Downtown Chico',
  )
  const intro = stripTags(
    headerBlock
      .replace(/<div class="cookietrail">[\s\S]*?<\/div>/i, '')
      .replace(/<div class="headercontenthdr">[\s\S]*?<\/div>/i, '')
      .replace(/<div class="filterbar[\s\S]*$/i, ''),
  )

  const searchResults = extractBetween(
    html,
    /<div id="searchResults">/i,
    /<div class="wrapperright">/i,
  )
  const body = searchResults || extractBetween(
    html,
    /<div class="bodycontent">/i,
    /<div class="wrapperright">/i,
  )
  const content =
    extractBetween(
      body,
      /<div class="contentwrapper">/i,
      /<\/div>\s*<\/div>\s*<\/div>\s*<\/div>\s*<div class="wrapperright">/i,
    ) || body

  const items = []
  const itemRe =
    /<div class="item(?:\s+clickDiv)?"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/gi
  let match
  while ((match = itemRe.exec(content)) !== null) {
    const block = match[1]
    const linkMatch = block.match(
      /<a\s+href="([^"]+)"[^>]*(?:title="([^"]*)")?[^>]*>/i,
    )
    if (!linkMatch) continue
    const href = linkMatch[1]
    if (!listingFilter.test(href)) continue

    const title =
      decodeEntities(linkMatch[2] || '') ||
      decodeEntities(block.match(/<em>([^<]+)<\/em>/i)?.[1] || '') ||
      decodeEntities(block.match(/alt="([^"]+)"/i)?.[1] || '')
    const schedule = decodeEntities(
      block.match(/<p>([\s\S]*?)<\/p>/i)?.[1]?.replace(/<[^>]+>/g, '').trim() ||
        '',
    )
    const image = absoluteUrl(block.match(/<img[^>]+src="([^"]+)"/i)?.[1])

    items.push({
      title,
      schedule: schedule || undefined,
      url: absoluteUrl(href),
      image: image || undefined,
    })
  }

  const seen = new Set()
  const unique = []
  for (const item of items) {
    if (!item.title || seen.has(item.url)) continue
    seen.add(item.url)
    unique.push(item)
  }

  return { pageTitle, intro, items: unique }
}

/** Detail content from a signature event page. */
function parseEventDetail(html, fallback) {
  const h1 = decodeEntities(
    html.match(/<div class="headertext">\s*<h1>([^<]+)<\/h1>/i)?.[1] ||
      fallback.title,
  )
  const listing = extractBetween(
    html,
    /<div class="fclear listingdetail">/i,
    /<div class="tertiarynav">/i,
  )
  const subtitle = decodeEntities(
    listing.match(/<h2 class="subtitle">([\s\S]*?)<\/h2>/i)?.[1]?.replace(
      /<[^>]+>/g,
      '',
    ) || '',
  )
  const dateHeading = decodeEntities(
    [...listing.matchAll(/<h2(?![^>]*subtitle)[^>]*>([\s\S]*?)<\/h2>/gi)]
      .map((m) => stripTags(m[1]))
      .find((t) => t && !/subtitle/i.test(t)) || '',
  )
  const phone = decodeEntities(
    listing.match(/Phone:\s*([^<\n]+)/i)?.[1]?.trim() || '',
  )
  const facebook = listing.match(
    /href="(https:\/\/www\.facebook\.com[^"]+)"/i,
  )?.[1]

  const customHtml = html.match(
    /<div class="customtext">([\s\S]*?)(?:<div class="(?:wrapperright|tertiarynav|sep)"|<\/div>\s*<\/div>\s*<\/div>\s*<div class="wrapperright">)/i,
  )?.[1]

  const contentHtml =
    customHtml ||
    extractBetween(
      html,
      /<div class="customtext">/i,
      /<div class="wrapperright">/i,
    )

  const content = stripTags(contentHtml)

  return {
    title: h1 || fallback.title,
    schedule: dateHeading || fallback.schedule,
    subtitle: subtitle || undefined,
    phone: phone || undefined,
    facebook: facebook || undefined,
    url: fallback.url,
    image: fallback.image,
    content: content || undefined,
  }
}

/** Detail content from a restaurant / business listing page. */
function parseRestaurantDetail(html, fallback) {
  const h1 = decodeEntities(
    html.match(/<div class="headertext">\s*<h1>([^<]+)<\/h1>/i)?.[1] ||
      fallback.title,
  )
  const listing = extractBetween(
    html,
    /<div class="fclear listingdetail">/i,
    /<div class="wrapperright">/i,
  )
  const nameBlock = extractBetween(
    listing,
    /<div class="item" id="PPE_Name">/i,
    /<\/div>\s*<\/div>\s*<\/div>/i,
  ) || listing

  const addressHtml = nameBlock.match(
    /<div class="addr">([\s\S]*?)<\/div>/i,
  )?.[1] || ''
  const address = stripTags(
    addressHtml.replace(/<a\b[\s\S]*?<\/a>/gi, ''),
  )
    .replace(/\n+/g, ', ')
    .replace(/\s*,\s*,+/g, ',')
    .replace(/\s*&bull;\s*/gi, ' ')
    .replace(/\s{2,}/g, ' ')
    .replace(/^,\s*|,\s*$/g, '')
    .trim()

  const phone = decodeEntities(
    nameBlock.match(/Phone:\s*([^<\n]+)/i)?.[1]?.trim() || '',
  )
  const website = nameBlock.match(
    /<a[^>]+class="websiteurl"[^>]+href="([^"]+)"/i,
  )?.[1] || nameBlock.match(
    /href="([^"]+)"[^>]*class="websiteurl"/i,
  )?.[1]

  const reserveHref = nameBlock.match(
    /class="btn"[^>]*aria-label="Reserve Now[^"]*"[^>]*href="([^"]+)"/i,
  )?.[1] || nameBlock.match(
    /href="([^"]+)"[^>]*class="btn"[^>]*aria-label="Reserve Now/i,
  )?.[1]
  let reserve_url
  if (reserveHref) {
    try {
      const u = new URL(absoluteUrl(reserveHref))
      const fl = u.searchParams.get('FL')
      reserve_url = fl ? decodeURIComponent(fl) : absoluteUrl(reserveHref)
    } catch {
      reserve_url = absoluteUrl(reserveHref)
    }
  }

  const social = parseSocialLinks(nameBlock)

  const aboutHtml =
    listing.match(
      /<div class="listingBody2?">([\s\S]*?)<\/div>\s*<div class="listingamenities">/i,
    )?.[1] ||
    listing.match(/<div class="listingBody2?">([\s\S]*?)<\/div>/i)?.[1]
  const about = stripTags(aboutHtml)

  const amenitiesBlock =
    extractBetween(
      listing,
      /<div class="listingamenities">/i,
      /<div class="wrapperright">/i,
    ) || listing.match(/<div class="listingamenities">([\s\S]*)/i)?.[1] || ''

  const hours = parseListItemsAfterHeading(amenitiesBlock, /<h3>Hours<\/h3>/i)
  const amenities = parseListItemsAfterHeading(
    amenitiesBlock,
    /<h3>Amenities\s*(?:&amp;|&)\s*Services<\/h3>/i,
  )
  const cuisine = parseListItemsAfterHeading(
    amenitiesBlock,
    /<h3>Cuisine Type<\/h3>/i,
  )
  const daily_service = parseListItemsAfterHeading(
    amenitiesBlock,
    /<h3>Daily Service<\/h3>/i,
  )

  const image =
    absoluteUrl(
      listing.match(
        /id="PPE_ListingImage"[\s\S]*?<img[^>]+src="([^"]+)"/i,
      )?.[1],
    ) || fallback.image

  return {
    title: h1 || fallback.title,
    address: address || undefined,
    phone: phone || undefined,
    website: website || undefined,
    reserve_url: reserve_url || undefined,
    social,
    url: fallback.url,
    image: image || undefined,
    hours: hours.length ? hours : undefined,
    amenities: amenities.length ? amenities : undefined,
    cuisine: cuisine.length ? cuisine : undefined,
    daily_service: daily_service.length ? daily_service : undefined,
    about: about || undefined,
  }
}

function parseArgs(argv) {
  let source = 'events'
  let out
  let combine = false
  let toMd = false
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--combine') {
      combine = true
    } else if (argv[i] === '--to-md') {
      toMd = true
    } else if ((argv[i] === '--source' || argv[i] === '--page') && argv[i + 1]) {
      source = String(argv[++i]).toLowerCase()
    } else if (argv[i] === '--out' && argv[i + 1]) {
      out = path.resolve(argv[++i])
    } else if (argv[i] === 'restaurants' || argv[i] === 'events') {
      source = argv[i]
    }
  }
  if (source === 'signature-events' || source === 'signature_events') {
    source = 'events'
  }
  if (toMd) {
    return {
      toMd: true,
      out:
        out ||
        path.join(
          __dirname,
          '..',
          'backend',
          'data',
          'knowledge_base',
          'downtown',
        ),
      input: path.join(__dirname, 'downtown-chico.json'),
    }
  }
  if (combine) {
    return {
      combine: true,
      out: out || path.join(__dirname, 'downtown-chico.json'),
    }
  }
  if (!SOURCES[source]) {
    throw new Error(
      `Unknown source "${source}". Use: events | restaurants | --combine | --to-md`,
    )
  }
  return {
    combine: false,
    toMd: false,
    source,
    out: out || SOURCES[source].defaultOut,
  }
}

function slugify(text) {
  return (
    String(text || 'item')
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'item'
  )
}

function mdEscape(value) {
  return decodeEntities(String(value ?? '').replace(/\r\n/g, '\n')).trim()
}

function mdList(values) {
  if (!Array.isArray(values) || !values.length) return ''
  return values.map((v) => `- ${mdEscape(v)}`).join('\n')
}

const MONTHS = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
}

function monthNum(name) {
  return MONTHS[String(name || '').toLowerCase().replace(/\.$/, '')]
}

function pad2(n) {
  return String(n).padStart(2, '0')
}

function isoDate(year, month, day) {
  if (!year || !month || !day) return undefined
  return `${year}-${pad2(month)}-${pad2(day)}`
}

/** "4:00-8:00 p.m." → "16:00-20:00" (applies a trailing meridiem to both ends). */
function to24Hour(hourMin, meridiem) {
  const [hStr, mStr = '00'] = hourMin.split(':')
  let hour = Number(hStr)
  const mer = String(meridiem || '').toLowerCase().replace(/\./g, '')
  if (mer === 'pm' && hour !== 12) hour += 12
  if (mer === 'am' && hour === 12) hour = 0
  return `${pad2(hour)}:${pad2(Number(mStr))}`
}

function parseTimeRange(text) {
  const match = String(text || '').match(
    /(\d{1,2}(?::\d{2})?)\s*(a\.?m\.?|p\.?m\.?)?\s*[-–]\s*(\d{1,2}(?::\d{2})?)\s*(a\.?m\.?|p\.?m\.?)/i,
  )
  if (!match) return undefined
  const [, start, startMer, end, endMer] = match
  const meridiem = endMer || startMer
  return `${to24Hour(start, startMer || meridiem)}-${to24Hour(end, endMer || meridiem)}`
}

/**
 * Parses freeform event schedule strings from downtownchico.com into
 * structured {date, date_end, time} for KB metadata filtering. Handles:
 *   "Sunday, September 6, 2026 11:00AM - 5:30PM"
 *   "Oct 1 - 31, 2026 l Times Vary Per Event"
 *   "September 25 & 26, 2026 | 10:00 AM - 5:00 PM"
 *   "April 9 - Sept 24, 2026 l 6:00 - 9:00PM"
 *   "Sunday, November 22, 2026 | 4:00-8:00 p.m."
 */
function parseEventSchedule(schedule) {
  const text = mdEscape(schedule)
  if (!text) return {}

  let datePart = text
  let time

  if (/times?\s*vary/i.test(text)) {
    time = 'times_vary'
    datePart = text.replace(/[|lI]?\s*times?\s*vary(?:\s*per\s*event)?/i, '')
  } else {
    const timeMatch = text.match(
      /\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)?\s*[-–]\s*\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)/i,
    )
    if (timeMatch) {
      time = parseTimeRange(timeMatch[0])
      datePart = text.slice(0, timeMatch.index)
    }
  }

  datePart = datePart
    .replace(/^[A-Za-z]+,\s*/, '') // drop leading weekday, e.g. "Sunday, "
    .replace(/[|lI]\s*$/, '') // drop trailing "l"/"|" separator glyph
    .trim()
    .replace(/,$/, '')
    .trim()

  const rangeMatch = datePart.match(
    /^([A-Za-z]+)\.?\s+(\d{1,2})\s*(?:[-–]|&)\s*(?:([A-Za-z]+)\.?\s+)?(\d{1,2}),?\s*(\d{4})$/,
  )
  if (rangeMatch) {
    const [, mon1, day1, mon2, day2, year] = rangeMatch
    const month1 = monthNum(mon1)
    const month2 = mon2 ? monthNum(mon2) : month1
    return {
      date: isoDate(year, month1, day1),
      date_end: isoDate(year, month2, day2),
      time,
    }
  }

  const singleMatch = datePart.match(/^([A-Za-z]+)\.?\s+(\d{1,2}),?\s*(\d{4})$/)
  if (singleMatch) {
    const [, mon, day, year] = singleMatch
    return { date: isoDate(year, monthNum(mon), day), time }
  }

  return { time }
}

function metadataAttr(stringValue, includeForEmbedding) {
  return { value: { type: 'STRING', stringValue }, includeForEmbedding }
}

/** Builds the Bedrock KB `.metadata.json` sidecar payload for one listing. */
function buildMetadata(item) {
  const attrs = { type: metadataAttr(item.type, true) }

  if (item.type === 'signature_event') {
    const parsed = parseEventSchedule(item.schedule)
    if (parsed.date) attrs.date = metadataAttr(parsed.date, false)
    if (parsed.date_end) attrs.date_end = metadataAttr(parsed.date_end, false)
    if (parsed.time) attrs.time = metadataAttr(parsed.time, false)
  } else if (item.type === 'restaurant' && item.hours?.length) {
    attrs.time = metadataAttr(item.hours.map(mdEscape).join('; '), false)
  }

  return { metadataAttributes: attrs }
}

function itemToMarkdown(item) {
  const lines = [`# ${mdEscape(item.title)}`, '']
  lines.push(`- **Type:** ${mdEscape(item.type)}`)
  if (item.subtitle) lines.push(`- **Subtitle:** ${mdEscape(item.subtitle)}`)
  if (item.type === 'signature_event') {
    const parsed = parseEventSchedule(item.schedule)
    if (parsed.date) lines.push(`- **Date:** ${parsed.date}`)
    if (parsed.date_end) lines.push(`- **Date end:** ${parsed.date_end}`)
    if (parsed.time) lines.push(`- **Time:** ${parsed.time}`)
  } else if (item.hours?.length) {
    lines.push(`- **Time:** ${item.hours.map(mdEscape).join('; ')}`)
  }
  if (item.schedule) lines.push(`- **When:** ${mdEscape(item.schedule)}`)
  if (item.address) lines.push(`- **Address:** ${mdEscape(item.address)}`)
  if (item.phone) lines.push(`- **Phone:** ${mdEscape(item.phone)}`)
  if (item.website) lines.push(`- **Website:** ${mdEscape(item.website)}`)
  if (item.reserve_url) {
    lines.push(`- **Reservations:** ${mdEscape(item.reserve_url)}`)
  }
  if (item.url) lines.push(`- **Source:** ${mdEscape(item.url)}`)
  if (item.facebook) lines.push(`- **Facebook:** ${mdEscape(item.facebook)}`)
  if (item.social) {
    for (const [network, href] of Object.entries(item.social)) {
      if (href) {
        const label = network.charAt(0).toUpperCase() + network.slice(1)
        lines.push(`- **${label}:** ${mdEscape(href)}`)
      }
    }
  }
  lines.push('')

  if (item.hours?.length) {
    lines.push('## Hours', '', mdList(item.hours), '')
  }
  if (item.cuisine?.length) {
    lines.push('## Cuisine', '', mdList(item.cuisine), '')
  }
  if (item.amenities?.length) {
    lines.push('## Amenities & Services', '', mdList(item.amenities), '')
  }
  if (item.daily_service?.length) {
    lines.push('## Daily Service', '', mdList(item.daily_service), '')
  }

  const body = item.content || item.about
  if (body) {
    lines.push('## Details', '', mdEscape(body), '')
  }

  return `${lines.join('\n').replace(/\n{3,}/g, '\n\n').trim()}\n`
}

async function clearMarkdownDir(dir) {
  try {
    const names = await readdir(dir)
    await Promise.all(
      names
        .filter((name) => name.endsWith('.md') || name.endsWith('.md.metadata.json'))
        .map((name) => unlink(path.join(dir, name))),
    )
  } catch (err) {
    if (err.code !== 'ENOENT') throw err
  }
}

async function writeMarkdownFromCombined(inputPath, outDir) {
  const data = JSON.parse(await readFile(inputPath, 'utf8'))
  const items = data.items || []
  const byType = {
    signature_event: path.join(outDir, 'signature-events'),
    restaurant: path.join(outDir, 'restaurants'),
  }

  for (const dir of Object.values(byType)) {
    await mkdir(dir, { recursive: true })
    await clearMarkdownDir(dir)
  }

  const used = new Map()
  let written = 0
  for (const item of items) {
    const typeDir = byType[item.type] || path.join(outDir, 'other')
    if (!byType[item.type]) {
      await mkdir(typeDir, { recursive: true })
    }
    let base = slugify(item.title)
    const count = (used.get(base) || 0) + 1
    used.set(base, count)
    if (count > 1) base = `${base}-${count}`
    const filePath = path.join(typeDir, `${base}.md`)
    await writeFile(filePath, itemToMarkdown(item), 'utf8')
    await writeFile(
      `${filePath}.metadata.json`,
      `${JSON.stringify(buildMetadata(item), null, 2)}\n`,
      'utf8',
    )
    written++
  }

  const indexLines = [
    '# Downtown Chico',
    '',
    `Source: ${data.source || ORIGIN}`,
    `Scraped at: ${data.scraped_at || ''}`,
    '',
    'Markdown knowledge-base docs generated from `downtown-chico.json`.',
    'One file per listing so Bedrock can chunk by document.',
    '',
  ]
  if (data.sources?.signature_events?.intro) {
    indexLines.push(
      '## Signature events',
      '',
      mdEscape(data.sources.signature_events.intro),
      '',
    )
  }
  if (data.sources?.restaurants?.intro) {
    indexLines.push(
      '## Restaurants',
      '',
      mdEscape(data.sources.restaurants.intro),
      '',
    )
  }
  await writeFile(
    path.join(outDir, 'README.md'),
    `${indexLines.join('\n')}\n`,
    'utf8',
  )

  const eventCount = items.filter((i) => i.type === 'signature_event').length
  const restaurantCount = items.filter((i) => i.type === 'restaurant').length
  console.error(
    `Wrote ${written} markdown files (${eventCount} events, ${restaurantCount} restaurants) → ${outDir}`,
  )
}

async function combineCategoryFiles(out) {
  const events = JSON.parse(
    await readFile(SOURCES.events.defaultOut, 'utf8'),
  )
  const restaurants = JSON.parse(
    await readFile(SOURCES.restaurants.defaultOut, 'utf8'),
  )

  const items = [
    ...(events.signature_events || []).map((item) => ({
      ...item,
      type: 'signature_event',
    })),
    ...(restaurants.restaurants || []).map((item) => ({
      ...item,
      type: 'restaurant',
    })),
  ]

  const payload = {
    source: ORIGIN,
    scraped_at: new Date().toISOString(),
    sources: {
      signature_events: {
        source: events.source,
        scraped_at: events.scraped_at,
        page_title: events.page_title,
        intro: events.intro,
      },
      restaurants: {
        source: restaurants.source,
        scraped_at: restaurants.scraped_at,
        page_title: restaurants.page_title,
        intro: restaurants.intro,
      },
    },
    items,
  }
  await writeFile(out, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
  const eventCount = items.filter((i) => i.type === 'signature_event').length
  const restaurantCount = items.filter((i) => i.type === 'restaurant').length
  console.error(
    `Combined ${eventCount} events + ${restaurantCount} restaurants (${items.length} items) → ${out}`,
  )
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.toMd) {
    await writeMarkdownFromCombined(args.input, args.out)
    return
  }
  if (args.combine) {
    await combineCategoryFiles(args.out)
    return
  }

  const { source, out } = args
  const config = SOURCES[source]
  const parseDetail =
    source === 'restaurants' ? parseRestaurantDetail : parseEventDetail

  console.error(`Fetching listing: ${config.url}`)
  const listingHtml = await fetchHtml(config.url)
  const { pageTitle, intro, items: listed } = parseListing(
    listingHtml,
    config.listingFilter,
  )
  console.error(`Found ${listed.length} ${config.payloadKey.replace(/_/g, ' ')}`)

  const records = []
  for (let i = 0; i < listed.length; i++) {
    const item = listed[i]
    process.stderr.write(`  [${i + 1}/${listed.length}] ${item.title} … `)
    try {
      await sleep(FETCH_DELAY_MS)
      const detailHtml = await fetchHtml(item.url)
      records.push(parseDetail(detailHtml, item))
      console.error('ok')
    } catch (err) {
      console.error(`failed (${err.message}); keeping listing fields`)
      records.push({ ...item, content: undefined, about: undefined })
    }
  }

  const payload = {
    source: config.url,
    scraped_at: new Date().toISOString(),
    page_title: pageTitle,
    intro,
    [config.payloadKey]: records,
  }

  await writeFile(out, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
  console.error(`Wrote ${records.length} records → ${out}`)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
