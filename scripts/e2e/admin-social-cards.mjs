// 后台“设置 → 用户 → 社交链接”里的名片平台（微信、QQ）：选 QQ 后这一行变成“号码 + 二维码”，号码框里 ⌘V 粘贴图片会传到图床并显示缩略图，
// 保存时提交 { id, qr }。用本地 API 令牌（.local/publish.json）代替登录，上传和保存都在浏览器里拦截替换，不写日常库、不传图床。
// 需先开 pnpm dev（后台 9528、Core 2333）。用法：node scripts/e2e/admin-social-cards.mjs（ADMIN_URL 可改后台地址）
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { openBrowser, sleep } from '../headless-browser.mjs'

const admin = process.env.ADMIN_URL ?? 'http://127.0.0.1:9528'
const core = 'http://127.0.0.1:2333'
const token = JSON.parse(readFileSync(new URL('../../.local/publish.json', import.meta.url), 'utf8')).local.token
const fakeQr = `${core}/objects/avatar/Sin.jpg`
const cors = [
  { name: 'Access-Control-Allow-Origin', value: new URL(admin).origin },
  { name: 'Access-Control-Allow-Credentials', value: 'true' },
  { name: 'Content-Type', value: 'application/json' },
]

const b = await openBrowser({ port: 9356 })
const patched = []
const leaked = []
try {
  await b.setViewport(1920, 991)
  await b.send('Fetch.enable', { patterns: [{ urlPattern: `${core}/*` }] })
  b.listeners.push((m) => {
    if (m.method !== 'Fetch.requestPaused') return
    const { requestId, request } = m.params
    const fulfill = (body) => b.send('Fetch.fulfillRequest', { requestId, responseCode: 200, responseHeaders: cors, body: Buffer.from(JSON.stringify(body)).toString('base64') })
    if (request.method === 'POST' && request.url.includes('/files/upload')) return fulfill({ url: fakeQr, name: 'qr.png' })
    if (request.method === 'PATCH' && request.url.endsWith('/owner')) {
      patched.push(JSON.parse(request.postData))
      return fulfill({})
    }
    if (!['GET', 'OPTIONS', 'HEAD'].includes(request.method)) leaked.push(`${request.method} ${request.url}`)
    b.send('Fetch.continueRequest', { requestId, headers: [...Object.entries(request.headers).map(([name, value]) => ({ name, value })), { name: 'x-api-key', value: token }] })
  })

  await b.goto(`${admin}/#/setting?group=user`, 6000)
  const rows = `[...document.querySelectorAll('.divide-y > .flex')]`
  // 真实资料里已经有 QQ 时先在页面上删掉那一行（保存请求被拦截，不会真的删），保证下面能重新选 QQ
  await b.evaluate(`(() => { const row = ${rows}.find((el) => el.querySelector('.n-base-selection')?.textContent.trim() === 'QQ'); row?.querySelector(':scope > button')?.click() })()`)
  await sleep(300)
  const before = await b.evaluate(`${rows}.length`)
  // 添加一行，平台换成 QQ（下拉可输入筛选）
  await b.evaluate(`[...document.querySelectorAll('button')].find((el) => el.textContent.trim() === '添加').click()`)
  await sleep(300)
  assert.equal(await b.evaluate(`${rows}.length`), before + 1, '添加了一行')
  const select = await b.evaluate(`(() => { const el = ${rows}.at(-1).querySelector('.n-base-selection'); el.scrollIntoView({ block: 'center' }); const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } })()`)
  await b.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: select.x, y: select.y })
  for (const type of ['mousePressed', 'mouseReleased']) await b.send('Input.dispatchMouseEvent', { type, x: select.x, y: select.y, button: 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: 1 })
  await sleep(300)
  await b.send('Input.insertText', { text: 'QQ' })
  await sleep(300)
  for (const type of ['keyDown', 'keyUp']) await b.send('Input.dispatchKeyEvent', { type, key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' })
  await sleep(400)

  const row = `${rows}.at(-1)`
  assert.match(await b.evaluate(`${row}.querySelector('.n-input input').placeholder`), /QQ 号.*粘贴二维码/, '换成 QQ 后是号码框，提示可以粘贴二维码')
  assert.equal(await b.evaluate(`[...${row}.querySelectorAll('button')].some((el) => el.textContent.includes('上传二维码'))`), true)

  // 号码框里 ⌘V 粘贴二维码 → 上传 → 显示缩略图；再填号码
  await b.evaluate(`(async () => {
    const canvas = Object.assign(document.createElement('canvas'), { width: 200, height: 200 })
    canvas.getContext('2d').fillRect(0, 0, 200, 200)
    const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'))
    const data = new DataTransfer()
    data.items.add(new File([blob], 'qr.png', { type: 'image/png' }))
    const input = ${row}.querySelector('.n-input input')
    input.focus()
    input.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }))
  })()`)
  await sleep(800)
  assert.equal(await b.evaluate(`${row}.querySelector('img[alt="二维码"]')?.getAttribute('src')`), fakeQr, '粘贴后显示二维码缩略图')
  await b.evaluate(`${row}.querySelector('.n-input input').focus()`)
  await b.send('Input.insertText', { text: '3554989283' })
  await sleep(300)

  // 保存（页头右上角的对勾）：提交 { id, qr }
  await b.evaluate(`[...document.querySelectorAll('button')].find((el) => el.querySelector('svg.lucide-circle-check') && !el.disabled).click()`)
  await sleep(800)
  assert.equal(patched.length, 1, '保存时提交了一次')
  assert.deepEqual(patched[0].socialIds.qq, { id: '3554989283', qr: fakeQr }, '名片平台提交号码和二维码')
  assert.equal(typeof patched[0].socialIds.github, 'string', '其他平台仍是字符串')

  assert.deepEqual(leaked, [], '测试不应当有真正写入 Core 的请求')
  assert.deepEqual(b.errors, [], '页面不应当有报错')
  console.log('PASS 后台名片平台：选 QQ 变成号码 + 二维码、粘贴上传显示缩略图、保存提交 { id, qr }')
} finally {
  await b.close()
}
