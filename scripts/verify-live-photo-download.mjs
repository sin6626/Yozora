// 检查 apps/web/lib/live-photo-download.ts（前台 Plate 实况图的“下载成 Motion Photo”）：
// 封面 20 MiB、短片 6 MiB 的上限边读边数（分块传输、没有 Content-Length 也不会先整份读进内存），超了立即停；
// 一支失败就取消另一支；组件卸载（signal 取消）后两支都停，也不会再触发保存。原来是 response.blob() 读完才判断大小，离开页面也停不下。
// 用法：node scripts/verify-live-photo-download.mjs（已并入 pnpm verify）
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import vm from 'node:vm'

const require = createRequire(new URL('../apps/web/package.json', import.meta.url))
const ts = require('typescript')
const transpile = (path) => ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText

const MiB = 1024 * 1024
const chunk = new Uint8Array(256 * 1024)
let streams = []
// 假 fetch：按地址给一个无限（或定长）的分块流，记下拉了多少块、是否被取消；signal 取消时流跟着断开
const fetch = async (url, { signal }) => {
  signal?.throwIfAborted()
  const spec = routes[url]
  const record = { url, pulled: 0, cancelled: false, signal }
  streams.push(record)
  if (spec.status) return new Response('nope', { status: spec.status })
  const body = new ReadableStream({
    async pull(controller) {
      if (signal.aborted) return controller.error(signal.reason)
      if (spec.chunks !== undefined && record.pulled >= spec.chunks) return controller.close()
      await new Promise((r) => setTimeout(r, spec.delay ?? 0))
      if (signal.aborted) return controller.error(signal.reason)
      record.pulled++
      controller.enqueue(chunk)
    },
    cancel() { record.cancelled = true },
  })
  signal.addEventListener('abort', () => { record.cancelled = true })
  return new Response(body, { headers: { 'content-type': spec.type ?? 'application/octet-stream' } })
}
let routes = {}
const load = (name, path, mocks = {}) => {
  const module = { exports: {} }
  vm.runInNewContext(transpile(path), {
    module, exports: module.exports, require: (id) => mocks[id] ?? require(id),
    fetch, Response, Blob, AbortController, AbortSignal, Uint8Array, setTimeout,
  })
  return module.exports
}
const readLimited = load('read-limited', '../apps/web/lib/read-limited.ts')
const { downloadLivePhoto } = load('download', '../apps/web/lib/live-photo-download.ts', { './read-limited': readLimited })

const build = async (cover, clip) => new Blob([cover, clip], { type: 'image/jpeg' })
const run = async (signal = new AbortController().signal, overrides = {}) => {
  const saved = []
  streams = []
  await downloadLivePhoto({ url: 'cover', videoUrl: 'clip', signal, build, save: (file) => saved.push(file), ...overrides })
  return saved
}

// 正常：两份都读完，拼好后保存一次
routes = { cover: { chunks: 2, type: 'image/jpeg' }, clip: { chunks: 3, type: 'video/mp4' } }
const ok = await run()
assert.equal(ok.length, 1)
assert.equal(ok[0].size, 5 * chunk.length)

// 短片是没有 Content-Length 的超大分块流：过了 6 MiB 立即停，封面那支也被取消
routes = { cover: { delay: 5 }, clip: {} }
await assert.rejects(run(), /太大/)
const clip = streams.find((s) => s.url === 'clip')
assert.ok(clip.cancelled && clip.pulled * chunk.length <= 6 * MiB + chunk.length * 2, `短片读到上限就停（读了 ${clip.pulled} 块）`)
const cover = streams.find((s) => s.url === 'cover')
assert.ok(cover.signal.aborted && cover.pulled * chunk.length < 20 * MiB, `封面跟着取消（读了 ${cover.pulled} 块）`)

// 一支返回错误状态：另一支取消
routes = { cover: { delay: 5 }, clip: { status: 404 } }
await assert.rejects(run())
assert.ok(streams.find((s) => s.url === 'cover').signal.aborted, '短片 404 时封面取消')

// 组件卸载：读到一半取消，两支都停，不保存
routes = { cover: { delay: 5 }, clip: { delay: 5 } }
const leave = new AbortController()
const pending = run(leave.signal)
await new Promise((r) => setTimeout(r, 30))
leave.abort()
await assert.rejects(pending)
assert.ok(streams.every((s) => s.signal.aborted), '卸载后两支下载都取消')
const pulledAtAbort = streams.map((s) => s.pulled)
await new Promise((r) => setTimeout(r, 50))
assert.deepEqual(streams.map((s) => s.pulled), pulledAtAbort, '取消后不再继续拉流')

// 读完了但在拼 Motion Photo 时卸载：不触发保存
routes = { cover: { chunks: 1 }, clip: { chunks: 1 } }
const late = new AbortController()
const saved = []
await assert.rejects(downloadLivePhoto({
  url: 'cover', videoUrl: 'clip', signal: late.signal, save: (file) => saved.push(file),
  build: async (a, b) => { late.abort(); return new Blob([a, b]) },
}))
assert.equal(saved.length, 0, '拼好之前已经离开页面，不再下载')
await assert.rejects(downloadLivePhoto({ url: 'cover', videoUrl: 'clip', signal: AbortSignal.abort(), build, save: () => saved.push(1) }))
assert.equal(saved.length, 0, '已取消时一开始就不发请求、不保存')

// 组件真的用它，且卸载时取消
const component = readFileSync(new URL('../apps/web/components/plate-live-photo.tsx', import.meta.url), 'utf8')
assert.ok(component.includes('downloadLivePhoto(') && !/response\.blob\(\)/.test(component), '组件走限流下载，不再整份 blob()')
assert.ok(/return \(\) => controller\.abort\(\)/.test(component) && /AbortSignal\.any\(\[unmount/.test(component), '组件卸载时取消下载')

console.log('PASS live photo download: streamed size caps, sibling cancellation, unmount cancels and never saves')
