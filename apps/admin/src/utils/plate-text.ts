import { toMarkdown } from '@suzuri/editor/schema'

/**
 * Markdown projection of a Plate (Suzuri envelope) body, for text diffs of drafts and translations.
 * Draft history stores only `content` for rich formats, so the text is derived here, the same way Core does on save.
 */
export function plateMarkdown(content?: string): string {
  if (!content) return ''
  try {
    const result = toMarkdown(content)
    return result.ok ? result.markdown.trim() : ''
  } catch {
    return ''
  }
}

/** The Markdown to diff for a document: derived from `content` for Plate, the stored `text` otherwise. */
export function diffTextOf(doc: {
  contentFormat?: string
  content?: string
  text?: string
}): string {
  return doc.contentFormat === 'plate' && doc.content
    ? plateMarkdown(doc.content)
    : (doc.text ?? '')
}
