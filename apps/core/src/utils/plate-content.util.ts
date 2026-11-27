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

/**
 * Validates a Plate envelope and projects it to Markdown.
 * Returns the content to store (restamped when the fingerprint drifted) and the derived text.
 */
export function projectPlateContent(content: string): {
  content: string
  text: string
} {
  const { envelope, restamped } = parseEnvelope(content)
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
    return isSuzuriEnvelope(parsed) ? JSON.stringify(parsed.document) : content
  } catch {
    return content
  }
}
