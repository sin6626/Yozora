import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

// 检查站长“正在用 / 在听”的云函数（scripts/functions/ps-update.ts）：密钥校验、第一次调用不报错、只在变化时广播、
// 不存窗口标题和非 https 图标、没在放歌时清掉音乐、DELETE 清空。用假的 ctx 直接调用，不需要启动服务。
// 用法：node scripts/verify-presence.mjs（pnpm verify）
const require = createRequire(new URL('../apps/web/package.json', import.meta.url))
const ts = require('typescript')
const load = (path) => {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8')
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const module = { exports: {} }
  vm.runInNewContext(code, { module, exports: module.exports })
  return module.exports
}
const handler = load('./functions/ps-update.ts').default

const store = new Map()
let events = []
const call = (method, body, { auth = false, secret = { key: 'secret-key' } } = {}) =>
  handler({
    req: { method, body },
    isAuthenticated: auth,
    secret,
    storage: {
      cache: {
        get: async (key) => (store.has(key) ? JSON.parse(store.get(key).value) : null),
        set: async (key, value, ttl) => void store.set(key, { value: JSON.stringify(value), ttl }),
        del: async (key) => void store.delete(key),
      },
    },
    broadcast: (type, data) => events.push({ type, data: JSON.parse(JSON.stringify(data)) }),
    throws: (status, message) => { throw Object.assign(new Error(message), { status }) },
  })
const plain = (value) => JSON.parse(JSON.stringify(value))
// 取出这段时间的广播；ps-update 带时间戳，比较前去掉
const take = () => {
  const list = events.map(({ type, data }) => (type === 'ps-update' ? { type, data: { ...data, ts: typeof data.ts } } : { type, data }))
  events = []
  return list
}
const post = (process, media) => call('POST', { key: 'secret-key', process, media })
const vscode = { name: 'Code', iconUrl: 'https://s3.example.com/icons/code.png', description: '正在编辑\nsecret-plan.md', iconBase64: 'AAAA' }
const song = { title: '夜に駆ける', artist: 'YOASOBI' }

assert.deepEqual(plain(await call('GET')), { processName: null, processInfo: null, mediaInfo: null }, '没有数据时 GET 返回空状态')
await assert.rejects(call('POST', { process: vscode }), { status: 401 }, '没带密钥要 401')
await assert.rejects(call('POST', { key: 'wrong', process: vscode }), { status: 401 }, '密钥不对要 401')
await assert.rejects(call('POST', { key: '', process: vscode }, { secret: {} }), { status: 401 }, '后台没设密钥时谁都不能写')
await assert.rejects(call('PUT', { key: 'secret-key' }), { status: 405 })
assert.deepEqual(take(), [], '被拒绝的请求不广播')

const first = await post(vscode, { title: ' 夜に駆ける ', artist: 'YOASOBI', duration: 261 })
assert.equal(first.ok, 1, '第一次写入（缓存还是空的）不报错')
assert.deepEqual(plain(await call('GET')), {
  processName: 'Code',
  processInfo: { name: 'Code', iconUrl: 'https://s3.example.com/icons/code.png' },
  mediaInfo: song,
}, '只留 App 名和 https 图标、歌名和歌手；窗口标题、iconBase64、时长都不存')
assert.equal(store.get('ps').ttl, 120, 'App 两分钟没续上就过期')
assert.deepEqual(take(), [
  { type: 'ps-update', data: { processInfo: { name: 'Code', iconUrl: 'https://s3.example.com/icons/code.png' }, process: 'Code', ts: 'number' } },
  { type: 'media-update', data: song },
], '第一次两样都广播，广播里同样没有窗口标题')

await post(vscode, song)
assert.deepEqual(take(), [], '心跳（内容没变）不广播')

await post({ name: 'Safari', iconUrl: 'javascript:alert(1)' }, song)
assert.deepEqual(take(), [{ type: 'ps-update', data: { processInfo: { name: 'Safari' }, process: 'Safari', ts: 'number' } }], '换 App 只广播 App，非 https 图标丢掉')

await post({ name: 'Safari' }, { artist: 'YOASOBI', title: null })
assert.deepEqual(take(), [{ type: 'media-update', data: null }], '没在放歌（没有标题）时广播 null')
assert.equal(plain(await call('GET')).mediaInfo, null, '并清掉缓存里的歌')

await post('Ghostty', undefined)
assert.equal(plain(await call('GET')).processName, 'Ghostty', '旧版 ProcessReporterMac 把 process 发成字符串也认')
await post({ name: 'x'.repeat(200) }, undefined)
assert.equal(plain(await call('GET')).processName.length, 64, 'App 名最长 64 字')
take()

await post({ name: '  ' }, song)
assert.deepEqual(take().map(({ type, data }) => [type, type === 'ps-update' ? data.processInfo : data]), [['ps-update', null], ['media-update', song]], '被 Companion 隐藏的 App（没有名字）当作不在用')

await call('POST', { process: { name: 'Admin' } }, { auth: true })
assert.equal(plain(await call('GET')).processName, 'Admin', '已登录后台时不用密钥')
take()

await call('DELETE', { key: 'secret-key' })
assert.deepEqual(plain(await call('GET')), { processName: null, processInfo: null, mediaInfo: null }, 'DELETE 清空')
assert.deepEqual(take().map(({ type, data }) => [type, type === 'ps-update' ? data.processInfo : data]), [['ps-update', null]], '清空时广播（歌本来就没有，不重复广播）')

// 前台（apps/web/lib/presence.ts）解析 GET 响应和 WebSocket 广播
const { presenceFromSnapshot, applyPresenceEvent, emptyPresence } = load('../apps/web/lib/presence.ts')
await post(vscode, song)
const snapshot = plain(presenceFromSnapshot(await call('GET')))
assert.deepEqual(snapshot, { app: { name: 'Code', icon: 'https://s3.example.com/icons/code.png' }, media: song }, '前台读 GET 响应')
assert.deepEqual(plain(presenceFromSnapshot({ ok: 0, code: 11017, message: '函数不存在' })), { app: null, media: null }, '云函数没装时是空状态')
assert.deepEqual(plain(presenceFromSnapshot(null)), { app: null, media: null })
assert.equal(applyPresenceEvent(emptyPresence, { type: 'POST_CREATE', data: {} }), null, '别的消息不处理')
assert.deepEqual(plain(applyPresenceEvent(snapshot, { type: 'fn#ps-update', data: { processInfo: { name: 'Safari', iconUrl: 'http://x/a.png' } } })), { app: { name: 'Safari' }, media: song }, '换 App 只改 App，非 https 图标丢掉')
assert.deepEqual(plain(applyPresenceEvent(snapshot, { type: 'fn#ps-update', data: { processInfo: null, process: null } })), { app: null, media: song }, 'App 清空')
assert.deepEqual(plain(applyPresenceEvent(snapshot, { type: 'fn#media-update', data: null })), { app: snapshot.app, media: null }, '歌清空')
assert.deepEqual(plain(applyPresenceEvent(emptyPresence, { type: 'fn#media-update', data: { title: '晴る' } })), { app: null, media: { title: '晴る' } }, '没有歌手也行')

console.log('PASS 站长“正在用 / 在听”：云函数的密钥、清洗、只在变化时广播、清空，前台解析 GET 与广播')
