// 后台“附加功能 → Yozora 主题”：表单读的是 Core 的 theme/yozora 片段，改一项点保存，只把这一项套到保存前刚读到的最新片段上，
// 打开页面后别处做的修改（这里模拟清空图标行、新增作品译文）不会被旧快照覆盖；保存带 baseRaw，读写之间又被改（409）会重读再试。
// 读最新片段和保存请求都在浏览器里拦截，不写日常库。用后台本地 API 令牌（.local/publish.json）代替登录。
// 需先开 pnpm dev（后台 9528、Core 2333）。用法：node scripts/e2e/admin-yozora-theme.mjs（ADMIN_URL 可改后台地址）
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { openBrowser, sleep } from '../headless-browser.mjs'

const admin = process.env.ADMIN_URL ?? 'http://127.0.0.1:9528'
const core = 'http://127.0.0.1:2333'
const token = JSON.parse(readFileSync(new URL('../../.local/publish.json', import.meta.url), 'utf8')).local.token
const snippet = (await (await fetch(`${core}/snippets/group/theme`, { headers: { 'x-api-key': token } })).json()).data.find((item) => item.name === 'yozora')
assert.ok(snippet, '本地 Core 里要有 theme/yozora 片段')
const before = JSON.parse(snippet.raw)
const cors = [
  { name: 'Access-Control-Allow-Origin', value: new URL(admin).origin },
  { name: 'Access-Control-Allow-Credentials', value: 'true' },
  { name: 'Content-Type', value: 'application/json' },
]

// 打开页面之后，有人在“配置与云函数”里清空了图标行、加了一条作品译文
const elsewhere = structuredClone(before)
elsewhere.techStack.rows = []
elsewhere.i18n.en.projects = { ...elsewhere.i18n.en.projects, e2e: { name: 'added elsewhere' } }
const latest = { ...snippet, raw: JSON.stringify(elsewhere, null, 2) }

const b = await openBrowser({ port: 9343 })
const saved = []
const leaked = []
let latestReads = 0
try {
  await b.setViewport(1440, 900)
  await b.send('Fetch.enable', { patterns: [{ urlPattern: `${core}/*` }] })
  b.listeners.push((m) => {
    if (m.method !== 'Fetch.requestPaused') return
    const { requestId, request } = m.params
    if (request.method === 'GET' && new URL(request.url).pathname.endsWith(`/snippets/${snippet.id}`)) {
      latestReads++
      return b.send('Fetch.fulfillRequest', { requestId, responseCode: 200, responseHeaders: cors, body: Buffer.from(JSON.stringify(latest)).toString('base64') })
    }
    if (request.method === 'PUT' && request.url.endsWith(`/snippets/${snippet.id}`)) {
      saved.push(JSON.parse(request.postData))
      // 第一次保存时假装读写之间片段又被改了
      if (saved.length === 1) return b.send('Fetch.fulfillRequest', { requestId, responseCode: 409, responseHeaders: cors, body: Buffer.from(JSON.stringify({ ok: 0, code: 12006, message: '配置片段已在别处被修改，请重新读取后再保存' })).toString('base64') })
      return b.send('Fetch.fulfillRequest', { requestId, responseCode: 200, responseHeaders: cors, body: Buffer.from(JSON.stringify({ ...snippet, ...JSON.parse(request.postData) })).toString('base64') })
    }
    if (!['GET', 'OPTIONS', 'HEAD'].includes(request.method)) leaked.push(`${request.method} ${request.url}`)
    b.send('Fetch.continueRequest', { requestId, headers: [...Object.entries(request.headers).map(([name, value]) => ({ name, value })), { name: 'x-api-key', value: token }] })
  })

  await b.goto(`${admin}/#/extra-features/yozora-theme`, 6000)
  assert.equal(await b.evaluate('location.hash'), '#/extra-features/yozora-theme', '能直接打开 Yozora 主题页')
  const shown = await b.evaluate(`({
    menu: [...document.querySelectorAll('body *')].some((el) => el.children.length === 0 && el.textContent.trim() === 'Yozora 主题'),
    values: [...document.querySelectorAll('input, textarea')].map((el) => el.value),
  })`)
  assert.ok(shown.menu, '侧栏有“Yozora 主题”')
  assert.ok(shown.values.includes(before.hero.title), `表单显示片段里的首屏标题：${before.hero.title}`)
  assert.ok(shown.values.includes(before.footer.motto), '表单显示页脚那句话')
  const states = await b.evaluate(`[...document.querySelectorAll('.n-tag')].map((el) => el.textContent.trim())`)
  assert.ok(states.includes('自定义'), `每项标出当前状态：${states}`)
  const buttons = await b.evaluate(`[...document.querySelectorAll('button')].map((el) => el.textContent.trim())`)
  assert.ok(buttons.includes('恢复默认'), '写了的项能改回默认')

  // English 标签里有站点描述和每个作品的译文栏
  await b.evaluate(`[...document.querySelectorAll('.n-tabs-tab')].find((el) => el.textContent.trim() === 'English').click()`)
  await sleep(500)
  const english = await b.evaluate(`({
    labels: [...document.querySelectorAll('.n-form-item-label')].map((el) => el.textContent.trim()),
    values: [...document.querySelectorAll('input, textarea')].map((el) => el.value),
  })`)
  assert.ok(english.labels.some((label) => label.startsWith('站点描述')), `English 标签有站点描述：${english.labels}`)
  assert.ok(english.labels.some((label) => label.startsWith('作品：')), 'English 标签有作品译文')
  if (before.i18n?.en?.siteDescription) assert.ok(english.values.includes(before.i18n.en.siteDescription), '显示片段里的英文站点描述')
  await b.evaluate(`[...document.querySelectorAll('.n-tabs-tab')].find((el) => el.textContent.trim() === '中文').click()`)
  await sleep(500)

  // 改中文“页脚那句话”，点保存
  const motto = 'e2e 改过的那句话'
  await b.evaluate(`(() => {
    const field = [...document.querySelectorAll('input')].find((el) => el.value === ${JSON.stringify(before.footer.motto)})
    field.focus()
    field.select()
  })()`)
  await b.send('Input.insertText', { text: motto })
  await sleep(200)
  await b.evaluate(`document.querySelector('button[aria-label="保存"]').click()`)
  await sleep(1500)

  assert.equal(saved.length, 2, '第一次 409 后重读最新片段再保存一次')
  assert.equal(latestReads, 2, '每次保存前都读一次最新片段')
  for (const request of saved) assert.equal(request.baseRaw, latest.raw, '保存请求带上所依据的最新内容（baseRaw）')
  const after = JSON.parse(saved[1].raw)
  assert.equal(after.footer.motto, motto, '改的那一项写进片段')
  assert.deepEqual(after.techStack.rows, [], '别处清空的图标行没有被旧快照恢复')
  assert.deepEqual(after.i18n.en.projects, elsewhere.i18n.en.projects, '别处新增的作品译文没有丢')
  assert.deepEqual({ ...after, footer: { ...after.footer, motto: elsewhere.footer.motto } }, elsewhere, '除了改的那一项，和最新片段一字不差')
  assert.equal(saved[1].name, 'yozora')
  assert.deepEqual(leaked, [], '没有别的写请求')
  console.log('admin-yozora-theme: 通过')
} finally {
  b.close()
}
