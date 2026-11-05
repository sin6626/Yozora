// 一次性迁移（2026-11-05）：界面文字和站点文案改由后台“AI i18n”翻译之前，英文、日文是手写的——
// 界面文字在 git 里的 en.ts、ja.ts（已导出成 scripts/data/i18n-legacy.json），站点那句话、首屏、页脚、技术栈、作品名和介绍在配置片段 theme/yozora 的 i18n 下。
// 这里把它们逐条写进 Core 的翻译条目（PUT /ai/i18n/entries，Core 会标成“手改过”，AI 不会重翻），再按需从片段里删掉 i18n。
// 用法：node scripts/import-i18n-legacy.mjs [--prod] [--dry-run] [--drop-snippet-i18n]
// - 先推一次中文原文（同 push-i18n-source.mjs），Core 才认得这些条目；
// - 已经是同样译文的条目跳过，可以重复跑；
// - --drop-snippet-i18n：导入全部成功后，把片段原文备份到 .local/backups，再保存去掉 i18n 的片段（带 baseRaw，别处改过就失败、不覆盖）。
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { coreUrl } from './lib/core-url.mjs'
import { loadI18n } from './lib/i18n-source.mjs'

const target = process.argv.includes('--prod') ? 'prod' : 'local'
const dryRun = process.argv.includes('--dry-run')
const dropSnippetI18n = process.argv.includes('--drop-snippet-i18n')
const configPath = new URL('../.local/publish.json', import.meta.url)
const server = existsSync(configPath) ? JSON.parse(readFileSync(configPath, 'utf8'))[target] : undefined
if (!server?.api || !server?.token) {
  console.error(`没有 ${target} 的配置，先在 .local/publish.json 填好 api、token`)
  process.exit(1)
}

async function call(method, path, body) {
  for (let attempt = 1; ; attempt++) {
    try {
      const response = await fetch(coreUrl(server.api, path), {
        method,
        headers: { 'x-api-key': server.token, ...(body && { 'content-type': 'application/json' }) },
        body: body && JSON.stringify(body),
        signal: AbortSignal.timeout(20000),
      })
      const text = await response.text()
      const data = text ? JSON.parse(text) : null
      return { status: response.status, data: data && typeof data === 'object' && 'data' in data && Object.keys(data).length === 1 ? data.data : data }
    } catch (error) {
      if (attempt >= 3) throw error
    }
  }
}

const { source } = loadI18n()
const legacy = JSON.parse(readFileSync(new URL('./data/i18n-legacy.json', import.meta.url), 'utf8'))

if (!dryRun) {
  const pushed = await call('PUT', '/ai/i18n/source', { messages: source })
  if (pushed.status !== 200) throw new Error(`推中文原文失败：${pushed.status} ${JSON.stringify(pushed.data)}`)
}

// 片段里的手写译文：中文原文 → 每种语言的译文（按同一路径配对），作品按 id
const snippets = await call('GET', '/snippets/group/theme')
const snippet = (Array.isArray(snippets.data) ? snippets.data : []).find((item) => item.name === 'yozora')
const root = snippet ? JSON.parse(snippet.raw) : {}
const seo = (await call('GET', '/options/seo')).data
const at = (value, path) => path.reduce((current, key) => (current == null ? undefined : current[key]), value)
const sitePaths = [['hero', 'title'], ['footer', 'motto'], ['copyright'], ['techStack', 'title'], ['techStack', 'description']]
const description = at(root, ['hero', 'description'])
if (Array.isArray(description)) description.forEach((_, index) => sitePaths.push(['hero', 'description', index]))
const siteTranslations = {}
const projectTranslations = {}
for (const lang of ['en', 'ja']) {
  const i18n = at(root, ['i18n', lang]) ?? {}
  const pairs = sitePaths.map((path) => [at(root, path), at(i18n, path)])
  pairs.push([seo?.description, i18n.siteDescription])
  siteTranslations[lang] = Object.fromEntries(pairs.filter(([from, to]) => typeof from === 'string' && from.trim() && typeof to === 'string' && to.trim()).map(([from, to]) => [from.trim(), to.trim()]))
  projectTranslations[lang] = i18n.projects ?? {}
}

const entries = (await call('GET', '/ai/i18n/entries')).data
if (!Array.isArray(entries)) throw new Error(`读不到条目：${JSON.stringify(entries)}`)
const counts = { written: 0, same: 0, missing: 0, failed: [] }
for (const entry of entries) {
  const keyPath = entry.key_path ?? entry.keyPath
  const lookupKey = entry.lookup_key ?? entry.lookupKey
  for (const lang of ['en', 'ja']) {
    const text = keyPath === 'ui.text' ? legacy[lang][lookupKey]
      : keyPath === 'site.text' ? siteTranslations[lang][entry.source]
      : keyPath === 'project.name' ? projectTranslations[lang][lookupKey]?.name
      : projectTranslations[lang][lookupKey]?.description
    if (typeof text !== 'string' || !text.trim()) {
      counts.missing++
      continue
    }
    const current = entry.translations?.[lang]
    if (current?.text === text && current?.manual) {
      counts.same++
      continue
    }
    if (dryRun) {
      counts.written++
      continue
    }
    const saved = await call('PUT', '/ai/i18n/entries', { keyPath, lookupKey, lang, text })
    if (saved.status === 200) counts.written++
    else counts.failed.push(`${lang} ${keyPath} ${lookupKey}：${saved.status} ${JSON.stringify(saved.data)}`)
  }
}
console.log(`${target}${dryRun ? '（试运行）' : ''}：写入 ${counts.written}，已是同样译文 ${counts.same}，没有手写译文 ${counts.missing}，失败 ${counts.failed.length}`)
if (counts.failed.length) {
  console.log(counts.failed.join('\n'))
  process.exit(1)
}

if (dropSnippetI18n && snippet && 'i18n' in root) {
  const backups = new URL('../.local/backups/', import.meta.url)
  mkdirSync(backups, { recursive: true })
  const backup = new URL(`snippet-yozora-before-i18n-drop-${target}-${new Date().toISOString().slice(0, 10)}.json`, backups)
  writeFileSync(backup, `${JSON.stringify(snippet, null, 2)}\n`)
  chmodSync(backup, 0o600)
  const { i18n, ...rest } = root
  if (dryRun) {
    console.log(`试运行：会去掉片段里的 i18n（${Object.keys(i18n).join('、')}），原文已备份到 ${backup.pathname}`)
  } else {
    const saved = await call('PUT', `/snippets/${snippet._id ?? snippet.id}`, {
      name: snippet.name, reference: snippet.reference, type: snippet.type, private: snippet.private, comment: snippet.comment, metatype: snippet.metatype, enable: snippet.enable,
      raw: JSON.stringify(rest, null, 2),
      baseRaw: snippet.raw,
    })
    if (saved.status !== 200) throw new Error(`片段保存失败：${saved.status} ${JSON.stringify(saved.data)}`)
    console.log(`片段里的 i18n 已删掉，原文备份在 ${backup.pathname}`)
  }
}
