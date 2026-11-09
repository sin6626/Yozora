import { HeadlessLivePhotoNode } from '~/utils/live-photo-node'
import { allHeadlessNodes } from '@haklex/rich-headless'
import { createHeadlessEditor } from '@lexical/headless'
import { BadRequestException, Injectable } from '@nestjs/common'
import { nanoid } from 'nanoid'
import { z } from 'zod'

import {
  BLOCK_ID_STATE_KEY,
  NODE_STATE_KEY,
} from '~/constants/lexical.constant'
import { ContentFormat } from '~/shared/types/content-format.type'
import {
  $toProjectedMarkdown,
  validateProjectionNode,
} from '~/utils/lexical-projection.util'
import { md5 } from '~/utils/tool.util'

const lexicalNodeSchema = z
  .object({
    type: z.string(),
    version: z.number().int(),
    children: z.array(z.unknown()).optional(),
  })
  .passthrough()

const lexicalStateSchema = z.object({
  root: lexicalNodeSchema.extend({
    type: z.literal('root'),
    children: z.array(z.unknown()),
  }),
})

const lexicalNodeTypes = new Set([
  'root',
  'paragraph',
  'text',
  'linebreak',
  'tab',
  'live-photo',
  ...allHeadlessNodes.map((Node) => Node.getType()),
])

const plainParagraphProperties: Record<string, unknown> = {
  type: 'paragraph', version: 1, direction: null, format: '', indent: 0,
  style: '', textFormat: 0, textStyle: '',
}
const nonInlineChildren = new Set([
  'root', 'paragraph', 'heading', 'quote', 'list', 'listitem',
  'table', 'tablerow', 'tablecell', 'details',
])

function isLexicalState(content: string | undefined) {
  if (!content) return false
  try {
    return lexicalStateSchema.safeParse(JSON.parse(content)).success
  } catch {
    return false
  }
}

function isPlainParagraph(node: z.infer<typeof lexicalNodeSchema>) {
  return Object.entries(node).every(([key, value]) => {
    if (key === 'children') return true
    if (key === NODE_STATE_KEY) {
      const state = z.record(z.string(), z.unknown()).safeParse(value)
      return state.success && Object.keys(state.data).length === 0
    }
    return Object.hasOwn(plainParagraphProperties, key)
      && value === plainParagraphProperties[key]
  })
}

type ContentDocument = {
  contentFormat?: ContentFormat | string
  content?: string
  text?: string
}

const KNOWN_STRUCTURAL_PROPS = new Set([
  'children',
  'type',
  'version',
  'direction',
  'format',
  'indent',
  'style',
  'detail',
  'mode',
  'text',
  'tag',
  'listType',
  'start',
  'value',
  'url',
  'rel',
  'target',
  'colSpan',
  'headerState',
  'width',
  NODE_STATE_KEY,
])

export interface LexicalRootBlock {
  id: string | null
  type: string
  text: string
  fingerprint: string
  index: number
}

@Injectable()
export class LexicalService {
  private createBlockId() {
    return nanoid(8)
  }

  private parseEditorState(content: string): any | null {
    try {
      return JSON.parse(content)
    } catch {
      return null
    }
  }

  private getNodeState(node: any): Record<string, any> | null {
    const state = node?.[NODE_STATE_KEY]
    if (!state || typeof state !== 'object' || Array.isArray(state)) {
      return null
    }
    return state
  }

  private readBlockId(node: any): string | null {
    const state = this.getNodeState(node)
    const blockId = state?.[BLOCK_ID_STATE_KEY]
    if (typeof blockId !== 'string' || !blockId.trim()) {
      return null
    }
    return blockId.trim()
  }

  private writeBlockId(node: any, blockId: string): boolean {
    let changed = false

    if (!node[NODE_STATE_KEY] || typeof node[NODE_STATE_KEY] !== 'object') {
      node[NODE_STATE_KEY] = {}
      changed = true
    }

    if (node[NODE_STATE_KEY][BLOCK_ID_STATE_KEY] !== blockId) {
      node[NODE_STATE_KEY][BLOCK_ID_STATE_KEY] = blockId
      changed = true
    }

    return changed
  }

  private normalizeText(text: string): string {
    return text.replaceAll(/\s+/g, ' ').trim()
  }

  private isNestedEditorState(
    value: unknown,
  ): value is { root: { children: any[] } } {
    return (
      !!value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      'root' in value &&
      !!value.root &&
      typeof value.root === 'object' &&
      'children' in value.root &&
      Array.isArray(value.root.children)
    )
  }

  private extractBlockText(node: any): string {
    if (!node) return ''

    if (node.type === 'text') {
      return String(node.text || '')
    }

    if (node.type === 'linebreak') {
      return '\n'
    }

    if (typeof node.code === 'string') {
      return node.code
    }

    // Include snapshot content for fingerprinting (e.g., excalidraw)
    if (typeof node.snapshot === 'string') {
      return node.snapshot
    }

    const segments: string[] = []

    if (Array.isArray(node.children)) {
      const childText = node.children
        .map((child: any) => this.extractBlockText(child))
        .join('')
      if (childText) {
        segments.push(childText)
      }
    }

    for (const [key, rawValue] of Object.entries(
      node as Record<string, unknown>,
    )) {
      const value = rawValue
      if (KNOWN_STRUCTURAL_PROPS.has(key)) continue

      if (this.isNestedEditorState(value)) {
        const nested = value.root.children
          .map((child: any) => this.extractBlockText(child))
          .join('\n')
        if (nested) {
          segments.push(nested)
        }
        continue
      }

      if (Array.isArray(value)) {
        const nestedSegments: string[] = []
        for (const item of value) {
          if (!this.isNestedEditorState(item)) continue
          const nested = item.root.children
            .map((child: any) => this.extractBlockText(child))
            .join('\n')
          if (nested) {
            nestedSegments.push(nested)
          }
        }
        if (nestedSegments.length) {
          segments.push(nestedSegments.join('\n'))
        }
      }
    }

    return segments.join('\n')
  }

  normalizeBlockIds(content: string): { content: string; changed: boolean } {
    const editorState = this.parseEditorState(content)
    if (!editorState?.root || !Array.isArray(editorState.root.children)) {
      return { content, changed: false }
    }

    let changed = false
    const used = new Set<string>()

    for (const child of editorState.root.children) {
      if (!child || typeof child !== 'object') continue

      let blockId = this.readBlockId(child)
      if (!blockId || used.has(blockId)) {
        blockId = this.createBlockId()
      }

      if (this.writeBlockId(child, blockId)) {
        changed = true
      }

      used.add(blockId)
    }

    return changed
      ? { content: JSON.stringify(editorState), changed: true }
      : { content, changed: false }
  }

  extractRootBlocks(content: string): LexicalRootBlock[] {
    const editorState = this.parseEditorState(content)
    if (!editorState?.root || !Array.isArray(editorState.root.children)) {
      return []
    }

    return editorState.root.children
      .map((child: any, index: number) => {
        if (!child || typeof child !== 'object') {
          return null
        }

        const text = this.extractBlockText(child)
        const normalized = this.normalizeText(text)
        const type = typeof child.type === 'string' ? child.type : 'unknown'
        const fingerprint = md5(`${type}:${normalized}`)

        return {
          id: this.readBlockId(child),
          type,
          text,
          fingerprint,
          index,
        } satisfies LexicalRootBlock
      })
      .filter((block): block is LexicalRootBlock => !!block)
  }

  normalizeLegacyQuotes(content: string): string {
    let changed = false
    function visitDocument(value: unknown): unknown {
      const record = z.record(z.string(), z.unknown()).safeParse(value)
      if (!record.success || !lexicalStateSchema.safeParse(value).success) return value
      return { ...record.data, root: visitNode(record.data.root) }
    }
    function visitNode(value: unknown): unknown {
      const parsed = lexicalNodeSchema.safeParse(value)
      if (!parsed.success) return value
      const record = z.record(z.string(), z.unknown()).parse(value)
      let node = { ...record, ...parsed.data }
      if (node.children) node.children = node.children.map(visitNode)
      if (['banner', 'alert-quote', 'nested-doc'].includes(node.type)) {
        if (node.content) node.content = visitDocument(node.content)
      }
      if (node.type === 'grid-container' && Array.isArray(node.cells)) {
        node.cells = node.cells.map(visitDocument)
      }
      while (node.type === 'paragraph' && node.children?.length === 1) {
        const child = lexicalNodeSchema.safeParse(node.children[0])
        if (!child.success || child.data.type !== 'paragraph') break
        if (isPlainParagraph(node)) {
          node = { ...z.record(z.string(), z.unknown()).parse(node.children[0]), ...child.data }
        } else if (isPlainParagraph(child.data)) {
          node.children = child.data.children ?? []
        } else break
        changed = true
      }
      return node
    }
    try {
      const normalized = visitDocument(JSON.parse(content))
      return changed ? JSON.stringify(normalized) : content
    } catch {
      return content
    }
  }

  lexicalToMarkdown(editorState: string): string {
    try {
      const normalized = this.normalizeLegacyQuotes(editorState)
      const state = lexicalStateSchema.parse(JSON.parse(normalized))
      this.validateNode(state.root)
      return this.convertToMarkdown(normalized)
    } catch (error) {
      if (error instanceof BadRequestException) throw error
      throw new BadRequestException('Invalid Lexical content')
    }
  }

  private validateNode(value: unknown): void {
    const node = lexicalNodeSchema.parse(value)
    if (!lexicalNodeTypes.has(node.type)) {
      const type = /^[\w-]{1,80}$/.test(node.type) ? node.type : 'unknown'
      throw new BadRequestException(`Unsupported Lexical node: ${type}`)
    }
    validateProjectionNode(node)
    for (const child of node.children ?? []) {
      if (['paragraph', 'heading'].includes(node.type)) {
        const parsed = lexicalNodeSchema.parse(child)
        if (nonInlineChildren.has(parsed.type)) {
          throw new BadRequestException(`Invalid Lexical nesting: ${node.type} > ${parsed.type}`)
        }
      }
      this.validateNode(child)
    }
    if (
      ['banner', 'alert-quote', 'nested-doc'].includes(node.type) &&
      node.content != null
    ) {
      this.validateNode(lexicalStateSchema.parse(node.content).root)
    }
    if (node.type === 'grid-container') {
      for (const cell of z.array(lexicalStateSchema).parse(node.cells ?? [])) {
        this.validateNode(cell.root)
      }
    }
  }

  private convertToMarkdown(editorState: string): string {
    const editor = createHeadlessEditor({
      nodes: [...allHeadlessNodes, HeadlessLivePhotoNode],
      onError: (error) => {
        throw error
      },
    })

    const parsed = editor.parseEditorState(editorState)
    if (parsed.isEmpty()) return ''
    editor.setEditorState(parsed)

    let markdown = ''
    editor.read(() => {
      markdown = $toProjectedMarkdown((state) =>
        this.lexicalToMarkdown(JSON.stringify(state)),
      )
    })

    return markdown
  }

  // Autosave runs mid-edit (a new link starts as "https://"), so a draft keeps
  // any well-formed Lexical document with its last good text; publish re-checks.
  populateDraftText<T extends ContentDocument>(
    doc: T,
    existing?: ContentDocument,
  ): boolean {
    try {
      return this.populateText(doc, existing)
    } catch (error) {
      if (!isLexicalState(doc.content)) throw error
      doc.text = existing?.text ?? ''
      return true
    }
  }

  populateText<T extends ContentDocument>(
    doc: T,
    existing?: ContentDocument,
  ): boolean {
    const format =
      doc.contentFormat ?? existing?.contentFormat ?? ContentFormat.Markdown
    const formatChanged =
      existing &&
      doc.contentFormat !== undefined &&
      doc.contentFormat !== (existing.contentFormat ?? ContentFormat.Markdown)

    if (format === ContentFormat.Markdown) {
      if (formatChanged && doc.text === undefined) {
        throw new BadRequestException(
          'text is required when switching to markdown',
        )
      }
      return false
    }
    if (
      existing &&
      doc.content === undefined &&
      doc.text === undefined &&
      !formatChanged
    ) {
      return false
    }
    const content =
      doc.content ?? (formatChanged ? undefined : existing?.content)
    if (!content) {
      throw new BadRequestException(
        'content is required when contentFormat is lexical',
      )
    }
    const normalized = this.normalizeLegacyQuotes(content)
    const text = this.lexicalToMarkdown(normalized)
    if (doc.content !== undefined) {
      doc.content = normalized !== existing?.content
        ? this.normalizeBlockIds(normalized).content
        : normalized
    }
    doc.text = text.trim()
    return true
  }
}
