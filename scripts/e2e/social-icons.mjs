// 社交图标悬停换成品牌色（2026-10-31 用户选定）：平时单色，鼠标移上去变成平台自己的颜色；
// 深色品牌（GitHub 等）熄灯时是品牌色圆底 + 白色图标，开灯时直接用品牌色。在 /debug 的“社交图标”里用真实首屏组件和导航面板样式测。
// 首屏与导航“首页”面板的图标悬停时在上方显示平台名称（2026-11-01，Base UI Tooltip），不再用浏览器自带的 title，所以按 aria-label 找图标。
// 需先开 pnpm dev。用法：node scripts/e2e/social-icons.mjs（WEB_URL 可改地址）
import assert from 'node:assert/strict'
import { openBrowser, sleep } from '../headless-browser.mjs'

const base = process.env.WEB_URL ?? 'http://127.0.0.1:2323'
const b = await openBrowser({ port: 9354 })
const hover = async (selector) => {
  const box = await b.evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); el.scrollIntoView({ block: 'center' }); const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } })()`)
  await b.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: box.x, y: box.y })
  await sleep(450)
  return b.evaluate(`(() => { const s = getComputedStyle(document.querySelector(${JSON.stringify(selector)})); return { color: s.color, background: s.backgroundColor } })()`)
}
const away = () => b.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 2, y: 2 })
const hero = (label) => `#debug-socials .home-hero-socials:not(.debug-social-brand) a[aria-label="${label}"]`
const cardButton = (label) => `#debug-social-cards button[aria-label^="${label}："]`
const tips = () => b.evaluate(`[...document.querySelectorAll('.social-tooltip')].filter((e) => !e.hasAttribute('data-ending-style')).map((e) => e.textContent)`)

try {
  await b.setViewport(1440, 900)
  await b.goto(`${base}/debug`)
  const idle = await b.evaluate(`getComputedStyle(document.querySelector(${JSON.stringify(hero('哔哩哔哩'))})).color`)
  assert.notEqual(idle, 'rgb(0, 161, 214)', '平时是单色')
  assert.equal((await hover(hero('哔哩哔哩'))).color, 'rgb(0, 161, 214)', '悬停哔哩哔哩变成 B 站蓝')
  await away()
  assert.deepEqual(await hover(hero('GitHub')), { color: 'rgb(255, 255, 255)', background: 'rgb(24, 23, 23)' }, '熄灯时 GitHub 悬停是黑色圆底 + 白色图标')
  // 悬停提示：停一下出现平台名称，提示在图标正上方；挪到相邻图标立即换成它的名称；首屏图标没有 title（免得浏览器再冒一个）
  assert.deepEqual(await tips(), ['GitHub'], '悬停 GitHub 显示名称')
  const above = await b.evaluate(`(() => { const t = document.querySelector('.social-tooltip').getBoundingClientRect(), i = document.querySelector(${JSON.stringify(hero('GitHub'))}).getBoundingClientRect(); return t.bottom <= i.top && Math.abs((t.left + t.right) / 2 - (i.left + i.right) / 2) < 2 })()`)
  assert.equal(above, true, '提示在图标正上方')
  const next = await b.evaluate(`(() => { const r = document.querySelector(${JSON.stringify(hero('哔哩哔哩'))}).getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } })()`)
  await b.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: next.x, y: next.y })
  await sleep(120)
  assert.deepEqual(await tips(), ['哔哩哔哩'], '挪到相邻图标立即换成它的名称')
  assert.equal(await b.evaluate(`document.querySelectorAll('#debug-socials .home-hero-socials:not(.debug-social-brand) [title]').length`), 0, '首屏图标不再有 title')
  await away()
  await sleep(300)
  assert.deepEqual(await tips(), [], '移开后提示收起')

  // 名片（微信、QQ）：在竖线后面；点 QQ 弹出卡片（二维码 + 号码 + 复制），点外面关闭；导航面板只有直达链接
  const cards = await b.evaluate(`(() => {
    const items = [...document.querySelectorAll('#debug-social-cards .home-hero-socials > li')]
    return items.map((li) => li.classList.contains('home-hero-socials-divider') ? '|' : li.querySelector('a, button').getAttribute('aria-label').split('：')[0])
  })()`)
  assert.deepEqual(cards, ['GitHub', '哔哩哔哩', '微博', '|', '微信', 'QQ', 'Discord', '赞赏'], '直达链接在前，竖线，名片在后')
  // 名片也有悬停提示；点开卡片时提示收起
  await hover(cardButton('QQ'))
  assert.deepEqual(await tips(), ['QQ'], '悬停 QQ 名片显示名称')
  const qqBox = await b.evaluate(`(() => { const r = document.querySelector(${JSON.stringify(cardButton('QQ'))}).getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } })()`)
  for (const type of ['mousePressed', 'mouseReleased']) await b.send('Input.dispatchMouseEvent', { type, x: qqBox.x, y: qqBox.y, button: 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: 1 })
  await sleep(500)
  assert.deepEqual(await tips(), [], '点开名片时提示收起')
  const card = await b.evaluate(`(() => { const c = document.querySelector('.contact-card'); return c && { title: c.querySelector('.contact-card-title').textContent, qr: !!c.querySelector('img.contact-card-qr'), id: c.querySelector('.contact-card-id span')?.textContent, copy: c.querySelector('.contact-card-id button')?.textContent } })()`)
  assert.deepEqual(card, { title: 'QQ', qr: true, id: '10001', copy: '复制' }, '点 QQ 弹出名片')
  await b.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 5, y: 5, button: 'left', buttons: 1, clickCount: 1 })
  await b.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 5, y: 5, button: 'left', buttons: 0, clickCount: 1 })
  await sleep(500)
  assert.equal(await b.evaluate(`document.querySelector('.contact-card')`), null, '点外面关闭')
  // 赞赏码：只有二维码，说明是“请我喝杯茶”；Discord：只有用户名和复制
  await b.evaluate(`document.querySelector(${JSON.stringify(cardButton('赞赏'))}).click()`)
  await sleep(500)
  assert.deepEqual(await b.evaluate(`(() => { const c = document.querySelector('.contact-card'); return { qr: !!c.querySelector('img.contact-card-qr'), id: !!c.querySelector('.contact-card-id'), hint: c.querySelector('.contact-card-hint')?.textContent } })()`), { qr: true, id: false, hint: '觉得有用的话，可以请我喝杯茶' })
  await b.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
  await sleep(400)
  await b.evaluate(`document.querySelector(${JSON.stringify(cardButton('Discord'))}).click()`)
  await sleep(500)
  assert.deepEqual(await b.evaluate(`(() => { const c = document.querySelector('.contact-card'); return { qr: !!c.querySelector('img.contact-card-qr'), id: c.querySelector('.contact-card-id span')?.textContent } })()`), { qr: false, id: 'sin6626' })
  await b.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
  await sleep(400)

  await b.evaluate(`document.documentElement.dataset.theme = 'light'`)
  await sleep(700)
  assert.equal((await hover(hero('GitHub'))).color, 'rgb(24, 23, 23)', '开灯时 GitHub 悬停直接用品牌色')

  // 真实导航的“首页”面板（用站长后台里的真实社交链接）：社交图标悬停同样换成品牌色；微信、QQ 名片在竖线后面，
  // 点开的卡片挂在导航弹层里——鼠标移到卡片上（在面板外面）面板也不收起，点别处卡片关闭
  await b.goto(`${base}/notes`)
  const trigger = await b.evaluate(`(() => { const t = [...document.querySelectorAll('.navigation-List .navigation-Trigger')].find((el) => el.textContent.trim().startsWith('首页')); const r = t.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } })()`)
  await b.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: trigger.x, y: trigger.y + 80 })
  await sleep(600)
  await b.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: trigger.x, y: trigger.y })
  await sleep(900)
  const navTitles = await b.evaluate(`[...document.querySelectorAll('.navigation-Popup .nav-socials a')].map((a) => a.getAttribute('aria-label'))`)
  assert.ok(navTitles.length > 0, '导航面板里有社交图标')
  assert.equal(await b.evaluate(`document.querySelectorAll('.navigation-Popup .nav-socials [title]').length`), 0, '导航面板图标不再有 title')
  const navIcon = `.navigation-Popup .nav-socials a[aria-label="${navTitles[0]}"]`
  const navBox = await b.evaluate(`(() => { const r = document.querySelector(${JSON.stringify(navIcon)}).getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } })()`)
  const navIdle = await b.evaluate(`getComputedStyle(document.querySelector(${JSON.stringify(navIcon)})).color`)
  await b.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: navBox.x, y: navBox.y })
  await sleep(450)
  const navHover = await b.evaluate(`getComputedStyle(document.querySelector(${JSON.stringify(navIcon)})).color`)
  assert.notEqual(navHover, navIdle, '导航面板里悬停换成品牌色')
  // 悬停提示挂在导航弹层里（不被面板盖住），面板不收起
  const navTip = await b.evaluate(`(() => { const t = [...document.querySelectorAll('.social-tooltip')].filter((e) => !e.hasAttribute('data-ending-style')); return { text: t.map((e) => e.textContent), inPopup: t.every((e) => !!e.closest('.navigation-Popup')), panel: !!document.querySelector('.navigation-Popup .nav-panel.is-home') } })()`)
  assert.deepEqual(navTip, { text: [navTitles[0]], inPopup: true, panel: true }, '导航面板图标悬停显示名称')

  const navOrder = await b.evaluate(`[...document.querySelectorAll('.navigation-Popup .nav-socials > li')].map((li) => li.classList.contains('nav-socials-divider') ? '|' : li.querySelector('a, button').getAttribute('aria-label').split('：')[0])`)
  assert.deepEqual(navOrder.slice(-3), ['|', '微信', 'QQ'], `导航面板里名片在竖线后面：${navOrder}`)
  const qq = await b.evaluate(`(() => { const r = document.querySelector('.navigation-Popup .nav-socials button[aria-label^="QQ："]').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } })()`)
  await b.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: qq.x, y: qq.y })
  for (const type of ['mousePressed', 'mouseReleased']) await b.send('Input.dispatchMouseEvent', { type, x: qq.x, y: qq.y, button: 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: 1 })
  await sleep(600)
  const navCard = await b.evaluate(`(() => { const c = document.querySelector('.navigation-Popup .contact-card'); if (!c) return null; const r = c.getBoundingClientRect(), p = document.querySelector('.navigation-Popup .nav-panel').getBoundingClientRect(); return { id: c.querySelector('.contact-card-id span')?.textContent, x: r.x + r.width / 2, y: r.y + r.height / 2, outside: r.bottom > p.bottom } })()`)
  assert.ok(navCard, 'QQ 名片弹出，并且挂在导航弹层里')
  assert.equal(navCard.id, '3554989283')
  // 鼠标从图标慢慢移到卡片中间（卡片超出面板下沿），面板和卡片都还在
  for (let step = 1; step <= 6; step++) await b.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: qq.x + ((navCard.x - qq.x) * step) / 6, y: qq.y + ((navCard.y - qq.y) * step) / 6 })
  await sleep(800)
  assert.deepEqual(await b.evaluate(`({ panel: !!document.querySelector('.navigation-Popup .nav-panel.is-home'), card: !!document.querySelector('.contact-card') })`), { panel: true, card: true }, `鼠标移到卡片上（卡片超出面板：${navCard.outside}）面板不收起`)
  await b.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
  await b.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
  await sleep(500)
  assert.equal(await b.evaluate(`!!document.querySelector('.contact-card')`), false, 'Esc 关闭名片')

  // 英文、日文首屏：图标名称（读屏文字和悬停提示）跟着站点语言，英文页面没有汉字；悬停微信显示 WeChat
  for (const [lang, bilibili] of [['en', 'Bilibili'], ['ja', 'ビリビリ動画']]) {
    await b.goto(`${base}/${lang}`, 5000)
    const names = await b.evaluate(`[...document.querySelectorAll('.home-hero .home-hero-socials :is(a, button)')].map((e) => e.getAttribute('aria-label').split(/[:：]/)[0])`)
    assert.ok(names.length > 0, `${lang} 首屏有社交图标`)
    if (lang === 'en') assert.deepEqual(names.filter((name) => /\p{Script=Han}/u.test(name)), [], `英文首屏图标名称没有汉字：${names}`)
    if (names.includes('哔哩哔哩') || names.includes(bilibili)) assert.ok(names.includes(bilibili), `${lang} 哔哩哔哩显示为 ${bilibili}：${names}`)
    if (lang === 'en' && names.includes('WeChat')) {
      const wechat = await b.evaluate(`(() => { const r = document.querySelector('.home-hero .home-hero-socials button[aria-label^="WeChat:"]').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } })()`)
      await b.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: wechat.x, y: wechat.y })
      await sleep(500)
      assert.deepEqual(await tips(), ['WeChat'], '英文首屏悬停微信显示 WeChat')
      await away()
    }
  }
  assert.deepEqual(b.errors, [], '页面不应当有报错')
  console.log('PASS 社交图标：平时单色、悬停换品牌色（首屏与导航面板），深色品牌熄灯时白色图标；首屏与导航面板悬停在上方显示平台名称（英文日文页面用英文日文名）、相邻图标立即切换、点开名片时收起；微信、QQ、Discord、赞赏码名片在竖线后、点开看二维码和号码')
} finally {
  await b.close()
}
