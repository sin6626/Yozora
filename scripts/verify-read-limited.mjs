// 检查 apps/web/lib/read-limited.ts：读远程响应时边读边数字节，超过上限立即取消、不把整份读进内存（分享图取头像用，Codex 复查发现原来先读完再判断大小）。
// 用法：node scripts/verify-read-limited.mjs（已并入 pnpm verify）
import assert from 'node:assert/strict'
import { runTs } from './lib/i18n-source.mjs'

const { readLimited } = runTs('apps/web/lib/read-limited.ts', {})
const chunk = new Uint8Array(1000)
const stream = (count, onCancel) => {
  let sent = 0
  return new ReadableStream({
    pull(controller) { sent++ < count ? controller.enqueue(chunk) : controller.close() },
    cancel() { onCancel?.(sent) },
  })
}

const small = await readLimited(new Response(stream(3)), 5000)
assert.equal(small.length, 3000, '没超过上限时完整读出')

let pulledWhenCancelled = 0
await assert.rejects(readLimited(new Response(stream(1000, (n) => { pulledWhenCancelled = n })), 5000), /太大/, '超过上限要报错')
assert.ok(pulledWhenCancelled > 0 && pulledWhenCancelled <= 7, `超过上限后立即取消读取，不读完整份（读了 ${pulledWhenCancelled} 块）`)

await assert.rejects(readLimited(new Response('x', { headers: { 'content-length': '999999' } }), 5000), /太大/, 'Content-Length 已经超了就不读')
console.log('PASS limited reads: full body under the cap, cancel as soon as the cap is passed, early reject on Content-Length')
