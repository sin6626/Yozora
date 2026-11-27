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

/**
 * Whether two versions can be compared as Lexical JSON (the Haklex rich diff).
 * Only when both sides are Lexical: a Plate envelope fed to the Lexical differ throws
 * (e.g. a migrated Plate post whose old draft is still Lexical); everything else diffs the Markdown.
 */
export function canLexicalDiff(
  a: { contentFormat?: string; content?: string },
  b: { contentFormat?: string; content?: string },
): boolean {
  return (
    a.contentFormat === 'lexical' &&
    b.contentFormat === 'lexical' &&
    !!a.content &&
    !!b.content
  )
}

/** A short warning when restoring `version` would change the published document's format. */
export function formatChangeNotice(
  published: { contentFormat?: string },
  version: { contentFormat?: string },
): string | null {
  const from = published.contentFormat ?? 'markdown'
  const to = version.contentFormat ?? 'markdown'
  if (from === to) return null
  return `这个版本是 ${to} 格式，已发布的是 ${from} 格式；对比按两边的 Markdown 文字进行，恢复后会按 ${to} 格式保存。`
}
