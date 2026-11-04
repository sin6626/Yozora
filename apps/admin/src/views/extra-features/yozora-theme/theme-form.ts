// Yozora 主题设置表单 ⇄ Core 配置片段 theme/yozora 的 JSON（格式见前台 apps/web/lib/theme-config.ts）。
// 表单只管下面这些字段；保存时只写改过的字段，片段里其他内容（技术栈的行、作品译文等）和没动过的字段原样保留。
// 中文写在片段根上，写成空就是“不显示”；英文、日文写在 i18n.<lang> 下，留空表示“没有译文，显示中文”。
export const languages = ['zh', 'en', 'ja'] as const
export type Language = (typeof languages)[number]

export const textFields = ['heroTitle', 'heroDescription', 'motto', 'copyright', 'techTitle', 'techDescription'] as const
export type TextField = (typeof textFields)[number]

export type ThemeForm = Record<Language, Record<TextField, string>> & {
  icpLabel: string
  icpHref: string
  github: string
  leetcode: string
}

const paths: Record<TextField, string[]> = {
  heroTitle: ['hero', 'title'],
  heroDescription: ['hero', 'description'],
  motto: ['footer', 'motto'],
  copyright: ['copyright'],
  techTitle: ['techStack', 'title'],
  techDescription: ['techStack', 'description'],
}
const sharedPaths = {
  icpLabel: ['footer', 'icp', 'label'],
  icpHref: ['footer', 'icp', 'href'],
  github: ['accounts', 'github'],
  leetcode: ['accounts', 'leetcode'],
} as const

type Json = Record<string, unknown>
const isObject = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value)

function get(source: unknown, path: readonly string[]): unknown {
  return path.reduce<unknown>((value, key) => (isObject(value) ? value[key] : undefined), source)
}

function set(target: Json, path: readonly string[], value: unknown) {
  let node = target
  for (const key of path.slice(0, -1)) {
    if (!isObject(node[key])) node[key] = {}
    node = node[key] as Json
  }
  if (value === undefined) delete node[path.at(-1)!]
  else node[path.at(-1)!] = value
}

// 说明在片段里是数组（一行一段），表单里是多行文本
const toText = (field: TextField, value: unknown) =>
  field === 'heroDescription' && Array.isArray(value) ? value.join('\n') : typeof value === 'string' ? value : ''
const fromText = (field: TextField, value: string) =>
  field === 'heroDescription' ? value.split('\n').map((line) => line.trim()).filter(Boolean) : value.trim()

const scope = (config: Json, language: Language) => (language === 'zh' ? config : get(config, ['i18n', language]))

export function readThemeForm(raw: string): ThemeForm {
  const config = JSON.parse(raw) as Json
  const text = (language: Language) =>
    Object.fromEntries(textFields.map((field) => [field, toText(field, get(scope(config, language), paths[field]))])) as Record<TextField, string>
  const shared = (key: keyof typeof sharedPaths) => {
    const value = get(config, sharedPaths[key])
    return typeof value === 'string' ? value : ''
  }
  return { zh: text('zh'), en: text('en'), ja: text('ja'), icpLabel: shared('icpLabel'), icpHref: shared('icpHref'), github: shared('github'), leetcode: shared('leetcode') }
}

export function writeThemeForm(raw: string, initial: ThemeForm, next: ThemeForm): string {
  const config = JSON.parse(raw) as Json
  for (const language of languages) {
    for (const field of textFields) {
      if (next[language][field] === initial[language][field]) continue
      const value = fromText(field, next[language][field])
      const empty = Array.isArray(value) ? value.length === 0 : value === ''
      if (language === 'zh') set(config, paths[field], value)
      else set(config, ['i18n', language, ...paths[field]], empty ? undefined : value)
    }
  }
  if (next.icpLabel !== initial.icpLabel || next.icpHref !== initial.icpHref) {
    const label = next.icpLabel.trim()
    const href = next.icpHref.trim()
    set(config, ['footer', 'icp'], label && href ? { label, href } : null)
  }
  for (const key of ['github', 'leetcode'] as const) {
    if (next[key] !== initial[key]) set(config, sharedPaths[key], next[key].trim())
  }
  return JSON.stringify(config, null, 2)
}
