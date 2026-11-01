// 站长“正在用 / 在听”的云函数（Core 引用 ps、名字 update，地址 /fn/ps/update），由 scripts/install-ps-function.mjs 装进 Core，
// 改了这里要重新运行安装脚本。改写自 mx-space/snippets 的 shiro/functions/ps.ts，接口和事件保持一致：
// - POST：Mac 上的 Yohaku Companion（MixSpace 兼容通道）每隔几秒发来当前的 App 和音乐，请求体带密钥 key；
//   清洗后存进 Redis，有变化才广播给访客（fn#ps-update / fn#media-update）；
// - GET：前台夜航岛读当前状态；
// - DELETE：带密钥手动清空（也给测试收尾用）。

type Process = { name: string; iconUrl?: string }
type Media = { title: string; artist?: string }
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

function text(value: unknown, max: number) {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed ? trimmed.slice(0, max) : undefined
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
function toMedia(value: unknown): Media | null {
  const raw = (value ?? {}) as Record<string, unknown>
  const title = text(raw.title, 128)
  if (!title) return null
  const artist = text(raw.artist, 128)
  return artist ? { title, artist } : { title }
}

async function read(ctx: Context) {
  const [processInfo, mediaInfo] = await Promise.all([
    ctx.storage.cache.get<Process>('ps'),
    ctx.storage.cache.get<Media>('media'),
  ])
  return { processName: processInfo?.name ?? null, processInfo: processInfo ?? null, mediaInfo: mediaInfo ?? null }
}

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

async function save(ctx: Context, key: string, value: Process | Media | null) {
  if (value) await ctx.storage.cache.set(key, value, ttl)
  else await ctx.storage.cache.del(key)
}

async function update(ctx: Context, process: Process | null, media: Media | null) {
  const before = await read(ctx)
  if (!same(before.processInfo, process)) {
    ctx.broadcast?.('ps-update', { processInfo: process, process: process?.name ?? null, ts: Date.now() })
  }
  if (!same(before.mediaInfo, media)) ctx.broadcast?.('media-update', media)
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
  return method === 'DELETE' ? update(ctx, null, null) : update(ctx, toProcess(body.process), toMedia(body.media))
}
