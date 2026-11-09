import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

const require = createRequire(new URL('../apps/web/package.json', import.meta.url))
const ts = require('typescript')
function load(name) {
  const source = readFileSync(new URL(`../apps/web/lib/${name}.ts`, import.meta.url), 'utf8')
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
  const module = { exports: {} }
  vm.runInNewContext(code, {
    module, exports: module.exports, process, URL, AbortSignal, Headers,
    require: (id) => id === 'server-only' ? {} : id === './config' ? load('config') : require(id),
  }, { filename: fileURLToPath(new URL(`../apps/web/lib/${name}.ts`, import.meta.url)) })
  return module.exports
}
const previousUrl = process.env.MIX_SPACE_API_URL
const previousFetch = globalThis.fetch
try {
  delete process.env.MIX_SPACE_API_URL
  assert.throws(() => load('config').getApiUrl(), /MIX_SPACE_API_URL/)
  process.env.MIX_SPACE_API_URL = 'https://example.test/api/v2/'
  const { getApiClient } = load('api')
  globalThis.fetch = async (url, options) => {
    assert.equal(String(url), 'https://example.test/api/v2/aggregate')
    assert.equal(options.cache, 'no-store')
    assert.ok(options.signal instanceof AbortSignal)
    return Response.json({ categories: [], page_meta: [{ title: '关于我', slug: 'about' }] })
  }
  assert.equal((await getApiClient().aggregate.getAggregateData()).pageMeta[0].slug, 'about')
  globalThis.fetch = async (url) => {
    const request = new URL(url)
    assert.equal(request.pathname, '/api/v2/posts')
    assert.equal(request.searchParams.get('page'), '2')
    assert.equal(request.searchParams.get('size'), '10')
    assert.equal(request.searchParams.get('categoryIds'), '000000000000000000000001,000000000000000000000002')
    return Response.json({ data: [], pagination: { current_page: 2, total_page: 2 } })
  }
  const posts = await getApiClient().post.getList(2, 10, {
    categoryIds: ['000000000000000000000001', '000000000000000000000002'],
  })
  assert.equal(posts.pagination.currentPage, 2)
  globalThis.fetch = async () => Response.json({ ok: 0, message: 'not found' }, { status: 404 })
  await assert.rejects(getApiClient().post.getPost('category', 'missing'), (error) => error.status === 404)
  const control = Object.assign(new Error('redirect'), { digest: 'NEXT_REDIRECT;replace;/;307;' })
  globalThis.fetch = async () => { throw control }
  await assert.rejects(getApiClient().aggregate.getAggregateData(), (error) => error === control)
  const failure = new Error('network unavailable')
  globalThis.fetch = async () => { throw failure }
  await assert.rejects(getApiClient().aggregate.getAggregateData(), (error) => error === failure)
  console.log('PASS SDK aggregate/posts, category paging query, camelCase fields, URL, timeout and Next control errors')
} finally {
  globalThis.fetch = previousFetch
  if (previousUrl === undefined) delete process.env.MIX_SPACE_API_URL
  else process.env.MIX_SPACE_API_URL = previousUrl
}
