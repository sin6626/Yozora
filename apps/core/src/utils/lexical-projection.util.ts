import { allHeadlessTransformers } from '@haklex/rich-headless'
import { $isLinkNode } from '@lexical/link'
import { $isListItemNode, $isListNode } from '@lexical/list'
import { $convertToMarkdownString } from '@lexical/markdown'
import type {
  ElementTransformer,
  TextMatchTransformer,
} from '@lexical/markdown'
import type { ListNode } from '@lexical/list'
import { $isHeadingNode } from '@lexical/rich-text'
import { $isTableCellNode, $isTableNode, $isTableRowNode } from '@lexical/table'
import { $isElementNode, $isTextNode } from 'lexical'
import type { ElementNode, LexicalNode, TextNode } from 'lexical'
import { z } from 'zod'

const htmlAttribute = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
const htmlText = (value: string) =>
  value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
const literalText = (value: string) =>
  htmlText(value)
    .replaceAll(/[\\`*_~[\]{}!|#]/g, '\\$&')
    .replaceAll(/:(?=\/\/)/g, '\\:')
const color =
  /^(?:#[\da-f]{3,4}|#[\da-f]{6}|#[\da-f]{8}|[a-z]+|(?:rgb|rgba|hsl|hsla)\([\d\s.,%+-]+\))$/i
const length = /^\d+(?:\.\d+)?(?:px|rem|em|pt|%)$/
const positivePixels = z.number().finite().nonnegative().max(100_000)
const span = z.number().int().min(1).max(1000)
const alertType = z.enum(['note', 'tip', 'important', 'warning', 'caution'])
const bannerType = z
  .enum([
    'note',
    'tip',
    'important',
    'warning',
    'caution',
    'info',
    'success',
    'error',
  ])
  .transform((type) =>
    type === 'info'
      ? 'note'
      : type === 'success'
        ? 'tip'
        : type === 'error'
          ? 'caution'
          : type,
  )

function safeStyle(value: string) {
  return value
    .split(';')
    .filter((part) => part.trim())
    .map((part) => {
      const colon = part.indexOf(':')
      const name = part.slice(0, colon).trim().toLowerCase()
      let value = part.slice(colon + 1).trim()
      let valid = false
      if (name === 'color' || name === 'background-color')
        valid = color.test(value)
      if (name === 'font-size') valid = length.test(value)
      if (name === 'font-family') {
        valid =
          /^(?:[\p{L}][\p{L}\d -]*|"[\p{L}][\p{L}\d -]*"|'[\p{L}][\p{L}\d -]*')(?:\s*,\s*(?:[\p{L}][\p{L}\d -]*|"[\p{L}][\p{L}\d -]*"|'[\p{L}][\p{L}\d -]*'))*$/u.test(
            value,
          )
        value = value.replaceAll(/["']/g, '')
      }
      if (colon < 1 || !valid) throw new Error('Unsupported Lexical style')
      return `${name}: ${value}`
    })
    .join('; ')
}

function safeUrl(value: string, purpose: 'link' | 'media') {
  if (!value || /[\u0000-\u0020\u007f\\<>"']/.test(value))
    throw new Error('Invalid Lexical URL')
  if (
    /^\/(?!\/)/.test(value) ||
    (purpose === 'link' && /^#[\w-]+$/.test(value))
  )
    return value
  const url = new URL(value)
  if (
    ![
      'http:',
      'https:',
      ...(purpose === 'link' ? ['mailto:', 'tel:'] : []),
    ].includes(url.protocol) ||
    url.username ||
    url.password
  )
    throw new Error('Invalid Lexical URL')
  return value
}

function fence(content: string, language = '') {
  if (
    !/^[\w+-]*$/.test(language) ||
    ['component', 'lexical-code'].includes(language.toLowerCase())
  )
    throw new Error('Unsupported code language')
  // The Markdown HTML parser scans closing tags before parsing fenced code.
  if (/<\/?[a-z][\w:-]*(?=[\s/>]|$)/i.test(content))
    return `\`\`\`lexical-code\n${Buffer.from(JSON.stringify({ language, code: content })).toString('base64')}\n\`\`\``
  const delimiter = '`'.repeat(
    Math.max(
      3,
      ...Array.from(content.matchAll(/`+/g), (match) => match[0].length + 1),
    ),
  )
  return `${delimiter}${language}\n${content}\n${delimiter}`
}

const sourceMetadata = z.object({
  type: z.string(),
  style: z.string().optional(),
  format: z.union([z.string(), z.number().int().nonnegative()]).optional(),
  indent: z.number().int().min(0).max(100).optional(),
  url: z.string().optional(),
  src: z.string().optional(),
  poster: z.string().optional(),
  language: z.string().optional(),
  colSpan: span.optional(),
  rowSpan: span.optional(),
  backgroundColor: z.string().nullable().optional(),
  width: positivePixels.nullable().optional(),
  height: positivePixels.optional(),
  colWidths: z.array(positivePixels).optional(),
  verticalAlign: z.enum(['', 'top', 'middle', 'bottom']).optional(),
  rowStriping: z.boolean().optional(),
  frozenColumnCount: z.number().optional(),
  frozenRowCount: z.number().optional(),
})

// Called before Lexical imports JSON, so invalid metadata cannot be normalized away.
export function validateProjectionNode(value: unknown) {
  const node = sourceMetadata.parse(value)
  if (node.type === 'live-photo') {
    const photo = livePhotoSchema.parse(value)
    safeUrl(photo.src, 'media')
    safeUrl(photo.videoSrc, 'media')
  }
  if (node.style) safeStyle(node.style)
  if (node.backgroundColor)
    safeStyle(`background-color: ${node.backgroundColor}`)
  if (node.url) safeUrl(node.url, 'link')
  if (node.src) safeUrl(node.src, 'media')
  if (node.poster) safeUrl(node.poster, 'media')
  if (node.language) fence('', node.language)
  if (
    typeof node.format === 'number' &&
    node.type === 'text' &&
    node.format & ~2047
  )
    throw new Error('Unsupported text format')
  if (
    typeof node.format === 'string' &&
    !['', 'left', 'right', 'center', 'justify', 'start', 'end'].includes(
      node.format,
    )
  )
    throw new Error('Unsupported alignment')
  if (
    (node.style || (typeof node.format === 'string' && node.format)) &&
    ![
      'text',
      'paragraph',
      'heading',
      'quote',
      'list',
      'listitem',
      'link',
      'autolink',
      'table',
      'tablerow',
      'tablecell',
      'details',
    ].includes(node.type)
  )
    throw new Error('Unsupported styled node')
  if (node.rowStriping || node.frozenColumnCount || node.frozenRowCount)
    throw new Error('Unsupported table layout')
}

const imageSchema = z.object({
  src: z.string(),
  altText: z.string().default(''),
  caption: z.string().optional(),
  width: positivePixels.optional(),
  height: positivePixels.optional(),
})
const livePhotoSchema = imageSchema.extend({version:z.literal(1), videoSrc:z.string()})

function imageMarkdown(value: unknown) {
  const image = imageSchema.parse(value)
  safeUrl(image.src, 'media')
  const complex =
    /[\[\]<>\n\r&\\]/.test(image.altText) ||
    /[<>\n\r&"\\]/.test(image.caption ?? '') ||
    /[()&]/.test(image.src) ||
    image.width ||
    image.height
  if (!complex)
    return `![${image.altText}](${image.src}${image.caption ? ` "${image.caption.replaceAll('"', '\\"')}"` : ''})`
  const attrs = [
    `data-lexical-image="true"`,
    `src="${image.src}"`,
    `alt="${htmlAttribute(image.altText)}"`,
  ]
  if (image.caption) attrs.push(`title="${htmlAttribute(image.caption)}"`)
  if (image.width) attrs.push(`width="${image.width}"`)
  if (image.height) attrs.push(`height="${image.height}"`)
  return `<img ${attrs.join(' ')}/>`
}

function textNeedsHtml(node: LexicalNode): boolean {
  return $isTextNode(node)
    ? Boolean(node.getStyle() || node.getFormat() & ~127)
    : $isElementNode(node) && node.getChildren().some(textNeedsHtml)
}
function inlineGroupNeedsHtml(node: LexicalNode, cache: Map<string, boolean>) {
  let group = node.getParent()
  while (group?.isInline()) group = group.getParent()
  const block = group ?? node
  const key = block.getKey()
  if (!cache.has(key)) cache.set(key, textNeedsHtml(block))
  return cache.get(key)
}
function formattedText(node: TextNode) {
  let value = literalText(node.getTextContent())
  const formats = [
    ['bold', 'strong'],
    ['italic', 'em'],
    ['strikethrough', 'del'],
    ['underline', 'u'],
    ['code', 'code'],
    ['subscript', 'sub'],
    ['superscript', 'sup'],
    ['highlight', 'mark'],
  ] as const
  for (const [format, tag] of formats)
    if (node.hasFormat(format)) value = `<${tag}>${value}</${tag}>`
  const styles = [safeStyle(node.getStyle())]
  for (const format of ['lowercase', 'uppercase', 'capitalize'] as const)
    if (node.hasFormat(format)) styles.push(`text-transform: ${format}`)
  return styles.some(Boolean)
    ? `<span style="${htmlAttribute(styles.filter(Boolean).join('; '))}">${value}</span>`
    : value
}
function elementAttributes(node: ElementNode, extraStyles: string[] = []) {
  const styles = [safeStyle(node.getStyle()), ...extraStyles]
  if (node.getFormatType()) styles.push(`text-align: ${node.getFormatType()}`)
  if (node.getIndent())
    styles.push(`padding-inline-start: ${node.getIndent() * 40}px`)
  return `${styles.some(Boolean) ? ` style="${htmlAttribute(styles.filter(Boolean).join('; '))}"` : ''}${node.getDirection() === 'rtl' ? ' dir="rtl"' : ''}`
}

export function $toProjectedMarkdown(project: (state: unknown) => string) {
  const htmlGroups = new Map<string, boolean>()
  function renderList(
    node: ListNode,
    exportChildren: (node: ElementNode) => string,
  ): string {
    if (node.getListType() === 'check')
      throw new Error('Unsupported styled checklist')
    const tag = node.getTag()
    return `<${tag}${node.getListType() === 'number' ? ` start="${node.getStart()}"` : ''}${elementAttributes(node)}>\n${node
      .getChildren()
      .map((item) => {
        if (!$isListItemNode(item)) throw new Error('Invalid list item')
        return `<li${elementAttributes(item)}>${exportChildren(item)}</li>`
      })
      .join('\n')}\n</${tag}>`
  }
  const custom: ElementTransformer = {
    dependencies: [],
    regExp: /a^/,
    replace() {},
    type: 'element',
    export(node, exportChildren) {
      const type = node.getType()
      if (
        $isListNode(node) &&
        (elementAttributes(node) ||
          textNeedsHtml(node) ||
          node
            .getChildren()
            .some((child) => $isElementNode(child) && elementAttributes(child)))
      ) {
        return renderList(node, exportChildren)
      }
      if ($isTableNode(node)) {
        const rows = node.getChildren()
        const simple =
          !elementAttributes(node) &&
          !node.getColWidths() &&
          rows.length > 0 &&
          rows.every(
            (row, index) =>
              $isTableRowNode(row) &&
              !row.getHeight() &&
              !elementAttributes(row) &&
              row
                .getChildren()
                .every(
                  (cell) =>
                    $isTableCellNode(cell) &&
                    cell.getHeaderStyles() === (index === 0 ? 1 : 0) &&
                    cell.getColSpan() === 1 &&
                    cell.getRowSpan() === 1 &&
                    !cell.getWidth() &&
                    !cell.getBackgroundColor() &&
                    !cell.getVerticalAlign() &&
                    !elementAttributes(cell) &&
                    cell
                      .getChildren()
                      .every(
                        (p) =>
                          p.getType() === 'paragraph' &&
                          $isElementNode(p) &&
                          !elementAttributes(p) &&
                          p
                            .getChildren()
                            .every(
                              (t) =>
                                $isTextNode(t) &&
                                !t.getFormat() &&
                                !t.getStyle() &&
                                !/[<>&\[\]]/.test(t.getTextContent()),
                            ),
                      ),
                ),
          )
        if (simple) return null
        const columns = node
          .getColWidths()
          ?.map(
            (width) => `<col style="width: ${positivePixels.parse(width)}px"/>`,
          )
          .join('')
        return `<table${elementAttributes(node)}>${columns ? `<colgroup>${columns}</colgroup>` : ''}<tbody>\n${rows
          .map((row) => {
            if (!$isTableRowNode(row)) throw new Error('Invalid table row')
            return `<tr${elementAttributes(row, row.getHeight() ? [`height: ${row.getHeight()}px`] : [])}>\n${row
              .getChildren()
              .map((cell) => {
                if (!$isTableCellNode(cell))
                  throw new Error('Invalid table cell')
                const tag = cell.getTag()
                const styles: string[] = []
                if (cell.getBackgroundColor())
                  styles.push(
                    safeStyle(`background-color: ${cell.getBackgroundColor()}`),
                  )
                if (cell.getWidth()) styles.push(`width: ${cell.getWidth()}px`)
                if (cell.getVerticalAlign())
                  styles.push(`vertical-align: ${cell.getVerticalAlign()}`)
                return `<${tag} colspan="${span.parse(cell.getColSpan())}" rowspan="${span.parse(cell.getRowSpan())}"${elementAttributes(cell, styles)}>\n${$convertToMarkdownString(transformers, cell)}\n</${tag}>`
              })
              .join('\n')}\n</tr>`
          })
          .join('\n')}\n</tbody></table>`
      }
      if (
        $isElementNode(node) &&
        ['paragraph', 'heading', 'quote'].includes(type)
      ) {
        const attributes = elementAttributes(node)
        if (!attributes && !textNeedsHtml(node)) return null
        const tag = $isHeadingNode(node)
          ? node.getTag()
          : type === 'quote'
            ? 'blockquote'
            : 'p'
        return `<${tag}${attributes}>${exportChildren(node)}</${tag}>`
      }
      if (type === 'details' && $isElementNode(node)) {
        const data = z
          .object({ summary: z.string(), open: z.boolean() })
          .parse(node.exportJSON())
        return `<details${elementAttributes(node)}${data.open ? ' open="true"' : ''}>\n<summary>${literalText(data.summary)}</summary>\n${$convertToMarkdownString(transformers, node)}\n</details>`
      }
      if (type === 'nested-doc') {
        const data = z.object({ content: z.unknown() }).parse(node.exportJSON())
        return `<section data-lexical="nested-doc">\n${project(data.content)}\n</section>`
      }
      if (type === 'grid-container') {
        const data = z
          .object({
            cols: z.number().int().min(1).max(12),
            gap: z.string().regex(/^\d+(?:\.\d+)?(?:px|rem|em)$/),
            cells: z.array(z.unknown()),
          })
          .parse(node.exportJSON())
        return `<div data-lexical="grid" style="display: grid; grid-template-columns: repeat(${data.cols}, minmax(0, 1fr)); gap: ${data.gap}">\n${data.cells.map((cell) => `<div>\n${project(cell)}\n</div>`).join('\n')}\n</div>`
      }
      if (type === 'banner' || type === 'alert-quote') {
        const data = z
          .object({
            content: z.unknown(),
            bannerType: bannerType.optional(),
            alertType: alertType.optional(),
          })
          .parse(node.exportJSON())
        return [
          `> [!${(data.bannerType ?? data.alertType ?? 'note').toUpperCase()}]`,
          ...project(data.content)
            .split('\n')
            .map((line) => `> ${line}`),
        ].join('\n')
      }
      if (type === 'katex-block') {
        const { equation } = z.object({ equation: z.string() }).parse(node.exportJSON())
        return `$$${equation}$$`
      }
      if (type === 'code-block') {
        const data = z
          .object({ code: z.string(), language: z.string().default('') })
          .parse(node.exportJSON())
        return fence(data.code, data.language)
      }
      if (type === 'code-snippet') {
        const { files } = z
          .object({
            files: z
              .array(
                z.object({
                  filename: z.string().default('untitled'),
                  language: z.string().default(''),
                  code: z.string().default(''),
                }),
              )
              .default([]),
          })
          .parse(node.exportJSON())
        const blocks = files.map((file) => fence(file.code, file.language))
        if (
          !blocks.some((block) => block.startsWith('```lexical-code\n')) &&
          !files.some((file) => file.filename.includes('<'))
        )
          return null
        return `<section>\n${files.map((file, index) => `<h4>${literalText(file.filename)}</h4>\n${blocks[index]}`).join('\n')}\n</section>`
      }
      if (type === 'code') {
        const { language } = z
          .object({ language: z.string().optional() })
          .parse(node.exportJSON())
        return fence(node.getTextContent(), language)
      }
      if (type === 'mermaid') {
        const { diagram } = z
          .object({ diagram: z.string() })
          .parse(node.exportJSON())
        return fence(diagram, 'mermaid')
      }
      if (type === 'excalidraw') {
        const { snapshot } = z
          .object({ snapshot: z.string() })
          .parse(node.exportJSON())
        if (snapshot.startsWith('ref:') || snapshot.startsWith('http')) {
          const [reference, ...lines] = snapshot.split('\n')
          if (reference.startsWith('ref:')) {
            if (!/^ref:file\/[\w.-]+\.excalidraw$/.test(reference) || reference.includes('..'))
              throw new Error('Invalid Excalidraw reference')
          } else safeUrl(reference, 'media')
          const delta = lines.join('\n').trim()
          if (delta) z.record(z.string(), z.unknown()).parse(JSON.parse(delta))
        } else z.record(z.string(), z.unknown()).parse(JSON.parse(snapshot))
        return fence(snapshot, 'excalidraw')
      }
      if (type === 'live-photo') {
        const photo = livePhotoSchema.parse(node.exportJSON())
        const cover = `![${literalText(photo.altText.replace(/[\r\n]/g, ' '))}](<${photo.src}>)`
        return [cover, photo.caption && literalText(photo.caption), `[▶ Live Photo](<${photo.videoSrc}>)`].filter(Boolean).join('\n\n')
      }
      if (type === 'image') return imageMarkdown(node.exportJSON())
      if (type === 'gallery') {
        const { images } = z
          .object({
            images: z.array(
              z.object({ src: z.string(), alt: z.string().default('') }),
            ),
          })
          .parse(node.exportJSON())
        return images
          .map((image) => imageMarkdown({ src: image.src, altText: image.alt }))
          .join('\n')
      }
      return null
    },
  }
  const safeInline: TextMatchTransformer = {
    dependencies: [],
    importRegExp: /a^/,
    regExp: /a^/,
    replace() {},
    type: 'text-match',
    export(node, exportChildren, exportFormat) {
      if ($isTextNode(node)) {
        if (
          inlineGroupNeedsHtml(node, htmlGroups) ||
          (node.hasFormat('code') && /[<`]/.test(node.getTextContent()))
        )
          return formattedText(node)
        if (!node.hasFormat('code')) {
          return exportFormat(node, htmlText(node.getTextContent()))
            .replaceAll(/[\[\]{}!#|=]/g, '\\$&')
            .replaceAll(/:(?=\/\/)/g, '\\:')
            .replaceAll(/^([ \t]*)([-+])/gm, '$1\\$2')
            .replaceAll(/^(\s*\d+)\.(?=\s)/gm, '$1\\.')
        }
      }
      if ($isLinkNode(node)) {
        const url = safeUrl(node.getURL(), 'link')
        if (elementAttributes(node))
          return `<a href="${url}"${elementAttributes(node)}>${exportChildren(node)}</a>`
        if (/[()]/.test(url))
          return `[${exportChildren(node)}](${url.replaceAll('(', '%28').replaceAll(')', '%29')})`
      }
      if ($isListNode(node)) return renderList(node, exportChildren)
      // Element transformers are not called for decorators nested inside paragraphs/lists.
      if (
        [
          'image',
          'gallery',
          'table',
          'details',
          'nested-doc',
          'grid-container',
          'banner',
          'alert-quote',
          'excalidraw',
          'code-block',
          'code-snippet',
          'code',
          'mermaid',
          'katex-block',
        ].includes(node.getType())
      )
        return custom.export?.(node, exportChildren) ?? null
      return null
    },
  }
  const transformers = [custom, safeInline, ...allHeadlessTransformers]
  return $convertToMarkdownString(transformers)
}
