// 后台“思考”编辑框（2026-11-12）：原来只有一个文本框，不能选类型、填卡片信息，也不能引用站内内容。
// 现在：八种类型单选，按类型显示字段（必填项缺了不发请求、提示哪一项），粘贴 GitHub 链接自动填所有者和仓库，
// “引用站内内容”输入关键词搜文章和手记（真实 Core 的只读搜索），保存发出 { type, content, metadata, ref }；编辑旧条目清掉引用时发 ref: null。
// 列表里显示卡片摘要和引用。用后台本地 API 令牌（.local/publish.json）代替登录；新建、修改都在浏览器里拦下换成假响应，不写库。
// 需先开 pnpm dev（后台 9528、Core 2333）。用法：node scripts/e2e/admin-thinking.mjs。截图存 .local/previews/admin-thinking/。
import assert from 'node:assert/strict'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { openBrowser, sleep } from '../headless-browser.mjs'

const admin = process.env.ADMIN_URL ?? 'http://127.0.0.1:9528'
const core = 'http://127.0.0.1:2333'
const token = JSON.parse(readFileSync(new URL('../../.local/publish.json', import.meta.url), 'utf8')).local.token
const shots = new URL('../../.local/previews/admin-thinking/', import.meta.url)
mkdirSync(shots, { recursive: true })
const cors = [
  { name: 'Access-Control-Allow-Origin', value: new URL(admin).origin },
  { name: 'Access-Control-Allow-Credentials', value: 'true' },
  { name: 'Content-Type', value: 'application/json' },
]

// 搜索用的真实文章：标题 Zod
const target = (await (await fetch(`${core}/search/post?keyword=Zod&size=1`, { headers: { 'x-api-key': token } })).json()).data[0]
assert.equal(target?.title, 'Zod', '本地库里要有标题为 Zod 的文章')

const b = await openBrowser({ port: 9491 })
const sent = []
const leaked = []
const shot = async (name) => {
  const { result } = await b.send('Page.captureScreenshot', { format: 'jpeg', quality: 82 })
  writeFileSync(new URL(`${name}.jpg`, shots), Buffer.from(result.data, 'base64'))
}
const waitFor = async (expression, ms = 8000) => {
  for (let t = 0; t < ms; t += 150) { if (await b.evaluate(expression)) return true; await sleep(150) }
  return false
}
const click = (expression) => b.evaluate(`(${expression}).click()`)
const byText = (selector, text) => `[...document.querySelectorAll(${JSON.stringify(selector)})].find((el) => el.textContent.trim() === ${JSON.stringify(text)})`
const type = async (selector, text) => {
  await b.evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); el.focus(); el.select?.() })()`)
  await b.send('Input.insertText', { text })
}
const dialog = `document.querySelector('.n-dialog')`
const toasts = () => b.evaluate(`[...document.querySelectorAll('[data-sonner-toast]')].map((el) => el.textContent.trim())`)

try {
  await b.setViewport(1920, 991)
  await b.send('Fetch.enable', { patterns: [{ urlPattern: `${core}/*` }] })
  b.listeners.push((m) => {
    if (m.method !== 'Fetch.requestPaused') return
    const { requestId, request } = m.params
    const fulfill = (body) => b.send('Fetch.fulfillRequest', { requestId, responseCode: 200, responseHeaders: cors, body: Buffer.from(JSON.stringify(body)).toString('base64') })
    const write = request.url.match(/\/recently(?:\/([a-f\d]{24}))?(?:\?|$)/)
    if (write && ['POST', 'PUT'].includes(request.method)) {
      const body = JSON.parse(request.postData)
      sent.push({ method: request.method, id: write[1] ?? null, body })
      const ref = body.ref === target.id ? { id: target.id, title: target.title, slug: target.slug } : null
      return fulfill({ id: write[1] ?? '000000000000000000000e2e', created: new Date().toISOString(), up: 0, down: 0, allowComment: true, ...body, ref, refType: ref ? 'Post' : null })
    }
    if (!['GET', 'OPTIONS', 'HEAD'].includes(request.method)) leaked.push(`${request.method} ${request.url}`)
    const headers = [...Object.entries(request.headers).map(([name, value]) => ({ name, value })), { name: 'x-api-key', value: token }]
    b.send('Fetch.continueRequest', { requestId, headers })
  })

  await b.goto(`${admin}/#/recently`, 5000)
  assert.equal(await b.evaluate('location.hash'), '#/recently', '用 API 令牌直接打开后台的思考页')
  assert.ok(await waitFor(`document.querySelector('[role=feed] article')`), '列表加载出来')

  // 新建：八种类型
  await click(`document.querySelector('[aria-label=新建思考]')`)
  assert.ok(await waitFor(`Boolean(${dialog})`), '打开编辑框')
  const types = await b.evaluate(`[...${dialog}.querySelectorAll('.n-radio-button')].map((el) => el.textContent.trim())`)
  assert.deepEqual(types, ['纯文字', '书', '影视', '音乐', 'GitHub', '网页', '论文', '题目'])

  // 纯文字什么都没写就保存：提示写看法，不发请求
  await click(byText('.n-dialog button', '保存'))
  await sleep(400)
  assert.ok((await toasts()).some((text) => text.includes('请写下看法')), '纯文字要写看法')
  assert.equal(sent.length, 0)

  // 选“书”：出现书的字段，缺必填项时提示第一项
  await click(byText('.n-dialog .n-radio-button', '书'))
  await sleep(200)
  const bookFields = await b.evaluate(`[...${dialog}.querySelectorAll('input[name]')].map((el) => el.name)`)
  assert.deepEqual(bookFields, ['url', 'title', 'author', 'cover', 'rating', 'isbn'])
  // 只有必填项带红星：书的链接、书名、作者；看法、封面、评分、ISBN、引用都不带
  const marked = await b.evaluate(`[...${dialog}.querySelectorAll('.n-form-item')].filter((item) => item.querySelector('.n-form-item-label__asterisk')).map((item) => item.querySelector('.n-form-item-label__text')?.textContent.trim())`)
  assert.deepEqual(marked, ['链接', '书名', '作者'])
  await click(byText('.n-dialog button', '保存'))
  await sleep(400)
  assert.ok((await toasts()).some((text) => text.includes('请填写链接')), '缺链接时提示')
  assert.equal(sent.length, 0)

  await type('.n-dialog textarea', '「课题分离」那一章看了两遍。')
  await type('.n-dialog input[name=url]', 'https://book.douban.com/subject/26369699/')
  await type('.n-dialog input[name=title]', '被讨厌的勇气')
  await type('.n-dialog input[name=author]', '岸见一郎 / 古贺史健')
  await type('.n-dialog input[name=rating]', '8.4')

  // 引用站内内容：输入关键词，搜到真实文章，选中
  await click(`${dialog}.querySelector('.n-base-selection')`)
  await sleep(200)
  await type('.n-dialog .n-base-selection-input', 'Zod')
  assert.ok(await waitFor(`[...document.querySelectorAll('.n-base-select-option')].some((el) => el.textContent.includes('文章｜Zod'))`), '搜到文章 Zod')
  await click(`[...document.querySelectorAll('.n-base-select-option')].find((el) => el.textContent.includes('文章｜Zod'))`)
  await sleep(300)
  await shot('create-book')

  await click(byText('.n-dialog button', '保存'))
  assert.ok(await waitFor(`!document.querySelector('.n-dialog')`), '保存后关闭编辑框')
  assert.deepEqual(sent.at(-1), {
    method: 'POST',
    id: null,
    body: { type: 'book', content: '「课题分离」那一章看了两遍。', ref: target.id, metadata: { url: 'https://book.douban.com/subject/26369699/', title: '被讨厌的勇气', author: '岸见一郎 / 古贺史健', rating: 8.4 } },
  }, '发出书的卡片信息和引用的文章 id')

  // 列表里新的一条显示卡片摘要和引用（引用链到后台文章编辑页）
  const created = await b.evaluate(`(() => {
    const article = document.querySelector('[role=feed] article')
    const internal = article.querySelector('a[href*="/posts/edit"]')
    return { text: article.innerText, internal: internal?.getAttribute('href') }
  })()`)
  assert.match(created.text, /书｜《被讨厌的勇气》 · 岸见一郎 \/ 古贺史健/)
  assert.match(created.text, /文章\s*Zod/)
  assert.equal(created.internal, `#/posts/edit?id=${target.id}`)
  await shot('list')

  // GitHub：粘贴链接后自动填所有者和仓库
  await click(`document.querySelector('[aria-label=新建思考]')`)
  assert.ok(await waitFor(`Boolean(${dialog})`))
  await click(byText('.n-dialog .n-radio-button', 'GitHub'))
  await sleep(200)
  await type('.n-dialog input[name=url]', 'https://github.com/mx-space/core')
  await b.evaluate(`document.querySelector('.n-dialog input[name=url]').blur()`)
  await sleep(300)
  const filled = await b.evaluate(`({ owner: document.querySelector('.n-dialog input[name=owner]').value, repo: document.querySelector('.n-dialog input[name=repo]').value })`)
  assert.deepEqual(filled, { owner: 'mx-space', repo: 'core' })
  await type('.n-dialog input[name=stars]', '1.5')
  await click(byText('.n-dialog button', '保存'))
  await sleep(400)
  assert.ok((await toasts()).some((text) => text.includes('星标要是不小于 0 的整数')), '星标格式不对时提示')
  await shot('create-github')
  await click(byText('.n-dialog button', '取消'))
  await sleep(300)

  // 编辑刚才那条：表单带回原来的内容，清掉引用、改成纯文字后发 ref: null，没有卡片信息
  const before = sent.length
  await click(`document.querySelector('[role=feed] article [aria-label=编辑此条目]')`)
  assert.ok(await waitFor(`Boolean(${dialog})`))
  const prefilled = await b.evaluate(`({ title: document.querySelector('.n-dialog input[name=title]')?.value, checked: ${dialog}.querySelector('.n-radio-button--checked')?.textContent.trim(), ref: ${dialog}.querySelector('.n-base-selection')?.textContent })`)
  assert.equal(prefilled.title, '被讨厌的勇气')
  assert.equal(prefilled.checked, '书')
  assert.match(prefilled.ref, /文章｜Zod/)
  // 清空按钮要鼠标移上去才出现，用真实鼠标点
  const box = await b.evaluate(`(() => { const r = ${dialog}.querySelector('.n-base-selection').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } })()`)
  await b.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: box.x, y: box.y })
  await sleep(250)
  const clear = await b.evaluate(`(() => { const r = ${dialog}.querySelector('.n-base-clear__clear').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } })()`)
  await b.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: clear.x, y: clear.y })
  await sleep(100)
  for (const kind of ['mousePressed', 'mouseReleased']) await b.send('Input.dispatchMouseEvent', { type: kind, x: clear.x, y: clear.y, button: 'left', clickCount: 1 })
  await sleep(200)
  assert.doesNotMatch(await b.evaluate(`${dialog}.querySelector('.n-base-selection').textContent`), /Zod/, '引用已清空')
  await click(byText('.n-dialog .n-radio-button', '纯文字'))
  await sleep(200)
  await click(byText('.n-dialog button', '保存'))
  assert.ok(await waitFor(`!document.querySelector('.n-dialog')`))
  assert.equal(sent.length, before + 1)
  assert.deepEqual(sent.at(-1), { method: 'PUT', id: '000000000000000000000e2e', body: { type: 'text', content: '「课题分离」那一章看了两遍。', ref: null } })

  assert.deepEqual(leaked, [], '除了拦下的新建和修改，不应有别的写请求')
  console.log('admin-thinking: 通过')
} finally {
  await b.close()
}
