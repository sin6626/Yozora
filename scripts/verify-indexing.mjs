import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

// 检查灰度时不让搜索引擎收录的开关（apps/web/lib/indexing.ts，docs/deploy-beta.md）：SITE_NOINDEX=1 时 robots.txt 整站禁止、不给站点地图；
// 没设时照常放行、只挡 /api/ 和 /debug。用法：node scripts/verify-indexing.mjs（pnpm verify）
const require = createRequire(new URL('../apps/web/package.json', import.meta.url))
const ts = require('typescript')
const source = readFileSync(new URL('../apps/web/lib/indexing.ts', import.meta.url), 'utf8')
const load = (env) => {
  const module = { exports: {} }
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { module, exports: module.exports, process: { env } })
  return module.exports
}
const plain = (value) => JSON.parse(JSON.stringify(value))

const hidden = load({ SITE_NOINDEX: '1' })
assert.equal(hidden.hiddenFromSearch(), true)
assert.deepEqual(plain(hidden.robotsFor('https://beta.example.com')), { rules: { userAgent: '*', disallow: '/' } }, '灰度时整站禁止收录，不给站点地图')

const open = load({})
assert.equal(open.hiddenFromSearch(), false)
assert.deepEqual(plain(open.robotsFor('https://example.com')), { rules: { userAgent: '*', allow: '/', disallow: ['/api/', '/debug'] }, sitemap: 'https://example.com/sitemap.xml' }, '正式上线时照常放行')
assert.equal(load({ SITE_NOINDEX: 'true' }).hiddenFromSearch(), false, '只认 1，免得写错时悄悄挡住正式站')

console.log('PASS 灰度不收录开关：SITE_NOINDEX=1 时 robots 整站禁止，没设时照常')
