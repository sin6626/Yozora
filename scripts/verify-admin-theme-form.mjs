// 后台“Yozora 主题”表单与配置片段 theme/yozora 的互转（apps/admin/src/views/extra-features/yozora-theme/theme-form.ts），
// 再用前台的 parseSiteContent 读回来，确认后台填的就是前台显示的。用法：node scripts/verify-admin-theme-form.mjs（已并入 pnpm verify）
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

const require = createRequire(new URL('../apps/web/package.json', import.meta.url))
const ts = require('typescript')
const load = (path) => {
  const module = { exports: {} }
  const code = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  vm.runInNewContext(code, { module, exports: module.exports })
  return module.exports
}
const { readThemeForm, writeThemeForm } = load('../apps/admin/src/views/extra-features/yozora-theme/theme-form.ts')
const { parseSiteContent } = load('../apps/web/lib/theme-config.ts')
const plain = (value) => JSON.parse(JSON.stringify(value))
const clone = (value) => JSON.parse(JSON.stringify(value))
const front = (raw, lang = 'zh') => plain(parseSiteContent(JSON.parse(raw), lang))

const raw = JSON.stringify({
  hero: { title: '一个在深夜写代码的**大三学生**', description: ['第一行', '第二行'] },
  footer: { motto: '那句话', icp: { label: '萌ICP备1号', href: 'https://icp.gov.moe/?keyword=1' } },
  accounts: { github: 'gh', leetcode: 'lc' },
  techStack: { title: '技术栈', rows: [[{ name: 'Vue', icon: 'skill-icons:vuejs-dark' }]] },
  i18n: { en: { siteDescription: 'kept', projects: { p1: { name: 'kept' } }, hero: { title: 'A **night owl**' } } },
})
const initial = readThemeForm(raw)
assert.equal(initial.zh.heroDescription, '第一行\n第二行', '说明一行一段')
assert.equal(initial.en.heroTitle, 'A **night owl**')
assert.equal(initial.en.motto, '', '没有译文的显示为空')
assert.equal(writeThemeForm(raw, initial, clone(initial)), JSON.stringify(JSON.parse(raw), null, 2), '什么都没改就原样保存')

const edited = clone(initial)
edited.zh.motto = '新的一句'
edited.zh.heroDescription = '只剩一行\n\n'
edited.zh.copyright = '本文采用 CC BY-NC-SA 4.0 许可'
edited.en.motto = 'A new line'
edited.en.heroTitle = ''
edited.ja.techTitle = '技術'
edited.leetcode = 'new-lc'
const saved = writeThemeForm(raw, initial, edited)
const config = JSON.parse(saved)
assert.deepEqual(config.techStack.rows, [[{ name: 'Vue', icon: 'skill-icons:vuejs-dark' }]], '表单不管的技术栈行原样保留')
assert.equal(config.i18n.en.siteDescription, 'kept', '片段里其他译文原样保留')
assert.deepEqual(config.i18n.en.projects, { p1: { name: 'kept' } })
assert.equal('title' in config.i18n.en.hero, false, '英文清空 = 删掉译文、回到中文')
const zh = front(saved)
assert.equal(zh.footer.motto.text, '新的一句')
assert.deepEqual(zh.hero.description, ['只剩一行'])
assert.equal(zh.copyright.text, '本文采用 CC BY-NC-SA 4.0 许可')
assert.equal(zh.accounts.leetcode, 'new-lc')
const en = front(saved, 'en')
assert.deepEqual([en.footer.motto, en.hero.titleLang], [{ text: 'A new line' }, 'zh-CN'], '英文那句话是新译文；标题没有译文显示中文')
assert.equal(front(saved, 'ja').techStack.title.text, '技術')

const cleared = clone(initial)
cleared.zh.heroTitle = ''
cleared.zh.motto = ''
cleared.icpLabel = ''
cleared.github = ''
const clearedFront = front(writeThemeForm(raw, initial, cleared))
assert.deepEqual([clearedFront.hero.title, clearedFront.footer.motto, clearedFront.footer.icp, clearedFront.accounts.github], [[], null, null, null], '中文清空后前台不显示，不会冒出占位')
console.log('PASS admin Yozora theme form: reads the snippet, writes only changed fields, keeps other keys, and the blog shows what was saved')
