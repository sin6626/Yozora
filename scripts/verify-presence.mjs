import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

// 检查站长“正在用 / 在听”的云函数（scripts/functions/ps-update.ts）：密钥校验、第一次调用不报错、只在变化时广播、
// 不存窗口标题和非 https 图标、不记 App 用了多久、歌记时长和进度、拖动进度时广播校准、没在放歌时清掉、DELETE 清空；
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
const app = { name: 'Code', iconUrl: 'https://s3.example.com/icons/code.png' }
const media = { title: '夜に駆ける', artist: 'YOASOBI', player: 'Music', duration: 261, elapsed: 30, at: t0 }
assert.deepEqual(await get(), { processName: 'Code', processInfo: app, mediaInfo: media }, '只留 App 名、https 图标，歌名、歌手、播放器、时长、进度；窗口标题、iconBase64、开始用的时间都不存')
assert.equal(store.get('ps').ttl, 120, 'App 两分钟没续上就过期')
assert.deepEqual(take(), [['ps-update', app], ['media-update', media]], '第一次两样都广播，广播里同样没有窗口标题')

later(10)
await post(vscode, song(40))
assert.deepEqual(take(), [], '心跳（同一个 App、同一首歌按时往前走）不广播')
const beat = await get()
assert.deepEqual([beat.mediaInfo.elapsed, beat.mediaInfo.at], [40, t0 + 10_000], '进度和采样时间跟着心跳更新')

later(10)
await post(vscode, song(120))
assert.deepEqual(take().map(([type]) => type), ['media-update'], '进度比推算的多出 5 秒以上（拖动了进度）时广播校准')

later(10)
await post({ name: 'Safari', iconUrl: 'javascript:alert(1)' }, song(130))
assert.deepEqual(take(), [['ps-update', { name: 'Safari' }]], '换 App 只广播 App，非 https 图标丢掉')

// 2026-11-01 的 bug：网易云放到 2:36，卡片却显示 0:10。Companion 每次心跳都原样重发切歌时采到的进度（一直是 0.708 秒），
// 云函数却把每次收到的时间当成采样时间，页面只能显示 0:00–0:10。同一首歌、进度数字没变，就是同一次采样，应当沿用第一次收到的时间往前推算
take()
later(10)
await post({ name: 'Safari' }, { title: '苦茶子', processName: 'NetEaseMusic', duration: 170.86, elapsedTime: 0.708 })
take()
const stale = clock.now
for (let i = 0; i < 3; i++) {
  later(10)
  await post({ name: 'Safari' }, { title: '苦茶子', processName: 'NetEaseMusic', duration: 170.86, elapsedTime: 0.708 })
}
assert.deepEqual(take(), [], '原样重发的进度不算拖动，不广播')
const { mediaPosition: positionAt } = load('../apps/web/lib/presence.ts')
assert.equal((await get()).mediaInfo.at, stale, '沿用第一次收到这个进度的时间')
assert.equal(Math.round(positionAt((await get()).mediaInfo, clock.now)), 31, '30 秒后显示 0:31，不再停在前几秒')
later(5)
await post({ name: 'Safari' }, { title: '苦茶子', processName: 'NetEaseMusic', duration: 170.86, elapsedTime: 120 })
assert.deepEqual(take().map(([type]) => type), ['media-update'], '进度数字变了（拖动了进度条）时重新校准并广播')
assert.deepEqual([(await get()).mediaInfo.elapsed, (await get()).mediaInfo.at], [120, clock.now])

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
assert.deepEqual(parsed, { app: { name: 'Code', icon: 'https://s3.example.com/icons/code.png' }, media }, '前台读 GET 响应')
assert.deepEqual(plain(presenceFromSnapshot({ ok: 0, code: 11017, message: '函数不存在' })), { app: null, media: null }, '云函数没装时是空状态')
assert.deepEqual(plain(presenceFromSnapshot(null)), { app: null, media: null })
assert.equal(applyPresenceEvent(emptyPresence, { type: 'POST_CREATE', data: {} }), null, '别的消息不处理')
assert.deepEqual(plain(applyPresenceEvent(parsed, { type: 'fn#ps-update', data: { processInfo: { name: 'Safari', iconUrl: 'http://x/a.png', since: 5 } } })).app, { name: 'Safari' }, '换 App 只改 App，非 https 图标和多余字段丢掉')
assert.equal(plain(applyPresenceEvent(parsed, { type: 'fn#ps-update', data: { processInfo: null } })).app, null, 'App 清空')
assert.equal(plain(applyPresenceEvent(parsed, { type: 'fn#media-update', data: null })).media, null, '歌清空')
assert.deepEqual(plain(applyPresenceEvent(emptyPresence, { type: 'fn#media-update', data: { title: '晴る', duration: 'x' } })).media, { title: '晴る' }, '没有歌手、时长不是数字也行')
assert.equal(mediaPosition(media, t0 + 15_000), 45, '进度 = 采样时的进度 + 之后过去的秒数')
assert.equal(mediaPosition(media, t0 + 999_000), 261, '不超过时长')
assert.equal(mediaPosition({ title: 'x' }, t0), undefined, '没有进度时不推算')
assert.deepEqual([formatClock(7), formatClock(225.9), formatClock(3723)], ['0:07', '3:45', '1:02:03'])

// 常见 App 的矢量图标对照表（apps/web/lib/app-icons.ts）：图标都在已装的图标集里，App 名不重复，查名字不分大小写
const { appIcons, appIconSrc } = load('../apps/web/lib/app-icons.ts')
const iconSets = Object.fromEntries(['logos', 'simple-icons', 'mingcute', 'skill-icons'].map((set) => [set, require(`@iconify-json/${set}/icons.json`)]))
const seen = new Set()
for (const [key, { icon, names }] of Object.entries(appIcons)) {
  const [prefix, name] = icon.split(':')
  assert.ok(iconSets[prefix]?.icons[name] || iconSets[prefix]?.aliases?.[name], `${key} 的图标 ${icon} 应当在已装的图标集里`)
  for (const n of names) {
    assert.ok(!seen.has(n.toLowerCase()), `App 名 ${n} 重复`)
    seen.add(n.toLowerCase())
  }
}
assert.equal(appIconSrc(' google chrome '), '/api/app-icon/chrome?v=1', '查名字不分大小写、去掉首尾空格')
assert.equal(appIconSrc('微信'), '/api/app-icon/wechat?v=1', '中文名也认')
assert.equal(appIconSrc('UU远程'), undefined, '认不得的 App 没有矢量图标')
assert.equal(appIconSrc('NetEaseMusic'), '/api/app-icon/netease?v=1', 'Companion 报的播放器进程名也认')

console.log('PASS 站长“正在用 / 在听”：云函数的密钥、清洗（不记用了多久）、进度校准、只在变化时广播、清空，前台解析与进度推算、App 图标对照表')
