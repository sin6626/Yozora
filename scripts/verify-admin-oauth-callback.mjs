// 后台“设置 → 账户 → OAuth”卡片上的 Callback URL 要和 Core 真正发给 GitHub/Google 的回调地址一样（2026-11-16）：
// Core 用后台“网站设置”的 API 地址（serverUrl）拼（apps/core/src/modules/auth/auth.middleware.ts），线上是 https://sin6626.me/api/v2；
// 后台原来按自己所在的域名（API_URL，线上是 api 子域名）拼，照着填进 Google 控制台会 redirect_uri_mismatch。
// 用法：node scripts/verify-admin-oauth-callback.mjs（已并入 pnpm verify）
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { existsSync, readFileSync } from 'node:fs'
import vm from 'node:vm'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

// Core 那边：回调地址就是 serverUrl + /auth/callback/<平台>（Core 改了这里，后台的显示也要跟着改）
const middleware = read('apps/core/src/modules/auth/auth.middleware.ts')
for (const type of ['github', 'google']) {
  assert.ok(middleware.includes(`redirectURI: \`\${urls.serverUrl}/auth/callback/${type}\``), `Core 的 ${type} 回调按 serverUrl 拼`)
}

// 后台这边：显示和复制都用同一个函数，按 serverUrl 拼
const helperPath = 'apps/admin/src/views/setting/tabs/sections/oauth-callback.ts'
assert.ok(existsSync(new URL(`../${helperPath}`, import.meta.url)), '后台有按 serverUrl 拼回调地址的函数')
const require = createRequire(new URL('../apps/web/package.json', import.meta.url))
const ts = require('typescript')
const code = ts.transpileModule(read(helperPath), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
const module = { exports: {} }
vm.runInNewContext(code, { module, exports: module.exports })
const { oauthCallbackUrl } = module.exports

assert.equal(oauthCallbackUrl('https://sin6626.me/api/v2', 'https://api.sin6626.me/api/v2', 'google'), 'https://sin6626.me/api/v2/auth/callback/google')
assert.equal(oauthCallbackUrl('https://sin6626.me/api/v2/', 'https://api.sin6626.me/api/v2', 'github'), 'https://sin6626.me/api/v2/auth/callback/github', '结尾的斜杠去掉')
assert.equal(oauthCallbackUrl('', 'http://127.0.0.1:2333', 'github'), 'http://127.0.0.1:2333/auth/callback/github', '没读到网站设置时退回后台的 API 地址')

const section = read('apps/admin/src/views/setting/tabs/sections/oauth.tsx')
assert.ok(!/\$\{API_URL\}\/auth\/callback|\{API_URL\}\/auth\/callback/.test(section), '卡片不再按后台自己的 API_URL 拼回调地址')
assert.ok((section.match(/oauthCallbackUrl\(/g) ?? []).length >= 1 && section.includes('optionsApi.getUrl()'), '卡片读网站设置的 serverUrl 并用 oauthCallbackUrl 拼')

// 网站设置接口的真实形状：Core 返回 { data: { server_url, … } }，后台的 request 转成驼峰但不解包对象，getUrl 要自己拆
const optionsCode = ts.transpileModule(read('apps/admin/src/api/options.ts'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
const optionsModule = { exports: {} }
const fakeRequest = { request: { get: async () => ({ data: { webUrl: 'https://sin6626.me', serverUrl: 'https://sin6626.me/api/v2', wsUrl: 'https://sin6626.me', adminUrl: 'x' } }) } }
vm.runInNewContext(optionsCode, { module: optionsModule, exports: optionsModule.exports, require: (id) => (id === '~/utils/request' ? fakeRequest : {}) })
const urls = await optionsModule.exports.optionsApi.getUrl()
assert.equal(urls.serverUrl, 'https://sin6626.me/api/v2', 'getUrl 拆开 { data } 拿到 serverUrl')

console.log('PASS 后台 OAuth 回调地址按 Core 的 serverUrl 显示')
