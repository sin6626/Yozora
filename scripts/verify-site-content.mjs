// 站长维护的站点内容（首屏标题与说明、页脚那句话、萌备、贡献星带账号、文章版权说明、首页技术栈）都在 Core 的配置片段 theme/yozora 里，
// 检查 lib/theme-config.ts 的 parseSiteContent：片段读不到或某项没写用占位；写成空（含整组写成 null）就不显示，旧值不会冒回来；
// 强调标记只去掉 **、不吃掉空格；外文页面用 i18n 里的译文，没有译文的那一项显示中文并单独标 zh-CN。
// 用法：node scripts/verify-site-content.mjs（已并入 pnpm verify）
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

const require = createRequire(new URL('../apps/web/package.json', import.meta.url))
const ts = require('typescript')
const code = ts.transpileModule(readFileSync(new URL('../apps/web/lib/theme-config.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
const module = { exports: {} }
vm.runInNewContext(code, { module, exports: module.exports })
const parse = (config, lang = 'zh') => JSON.parse(JSON.stringify(module.exports.parseSiteContent(config, lang)))
// 和首屏一样拼：每段去掉首尾空白放进 inline-block，首尾有空白的在块外补一个空格，浏览器再把连续空白合成一个
const visible = (title) => title.map((part) => `${/^\s/.test(part.text) ? ' ' : ''}${part.text.trim()}${/\s$/.test(part.text) ? ' ' : ''}`).join('').replace(/\s+/g, ' ').trim()

// 读不到 / 没写：占位
const fallback = parse(null)
assert.ok(fallback.hero.title.length && fallback.hero.description.length && fallback.footer.motto.text && fallback.footer.icp, '片段读不到时用占位')
assert.equal(fallback.techStack.rows.length, 2, '技术栈读不到时用默认两行')
assert.equal(parse(null, 'en').techStack.title.text, 'Tech stack', '外文占位是这种语言的')
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

// 外文：标题和说明各自标语言
const hero = { title: '一个在深夜写代码的**大三学生**', description: ['中文说明'] }
const en = (i18nHero) => parse({ hero, techStack: { title: '我的工具', rows: [[{ name: 'Vue', icon: 'skill-icons:vuejs-dark' }]] }, i18n: { en: { hero: i18nHero, techStack: { title: 'My tools' } } } }, 'en').hero
const both = en({ title: 'A **night owl**', description: ['English'] })
assert.deepEqual([visible(both.title), both.description, both.titleLang, both.descriptionLang], ['A night owl', ['English'], undefined, undefined], '全译')
const none = en(undefined)
assert.deepEqual([visible(none.title), none.titleLang, none.descriptionLang], ['一个在深夜写代码的大三学生', 'zh-CN', 'zh-CN'], '未译')
const titleOnly = en({ title: 'A **night owl**' })
assert.deepEqual([titleOnly.titleLang, titleOnly.description, titleOnly.descriptionLang], [undefined, ['中文说明'], 'zh-CN'], '只译了标题：英文标题不能被标成中文')
const descriptionOnly = en({ description: ['English'] })
assert.deepEqual([descriptionOnly.titleLang, descriptionOnly.descriptionLang], ['zh-CN', undefined], '只译了说明')
const enStack = parse({ techStack: { title: '我的工具', description: '中文说明' }, i18n: { en: { techStack: { title: 'My tools' } } } }, 'en').techStack
assert.deepEqual([enStack.title, enStack.description], [{ text: 'My tools' }, { text: '中文说明', lang: 'zh-CN' }], '技术栈标题、说明的译文读片段 i18n')
console.log('PASS site content from the theme/yozora snippet: fallback, missing, cleared leaves and groups, spaces around emphasis, per-field translations, tech stack, link safety')
