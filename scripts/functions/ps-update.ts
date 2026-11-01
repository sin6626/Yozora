// 站长“正在用 / 在听”的云函数（Core 引用 ps、名字 update，地址 /fn/ps/update），由 scripts/install-ps-function.mjs 装进 Core，
// 改了这里要重新运行安装脚本。改写自 mx-space/snippets 的 shiro/functions/ps.ts，接口和事件保持一致：
// - POST：Mac 上的 Yohaku Companion（MixSpace 兼容通道）每隔几秒发来当前的 App 和音乐，请求体带密钥 key；
//   清洗后存进 Redis，有变化才广播给访客（fn#ps-update / fn#media-update）；
// - GET：前台夜航岛读当前状态；
// - DELETE：带密钥手动清空（也给测试收尾用）。
// 歌记下时长、进度和采样时间（at），前台悬停卡片据此画播放进度。不记 App 用了多久（站长明确不要被计时）。
// Companion 只在音乐正在播放时才发 media，所以有 media 就是在放，进度可以按 at 往前推算。

type Process = { name: string; iconUrl?: string }
type Media = { title: string; artist?: string; player?: string; duration?: number; elapsed?: number; at?: number }
type Context = {
  req: { method: string; body?: unknown }
  isAuthenticated: boolean
  secret: { key?: unknown }
  storage: {
    cache: {
      get<T>(key: string): Promise<T | null>
      set(key: string, value: unknown, ttl?: number): Promise<void>
      del(key: string): Promise<void>
    }
  }
  broadcast?: (type: string, data: unknown) => void
  throws(status: number, message: string): never
}

// Companion 默认 10 秒发一次（最慢 1 分钟）；两分钟没收到就当站长离开了，Mac 睡眠、锁屏、关机后自然消失
const ttl = 120
// 进度和按上次推算的差超过这么多秒，当作拖动了进度或重新播放，广播一次让访客那边校准
const seekTolerance = 5

function text(value: unknown, max: number) {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed ? trimmed.slice(0, max) : undefined
}

function seconds(value: unknown, max: number) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= max ? value : undefined
}

// 这些数据会广播给每个访客：只留 App 名和 https 图标。窗口标题（description）、iconBase64 一律不存不播。
// 旧版 ProcessReporterMac 把 process 发成字符串，也认。
function toProcess(value: unknown): Process | null {
  const raw = (typeof value === 'string' ? { name: value } : value ?? {}) as Record<string, unknown>
  const name = text(raw.name, 64)
  if (!name) return null
  const iconUrl = text(raw.iconUrl, 512)
  return iconUrl && /^https:\/\//i.test(iconUrl) ? { name, iconUrl } : { name }
}

// Companion 没在放歌时也会发 media，只是没有标题
function toMedia(value: unknown, now: number): Media | null {
  const raw = (value ?? {}) as Record<string, unknown>
  const title = text(raw.title, 128)
  if (!title) return null
  const media: Media = { title }
  const artist = text(raw.artist, 128)
  const player = text(raw.processName, 64)
  const duration = seconds(raw.duration, 24 * 3600)
  const elapsed = seconds(raw.elapsedTime, duration ?? 24 * 3600)
  if (artist) media.artist = artist
  if (player) media.player = player
  if (duration) media.duration = duration
  if (elapsed !== undefined) Object.assign(media, { elapsed, at: now })
  return media
}

async function read(ctx: Context) {
  const [processInfo, mediaInfo] = await Promise.all([
    ctx.storage.cache.get<Process>('ps'),
    ctx.storage.cache.get<Media>('media'),
  ])
  return { processName: processInfo?.name ?? null, processInfo: processInfo ?? null, mediaInfo: mediaInfo ?? null }
}

const sameApp = (a: Process | null, b: Process | null) => a?.name === b?.name && a?.iconUrl === b?.iconUrl
const songOf = (media: Media | null) => JSON.stringify(media ? [media.title, media.artist, media.player] : null)
// Companion 只在切歌、暂停、拖动进度时重新采样，心跳时原样重发上次采到的进度（比如一直是 0.708 秒）。
// 同一首歌、进度数字没变，就是同一次采样：沿用第一次收到它的时间往前推算，不算拖动
const sameSample = (before: Media | null, media: Media | null) =>
  songOf(before) === songOf(media) && before?.elapsed !== undefined && before.elapsed === media?.elapsed && Boolean(before.at)
function sameSong(before: Media | null, media: Media | null, now: number) {
  if (songOf(before) !== songOf(media)) return false
  if (before?.elapsed === undefined || !before.at || media?.elapsed === undefined || sameSample(before, media)) return true
  return Math.abs(before.elapsed + (now - before.at) / 1000 - media.elapsed) <= seekTolerance
}

async function save(ctx: Context, key: string, value: Process | Media | null) {
  if (value) await ctx.storage.cache.set(key, value, ttl)
  else await ctx.storage.cache.del(key)
}

async function update(ctx: Context, body: Record<string, unknown> | null) {
  const now = Date.now()
  const before = await read(ctx)
  const process = body ? toProcess(body.process) : null
  const media = body ? toMedia(body.media, now) : null
  if (media && sameSample(before.mediaInfo, media)) media.at = before.mediaInfo?.at
  if (!sameApp(before.processInfo, process)) {
    ctx.broadcast?.('ps-update', { processInfo: process, process: process?.name ?? null, ts: now })
  }
  if (!sameSong(before.mediaInfo, media, now)) ctx.broadcast?.('media-update', media)
  await Promise.all([save(ctx, 'ps', process), save(ctx, 'media', media)])
  return { ok: 1, processName: process?.name ?? null, processInfo: process, mediaInfo: media }
}

export default async function handler(ctx: Context) {
  const method = String(ctx.req.method).toUpperCase()
  if (method === 'GET') return read(ctx)
  if (method !== 'POST' && method !== 'DELETE') ctx.throws(405, 'Method Not Allowed')
  const body = (ctx.req.body ?? {}) as Record<string, unknown>
  const key = ctx.secret?.key
  if (!ctx.isAuthenticated && (typeof key !== 'string' || !key || body.key !== key)) ctx.throws(401, 'Unauthorized')
  return update(ctx, method === 'DELETE' ? null : body)
}
