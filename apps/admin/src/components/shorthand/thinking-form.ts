// 后台“思考”编辑框的表单规则：八种类型各有哪些字段（和 Core 的 recently.schema.ts 一致），
// 表单状态和 Core 请求体之间的转换、校验，以及粘贴链接时的自动补全。检查 scripts/verify-admin-thinking-form.mjs。
// 表单里所有字段都存成文字，发出去时再按字段类型转成数字或列表。

export type ThinkingType =
  | 'text'
  | 'book'
  | 'media'
  | 'music'
  | 'github'
  | 'link'
  | 'academic'
  | 'code'
type FieldKind =
  | 'text'
  | 'url'
  | 'rating'
  | 'count'
  | 'color'
  | 'list'
  | 'textarea'
export interface ThinkingField {
  key: string
  label: string
  kind?: FieldKind
  required?: boolean
  placeholder?: string
}

const link: ThinkingField = {
  key: 'url',
  label: '链接',
  kind: 'url',
  required: true,
  placeholder: 'https://',
}
const cover: ThinkingField = {
  key: 'cover',
  label: '封面',
  kind: 'url',
  placeholder: '图片地址，可不填',
}
const rating: ThinkingField = {
  key: 'rating',
  label: '评分',
  kind: 'rating',
  placeholder: '0–10',
}

export const thinkingTypes: {
  value: ThinkingType
  label: string
  fields: ThinkingField[]
}[] = [
  { value: 'text', label: '纯文字', fields: [] },
  {
    value: 'book',
    label: '书',
    fields: [
      link,
      { key: 'title', label: '书名', required: true },
      { key: 'author', label: '作者', required: true },
      cover,
      rating,
      { key: 'isbn', label: 'ISBN' },
    ],
  },
  {
    value: 'media',
    label: '影视',
    fields: [
      link,
      { key: 'title', label: '标题', required: true },
      { key: 'originalTitle', label: '原名' },
      { key: 'genre', label: '类型', placeholder: '电影、动画、剧集…' },
      cover,
      rating,
      { key: 'description', label: '简介', kind: 'textarea' },
    ],
  },
  {
    value: 'music',
    label: '音乐',
    fields: [
      link,
      { key: 'title', label: '歌名', required: true },
      { key: 'artist', label: '歌手', required: true },
      { key: 'album', label: '专辑' },
      cover,
      { key: 'source', label: '来源', placeholder: '网易云音乐、Apple Music…' },
    ],
  },
  {
    value: 'github',
    label: 'GitHub',
    fields: [
      link,
      { key: 'owner', label: '所有者', required: true },
      { key: 'repo', label: '仓库', required: true },
      { key: 'description', label: '描述', kind: 'textarea' },
      { key: 'stars', label: '星标', kind: 'count' },
      { key: 'language', label: '语言' },
      {
        key: 'languageColor',
        label: '语言色',
        kind: 'color',
        placeholder: '#3178c6',
      },
    ],
  },
  {
    value: 'link',
    label: '网页',
    fields: [
      link,
      { key: 'title', label: '标题' },
      { key: 'description', label: '描述', kind: 'textarea' },
      {
        key: 'image',
        label: '配图',
        kind: 'url',
        placeholder: '图片地址，可不填',
      },
    ],
  },
  {
    value: 'academic',
    label: '论文',
    fields: [
      link,
      { key: 'title', label: '标题', required: true },
      {
        key: 'authors',
        label: '作者',
        kind: 'list',
        placeholder: '多位用逗号隔开',
      },
      { key: 'arxivId', label: 'arXiv 编号' },
    ],
  },
  {
    value: 'code',
    label: '题目',
    fields: [
      link,
      { key: 'title', label: '题目', required: true },
      { key: 'difficulty', label: '难度', placeholder: '简单、中等、困难' },
      {
        key: 'tags',
        label: '标签',
        kind: 'list',
        placeholder: '多个用逗号隔开',
      },
      { key: 'platform', label: '平台', placeholder: '力扣' },
    ],
  },
]

const fieldsOf = (type: ThinkingType) =>
  thinkingTypes.find((item) => item.value === type)?.fields ?? []
const typeLabel = (type: unknown) =>
  thinkingTypes.find((item) => item.value === type)?.label

export interface ThinkingDraft {
  type: ThinkingType
  content: string
  fields: Record<string, string>
  // 引用的站内文章、手记、页面的 id；null 表示不引用（编辑时会清掉原来的引用）
  ref: string | null
}

export interface ThinkingPayload {
  type: ThinkingType
  content: string
  metadata?: Record<string, unknown>
  ref: string | null
}

// 编辑已有的思考：Core 返回的条目 → 表单；没有类型的旧数据当纯文字
export function draftFrom(item?: {
  type?: string
  content?: string
  metadata?: Record<string, unknown> | null
  ref?: unknown
}): ThinkingDraft {
  const type = typeLabel(item?.type) ? (item!.type as ThinkingType) : 'text'
  const fields: Record<string, string> = {}
  for (const field of fieldsOf(type)) {
    const value = item?.metadata?.[field.key]
    if (Array.isArray(value)) fields[field.key] = value.join(', ')
    else if (typeof value === 'number' || (typeof value === 'string' && value))
      fields[field.key] = String(value)
  }
  const ref = item?.ref as
    | { id?: string; _id?: string }
    | string
    | null
    | undefined
  return {
    type,
    content: item?.content ?? '',
    fields,
    ref: (typeof ref === 'string' ? ref : (ref?.id ?? ref?._id)) || null,
  }
}

const isUrl = (value: string) => /^https?:\/\/\S+$/i.test(value)
const listOf = (value: string) =>
  value
    .split(/[,，、\n]/)
    .map((item) => item.trim())
    .filter(Boolean)

// 保存前的检查：缺了什么、哪里格式不对，按表单顺序给出提示
export function problems(draft: ThinkingDraft): string[] {
  const result: string[] = []
  if (draft.type === 'text' && !draft.content.trim()) result.push('请写下看法')
  for (const field of fieldsOf(draft.type)) {
    const value = draft.fields[field.key]?.trim() ?? ''
    if (!value) {
      if (field.required) result.push(`请填写${field.label}`)
      continue
    }
    if (field.kind === 'url' && !isUrl(value))
      result.push(`${field.label}要以 http:// 或 https:// 开头`)
    if (field.kind === 'rating' && !(Number(value) >= 0 && Number(value) <= 10))
      result.push(`${field.label}要是 0 到 10 的数字`)
    if (
      field.kind === 'count' &&
      !(Number.isSafeInteger(Number(value)) && Number(value) >= 0)
    )
      result.push(`${field.label}要是不小于 0 的整数`)
    if (field.kind === 'color' && !/^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(value))
      result.push(`${field.label}要写成 #3178c6 这样`)
  }
  return result
}

// 表单 → Core 请求体：只发当前类型的字段，空着的不发，数字和列表按字段类型转换
export function toPayload(draft: ThinkingDraft): ThinkingPayload {
  const payload: ThinkingPayload = {
    type: draft.type,
    content: draft.content.trim(),
    ref: draft.ref,
  }
  const fields = fieldsOf(draft.type)
  if (!fields.length) return payload
  const metadata: Record<string, unknown> = {}
  for (const field of fields) {
    const value = draft.fields[field.key]?.trim()
    if (!value) continue
    if (field.kind === 'rating' || field.kind === 'count')
      metadata[field.key] = Number(value)
    else if (field.kind === 'list') metadata[field.key] = listOf(value)
    else metadata[field.key] = value
  }
  payload.metadata = metadata
  return payload
}

// 粘贴链接后补全空着的字段：GitHub 的所有者和仓库、arXiv 编号、力扣平台名；已经填了的不动
export function autofill(
  type: ThinkingType,
  fields: Record<string, string>,
): Record<string, string> {
  let url: URL
  try {
    url = new URL(fields.url ?? '')
  } catch {
    return fields
  }
  const found: Record<string, string> = {}
  if (type === 'github' && url.hostname === 'github.com') {
    const [owner, repo] = url.pathname.split('/').filter(Boolean)
    if (owner && repo) Object.assign(found, { owner, repo })
  }
  if (type === 'academic' && url.hostname.endsWith('arxiv.org')) {
    const id = url.pathname.match(/\/(?:abs|pdf)\/([\w.\-/]+?)(?:\.pdf)?$/)?.[1]
    if (id) found.arxivId = id
  }
  if (type === 'code') {
    const platform = { 'leetcode.cn': '力扣', 'leetcode.com': 'LeetCode' }[
      url.hostname
    ]
    if (platform) found.platform = platform
  }
  const result = { ...fields }
  for (const [key, value] of Object.entries(found))
    if (!result[key]?.trim()) result[key] = value
  return result
}

// 列表里一行卡片摘要，如“书｜《被讨厌的勇气》 · 岸见一郎”；纯文字没有
export function quoteSummary(item: {
  type?: string
  metadata?: Record<string, any> | null
}): string | null {
  const label = typeLabel(item.type)
  const m = item.metadata
  if (!label || item.type === 'text' || !m) return null
  const host = () => {
    try {
      return new URL(m.url).hostname
    } catch {
      return ''
    }
  }
  const text = {
    book: () => [`《${m.title}》`, m.author],
    media: () => [m.title, m.originalTitle],
    music: () => [m.title, m.artist],
    github: () => [`${m.owner}/${m.repo}`],
    link: () => [m.title || host()],
    academic: () => [m.title],
    code: () => [m.title, m.difficulty],
  }[item.type as Exclude<ThinkingType, 'text'>]()
  return `${label}｜${text.filter(Boolean).join(' · ')}`
}
