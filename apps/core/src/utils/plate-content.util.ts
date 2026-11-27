import {
  collectMedia,
  isSuzuriEnvelope,
  toMarkdown,
  validateDocument,
} from '@suzuri/editor/schema'
import type { SuzuriEnvelope } from '@suzuri/editor/schema'
import { BadRequestException } from '@nestjs/common'

// Plate content is a @suzuri/editor envelope (`{ document, schema }`) stored as a
// JSON string. Suzuri's default schema `{ id: 'suzuri', version: 1 }` is used
// everywhere (Core, web, admin); only the fingerprint may drift across Suzuri
// upgrades, and `restamp` re-validates the tree and stamps the current one.

function parseEnvelope(content: string): {
  envelope: SuzuriEnvelope
  restamped: boolean
} {
  const result = validateDocument(content, {
    requireEnvelope: true,
    fingerprintPolicy: 'restamp',
  })
  if (!result.ok) {
    throw new BadRequestException(`Invalid Plate content: ${result.error}`)
  }
  return { envelope: result.envelope, restamped: result.fingerprintUpdated }
}

/** Whether `content` parses as an envelope, valid or not (lenient draft check). */
export function isPlateEnvelope(content: string | undefined): boolean {
  if (!content) return false
  try {
    return isSuzuriEnvelope(JSON.parse(content))
  } catch {
    return false
  }
}

// Links and other URL properties can live outside the media nodes collected by Suzuri.
function hasBlobUrl(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false
  return Object.entries(value).some(([key, child]) =>
    typeof child === 'string'
      ? /(?:url|src|href|poster)$/i.test(key) && /^blob:/i.test(child.trimStart())
      : hasBlobUrl(child),
  )
}

/**
 * Validates a Plate envelope and projects it to Markdown.
 * Returns the content to store (restamped when the fingerprint drifted) and the derived text.
 */
export function projectPlateContent(content: string): {
  content: string
  text: string
} {
  const { envelope, restamped } = parseEnvelope(content)
  if (hasBlobUrl(envelope.document)) {
    throw new BadRequestException('Invalid Plate content: blob URLs cannot be published')
  }
  for (const ref of collectMedia(envelope)) {
    for (const url of [ref.url, ref.extra?.videoUrl]) {
      if (typeof url === 'string' && /^(blob|data):/i.test(url.trimStart())) {
        throw new BadRequestException('Invalid Plate content: media needs a persistent URL')
      }
    }
  }
  const markdown = toMarkdown(envelope)
  if (!markdown.ok) {
    throw new BadRequestException(
      'Invalid Plate content: Markdown projection failed',
    )
  }
  return {
    content: restamped ? JSON.stringify(envelope) : content,
    text: markdown.markdown.trim(),
  }
}

/** Image, Live Photo cover and Live Photo clip URLs referenced by the envelope. */
export function extractPlateMediaUrls(content: string | undefined): string[] {
  if (!content) return []
  try {
    const urls: string[] = []
    for (const ref of collectMedia(JSON.parse(content))) {
      if (ref.url) urls.push(ref.url)
      const video = ref.extra?.videoUrl
      if (typeof video === 'string' && video) urls.push(video)
    }
    return urls
  } catch {
    return []
  }
}

/** Stable hash input: the document only, so a restamped fingerprint is not a content change. */
export function canonicalizePlateContentForHash(
  content?: string,
): string | undefined {
  if (!content) return content
  try {
    const parsed = JSON.parse(content)
    if (!isSuzuriEnvelope(parsed)) return content
    return JSON.stringify(parsed.document, (_, value) => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return value
      return Object.fromEntries(Object.keys(value).sort().map((key) => [key, value[key]]))
    })
  } catch {
    return content
  }
}
