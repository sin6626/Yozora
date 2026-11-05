// 一次性迁移（2026-11-05）：界面文字和站点文案改由后台“AI i18n”翻译之前，英文、日文是手写的——
// 界面文字在 git 里的 en.ts、ja.ts（已导出成 scripts/data/i18n-legacy.json），站点那句话、首屏、页脚、技术栈、作品名和介绍在配置片段 theme/yozora 的 i18n 下。
// 这里把它们逐条写进 Core 的翻译条目（PUT /ai/i18n/entries，Core 会标成“手改过”，AI 不会重翻），再按需从片段里删掉 i18n。
// 用法：node scripts/import-i18n-legacy.mjs [--prod] [--dry-run] [--drop-snippet-i18n] [--snippet-file=<备份>]
// --snippet-file：片段里的 i18n 已经删了时，从删之前的备份（.local/backups/snippet-yozora-before-i18n-drop-*.json）读手写译文
// - 先推一次中文原文（同 push-i18n-source.mjs），Core 才认得这些条目；
// - 要先在后台“i18n 语言”里填好 en、ja（AI i18n 开关可以先关着，关着时不会自动生成），脚本才看得到已有译文；
// - 已经手改过的条目（manual，不管写的是什么）一律不动，只写还没有译文或只有 AI 译文的，可以重复跑；
// - --drop-snippet-i18n：导入全部成功后，把片段原文备份到 .local/backups，再保存去掉 i18n 的片段（带 baseRaw，别处改过就失败、不覆盖）。
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { coreUrl } from './lib/core-url.mjs'
import { loadI18n } from './lib/i18n-source.mjs'
import { legacyProjectTranslations, legacySiteTranslations, planImport } from './lib/legacy-i18n.mjs'

const target = process.argv.includes('--prod') ? 'prod' : 'local'
const dryRun = process.argv.includes('--dry-run')
const dropSnippetI18n = process.argv.includes('--drop-snippet-i18n')
const snippetFile = process.argv.find((arg) => arg.startsWith('--snippet-file='))?.slice('--snippet-file='.length)
if (dropSnippetI18n && snippetFile) throw new Error('--snippet-file 只用来补导入，不能和 --drop-snippet-i18n 一起用')
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

const ok = (result, what) => {
  if (result.status !== 200) throw new Error(`${what}失败：${result.status} ${JSON.stringify(result.data)}`)
  return result.data
}
const status = ok(await call('GET', '/ai/i18n/status'), '读 AI i18n 状态')
const missingLanguages = ['en', 'ja'].filter((lang) => !status.languages?.includes(lang))
if (missingLanguages.length) throw new Error(`后台“i18n 语言”里还没有 ${missingLanguages.join('、')}，先填上（开关可以先关着）再导入`)

// 片段里的手写译文：按位置配对（scripts/lib/legacy-i18n.mjs），作品按 id
const snippets = ok(await call('GET', '/snippets/group/theme'), '读配置片段')
const snippet = (Array.isArray(snippets) ? snippets : []).find((item) => item.name === 'yozora')
const saved = snippetFile ? JSON.parse(readFileSync(snippetFile, 'utf8')) : snippet
const root = saved ? JSON.parse(saved.raw) : {}
const seo = ok(await call('GET', '/options/seo'), '读 SEO 设置')

// withStale：原文改过、前台已不再显示的手改译文也要看到，否则会被当成“没有译文”盖掉
const entries = ok(await call('GET', '/ai/i18n/entries?withStale=1'), '读翻译条目')
if (!Array.isArray(entries)) throw new Error(`读不到条目：${JSON.stringify(entries)}`)
const plan = planImport(entries, { ui: legacy, site: legacySiteTranslations(root, seo?.description), projects: legacyProjectTranslations(root) })
const failed = []
for (const write of dryRun ? [] : plan.writes) {
  const result = await call('PUT', '/ai/i18n/entries', write)
  if (result.status !== 200) failed.push(`${write.lang} ${write.keyPath} ${write.lookupKey}：${result.status} ${JSON.stringify(result.data)}`)
}
console.log(`${target}${dryRun ? '（试运行）' : ''}：写入 ${plan.writes.length - failed.length}，已手改过不动 ${plan.kept}，没有手写译文 ${plan.missing}，失败 ${failed.length}`)
if (failed.length) {
  console.log(failed.join('\n'))
  process.exit(1)
}
const unmatched = new Set(plan.unmatched)

if (dropSnippetI18n && snippet && 'i18n' in root && unmatched.size) {
  console.log(`片段里还有 ${unmatched.size} 条手写译文没对上条目，不删片段里的 i18n：\n${[...unmatched].join('\n')}`)
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
