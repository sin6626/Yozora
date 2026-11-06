// 站长维护的站点内容（首屏标题与说明、页脚那句话、萌备、贡献星带账号、文章版权说明、首页技术栈）都在 Core 的配置片段 theme/yozora 里，
// 检查 lib/theme-config.ts 的 parseSiteContent：片段读不到或某项没写用占位；写成空（含整组写成 null）就不显示，旧值不会冒回来；
// 强调标记只去掉 **、不吃掉空格；外文页面用后台“AI i18n”翻好的译文（Core GET /ai/i18n/:lang 的 site：位置 → 中文和译文），
// 按位置找、中文要一致；没有译文、或译文的 ** 对不上的那一项显示中文并单独标 zh-CN。
// 用法：node scripts/verify-site-content.mjs（已并入 pnpm verify）
import assert from 'node:assert/strict'
import { loadI18n, runTs } from './lib/i18n-source.mjs'

const { parseSiteContent } = runTs('apps/web/lib/theme-config.ts', { './i18n/msg': loadI18n().msg })
const parse = (config, lang = 'zh', site = {}) => JSON.parse(JSON.stringify(parseSiteContent(config, lang, site)))
// 和首屏一样拼：每段去掉首尾空白放进 inline-block，首尾有空白的在块外补一个空格，浏览器再把连续空白合成一个
const visible = (title) => title.map((part) => `${/^\s/.test(part.text) ? ' ' : ''}${part.text.trim()}${/\s$/.test(part.text) ? ' ' : ''}`).join('').replace(/\s+/g, ' ').trim()

// 读不到 / 没写：占位
const fallback = parse(null)
assert.ok(fallback.hero.title.length && fallback.hero.description.length && fallback.footer.motto.text && fallback.footer.icp, '片段读不到时用占位')
assert.equal(fallback.techStack.rows.length, 2, '技术栈读不到时用默认两行')
assert.deepEqual(parse(null, 'en').techStack.title, { text: '技术栈', lang: 'zh-CN' }, '占位只有中文，外文页面标 zh-CN')
assert.deepEqual(parse(null, 'en', { 'techStack.title': { source: '技术栈', text: 'Tech stack' } }).techStack.title, { text: 'Tech stack' }, '占位有译文时也换上')
assert.deepEqual(parse({ unrelated: 1 }), fallback, '某项没写时用占位')
assert.equal(fallback.copyright, null, '版权说明默认不显示（许可要站长自己选）')

// 写了：用后台的
const config = {
  hero: { title: '一个在深夜写代码的**大三学生**', description: ['第一行', '  ', '第二行'] },
  footer: { motto: '后台写的那句话', icp: { label: '萌ICP备1号', href: 'https://icp.gov.moe/?keyword=1' } },
  accounts: { github: 'someone', leetcode: 'someone-lc' },
  copyright: '本文采用 CC BY-NC-SA 4.0 许可',
  techStack: { title: '我的工具', description: '', rows: [[{ name: 'Vue', icon: 'skill-icons:vuejs-dark', extra: 1 }, { name: ' ', icon: 'x' }, 'Go'], 'x', [{ name: 'Go', icon: 'skill-icons:golang' }]] },
}
const zh = parse(config)
assert.deepEqual(zh.hero.title.filter((part) => part.strong).map((part) => part.text), ['大三学生'], '**…** 是强调的那几个字')
assert.equal(visible(zh.hero.title), '一个在深夜写代码的大三学生')
assert.deepEqual(zh.hero.description, ['第一行', '第二行'], '说明一行一段，空行丢掉')
assert.equal(zh.footer.motto.text, '后台写的那句话')
assert.deepEqual(zh.footer.icp, { label: '萌ICP备1号', href: 'https://icp.gov.moe/?keyword=1' })
assert.deepEqual(zh.accounts, { github: 'someone', leetcode: 'someone-lc' })
assert.equal(zh.copyright.text, '本文采用 CC BY-NC-SA 4.0 许可')
assert.equal(zh.techStack.title.text, '我的工具')
assert.equal(zh.techStack.description, null, '技术栈说明写成空就不显示')
assert.deepEqual(zh.techStack.rows, [[{ name: 'Vue', icon: 'skill-icons:vuejs-dark' }], [{ name: 'Go', icon: 'skill-icons:golang' }]], '格式不对的项逐个丢掉')

// 英文强调标题不吃空格
const spaced = parse({ hero: { title: 'A **night owl** in space' } })
assert.equal(visible(spaced.hero.title), 'A night owl in space', '只去掉 **，词间空格保留')
assert.deepEqual(spaced.hero.title.filter((part) => part.strong).map((part) => part.text), ['night owl'])
for (const [title, shown, strong] of [
  ['**Hello** **world**', 'Hello world', ['Hello', 'world']],
  ['**Lead** words after', 'Lead words after', ['Lead']],
  ['Words before **tail**', 'Words before tail', ['tail']],
  ['**a** and **b**', 'a and b', ['a', 'b']],
  ['plain title', 'plain title', []],
]) {
  const parsed = parse({ hero: { title } }).hero.title
  assert.equal(visible(parsed), shown, `只去掉 **，词间空格保留：${title}`)
  assert.deepEqual(parsed.filter((part) => part.strong).map((part) => part.text.trim()), strong, `强调的词：${title}`)
}

// 清空：叶子写成空，或整组写成 null，都不显示
for (const cleared of [
  { hero: { title: '', description: [] }, footer: { motto: '', icp: null }, accounts: { github: '', leetcode: '' }, copyright: '', techStack: { title: '', description: '', rows: [] } },
  { hero: null, footer: null, accounts: null, copyright: null, techStack: null },
]) {
  const c = parse(cleared)
  assert.deepEqual([c.hero.title, c.hero.description], [[], []], '首屏标题和说明清空后不显示')
  assert.deepEqual([c.footer.motto, c.footer.icp], [null, null], '页脚那句话和萌备清空后不显示')
  assert.deepEqual(c.accounts, { github: null, leetcode: null }, '星带账号清空后不取')
  assert.equal(c.copyright, null)
  assert.deepEqual([c.techStack.title, c.techStack.description, c.techStack.rows], [null, null, []], '技术栈清空后整块不显示')
  assert.deepEqual(parse(cleared, 'en').hero.title, [], '外文页面也不冒出占位')
}
assert.equal(parse({ footer: { icp: { label: 'x', href: 'javascript:alert(1)' } } }).footer.icp, null, '萌备链接只放行 http(s)')

// 外文：每一项按中文原文找译文，标题和说明各自标语言
const hero = { title: '一个在深夜写代码的**大三学生**', description: ['第一行', '第二行'] }
const snippet = { hero, techStack: { title: '我的工具', description: '中文说明', rows: [[{ name: 'Vue', icon: 'skill-icons:vuejs-dark' }]] } }
const en = (site) => parse(snippet, 'en', site)
const tr = (source, text) => ({ source, text })
const translations = { 'hero.title': tr('一个在深夜写代码的**大三学生**', 'A **night owl**'), 'hero.description.0': tr('第一行', 'Line one'), 'hero.description.1': tr('第二行', 'Line two'), 'techStack.title': tr('我的工具', 'My tools') }
const both = en(translations).hero
assert.deepEqual([visible(both.title), both.description, both.titleLang, both.descriptionLang], ['A night owl', ['Line one', 'Line two'], undefined, undefined], '全译')
assert.deepEqual(both.title.filter((part) => part.strong).map((part) => part.text), ['night owl'], '译文里的 ** 也是强调')
const none = en({}).hero
assert.deepEqual([visible(none.title), none.titleLang, none.descriptionLang], ['一个在深夜写代码的大三学生', 'zh-CN', 'zh-CN'], '未译')
const titleOnly = en({ 'hero.title': translations['hero.title'] }).hero
assert.deepEqual([titleOnly.titleLang, titleOnly.description, titleOnly.descriptionLang], [undefined, ['第一行', '第二行'], 'zh-CN'], '只译了标题：英文标题不能被标成中文')
const halfDescription = en({ 'hero.description.0': translations['hero.description.0'] }).hero
assert.deepEqual([halfDescription.description, halfDescription.descriptionLang], [['第一行', '第二行'], 'zh-CN'], '说明有一行没译：整段显示中文，不中外混排')
const badEmphasis = en({ 'hero.title': tr('一个在深夜写代码的**大三学生**', 'A night owl') }).hero
assert.deepEqual([visible(badEmphasis.title), badEmphasis.titleLang], ['一个在深夜写代码的大三学生', 'zh-CN'], '译文丢了 ** 不用')
assert.deepEqual(parse(snippet, 'zh', translations).hero.description, ['第一行', '第二行'], '中文页面不换')
const enStack = en(translations).techStack
assert.deepEqual([enStack.title, enStack.description], [{ text: 'My tools' }, { text: '中文说明', lang: 'zh-CN' }], '技术栈标题、说明各自找译文')
// 同一句中文在两处：各用各的译文
const twice = parse({ hero: { title: '你好' }, footer: { motto: '你好' } }, 'en', { 'hero.title': tr('你好', 'Hello!'), 'footer.motto': tr('你好', 'Greetings.') })
assert.deepEqual([visible(twice.hero.title), twice.footer.motto], ['Hello!', { text: 'Greetings.' }], '同一句中文在两处，各用各的译文')
// 片段刚改、译文还是旧中文的：不用（中文要一致）
const outdated = parse({ hero: { title: '新标题' } }, 'en', { 'hero.title': tr('旧标题', 'Old title') }).hero
assert.deepEqual([visible(outdated.title), outdated.titleLang], ['新标题', 'zh-CN'], '译文对应的中文和现在的不一致就不用')
// 说明里有空行：位置按片段数组原来的下标（和 Core 一致）
const gap = parse({ hero: { description: ['第一行', '', '第三行'] } }, 'en', { 'hero.description.0': tr('第一行', 'One'), 'hero.description.2': tr('第三行', 'Three') }).hero
assert.deepEqual([gap.description, gap.descriptionLang], [['One', 'Three'], undefined], '空行也占一个下标')
// 首屏第一行问候（{name} 换成站长名字）、丛雨图层、头像后的影子：都由片段决定
assert.deepEqual(fallback.hero.greeting, { before: '你好，我是', after: '。' }, '问候没写时用占位，{name} 前后拆开')
assert.equal(fallback.hero.mascot, null, '丛雨图层默认没有：别人用这个主题不会出现')
assert.equal(fallback.hero.shadow, null, '头像后的影子默认没有')
assert.equal(parse({ hero: { greeting: '' } }).hero.greeting, null, '问候写成空就不显示这一行')
assert.deepEqual(parse({ hero: { greeting: 'Welcome to my sky' } }).hero.greeting, { before: 'Welcome to my sky', after: null }, '没有 {name} 时只显示文字、不放名字')
assert.deepEqual(parse({ hero: { greeting: '你好，我是{name}。' } }, 'en', { 'hero.greeting': { source: '你好，我是{name}。', text: "Hi, I'm {name}." } }).hero.greeting, { before: "Hi, I'm ", after: '.' }, '外文用译文，英文结尾的空格保留')
assert.deepEqual(parse({ hero: { greeting: '你好，我是{name}。' } }, 'ja').hero.greeting, { before: '你好，我是', after: '。', lang: 'zh-CN' }, '没有译文时显示中文并标 zh-CN')
const layers = { back: 'https://s3.example.com/back.webp', blink: 'https://s3.example.com/blink.webp', front: 'https://s3.example.com/front.webp' }
assert.deepEqual(parse({ hero: { mascot: layers } }).hero.mascot, layers, '丛雨三层图都填了才显示')
assert.equal(parse({ hero: { mascot: { ...layers, front: 'javascript:alert(1)' } } }).hero.mascot, null, '有一层不是 http(s) 地址就不显示')
assert.deepEqual(parse({ hero: { shadow: { image: 'https://s3.example.com/shin.webp', page: ' shin ' } } }).hero.shadow, { image: 'https://s3.example.com/shin.webp', page: 'shin' }, '影子：图片和后台页面的 slug')
assert.equal(parse({ hero: { shadow: { image: 'https://s3.example.com/shin.webp', page: '../x' } } }).hero.shadow, null, 'slug 只能是一段路径')
console.log('PASS site content from the theme/yozora snippet: fallback, missing, cleared leaves and groups, spaces around emphasis, per-field AI translations, tech stack, link safety')
