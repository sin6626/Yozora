import type {
  SuzuriDocumentInput,
  SuzuriDocumentValue,
  SuzuriEnvelope,
} from '@suzuri/editor/schema'

import {
  isSuzuriEnvelope,
  normalizeToDocumentValue,
  toMarkdown,
  validateDocument,
} from '@suzuri/editor/schema'

export type PlateInitialValue =
  | { status: 'ok'; value: SuzuriDocumentInput | undefined }
  /** 有链接地址不合法（多半是编辑中途自动保存的占位 https://），这些链接已改成普通文字；其余内容原样 */
  | { status: 'repaired'; value: SuzuriEnvelope; links: string[] }
  /** 修不好：只读显示，不交给严格的编辑器（否则初始化直接抛错，整页打不开） */
  | { status: 'invalid'; error: string; text: string }

type Node = { type?: string; url?: unknown; children?: Node[] }

const validate = (value: unknown) =>
  validateDocument(value, { fingerprintPolicy: 'restamp' })

// 单独校验一个链接：包进一个段落里，其他什么都不放
const linkIsValid = (link: Node) =>
  validate({
    children: [
      { type: 'paragraph', children: [{ text: '' }, link, { text: '' }] },
    ],
  }).ok

function downgradeLinks(nodes: Node[], dropped: string[]): Node[] {
  return nodes.flatMap((node) => {
    const children = node.children && downgradeLinks(node.children, dropped)
    if (node.type === 'link' && !linkIsValid({ ...node, children })) {
      dropped.push(String(node.url ?? ''))
      return children ?? []
    }
    return children ? [{ ...node, children }] : [node]
  })
}

function readable(value: unknown) {
  try {
    const markdown = toMarkdown(value as SuzuriDocumentInput)
    if (markdown.ok) return markdown.markdown
  } catch {}
  return typeof value === 'string' ? value : JSON.stringify(value, null, 2)
}

/**
 * Core 允许草稿带着编辑中的占位链接保存，但 Suzuri 编辑器初始化时严格校验、遇到就抛错：
 * 打开前先校验，不合法的链接降成普通文字再打开（原稿不动，编辑之后才按新内容保存），还不行就只读显示。
 */
export function prepareInitialValue(
  value: SuzuriDocumentInput | undefined,
): PlateInitialValue {
  if (value === undefined) return { status: 'ok', value }
  const checked = validate(value)
  if (checked.ok) return { status: 'ok', value }

  let document: SuzuriDocumentValue | undefined
  try {
    const raw = typeof value === 'string' ? JSON.parse(value) : value
    document = isSuzuriEnvelope(raw)
      ? raw.document
      : normalizeToDocumentValue(raw)
  } catch {}
  if (document && Array.isArray(document.children)) {
    const links: string[] = []
    const children = downgradeLinks(document.children as Node[], links)
    const repaired = links.length ? validate({ ...document, children }) : null
    if (repaired?.ok) {
      return { status: 'repaired', value: repaired.envelope, links }
    }
  }
  return { status: 'invalid', error: checked.error, text: readable(value) }
}
