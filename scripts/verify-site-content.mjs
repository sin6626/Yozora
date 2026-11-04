// 站长维护的站点内容（首屏标题与说明、页脚那句话、萌备、贡献星带账号、文章版权说明）都在 Core 的配置片段 theme/yozora 里，
// 检查 lib/theme-config.ts 的 parseSiteContent：片段读不到用占位、某项没写用占位、写成空就不显示（旧值不会冒回来）、
// 外文页面用 i18n 里的译文，没有译文时显示中文并标 zh-CN。用法：node scripts/verify-site-content.mjs（已并入 pnpm verify）
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

const require = createRequire(new URL('../apps/web/package.json', import.meta.url))
const ts = require('typescript')
const code = ts.transpileModule(readFileSync(new URL('../apps/web/lib/theme-config.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
const module = { exports: {} }
vm.runInNewContext(code, { module, exports: module.exports })
const { parseSiteContent } = module.exports
const plain = (value) => JSON.parse(JSON.stringify(value))

const fallback = plain(parseSiteContent(null, 'zh'))
assert.ok(fallback.hero.title.length > 0 && fallback.hero.description.length > 0 && fallback.footer.motto.text, '片段读不到时用占位')
assert.deepEqual(plain(parseSiteContent({ techStack: {} }, 'zh')), fallback, '某项没写时用占位')

const config = {
  hero: { title: '一个在深夜写代码的**大三学生**', description: ['第一行', '  ', '第二行'] },
  footer: { motto: '后台写的那句话', icp: { label: '萌ICP备1号', href: 'https://icp.gov.moe/?keyword=1' } },
  accounts: { github: 'someone', leetcode: 'someone-lc' },
  copyright: '本文采用 CC BY-NC-SA 4.0 许可',
  i18n: { en: { hero: { title: 'A **night owl**', description: ['Line'] }, footer: { motto: 'English motto' } } },
}
const zh = plain(parseSiteContent(config, 'zh'))
assert.deepEqual(zh.hero.title, [{ text: '一个在深夜写代码的', strong: false }, { text: '大三学生', strong: true }], '**…** 是强调的那几个字')
assert.deepEqual(zh.hero.description, ['第一行', '第二行'], '说明一行一段，空行丢掉')
assert.equal(zh.footer.motto.text, '后台写的那句话')
assert.deepEqual(zh.footer.icp, { label: '萌ICP备1号', href: 'https://icp.gov.moe/?keyword=1' })
assert.deepEqual(zh.accounts, { github: 'someone', leetcode: 'someone-lc' })
assert.equal(zh.copyright.text, '本文采用 CC BY-NC-SA 4.0 许可')

const en = plain(parseSiteContent(config, 'en'))
assert.deepEqual(en.hero.title, [{ text: 'A', strong: false }, { text: 'night owl', strong: true }])
assert.equal(en.hero.lang, undefined)
assert.equal(en.footer.motto.text, 'English motto')
assert.deepEqual(en.copyright, { text: '本文采用 CC BY-NC-SA 4.0 许可', lang: 'zh-CN' }, '没有译文时显示中文并标明语言')

const ja = plain(parseSiteContent(config, 'ja'))
assert.equal(ja.hero.lang, 'zh-CN')
assert.deepEqual(ja.hero.description, ['第一行', '第二行'])

const cleared = plain(parseSiteContent({ hero: { title: '', description: [] }, footer: { motto: '', icp: null }, accounts: { github: '', leetcode: '' }, copyright: '' }, 'zh'))
assert.deepEqual(cleared.hero, { title: [], description: [] }, '清空后首屏标题和说明不显示')
assert.equal(cleared.footer.motto, null)
assert.equal(cleared.footer.icp, null)
assert.deepEqual(cleared.accounts, { github: null, leetcode: null })
assert.equal(cleared.copyright, null)
assert.equal(plain(parseSiteContent({ footer: { icp: { label: 'x', href: 'javascript:alert(1)' } } }, 'zh')).footer.icp, null, '萌备链接只放行 http(s)')
assert.equal(fallback.copyright, null, '版权说明默认不显示（许可要站长自己选）')
console.log('PASS site content from the theme/yozora snippet: fallback, missing, cleared, emphasis, translations, link safety')
