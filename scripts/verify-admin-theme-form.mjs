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
const { readThemeForm, themeChanges, applyThemeChanges } = load('../apps/admin/src/views/extra-features/yozora-theme/theme-form.ts')
const { parseSiteContent } = load('../apps/web/lib/theme-config.ts')
const plain = (value) => JSON.parse(JSON.stringify(value))
const clone = (value) => JSON.parse(JSON.stringify(value))
const front = (raw, lang = 'zh') => plain(parseSiteContent(JSON.parse(raw), lang))

// 后台保存的完整链路：打开时读 base → 改表单 → 算出改了哪几项 → 套到保存前刚读到的 latest 上
const save = (base, edit, latest = base) => {
  const initial = readThemeForm(base)
  const next = clone(initial)
  edit(next)
  const result = applyThemeChanges(base, latest, themeChanges(initial, next))
  return result
}
const saved = (base, edit, latest) => {
  const result = save(base, edit, latest)
  assert.deepEqual(plain(result.conflicts), [], '不该有冲突')
  return result.raw
}

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
assert.equal(initial.en.motto, null, '没有译文的是 null（显示中文），不是空')
assert.equal(initial.zh.copyright, null, '中文没写的是 null（前台用默认），不是空')
assert.equal(saved(raw, () => {}), JSON.stringify(JSON.parse(raw), null, 2), '什么都没改就原样保存')

const edited = saved(raw, (form) => {
  form.zh.motto = '新的一句'
  form.zh.heroDescription = '只剩一行\n\n'
  form.zh.copyright = '本文采用 CC BY-NC-SA 4.0 许可'
  form.en.motto = 'A new line'
  form.en.heroTitle = null
  form.ja.techTitle = '技術'
  form.leetcode = 'new-lc'
})
const config = JSON.parse(edited)
assert.deepEqual(config.techStack.rows, [[{ name: 'Vue', icon: 'skill-icons:vuejs-dark' }]], '表单不管的技术栈行原样保留')
assert.equal(config.i18n.en.siteDescription, 'kept', '片段里其他译文原样保留')
assert.deepEqual(config.i18n.en.projects, { p1: { name: 'kept' } })
assert.equal('title' in config.i18n.en.hero, false, '英文改回 null = 删掉译文、回到中文')
const zh = front(edited)
assert.equal(zh.footer.motto.text, '新的一句')
assert.deepEqual(zh.hero.description, ['只剩一行'])
assert.equal(zh.copyright.text, '本文采用 CC BY-NC-SA 4.0 许可')
assert.equal(zh.accounts.leetcode, 'new-lc')
const en = front(edited, 'en')
assert.deepEqual([en.footer.motto, en.hero.titleLang], [{ text: 'A new line' }, 'zh-CN'], '英文那句话是新译文；标题没有译文显示中文')
assert.equal(front(edited, 'ja').techStack.title.text, '技術')

const clearedFront = front(saved(raw, (form) => {
  form.zh.heroTitle = ''
  form.zh.motto = ''
  form.icpLabel = ''
  form.github = ''
}))
assert.deepEqual([clearedFront.hero.title, clearedFront.footer.motto, clearedFront.footer.icp, clearedFront.accounts.github], [[], null, null, null], '中文清空后前台不显示，不会冒出占位')
assert.equal(front(saved(raw, (form) => { form.en.motto = '' }), 'en').footer.motto, null, '英文写成空 = 英文页面不显示这一项')

// 复查 #3：整组清空后只改组里一项，其余各项仍是清空，不会冒出前台默认内容
const clearedGroups = JSON.stringify({ hero: null, accounts: null, techStack: null })
const groupForm = readThemeForm(clearedGroups)
assert.deepEqual([groupForm.zh.heroTitle, groupForm.zh.heroDescription, groupForm.github, groupForm.zh.techTitle], ['', '', '', ''], '清空的组读出来是“不显示”，不是“没写”')
const regrouped = front(saved(clearedGroups, (form) => { form.zh.heroTitle = '只填标题'; form.github = 'only-gh'; form.zh.techTitle = '只改标题' }))
assert.deepEqual(regrouped.hero.description, [], '只填标题后，说明仍不显示')
assert.equal(regrouped.accounts.leetcode, null, '只填 GitHub 后，力扣账号仍不显示')
assert.deepEqual(regrouped.techStack.rows, [], '只改技术栈标题后，图标行仍不显示')
assert.equal(regrouped.techStack.description, null)
assert.deepEqual([regrouped.hero.title.map((part) => part.text).join(''), regrouped.accounts.github, regrouped.techStack.title.text], ['只填标题', 'only-gh', '只改标题'])
assert.equal(front(saved(clearedGroups, (form) => { form.zh.heroTitle = null })).hero.title.length > 0, true, '清空组里把一项改回 null = 这一项回到默认，其余仍清空')

// 复查 #5：没写（前台显示默认）的项能直接设成“不显示”，不需要先存一段文字
const empty = '{}'
assert.equal(readThemeForm(empty).zh.heroTitle, null)
assert.ok(front(empty).hero.title.length > 0, '没写时前台显示默认标题')
assert.deepEqual(front(saved(empty, (form) => { form.zh.heroTitle = '' })).hero.title, [], '从“默认”直接改成“不显示”')
assert.equal(saved(empty, (form) => { form.zh.heroTitle = 'x'; form.zh.heroTitle = null }), JSON.stringify({}, null, 2), '输入后又改回默认，不写任何东西')
assert.equal(front(saved(empty, (form) => { form.leetcode = '' })).accounts.leetcode, null, '默认的力扣账号也能直接设成不显示')
assert.equal(front(saved(empty, (form) => { form.icpLabel = ''; form.icpHref = '' })).footer.icp, null, '默认的萌备也能直接设成不显示')

// 复查 #4：打开表单后别处（配置与云函数）改了片段，再在表单里只改页脚并保存——别处的修改不能被旧快照覆盖
const elsewhere = JSON.parse(raw)
elsewhere.techStack.rows = []
elsewhere.i18n.en.projects.p2 = { name: 'new project' }
const merged = JSON.parse(saved(raw, (form) => { form.zh.motto = '只改页脚' }, JSON.stringify(elsewhere)))
assert.deepEqual(merged.techStack.rows, [], '别处清空的图标行不会被恢复')
assert.deepEqual(merged.i18n.en.projects.p2, { name: 'new project' }, '别处新增的作品译文不会丢')
assert.equal(merged.footer.motto, '只改页脚')
const bothChanged = JSON.parse(raw)
bothChanged.footer.motto = '别处改的'
const conflict = save(raw, (form) => { form.zh.motto = '表单改的' }, JSON.stringify(bothChanged))
assert.deepEqual(plain(conflict.conflicts), [['footer', 'motto']], '同一项两边都改了：报冲突')
assert.equal(conflict.raw, undefined, '有冲突时不给出要保存的内容')
const groupClearedElsewhere = JSON.parse(raw)
groupClearedElsewhere.footer = null
assert.deepEqual(plain(save(raw, (form) => { form.zh.motto = '表单改的' }, JSON.stringify(groupClearedElsewhere)).conflicts), [['footer', 'motto']], '别处把整组清空也算冲突')
console.log('PASS admin Yozora theme form: three states per field, cleared groups stay cleared, saves merge onto the latest snippet and refuse field conflicts, and the blog shows what was saved')
