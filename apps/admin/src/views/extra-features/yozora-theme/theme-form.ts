// Yozora 主题设置表单 ⇄ Core 配置片段 theme/yozora 的 JSON（格式与读取规则见前台 apps/web/lib/theme-config.ts）。
// 每个字段三种状态，和前台的规则一一对应：
//   null —— 片段里没写：中文用前台默认文案；英文、日文表示没有译文、显示中文；
//   ''   —— 写成空：这一项（在这种语言里）不显示；
//   其他 —— 写了的文字。
// 保存时只算出改了哪几项（themeChanges），再套到保存那一刻读到的最新片段上（applyThemeChanges），
// 片段里表单不管的内容（技术栈图标行等）和别处刚做的修改都不会被打开表单时的旧快照覆盖。
// 另有只在外文里的两样：站点描述（中文在 SEO 设置）和作品名、介绍（中文在作品页），前台留空也是显示中文，所以只有“有译文 / 没有”两态。
export const languages = ['zh', 'en', 'ja'] as const
export type Language = (typeof languages)[number]

export const textFields = ['heroTitle', 'heroDescription', 'motto', 'copyright', 'techTitle', 'techDescription'] as const
export type TextField = (typeof textFields)[number]

export type FieldValue = string | null
export type ForeignLanguage = Exclude<Language, 'zh'>
export type ContentTranslation = { siteDescription: FieldValue; projects: Record<string, { name: FieldValue; description: FieldValue }> }
export type ThemeForm = Record<Language, Record<TextField, FieldValue>> & {
  icpLabel: FieldValue
  icpHref: FieldValue
  github: FieldValue
  leetcode: FieldValue
  translations: Record<ForeignLanguage, ContentTranslation>
}

// value 为 undefined 表示删掉这一项（回到默认 / 显示中文）
export type ThemeChange = { path: string[]; value: unknown }

const paths: Record<TextField, string[]> = {
  heroTitle: ['hero', 'title'],
  heroDescription: ['hero', 'description'],
  motto: ['footer', 'motto'],
  copyright: ['copyright'],
  techTitle: ['techStack', 'title'],
  techDescription: ['techStack', 'description'],
}
const icpPath = ['footer', 'icp']
const accountPaths = { github: ['accounts', 'github'], leetcode: ['accounts', 'leetcode'] } as const

// 前台认得的分组和组里的项。整组写成 null 是“全部不显示”；往这样的组里写一项时，其余各项要明确写成 null，
// 不能变成“没写”（那会让前台的默认内容冒出来）。techStack.rows 表单不管，但同样要保持清空。
const groupChildren: Record<string, string[]> = {
  hero: ['title', 'description'],
  footer: ['motto', 'icp'],
  accounts: ['github', 'leetcode'],
  techStack: ['title', 'description', 'rows'],
}

type Json = Record<string, unknown>
const isObject = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value)

const scopePath = (language: Language) => (language === 'zh' ? [] : ['i18n', language])

// 和前台 field() 同样的走法：途中某一级不是对象 = 写了、清空了（''）；缺这个键 = 没写（null）
function readValue(config: Json, language: Language, path: readonly string[]): unknown {
  let node: unknown = config
  if (language !== 'zh') {
    // 前台对 i18n、i18n.<lang> 本身不是对象的情况按“没有译文”处理
    const i18n = config.i18n
    if (!isObject(i18n) || !isObject(i18n[language])) return undefined
    node = i18n[language]
  }
  for (const key of path) {
    if (!isObject(node)) return null
    if (node[key] === undefined) return undefined
    node = node[key]
  }
  return node
}

const toField = (field: TextField | 'shared', value: unknown): FieldValue => {
  if (value === undefined) return null
  if (field === 'heroDescription' && Array.isArray(value)) return value.filter((line) => typeof line === 'string').join('\n')
  return typeof value === 'string' ? value : ''
}
const fromField = (field: TextField, value: string) =>
  field === 'heroDescription' ? value.split('\n').map((line) => line.trim()).filter(Boolean) : value.trim()

const translationText = (value: unknown): FieldValue => (typeof value === 'string' && value.trim() ? value : null)

// projectIds：后台现有作品的 id，每个作品一栏（没有译文的也列出来）
export function readThemeForm(raw: string, projectIds: string[] = []): ThemeForm {
  const config = JSON.parse(raw) as Json
  const translation = (language: ForeignLanguage): ContentTranslation => ({
    siteDescription: translationText(readValue(config, language, ['siteDescription'])),
    projects: Object.fromEntries(projectIds.map((id) => [id, {
      name: translationText(readValue(config, language, ['projects', id, 'name'])),
      description: translationText(readValue(config, language, ['projects', id, 'description'])),
    }])),
  })
  const text = (language: Language) =>
    Object.fromEntries(textFields.map((field) => [field, toField(field, readValue(config, language, paths[field]))])) as Record<TextField, FieldValue>
  const icp = readValue(config, 'zh', icpPath)
  const icpPart = (key: 'label' | 'href'): FieldValue => (icp === undefined ? null : isObject(icp) && typeof icp[key] === 'string' ? icp[key] : '')
  return {
    zh: text('zh'),
    en: text('en'),
    ja: text('ja'),
    icpLabel: icpPart('label'),
    icpHref: icpPart('href'),
    github: toField('shared', readValue(config, 'zh', accountPaths.github)),
    leetcode: toField('shared', readValue(config, 'zh', accountPaths.leetcode)),
    translations: { en: translation('en'), ja: translation('ja') },
  }
}

export function themeChanges(initial: ThemeForm, next: ThemeForm): ThemeChange[] {
  const changes: ThemeChange[] = []
  for (const language of languages) {
    for (const field of textFields) {
      const value = next[language][field]
      if (value === initial[language][field]) continue
      changes.push({ path: [...scopePath(language), ...paths[field]], value: value === null ? undefined : fromField(field, value) })
    }
  }
  if (next.icpLabel !== initial.icpLabel || next.icpHref !== initial.icpHref) {
    const label = next.icpLabel?.trim()
    const href = next.icpHref?.trim()
    const value = next.icpLabel === null && next.icpHref === null ? undefined : label && href ? { label, href } : null
    changes.push({ path: icpPath, value })
  }
  for (const key of ['github', 'leetcode'] as const) {
    if (next[key] !== initial[key]) changes.push({ path: [...accountPaths[key]], value: next[key] === null ? undefined : next[key]!.trim() })
  }
  const translationValue = (value: FieldValue) => value?.trim() || undefined
  for (const language of ['en', 'ja'] as const) {
    const [before, after] = [initial.translations[language], next.translations[language]]
    if (after.siteDescription !== before.siteDescription) changes.push({ path: ['i18n', language, 'siteDescription'], value: translationValue(after.siteDescription) })
    for (const [id, project] of Object.entries(after.projects)) {
      for (const key of ['name', 'description'] as const) {
        if (project[key] !== before.projects[id]?.[key]) changes.push({ path: ['i18n', language, 'projects', id, key], value: translationValue(project[key]) })
      }
    }
  }
  return changes
}

// 片段里某个位置“原来是什么”，用来判断保存前它有没有被别处改过
function peek(config: Json, path: readonly string[]): string {
  let node: unknown = config
  for (const key of path) {
    if (!isObject(node)) return node === undefined ? 'missing' : 'cleared'
    node = node[key]
  }
  return node === undefined ? 'missing' : JSON.stringify(node)
}

function clearedGroup(path: readonly string[]): Json {
  const key = (path[0] === 'i18n' ? path.slice(2) : path).join('.')
  return Object.fromEntries((groupChildren[key] ?? []).map((child) => [child, null]))
}

function setPath(config: Json, path: readonly string[], value: unknown) {
  let node = config
  for (let index = 0; index < path.length - 1; index++) {
    const key = path[index]
    const child = node[key]
    if (!isObject(child)) {
      if (child === undefined && value === undefined) return // 要删的项本来就没写
      node[key] = child === undefined ? {} : clearedGroup(path.slice(0, index + 1))
    }
    node = node[key] as Json
  }
  if (value === undefined) delete node[path.at(-1)!]
  else node[path.at(-1)!] = value
}

// base：打开表单时读到的片段；latest：保存前刚读到的片段。改了的那几项若在这期间也被别处改过，算冲突、不写。
export function applyThemeChanges(
  baseRaw: string,
  latestRaw: string,
  changes: ThemeChange[],
): { raw: string; conflicts: [] } | { raw?: undefined; conflicts: string[][] } {
  const base = JSON.parse(baseRaw) as Json
  const latest = JSON.parse(latestRaw) as Json
  const conflicts = changes.filter(({ path }) => peek(base, path) !== peek(latest, path)).map(({ path }) => path)
  if (conflicts.length > 0) return { conflicts }
  for (const { path, value } of changes) setPath(latest, path, value)
  return { raw: JSON.stringify(latest, null, 2), conflicts: [] }
}
