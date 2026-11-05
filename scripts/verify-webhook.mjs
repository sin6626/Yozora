import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

const require = createRequire(process.env.WEBHOOK_TEST_PACKAGE || new URL('../apps/web/package.json', import.meta.url))
const ts = require('typescript')
const load = (path, extra = {}) => {
  const code = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const module = { exports: {} }
  vm.runInNewContext(code, { module, exports: module.exports, ...extra })
  return module.exports
}
const webhookEvents = load('../apps/web/lib/webhook-events.ts')
const { BusinessEvents } = load('../apps/core/src/constants/business-event.constant.ts')
const coreEvents = new Set(Object.values(BusinessEvents))
const unknown = [...webhookEvents.eventTags.keys()].filter((event) => !coreEvents.has(event))
assert.deepEqual(unknown, [], 'every event the front end listens for must be registered in Core, otherwise the Webhook entry drops it')
const source = readFileSync(new URL('../apps/web/app/api/webhooks/mix-space/route.ts', import.meta.url), 'utf8')
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
const calls = []
let failInvalidation = false
const module = { exports: {} }
vm.runInNewContext(code, {
  module, exports: module.exports, Buffer, process, Response,
  require: (id) => id.endsWith('/lib/webhook-events') ? webhookEvents : id === 'next/cache' ? { revalidateTag: (...args) => {
    if (failInvalidation) throw new Error('storage unavailable')
    calls.push(args)
  } } : require(id),
})
const previous = process.env.MIX_SPACE_WEBHOOK_SECRET
const secret = 'local-test-secret-not-a-real-credential'
const id = '000000000000000000000001'
const signature = (body) => createHmac('sha256', secret).update(body).digest('hex')
const request = (event, body, signed = signature(body)) => new Request('http://localhost/api/webhooks/mix-space', {
  method: 'POST', headers: { 'content-type': 'application/json', 'x-webhook-event': event, 'x-webhook-signature256': signed }, body,
})
async function expectStatus(event, body, status, signed) {
  const before = calls.length
  const response = await module.exports.POST(request(event, body, signed))
  assert.equal(response.status, status)
  if (status !== 200 || event === 'health_check') assert.equal(calls.length, before)
  return response.json()
}
try {
  delete process.env.MIX_SPACE_WEBHOOK_SECRET
  await expectStatus('POST_CREATE', JSON.stringify({ id }), 503)
  process.env.MIX_SPACE_WEBHOOK_SECRET = secret
  await expectStatus('POST_CREATE', JSON.stringify({ id }), 401, '')
  await expectStatus('POST_CREATE', JSON.stringify({ id }), 401, 'g'.repeat(64))
  await expectStatus('POST_CREATE', JSON.stringify({ id }), 401, '0'.repeat(64))
  await expectStatus('POST_CREATE', JSON.stringify({ id, title: '篡改' }), 401, signature(JSON.stringify({ id })))
  await expectStatus('POST_CREATE', '{', 400)
  for (const body of ['null', '[]', '1', '{}', '{"id":"bad"}']) await expectStatus('POST_CREATE', body, 400)
  await expectStatus('UNKNOWN', JSON.stringify({ id }), 400)
  await expectStatus('POST_CREATE', 'x'.repeat(4 * 1024 * 1024 + 1), 413)
  assert.deepEqual(await expectStatus('health_check', '{}', 200), { event: 'health_check', revalidated: false })
  for (const event of ['POST_CREATE', 'POST_UPDATE', 'POST_DELETE', 'POST_DELETE']) {
    const body = JSON.stringify(event === 'POST_UPDATE' ? { _id: id, title: '中文正文 🐈' } : { id })
    const before = calls.length
    assert.equal((await expectStatus(event, body, 200)).revalidated, true)
    assert.equal(calls.length, before + 2)
    assert.equal(calls[before][0], 'blog:posts')
    assert.equal(calls[before + 1][0], 'blog:categories')
    assert.equal(calls[before][1].expire, 0)
  }
  const tagsFor = async (event, body) => {
    const before = calls.length
    assert.equal((await expectStatus(event, body, 200)).revalidated, true)
    return calls.slice(before).map(([tag, options]) => (assert.equal(options.expire, 0), tag))
  }
  for (const action of ['CREATE', 'UPDATE', 'DELETE']) {
    assert.deepEqual(await tagsFor(`NOTE_${action}`, JSON.stringify({ id })), ['blog:notes'])
    assert.deepEqual(await tagsFor(`PAGE_${action}`, JSON.stringify({ _id: id, title: '关于' })), ['blog:pages'])
    assert.deepEqual(await tagsFor(`CATEGORY_${action}`, JSON.stringify({ _id: id, name: '技术' })), ['blog:categories'])
    assert.deepEqual(await tagsFor(`TOPIC_${action}`, JSON.stringify({ id })), ['blog:notes'])
    assert.deepEqual(await tagsFor(`PROJECT_${action}`, JSON.stringify({ id })), ['blog:projects'])
    assert.deepEqual(await tagsFor(`SAY_${action}`, JSON.stringify({ id })), ['blog:says'])
    assert.deepEqual(await tagsFor(`RECENTLY_${action}`, JSON.stringify({ id })), ['blog:recently'])
    assert.deepEqual(await tagsFor(`MURMUR_${action}`, JSON.stringify({ id })), ['blog:murmurs'])
    assert.deepEqual(await tagsFor(`LINK_${action}`, JSON.stringify({ id })), ['blog:links'])
    assert.deepEqual(await tagsFor(`COMMENT_${action}`, JSON.stringify({ id })), ['blog:comments'])
    assert.deepEqual(await tagsFor(`AI_SUMMARY_${action}`, JSON.stringify({ id, refId: id, lang: 'zh' })), ['blog:ai'])
    assert.deepEqual(await tagsFor(`SNIPPET_${action}`, JSON.stringify({ id, reference: 'theme', name: 'yozora' })), ['blog:theme', 'activity-sky'])
    assert.deepEqual(await tagsFor(`TRANSLATION_${action}`, JSON.stringify({ id, refId: id, lang: 'en' })), ['blog:ai', 'blog:posts', 'blog:notes', 'blog:pages'])
  }
  assert.deepEqual(await tagsFor('OPTION_UPDATE', JSON.stringify({ id, key: 'seo' })), ['blog:navigation', 'blog:links', 'i18n'])
  // AI i18n 译文更新：载荷只有 { langs }，没有内容 ID
  assert.deepEqual(await tagsFor('I18N_UPDATE', JSON.stringify({ langs: ['en'] })), ['i18n'])
  assert.deepEqual(await tagsFor('OWNER_UPDATE', JSON.stringify({ id })), ['blog:navigation'])
  assert.deepEqual((await tagsFor('CONTENT_REFRESH', '"restore_done"')).sort(), ['activity-sky', 'blog:ai', 'blog:categories', 'blog:comments', 'blog:links', 'blog:murmurs', 'blog:navigation', 'blog:notes', 'blog:pages', 'blog:posts', 'blog:projects', 'blog:recently', 'blog:says', 'blog:theme', 'i18n'])
  for (const event of ['READER_CREATE', 'LINK_APPLY', 'VISITOR_ONLINE', 'OPTION_CREATE']) await expectStatus(event, JSON.stringify({ id }), 400)
  await expectStatus('NOTE_UPDATE', JSON.stringify({ id: 'bad' }), 400)
  await expectStatus('NOTE_UPDATE', JSON.stringify({ langs: ['en'] }), 400)
  failInvalidation = true
  await expectStatus('POST_UPDATE', JSON.stringify({ id }), 500)
  console.log('PASS webhook signatures, raw UTF-8, input limits, health check, post/note/page/category/topic/say/recently/murmur/comment/project/link/translation/ai-summary/snippet/option/owner/i18n/restore tags, events registered in Core, allowlist and cache failure')
} finally {
  if (previous === undefined) delete process.env.MIX_SPACE_WEBHOOK_SECRET
  else process.env.MIX_SPACE_WEBHOOK_SECRET = previous
}
