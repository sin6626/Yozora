// 把界面文字的中文原文推给 Core（PUT /ai/i18n/source），Core 记下新增、改过、删掉的条目，
// 后台开着 AI i18n 时自动把新增和改过的翻成每种语言。pnpm dev 启动 Core 后自动跑一次；部署前对线上跑 --prod。
// 用法：node scripts/push-i18n-source.mjs [--prod] [--dry-run]，Core 地址和后台令牌读 .local/publish.json（同 pnpm draft）
import { existsSync, readFileSync } from 'node:fs'
import { coreUrl } from './lib/core-url.mjs'
import { loadI18n } from './lib/i18n-source.mjs'

const target = process.argv.includes('--prod') ? 'prod' : 'local'
const dryRun = process.argv.includes('--dry-run')
const { source } = loadI18n()
console.log(`界面文字 ${Object.keys(source).length} 条`)
if (dryRun) process.exit(0)

const configPath = new URL('../.local/publish.json', import.meta.url)
const server = existsSync(configPath) ? JSON.parse(readFileSync(configPath, 'utf8'))[target] : undefined
if (!server?.api || !server?.token) {
  console.error(`没有 ${target} 的配置，先在 .local/publish.json 填好 api、token`)
  process.exit(1)
}
const response = await fetch(coreUrl(server.api, '/ai/i18n/source'), {
  method: 'PUT',
  headers: { 'x-api-key': server.token, 'content-type': 'application/json' },
  body: JSON.stringify({ messages: source }),
  signal: AbortSignal.timeout(15000),
})
if (!response.ok) {
  console.error(`推送失败：${response.status} ${await response.text()}`)
  process.exit(1)
}
const result = await response.json()
const data = result.data ?? result
console.log(`推到 ${target}：新增 ${data.added.length}，改过 ${data.changed.length}，删掉 ${data.removed.length}`)
