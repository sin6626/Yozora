// 2026-11-09 前台服务端连 Core：内网优先、公网兜底；转发读者 IP；内部密钥（docs/architecture-cache-plan.md 第 3、4 步）。
// 纯逻辑检查：转译 apps/web/lib/api.ts，替换 node:net（内网探测）、next/headers（读者请求头）、fetch 和时钟。
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { createRequire } from 'node:module'
import { isIP } from 'node:net'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

const require = createRequire(new URL('../apps/web/package.json', import.meta.url))
const ts = require('typescript')
const publicUrl = 'https://api.example.test/api/v2'
const internalUrl = 'http://mx-server:2333/api/v2'

function load(name, stubs) {
  const file = new URL(`../apps/web/lib/${name}.ts`, import.meta.url)
  const code = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const module = { exports: {} }
  vm.runInNewContext(code, {
    module, exports: module.exports, process, URL, AbortSignal, Headers, Response, Promise,
    Date: stubs.Date, fetch: (...args) => globalThis.fetch(...args),
    require: (id) => id === 'server-only' ? {} : id === './config' ? load('config', stubs) : id in stubs.modules ? stubs.modules[id] : require(id),
  }, { filename: fileURLToPath(file) })
  return module.exports
}

// 一套独立的模块状态：clock 控制 Date.now，net.result 决定内网探测连得上（connect）、拒绝（error）还是超时（timeout），
// requests 记下每次 fetch 的地址、方法和请求头，reply(url) 决定返回
function setup({ internal = internalUrl, key, readerHeaders = {} } = {}) {
  process.env.MIX_SPACE_API_URL = publicUrl
  if (internal) process.env.MIX_SPACE_INTERNAL_API_URL = internal
  else delete process.env.MIX_SPACE_INTERNAL_API_URL
  if (key) process.env.YOZORA_INTERNAL_KEY = key
  else delete process.env.YOZORA_INTERNAL_KEY
  const clock = { now: 1_000_000 }
  const FakeDate = class extends Date {}
  FakeDate.now = () => clock.now
  const net = {
    result: 'connect', probes: [],
    connect(options) {
      net.probes.push(options)
      const socket = new EventEmitter()
      socket.destroy = () => {}
      setImmediate(() => socket.emit(net.result, new Error('probe')))
      return socket
    },
    isIP,
  }
  const requests = []
  const state = { reply: () => Response.json({ ok: true }) }
  globalThis.fetch = async (url, options = {}) => {
    requests.push({ url: String(url), method: options.method ?? 'GET', headers: new Headers(options.headers) })
    return state.reply(String(url), options)
  }
  const api = load('api', {
    Date: FakeDate,
    modules: { 'node:net': net, 'next/headers': { headers: async () => new Headers(readerHeaders) } },
  })
  return { api, clock, net, requests, state }
}

const networkError = () => Object.assign(new TypeError('fetch failed'), { cause: new Error('getaddrinfo ENOTFOUND mx-server') })
const previous = { fetch: globalThis.fetch, env: { ...process.env } }
try {
  // 配置：getApiUrl 含义不变（公网，给浏览器）；内网地址可选、同样的校验规则
  {
    const { api } = setup({ internal: null })
    const config = load('config', { Date, modules: {} })
    assert.equal(config.getApiUrl(), publicUrl)
    assert.equal(config.getInternalApiUrl(), null)
    process.env.MIX_SPACE_INTERNAL_API_URL = 'http://user:pass@mx-server:2333/api/v2'
    assert.throws(() => config.getInternalApiUrl(), /MIX_SPACE_INTERNAL_API_URL/)
    process.env.MIX_SPACE_INTERNAL_API_URL = 'ftp://mx-server/api/v2'
    assert.throws(() => config.getInternalApiUrl(), /MIX_SPACE_INTERNAL_API_URL/)
    process.env.MIX_SPACE_INTERNAL_API_URL = `${internalUrl}/`
    assert.equal(config.getInternalApiUrl(), internalUrl)
    assert.ok(api.getApiClient && api.getLiveApiClient && api.coreFetch)
  }

  // 没配内网：只走公网，也不探测
  {
    const { api, net, requests } = setup({ internal: null })
    await api.getApiClient().aggregate.getAggregateData()
    assert.deepEqual(requests.map((r) => r.url), [`${publicUrl}/aggregate`])
    assert.equal(net.probes.length, 0)
  }

  // 内网正常：用内网；探测连接超时 1.5 秒，按地址的主机和端口
  {
    const { api, net, requests, state } = setup()
    state.reply = () => Response.json({ categories: [], page_meta: [{ title: '关于我', slug: 'about' }] })
    assert.equal((await api.getApiClient().aggregate.getAggregateData()).pageMeta[0].slug, 'about')
    await api.getApiClient('en').post.getList(1, 10)
    assert.equal(requests[0].url, `${internalUrl}/aggregate`)
    assert.ok(requests[1].url.startsWith(`${internalUrl}/posts?`) && requests[1].url.includes('lang=en'), requests[1].url)
    assert.equal(net.probes.length, 1, '60 秒内只探测一次')
    assert.deepEqual([net.probes[0].host, net.probes[0].port, net.probes[0].timeout], ['mx-server', 2333, 1500])
    const response = await api.coreFetch('/ai/i18n')
    assert.equal(requests[2].url, `${internalUrl}/ai/i18n`)
    assert.deepEqual(await response.json(), { categories: [], page_meta: [{ title: '关于我', slug: 'about' }] })
  }

  // 内网网络错误：同一个 GET 改走公网、结果正确；60 秒内直接走公网、不再探测；60 秒后再试内网
  {
    const { api, clock, net, requests, state } = setup()
    state.reply = (url) => {
      if (url.startsWith(internalUrl)) throw networkError()
      return Response.json({ categories: [], page_meta: [{ title: '公网', slug: 'public' }] })
    }
    assert.equal((await api.getApiClient().aggregate.getAggregateData()).pageMeta[0].slug, 'public')
    assert.deepEqual(requests.map((r) => r.url), [`${internalUrl}/aggregate`, `${publicUrl}/aggregate`])
    clock.now += 59_000
    await api.getApiClient().aggregate.getAggregateData()
    assert.equal((await api.coreFetch('/ai/i18n')).status, 200)
    assert.deepEqual(requests.slice(2).map((r) => r.url), [`${publicUrl}/aggregate`, `${publicUrl}/ai/i18n`])
    assert.equal(net.probes.length, 1)
    clock.now += 2_000
    state.reply = () => Response.json({ categories: [], page_meta: [] })
    await api.getApiClient().aggregate.getAggregateData()
    assert.equal(requests.at(-1).url, `${internalUrl}/aggregate`, '60 秒后再试内网')
    assert.equal(net.probes.length, 2)
  }

  // 内网连不上（探测超时或被拒）：不发内网请求，直接公网；60 秒内不再探测
  for (const result of ['timeout', 'error']) {
    const { api, clock, net, requests } = setup()
    net.result = result
    await api.getApiClient().aggregate.getAggregateData()
    await api.getApiClient().aggregate.getAggregateData()
    assert.deepEqual(requests.map((r) => r.url), [`${publicUrl}/aggregate`, `${publicUrl}/aggregate`], result)
    assert.equal(net.probes.length, 1)
    clock.now += 61_000
    net.result = 'connect'
    await api.getApiClient().aggregate.getAggregateData()
    assert.equal(requests.at(-1).url, `${internalUrl}/aggregate`)
  }

  // 请求超时（TimeoutError）也算连不上，改走公网
  {
    const { api, requests, state } = setup()
    state.reply = (url) => {
      if (url.startsWith(internalUrl)) throw new DOMException('The operation was aborted due to timeout', 'TimeoutError')
      return Response.json({ categories: [], page_meta: [] })
    }
    await api.getApiClient().aggregate.getAggregateData()
    assert.deepEqual(requests.map((r) => r.url), [`${internalUrl}/aggregate`, `${publicUrl}/aggregate`])
  }

  // HTTP 500 / 404 不兜底：Core 本身出错，换个地址也一样；之后照常走内网
  {
    const { api, requests, state } = setup()
    state.reply = () => Response.json({ message: 'boom' }, { status: 500 })
    await assert.rejects(api.getApiClient().aggregate.getAggregateData(), (error) => error.status === 500)
    state.reply = () => Response.json({ message: 'not found' }, { status: 404 })
    await assert.rejects(api.getApiClient().post.getPost('category', 'missing'), (error) => error.status === 404)
    assert.equal((await api.coreFetch('/ai/i18n/xx')).status, 404)
    assert.ok(requests.every((r) => r.url.startsWith(internalUrl)), requests.map((r) => r.url).join('\n'))
  }

  // Next 内部控制异常原样抛出、不兜底
  {
    const { api, requests, state } = setup()
    const control = Object.assign(new Error('redirect'), { digest: 'NEXT_REDIRECT;replace;/;307;' })
    state.reply = () => { throw control }
    await assert.rejects(api.getApiClient().aggregate.getAggregateData(), (error) => error === control)
    assert.equal(requests.length, 1)
  }

  // 非 GET：直接走内网，网络错误就报错，不改走公网
  {
    const { api, net, requests, state } = setup()
    state.reply = () => { throw networkError() }
    await assert.rejects(api.getApiClient().proxy.comments.post({ data: { text: 'x' } }), (error) => error.message === 'fetch failed')
    await assert.rejects(api.coreFetch('/pageview', { method: 'POST' }), /fetch failed/)
    assert.deepEqual(requests.map((r) => [r.method, r.url]), [['POST', `${internalUrl}/comments`], ['POST', `${internalUrl}/pageview`]])
    assert.equal(net.probes.length, 0)
  }

  // 读者 IP：先 x-real-ip，没有再取 x-forwarded-for 第一个；只给现取的客户端，缓存用的客户端不读请求头
  const ipOf = async (readerHeaders) => {
    const { api, requests } = setup({ readerHeaders })
    await (await api.getLiveApiClient()).aggregate.getAggregateData()
    await api.getApiClient().aggregate.getAggregateData()
    assert.equal(requests[1].headers.get('x-real-ip'), null, '缓存用的客户端不带读者 IP')
    assert.equal(requests[1].headers.get('x-forwarded-for'), null)
    const sent = requests[0].headers
    assert.equal(sent.get('x-forwarded-for'), sent.get('x-real-ip'))
    return sent.get('x-real-ip')
  }
  assert.equal(await ipOf({ 'x-real-ip': '203.0.113.5', 'x-forwarded-for': '198.51.100.1, 10.0.0.1' }), '203.0.113.5')
  assert.equal(await ipOf({ 'x-forwarded-for': ' 198.51.100.1 , 10.0.0.1' }), '198.51.100.1')
  assert.equal(await ipOf({ 'x-forwarded-for': '2001:db8::1' }), '2001:db8::1')
  assert.equal(await ipOf({}), null)
  assert.equal(await ipOf({ 'x-real-ip': 'unknown' }), null, '不是 IP 的值不转发')
  {
    const { api, requests } = setup({ readerHeaders: { 'x-real-ip': '203.0.113.5' } })
    await (await api.getLiveApiClient('ja')).post.getList(1, 10)
    assert.ok(requests[0].url.includes('lang=ja'))
    assert.equal(requests[0].headers.get('x-real-ip'), '203.0.113.5')
  }

  // 内部密钥：只有 Next 缓存重建用的 getApiClient 和 coreFetch 带；现取客户端是替读者发的，永远不带，
  // 拿不到读者 IP 时也不带（Codex 复查：否则访客能触发的服务端函数会被 Core 当成内部请求、绕过限流）
  {
    const { api, requests } = setup({ key: 'k'.repeat(64), readerHeaders: { 'x-real-ip': '203.0.113.5' } })
    await api.getApiClient().aggregate.getAggregateData()
    await (await api.getLiveApiClient()).aggregate.getAggregateData()
    await api.coreFetch('/ai/i18n')
    assert.deepEqual(requests.map((r) => r.headers.get('x-yozora-internal-key')), ['k'.repeat(64), null, 'k'.repeat(64)])
  }
  {
    const { api, requests } = setup({ key: 'k'.repeat(64) })
    await (await api.getLiveApiClient()).aggregate.getAggregateData()
    assert.equal(requests[0].headers.has('x-yozora-internal-key'), false, '没有读者 IP 的现取请求也不带密钥')
  }

  // 内网收到响应头后正文中途断开：同样改走公网、进入 60 秒熔断（Codex 复查：原来只包住了 fetch，读正文在外面）
  {
    const { api, requests, state } = setup()
    state.reply = (url) => url.startsWith(internalUrl)
      ? new Response(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('{"lang":')); controller.error(networkError()) } }))
      : Response.json({ lang: 'en' })
    assert.deepEqual(await (await api.coreFetch('/ai/i18n/en')).json(), { lang: 'en' })
    await api.coreFetch('/ai/i18n/ja')
    assert.deepEqual(requests.map((r) => r.url), [`${internalUrl}/ai/i18n/en`, `${publicUrl}/ai/i18n/en`, `${publicUrl}/ai/i18n/ja`])
  }
  {
    const { api, requests } = setup()
    await api.getApiClient().aggregate.getAggregateData()
    await (await api.getLiveApiClient()).aggregate.getAggregateData()
    await api.coreFetch('/ai/i18n')
    assert.ok(requests.every((r) => !r.headers.has('x-yozora-internal-key')))
  }

  console.log('PASS internal-first Core routing with public fallback, 60s breaker, GET-only retry, reader IP forwarding and internal key header')
} finally {
  globalThis.fetch = previous.fetch
  for (const key of ['MIX_SPACE_API_URL', 'MIX_SPACE_INTERNAL_API_URL', 'YOZORA_INTERNAL_KEY']) {
    if (previous.env[key] === undefined) delete process.env[key]
    else process.env[key] = previous.env[key]
  }
}
