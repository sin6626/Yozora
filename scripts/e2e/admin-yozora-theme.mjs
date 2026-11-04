// 后台“附加功能 → Yozora 主题”：表单读的是 Core 的 theme/yozora 片段，改一项点保存，发出去的片段只改了那一项、
// 技术栈的行和作品译文原样保留。保存请求在浏览器里拦截，不写日常库。用后台本地 API 令牌（.local/publish.json）代替登录。
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

const b = await openBrowser({ port: 9343 })
const saved = []
const leaked = []
try {
  await b.setViewport(1440, 900)
  await b.send('Fetch.enable', { patterns: [{ urlPattern: `${core}/*` }] })
  b.listeners.push((m) => {
    if (m.method !== 'Fetch.requestPaused') return
    const { requestId, request } = m.params
    if (request.method === 'PUT' && request.url.endsWith(`/snippets/${snippet.id}`)) {
      saved.push(JSON.parse(request.postData))
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

  assert.equal(saved.length, 1, '点保存发出一次 PUT')
  const after = JSON.parse(saved[0].raw)
  assert.equal(after.footer.motto, motto, '改的那一项写进片段')
  assert.deepEqual(after.techStack.rows, before.techStack.rows, '技术栈的行原样保留')
  assert.deepEqual(after.i18n.en.projects, before.i18n.en.projects, '作品译文原样保留')
  assert.deepEqual({ ...after, footer: { ...after.footer, motto: before.footer.motto } }, before, '除了改的那一项，片段一字不变')
  assert.equal(saved[0].name, 'yozora')
  assert.deepEqual(leaked, [], '没有别的写请求')
  console.log('admin-yozora-theme: 通过')
} finally {
  b.close()
}
