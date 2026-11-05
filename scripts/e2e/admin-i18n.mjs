// 后台“AI i18n”（接口约定见 docs/site-text-translation-plan.md）：
// ① 设置 → AI 的“AI i18n”一组：开关、i18n 语言列表（从右往左写的语言、中文被拒），保存发 PATCH /options/ai；
// ② AI → i18n 页：分组与每种语言的标签、改一条发 PUT、422 显示原因并回到原值、清空发 DELETE、
//    生成翻译发 POST 再每 3 秒查状态直到跑完、没开时顶部提示去设置；③ “附加功能 → Yozora 主题”已删。
// /ai/i18n/* 和保存设置都在浏览器里拦截返回约定格式的假数据，不写库。用后台本地 API 令牌（.local/publish.json）代替登录。
// 需先开 pnpm dev（后台 9528、Core 2333）。用法：node scripts/e2e/admin-i18n.mjs（ADMIN_URL 可改后台地址）
import assert from 'node:assert/strict'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { openBrowser, sleep } from '../headless-browser.mjs'

const admin = process.env.ADMIN_URL ?? 'http://127.0.0.1:9528'
const core = 'http://127.0.0.1:2333'
const token = JSON.parse(readFileSync(new URL('../../.local/publish.json', import.meta.url), 'utf8')).local.token
const shots = new URL('../../.local/previews/admin-i18n/', import.meta.url)
mkdirSync(shots, { recursive: true })
const cors = [
  { name: 'Access-Control-Allow-Origin', value: new URL(admin).origin },
  { name: 'Access-Control-Allow-Credentials', value: 'true' },
  { name: 'Content-Type', value: 'application/json' },
]

// 真实设置里的 ai 换成固定的起点：AI i18n 关着、语言只有 en
const options = await (await fetch(`${core}/options`, { headers: { 'x-api-key': token } })).json()
const optionsBody = options.data ?? options
optionsBody.ai = { ...optionsBody.ai, enable_i18n: false, i18n_languages: ['en'] }
delete optionsBody.ai.enableI18n
delete optionsBody.ai.i18nLanguages

const fake = {
  status: { running: false, enabled: true, languages: ['en', 'ja', 'ko'] },
  groups: [
    { group: 'header', total: 3, languages: { en: { done: 3, missing: 0, review: 0 }, ja: { done: 1, missing: 2, review: 0 }, ko: { done: 2, missing: 0, review: 1 } } },
    { group: 'site', total: 1, languages: { en: { done: 1, missing: 0, review: 0 }, ja: { done: 1, missing: 0, review: 0 }, ko: { done: 1, missing: 0, review: 0 } } },
    { group: 'brandNew', total: 1, languages: { en: { done: 0, missing: 1, review: 0 } } },
  ],
  entries: [
    { keyPath: 'ui.text', lookupKey: 'header.title', key: 'header.title', source: '夜空', translations: { en: { text: 'Night sky', manual: false, needsReview: false }, ja: null, ko: { text: '밤하늘', manual: false, needsReview: false } } },
    { keyPath: 'ui.text', lookupKey: 'header.greeting', key: 'header.greeting', source: '你好，{name}', translations: { en: { text: 'Hello, {name}', manual: true, needsReview: false }, ja: null, ko: { text: '안녕, {name}', manual: false, needsReview: true } } },
    { keyPath: 'ui.text', lookupKey: 'header.menu', key: 'header.menu', source: '菜单', translations: { en: { text: 'Menu', manual: false, needsReview: false }, ja: { text: 'メニュー', manual: false, needsReview: false }, ko: { text: '메뉴', manual: false, needsReview: false } } },
  ],
}
const seen = { puts: [], deletes: [], generates: [], patches: [], status: [], groups: 0, entries: 0 }
const leaked = []
let generateRuns = 0 // 生成后第几次查状态：第一次还在跑，第二次跑完

const b = await openBrowser({ port: 9347 })
const shoot = async (name) => {
  const { data } = await b.send('Page.captureScreenshot', { format: 'png' }).then((m) => m.result)
  writeFileSync(new URL(name, shots), Buffer.from(data, 'base64'))
}
const leaf = (text) => `[...document.querySelectorAll('body *')].find((el) => el.children.length === 0 && el.textContent.trim() === ${JSON.stringify(text)})`
const toasts = () => b.evaluate(`[...document.querySelectorAll('[data-sonner-toast]')].map((el) => el.textContent.trim())`)
const press = async (key) => {
  const code = { Enter: 13, Escape: 27 }[key]
  for (const type of ['keyDown', 'keyUp']) await b.send('Input.dispatchKeyEvent', { type, key, code: key, windowsVirtualKeyCode: code, ...(key === 'Enter' && type === 'keyDown' ? { text: '\r' } : {}) })
}
// 同一页面里换地址（hash）不会触发 load 事件，不能用 b.goto
const visit = async (hash, wait = 3000) => { await b.evaluate(`location.hash = ${JSON.stringify(hash)}`); await sleep(wait) }
const reload = async (wait = 3000) => {
  const loaded = new Promise((r) => b.listeners.push((m) => m.method === 'Page.loadEventFired' && r()))
  await b.send('Page.reload')
  await loaded
  await sleep(wait)
}
const until = async (check, ms = 4000) => {
  for (let i = 0; i < ms / 100; i++) { const v = await check(); if (v) return v; await sleep(100) }
  return check()
}

try {
  await b.setViewport(1440, 900)
  await b.send('Fetch.enable', { patterns: [{ urlPattern: `${core}/*` }] })
  b.listeners.push((m) => {
    if (m.method !== 'Fetch.requestPaused') return
    const { requestId, request } = m.params
    const { pathname, searchParams } = new URL(request.url)
    const fulfill = (body, responseCode = 200) => b.send('Fetch.fulfillRequest', { requestId, responseCode, responseHeaders: cors, body: Buffer.from(JSON.stringify(body)).toString('base64') })
    if (request.method === 'GET' && pathname === '/options') return fulfill(optionsBody)
    if (request.method === 'PATCH' && pathname === '/options/ai') { seen.patches.push(JSON.parse(request.postData)); return fulfill({}) }
    if (pathname.startsWith('/ai/i18n')) {
      if (request.method === 'OPTIONS') return b.send('Fetch.fulfillRequest', { requestId, responseCode: 204, responseHeaders: [...cors, { name: 'Access-Control-Allow-Methods', value: 'GET,PUT,POST,DELETE' }, { name: 'Access-Control-Allow-Headers', value: 'content-type,x-uuid' }] })
      if (pathname === '/ai/i18n/status') {
        seen.status.push(Date.now())
        // 慢的那次：1.5 秒后才回来，说还在生成
        if (fake.slowRunning) return void setTimeout(() => fulfill({ ...fake.status, running: true }), 1500)
        if (seen.generates.length && generateRuns++ === 0) return fulfill({ ...fake.status, running: true })
        return fulfill(seen.generates.length ? { ...fake.status, lastRun: { at: new Date().toISOString(), created: 5, failed: 0, skipped: 1 } } : fake.status)
      }
      if (pathname === '/ai/i18n/groups') { seen.groups++; return fulfill(fake.groups) }
      if (pathname === '/ai/i18n/entries' && request.method === 'GET') seen.entries++
      if (pathname === '/ai/i18n/entries' && request.method === 'GET') return fulfill(searchParams.get('group') === 'header' ? fake.entries : [])
      if (pathname === '/ai/i18n/entries' && request.method === 'PUT') {
        const body = JSON.parse(request.postData)
        seen.puts.push(body)
        if (body.text.includes('{name}') === false && body.lookupKey === 'header.greeting') return fulfill({ ok: 0, code: 422, message: '占位符对不上：译文里少了 {name}' }, 422)
        return fulfill({})
      }
      if (pathname === '/ai/i18n/entries' && request.method === 'DELETE') { seen.deletes.push(JSON.parse(request.postData)); return fulfill({}) }
      if (pathname === '/ai/i18n/generate') { seen.generates.push(JSON.parse(request.postData)); return fulfill({ started: true }) }
    }
    if (!['GET', 'OPTIONS', 'HEAD'].includes(request.method)) leaked.push(`${request.method} ${request.url}`)
    b.send('Fetch.continueRequest', { requestId, headers: [...Object.entries(request.headers).map(([name, value]) => ({ name, value })), { name: 'x-api-key', value: token }] })
  })

  // ── ① 设置 → AI ──
  await b.goto(`${admin}/#/setting?group=ai`, 5000)
  const row = (title) => `${leaf(title)}.parentElement.parentElement`
  const section = await b.evaluate(`(() => {
    const row = ${row('i18n 语言')}
    return { hasSwitch: !!${row('启用 AI i18n')}.querySelector('.n-switch'), description: row.textContent, tags: [...row.lastElementChild.querySelectorAll('.flex-wrap > span')].map((el) => el.textContent.trim()), disabled: row.querySelector('input').disabled }
  })()`)
  assert.ok(section.hasSwitch, '设置里有“启用 AI i18n”开关')
  assert.match(section.description, /中文 \+ 这份列表/, '说明写清前台语言菜单就是“中文 + 这份列表”')
  assert.match(section.description, /正文的自动翻译也会覆盖/, '说明写清正文自动翻译也覆盖这些语言')
  assert.deepEqual(section.tags, ['EN'], '语言列表显示已有的 en')
  assert.ok(section.disabled, '开关关着时语言列表不能改')

  await b.evaluate(`${row('启用 AI i18n')}.querySelector('.n-switch').click()`)
  await sleep(300)
  const addLanguage = async (code) => {
    await b.evaluate(`(() => { const input = ${row('i18n 语言')}.querySelector('input'); input.focus(); input.select() })()`)
    await b.send('Input.insertText', { text: code })
    await press('Enter')
    await sleep(300)
  }
  await addLanguage('ar')
  assert.ok((await toasts()).some((text) => text.includes('从右往左写的语言暂不支持')), '输入 ar 提示从右往左写的语言暂不支持')
  await addLanguage('zh')
  assert.ok((await toasts()).some((text) => text.includes('中文是原文')), '输入 zh 提示中文一直都有')
  await addLanguage('ko')
  const tags = await b.evaluate(`[...${row('i18n 语言')}.lastElementChild.querySelectorAll('.flex-wrap > span')].map((el) => el.textContent.trim())`)
  assert.deepEqual(tags, ['EN', 'KO'], `ar、zh 没加进去，ko 加进去了：${tags}`)
  await b.evaluate(`${row('i18n 语言')}.scrollIntoView({ block: 'center' })`)
  await shoot('setting-ai-i18n.png')
  await b.evaluate(`[...document.querySelectorAll('button')].find((el) => el.textContent.trim() === '保存全部').click()`)
  await until(() => seen.patches.length)
  assert.deepEqual(seen.patches, [{ enableI18n: true, i18nLanguages: ['en', 'ko'] }], `保存只发改过的两项：${JSON.stringify(seen.patches)}`)

  // ── ③ Yozora 主题菜单已删，AI 菜单里 i18n 在“翻译”和“翻译词表”之间 ──
  await visit('#/ai/i18n', 3000)
  const menu = await b.evaluate(`(() => {
    const find = (text) => [...document.querySelectorAll('body *')].find((el) => el.children.length === 0 && el.textContent.trim() === text)
    const [translation, i18n, entries] = ['翻译', 'i18n', '翻译词表'].map(find)
    const before = (a, z) => Boolean(a && z && a.compareDocumentPosition(z) & Node.DOCUMENT_POSITION_FOLLOWING)
    return { order: before(translation, i18n) && before(i18n, entries), yozora: !!${leaf('Yozora 主题')} }
  })()`)
  assert.deepEqual(menu, { order: true, yozora: false }, 'AI 菜单为 翻译 → i18n → 翻译词表，没有“Yozora 主题”')

  // ── ② i18n 页：分组和标签 ──
  const groups = await b.evaluate(`[...document.querySelectorAll('[data-group]')].map((el) => ({ group: el.dataset.group, text: el.textContent, tags: [...el.querySelectorAll('[data-lang]')].map((tag) => [tag.dataset.lang, tag.dataset.state, tag.textContent.trim()]) }))`)
  assert.deepEqual(groups.map((g) => g.group), ['header', 'site', 'brandNew'])
  assert.match(groups[0].text, /页头/, 'header 显示中文名“页头”')
  assert.match(groups[0].text, /3 条/)
  assert.match(groups[1].text, /站点文案/)
  assert.match(groups[2].text, /brandNew/, '不认识的分组显示原名')
  assert.deepEqual(groups[0].tags, [['en', 'done', 'EN'], ['ja', 'missing', 'JA 缺 2'], ['ko', 'review', 'KO 复核 1']], '缺译文、待复核的语言换颜色并显示数量')
  assert.deepEqual(groups[2].tags.map((t) => t[0]), ['en', 'ja', 'ko'], '每组都列出全部 i18n 语言，Core 没算到的当作缺')
  assert.equal(await b.evaluate(`!!document.querySelector('[role=status]')`), false, '开着且有语言时没有顶部提示')

  await b.evaluate(`document.querySelector('[data-group=header]').click()`)
  await until(() => b.evaluate(`document.querySelectorAll('tr[data-entry]').length === 3`))
  assert.equal(await b.evaluate('location.hash'), '#/ai/i18n?group=header', '选中的分组记在地址里')
  const table = await b.evaluate(`({
    head: [...document.querySelectorAll('thead th')].map((el) => el.textContent.trim()),
    greeting: [...document.querySelector('tr[data-entry="header.greeting"]').querySelectorAll('td')].map((el) => el.querySelector('textarea')?.value ?? el.textContent.trim()),
    marks: document.querySelector('tr[data-entry="header.greeting"]').textContent,
    missing: document.querySelector('tr[data-entry="header.title"] [data-cell=ja] textarea').placeholder,
  })`)
  assert.deepEqual(table.head, ['条目', '中文', 'EN', 'JA', 'KO'])
  assert.deepEqual(table.greeting, ['header.greeting', '你好，{name}', 'Hello, {name}', '', '안녕, {name}'])
  assert.match(table.marks, /已手改/, '手改过的标“已手改”')
  assert.match(table.marks, /待复核/, 'needsReview 的标“待复核”')
  assert.equal(table.missing, '缺译文')
  await shoot('i18n-page.png')

  // 改一条：回车保存，发约定的 PUT，之后标“已手改”、刷新分组
  const groupsBefore = seen.groups
  const edit = async (key, lang, text) => {
    await b.evaluate(`(() => { const el = document.querySelector('tr[data-entry="${key}"] [data-cell=${lang}] textarea'); el.focus(); el.select() })()`)
    await b.send('Input.insertText', { text })
    await press('Enter')
  }
  await edit('header.title', 'ja', '夜空')
  await until(() => seen.puts.length === 1)
  assert.deepEqual(seen.puts[0], { keyPath: 'ui.text', lookupKey: 'header.title', lang: 'ja', text: '夜空' })
  await until(() => b.evaluate(`document.querySelector('tr[data-entry="header.title"] [data-cell=ja]').textContent.includes('已手改')`))
  assert.ok(seen.groups > groupsBefore, '保存后重新读分组统计')

  // 422：显示 Core 给的原因，输入框回到原值
  await edit('header.greeting', 'en', 'Hello')
  await until(() => b.evaluate(`!!document.querySelector('tr[data-entry="header.greeting"] [data-cell=en] [role=alert]')`))
  const rejected = await b.evaluate(`(() => { const cell = document.querySelector('tr[data-entry="header.greeting"] [data-cell=en]'); return { reason: cell.querySelector('[role=alert]').textContent, value: cell.querySelector('textarea').value } })()`)
  assert.deepEqual(seen.puts[1], { keyPath: 'ui.text', lookupKey: 'header.greeting', lang: 'en', text: 'Hello' })
  assert.match(rejected.reason, /占位符对不上/, '422 显示原因')
  assert.equal(rejected.value, 'Hello, {name}', '422 后回到原值')
  await shoot('i18n-422.png')

  // 没改就失焦不发请求
  await b.evaluate(`(() => { const el = document.querySelector('tr[data-entry="header.menu"] [data-cell=en] textarea'); el.focus(); el.blur() })()`)
  await sleep(300)
  assert.equal(seen.puts.length, 2, '没改不发 PUT')

  // 正在输入、还没保存时列表刷新（比如生成跑完自动刷新，这条带来了新的 AI 译文）：输入框里的字不能被冲掉，失焦后照常保存
  await b.evaluate(`(() => { const el = document.querySelector('tr[data-entry="header.title"] [data-cell=ja] textarea'); el.focus(); el.select() })()`)
  await b.send('Input.insertText', { text: '夜の空' })
  fake.entries[0].translations.ja = { text: '夜空（AI）', manual: false, needsReview: false }
  const entriesBefore = seen.entries
  // 用脚本点“刷新”：.click() 不会让输入框失焦，和自动刷新一样
  await b.evaluate(`document.querySelector('button[aria-label="刷新"]').click()`)
  await until(() => seen.entries > entriesBefore)
  await sleep(400)
  assert.equal(await b.evaluate(`document.querySelector('tr[data-entry="header.title"] [data-cell=ja] textarea').value`), '夜の空', '刷新不冲掉正在输入的译文')
  await b.evaluate(`document.activeElement.blur()`)
  await until(() => seen.puts.length === 3)
  assert.deepEqual(seen.puts[2], { keyPath: 'ui.text', lookupKey: 'header.title', lang: 'ja', text: '夜の空' }, '失焦后保存输入的译文')

  // 清空一条：确认后发 DELETE，输入框变空
  await b.evaluate(`document.querySelector('tr[data-entry="header.menu"] [data-cell=ko] button[aria-label="清空这条译文"]').click()`)
  await sleep(300)
  await b.evaluate(`[...document.querySelectorAll('.n-popconfirm button')].find((el) => el.textContent.trim() === '确认').click()`)
  await until(() => seen.deletes.length)
  assert.deepEqual(seen.deletes, [{ keyPath: 'ui.text', lookupKey: 'header.menu', lang: 'ko' }])
  await until(() => b.evaluate(`document.querySelector('tr[data-entry="header.menu"] [data-cell=ko] textarea').value === ''`))

  // 生成翻译：只翻缺的、只翻 en → POST，之后每 3 秒查状态，跑完刷新分组
  await b.evaluate(`document.querySelector('button[aria-label="生成翻译"]').click()`)
  await sleep(400)
  // 一次点一个：同一刻连点两个复选框，第二下会拿到还没更新的选中值
  for (const label of ['只翻缺的', 'JA', 'KO']) {
    await b.evaluate(`[...document.querySelectorAll('.n-dialog .n-checkbox')].find((el) => el.textContent.trim().startsWith(${JSON.stringify(label)})).click()`)
    await sleep(150)
  }
  await shoot('i18n-generate.png')
  const groupsBeforeRun = seen.groups
  await b.evaluate(`[...document.querySelectorAll('.n-dialog button')].find((el) => el.textContent.trim() === '开始生成').click()`)
  await until(() => seen.generates.length)
  assert.deepEqual(seen.generates, [{ langs: ['en'], onlyMissing: true }])
  const statusBefore = seen.status.length
  await until(() => seen.status.length === statusBefore + 1, 4000)
  assert.equal(await b.evaluate(`!!document.querySelector('button[aria-label="正在生成翻译"]')`), true, '跑着时按钮显示正在生成')
  await until(() => seen.status.length === statusBefore + 2, 4500)
  const gap = seen.status.at(-1) - seen.status.at(-2)
  assert.ok(gap >= 2900 && gap < 3600, `每 3 秒查一次状态，实际 ${gap}ms`)
  await until(() => seen.groups > groupsBeforeRun)
  assert.ok((await toasts()).some((text) => text.includes('生成完成：新增 5')), '跑完提示结果')
  await sleep(3500)
  assert.equal(seen.status.length, statusBefore + 2, '不再 running 后停止查询')
  assert.equal(await b.evaluate(`!!document.querySelector('button[aria-label="生成翻译"]:not([disabled])')`), true, '跑完按钮恢复')

  // 没开 AI i18n：顶部提示去设置里打开，生成按钮不能点
  fake.status = { running: false, enabled: false, languages: [] }
  seen.generates.length = 0
  await visit('#/ai/i18n', 500)
  await reload()
  const notice = await b.evaluate(`(() => { const el = document.querySelector('[role=status]'); return el && { text: el.textContent, href: el.querySelector('a').getAttribute('href') } })()`)
  assert.match(notice?.text ?? '', /还没有开 AI i18n/)
  assert.match(notice.href, /setting\?group=ai/, '提示链到设置 → AI')
  assert.equal(await b.evaluate(`document.querySelector('button[aria-label="生成翻译"]').disabled`), true, '没开时不能生成')
  await shoot('i18n-disabled.png')

  // 离开页面时还有一次状态请求在路上：它回来说“还在生成”，也不能在已经离开的页面上接着每 3 秒查
  await visit('#/setting?group=ai', 1500)
  fake.status = { running: false, enabled: true, languages: ['en'] }
  fake.slowRunning = true
  const statusOnEnter = seen.status.length
  await visit('#/ai/i18n', 400)
  await visit('#/setting?group=ai', 0)
  await sleep(5500)
  fake.slowRunning = false
  assert.equal(seen.status.length - statusOnEnter, 1, `离开 i18n 页以后不再查状态（查了 ${seen.status.length - statusOnEnter} 次）`)

  assert.deepEqual(leaked, [], '没有别的写请求')
  const pageErrors = b.errors.filter(Boolean)
  assert.deepEqual(pageErrors, [], `页面没有报错：${pageErrors}`)
  console.log('admin-i18n: 通过')
} finally {
  await b.close()
}
