// 页脚星带的力扣日历：线上服务器取不到力扣时读站长 Mac 同步进 Core 的 theme/leetcode-calendar。
// 换了力扣账号、新账号又取不到时，不能拿旧账号（或没写账号的旧记录）的日历冒充。全部离线：外部请求和 Core 都用替身。
// 用法：node scripts/verify-activity-sky-account.mjs（已并入 pnpm verify）
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

const require = createRequire(new URL('../apps/web/package.json', import.meta.url))
const ts = require('typescript')
const transpile = (path) => ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
const load = (path, stubs) => {
  const module = { exports: {} }
  vm.runInNewContext(transpile(path), { module, exports: module.exports, require: (id) => stubs[id] ?? require(id), URL, Date, Intl, AbortSignal, fetch: async () => { throw new Error('offline') }, console })
  return module.exports
}
const skyCalendar = load('../apps/web/lib/sky-calendar.ts', {})
const day = Math.floor(Date.now() / 1000 / 86400) * 86400 - 86400 * 3
const calendar = JSON.stringify({ [day]: 5 })

async function leetcodeDays(snippet, configured = 'new-account') {
  const sky = load('../apps/web/lib/activity-sky.ts', {
    'server-only': {},
    'next/cache': { cacheLife() {}, cacheTag() {} },
    './api': { getApiClient: () => ({ snippet: { getByReferenceAndName: async () => snippet } }) },
    './blog-data': { getSiteContent: async () => ({ accounts: { leetcode: configured, github: null } }) },
    './sky-calendar': skyCalendar,
  })
  const result = await sky.getActivitySky().catch(() => null)
  return result ? result.days.filter((item) => item?.leetcode).length : 0
}

assert.equal(await leetcodeDays({ account: 'new-account', submissionCalendar: calendar }), 1, '同步的日历属于当前账号时照常用')
assert.equal(await leetcodeDays({ account: 'old-account', submissionCalendar: calendar }), 0, '换了账号后不用旧账号的日历')
assert.equal(await leetcodeDays({ submissionCalendar: calendar }), 0, '没写账号的旧记录不冒充任何账号')
console.log('PASS activity sky only falls back to a synced LeetCode calendar of the configured account')
