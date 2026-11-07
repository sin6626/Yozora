// 检查站名读后台“SEO → 网站标题”、关键字读“SEO → 关键字”（2026-11-04 站长定），站长名字仍读“个人资料”的昵称（聚合接口的 user.name）；
// 没填时用兜底值。不需要服务，用替身代替 Core 加载 apps/web/lib/blog-data.ts。
// 用法：node scripts/verify-site-name.mjs（已并入 pnpm verify）
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

const require = createRequire(new URL('../apps/web/package.json', import.meta.url))
const ts = require('typescript')
const source = readFileSync(new URL('../apps/web/lib/blog-data.ts', import.meta.url), 'utf8')
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText

let aggregate
const api = { aggregate: { getAggregateData: async () => aggregate } }
const stubs = {
  'server-only': {},
  './api': { getApiClient: () => api },
  'next/cache': { cacheLife: () => {}, cacheTag: () => {} },
  './excerpt': { excerpt: (value) => value ?? '', readingMinutes: () => 1 },
  './social': { socialLinks: () => [], socialCards: () => [] },
  './theme-config': { parseSiteContent: () => ({}), siteTranslation: () => undefined },
  './i18n/config': { isLanguageCode: () => false },
  './i18n/data': { getI18nBundle: async () => ({ messages: {}, site: {}, projects: {} }) },
  './safe-url': { safeUrl: (value) => value },
  './note-extras': { parseNoteMeta: () => ({ cover: null, banner: null }) },
}
const module = { exports: {} }
vm.runInNewContext(code, { module, exports: module.exports, require: (id) => stubs[id] ?? require(id), URL, console })
const blog = module.exports

const site = (title, user, keywords) => ({ url: { webUrl: 'http://127.0.0.1:2323' }, seo: { title, description: '一句话', keywords }, commentOptions: {}, user })

aggregate = site('  葉は静かに落ちる  ', { name: '  Moon  ' }, [' 个人博客 ', '', '大学生活', 3])
const renamed = await blog.getSiteSettings()
assert.equal(renamed.name, '葉は静かに落ちる', '站名要用 SEO 里的网站标题，不能再由个人资料名字拼出来')
assert.equal(renamed.ownerName, 'Moon', '首屏问候和页脚落款用的站长名字')
assert.deepEqual([...renamed.keywords], ['个人博客', '大学生活'], '关键字取 SEO 设置，去掉空白和不是文字的项')

aggregate = site('', { name: '' })
const empty = await blog.getSiteSettings()
assert.equal(empty.name, 'Sin’s Yozora', '网站标题没填时用兜底站名')
assert.equal(empty.ownerName, 'Sin', '没有名字时用兜底的 Sin')
assert.deepEqual([...empty.keywords], [], '没填关键字时是空的，页面不输出 keywords')
assert.equal(blog.siteName, 'Sin’s Yozora', '读取失败时的兜底站名')
console.log('verify-site-name: 通过')
