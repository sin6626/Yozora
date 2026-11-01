import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

// 检查站长“正在用 / 在听”的云函数（scripts/functions/ps-update.ts）：密钥校验、第一次调用不报错、只在变化时广播、
// 不存窗口标题和非 https 图标、App 记开始时间（换 App 才重计）、歌记时长和进度、拖动进度时广播校准、没在放歌时清掉、DELETE 清空；
// 以及前台 apps/web/lib/presence.ts 解析 GET 与广播、推算播放进度、时长格式。用假的 ctx 和时钟直接调用，不需要启动服务。
// 用法：node scripts/verify-presence.mjs（pnpm verify）
const require = createRequire(new URL('../apps/web/package.json', import.meta.url))
const ts = require('typescript')
const clock = { now: 1_000_000 }
const load = (path) => {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8')
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const module = { exports: {} }
  vm.runInNewContext(code, { module, exports: module.exports, Date: { now: () => clock.now } })
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
// 取出这段时间广播的类型和主要内容（ps-update 只看 processInfo）
const take = () => {
  const list = events.map(({ type, data }) => [type, type === 'ps-update' ? data.processInfo : data])
  events = []
  return list
}
const get = async () => plain(await call('GET'))
const post = (process, media) => call('POST', { key: 'secret-key', process, media })
const later = (seconds) => { clock.now += seconds * 1000 }
const t0 = clock.now
const vscode = { name: 'Code', iconUrl: 'https://s3.example.com/icons/code.png', description: '正在编辑\nsecret-plan.md', iconBase64: 'AAAA' }
const song = (elapsedTime) => ({ title: ' 夜に駆ける ', artist: 'YOASOBI', processName: 'Music', duration: 261, elapsedTime })

assert.deepEqual(await get(), { processName: null, processInfo: null, mediaInfo: null }, '没有数据时 GET 返回空状态')
await assert.rejects(call('POST', { process: vscode }), { status: 401 }, '没带密钥要 401')
await assert.rejects(call('POST', { key: 'wrong', process: vscode }), { status: 401 }, '密钥不对要 401')
await assert.rejects(call('POST', { key: '', process: vscode }, { secret: {} }), { status: 401 }, '后台没设密钥时谁都不能写')
await assert.rejects(call('PUT', { key: 'secret-key' }), { status: 405 })
assert.deepEqual(take(), [], '被拒绝的请求不广播')

assert.equal((await post(vscode, song(30))).ok, 1, '第一次写入（缓存还是空的）不报错')
const app = { name: 'Code', iconUrl: 'https://s3.example.com/icons/code.png', since: t0 }
const media = { title: '夜に駆ける', artist: 'YOASOBI', player: 'Music', duration: 261, elapsed: 30, at: t0 }
assert.deepEqual(await get(), { processName: 'Code', processInfo: app, mediaInfo: media }, '只留 App 名、https 图标、开始时间，歌名、歌手、播放器、时长、进度；窗口标题、iconBase64 不存')
assert.equal(store.get('ps').ttl, 120, 'App 两分钟没续上就过期')
assert.deepEqual(take(), [['ps-update', app], ['media-update', media]], '第一次两样都广播，广播里同样没有窗口标题')

later(10)
await post(vscode, song(40))
assert.deepEqual(take(), [], '心跳（同一个 App、同一首歌按时往前走）不广播')
const beat = await get()
assert.equal(beat.processInfo.since, t0, '同一个 App 保留开始时间')
assert.deepEqual([beat.mediaInfo.elapsed, beat.mediaInfo.at], [40, t0 + 10_000], '进度和采样时间跟着心跳更新')

later(10)
await post(vscode, song(120))
assert.deepEqual(take().map(([type]) => type), ['media-update'], '进度比推算的多出 5 秒以上（拖动了进度）时广播校准')

later(10)
await post({ name: 'Safari', iconUrl: 'javascript:alert(1)' }, song(130))
assert.deepEqual(take(), [['ps-update', { name: 'Safari', since: t0 + 30_000 }]], '换 App 只广播 App，重新计开始时间，非 https 图标丢掉')

await post({ name: 'Safari' }, { artist: 'YOASOBI', title: null })
assert.deepEqual(take(), [['media-update', null]], '没在放歌（没有标题）时广播 null')
assert.equal((await get()).mediaInfo, null, '并清掉缓存里的歌')

await post({ name: 'Safari' }, { title: '晴る', duration: -1, elapsedTime: Number.NaN })
assert.deepEqual((await get()).mediaInfo, { title: '晴る' }, '不合法的时长和进度丢掉')
await post({ name: 'Safari' }, { title: '晴る', duration: 200, elapsedTime: 300 })
assert.deepEqual((await get()).mediaInfo, { title: '晴る', duration: 200 }, '进度超过时长时丢掉进度')

await post('Ghostty', undefined)
assert.equal((await get()).processName, 'Ghostty', '旧版 ProcessReporterMac 把 process 发成字符串也认')
await post({ name: 'x'.repeat(200) }, undefined)
assert.equal((await get()).processName.length, 64, 'App 名最长 64 字')
take()

await post({ name: '  ' }, song(10))
assert.deepEqual(take().map(([type, data]) => [type, data && data.title]), [['ps-update', null], ['media-update', '夜に駆ける']], '被 Companion 隐藏的 App（没有名字）当作不在用')

await call('POST', { process: { name: 'Admin' } }, { auth: true })
assert.equal((await get()).processName, 'Admin', '已登录后台时不用密钥')
take()

await call('DELETE', { key: 'secret-key' })
assert.deepEqual(await get(), { processName: null, processInfo: null, mediaInfo: null }, 'DELETE 清空')
assert.deepEqual(take(), [['ps-update', null]], '清空时广播（歌本来就没有，不重复广播）')

// 前台（apps/web/lib/presence.ts）
const { presenceFromSnapshot, applyPresenceEvent, emptyPresence, mediaPosition, formatClock } = load('../apps/web/lib/presence.ts')
const parsed = plain(presenceFromSnapshot({ processInfo: app, mediaInfo: media }))
assert.deepEqual(parsed, { app: { name: 'Code', icon: 'https://s3.example.com/icons/code.png', since: t0 }, media }, '前台读 GET 响应')
assert.deepEqual(plain(presenceFromSnapshot({ ok: 0, code: 11017, message: '函数不存在' })), { app: null, media: null }, '云函数没装时是空状态')
assert.deepEqual(plain(presenceFromSnapshot(null)), { app: null, media: null })
assert.equal(applyPresenceEvent(emptyPresence, { type: 'POST_CREATE', data: {} }), null, '别的消息不处理')
assert.deepEqual(plain(applyPresenceEvent(parsed, { type: 'fn#ps-update', data: { processInfo: { name: 'Safari', iconUrl: 'http://x/a.png', since: 5 } } })).app, { name: 'Safari', since: 5 }, '换 App 只改 App，非 https 图标丢掉')
assert.equal(plain(applyPresenceEvent(parsed, { type: 'fn#ps-update', data: { processInfo: null } })).app, null, 'App 清空')
assert.equal(plain(applyPresenceEvent(parsed, { type: 'fn#media-update', data: null })).media, null, '歌清空')
assert.deepEqual(plain(applyPresenceEvent(emptyPresence, { type: 'fn#media-update', data: { title: '晴る', duration: 'x' } })).media, { title: '晴る' }, '没有歌手、时长不是数字也行')
assert.equal(mediaPosition(media, t0 + 15_000), 45, '进度 = 采样时的进度 + 之后过去的秒数')
assert.equal(mediaPosition(media, t0 + 999_000), 261, '不超过时长')
assert.equal(mediaPosition({ title: 'x' }, t0), undefined, '没有进度时不推算')
assert.deepEqual([formatClock(7), formatClock(225.9), formatClock(3723)], ['0:07', '3:45', '1:02:03'])

console.log('PASS 站长“正在用 / 在听”：云函数的密钥、清洗、开始时间、进度校准、只在变化时广播、清空，前台解析与进度推算')
