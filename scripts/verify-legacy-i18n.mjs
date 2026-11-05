// 迁移旧手写译文（scripts/import-i18n-legacy.mjs）的规划：站点文案按位置配对（同一句中文在两处各是各的），
// 手改过的条目一律不动（包括原文已改、前台不再显示的），片段里对不上条目的手写译文要报出来（这时不能删片段 i18n）。
// 用法：node scripts/verify-legacy-i18n.mjs（已并入 pnpm verify）
import assert from 'node:assert/strict'
import { legacyProjectTranslations, legacySiteTranslations, planImport } from './lib/legacy-i18n.mjs'

const root = {
  hero: { title: '你好', description: ['第一行', ' 第二行 '] },
  footer: { motto: '你好' },
  copyright: '',
  i18n: {
    en: { hero: { title: 'Hello!', description: ['Line one', 'Line two'] }, footer: { motto: 'Greetings.' }, copyright: 'unused', siteDescription: 'Night sky', projects: { p1: { name: 'Stars', description: '' }, gone: { name: 'Old' } } },
    ja: { footer: { motto: 'こんにちは' } },
  },
}
const site = legacySiteTranslations(root, '夜空')
assert.deepEqual(site.en, { 'hero.title': 'Hello!', 'footer.motto': 'Greetings.', 'hero.description.0': 'Line one', 'hero.description.1': 'Line two', 'seo.description': 'Night sky' }, '同一句中文的两处各自配对；中文为空的位置不收')
assert.deepEqual(site.ja, { 'footer.motto': 'こんにちは' })
const projects = legacyProjectTranslations(root)

const cell = (text, manual, stale) => ({ text, manual, needs_review: false, ...(stale && { stale: true }) })
const entries = [
  { key_path: 'ui.text', lookup_key: 'a', translations: { en: null, ja: cell('旧い', false) } },
  { key_path: 'ui.text', lookup_key: 'b', translations: { en: cell('Owner wording', true, true), ja: null } },
  { key_path: 'site.text', lookup_key: 'hero.title', source: '你好', translations: { en: null, ja: null } },
  { key_path: 'site.text', lookup_key: 'footer.motto', source: '你好', translations: { en: null, ja: cell('手直し', true) } },
  { key_path: 'project.name', lookup_key: 'p1', source: '星', translations: { en: null, ja: null } },
]
const plan = planImport(entries, { ui: { en: { a: 'A', b: 'B' }, ja: { a: 'エー', b: 'ビー' } }, site, projects })
assert.deepEqual(plan.writes, [
  { keyPath: 'ui.text', lookupKey: 'a', lang: 'en', text: 'A' },
  { keyPath: 'ui.text', lookupKey: 'a', lang: 'ja', text: 'エー' },
  { keyPath: 'ui.text', lookupKey: 'b', lang: 'ja', text: 'ビー' },
  { keyPath: 'site.text', lookupKey: 'hero.title', lang: 'en', text: 'Hello!' },
  { keyPath: 'site.text', lookupKey: 'footer.motto', lang: 'en', text: 'Greetings.' },
  { keyPath: 'project.name', lookupKey: 'p1', lang: 'en', text: 'Stars' },
], 'AI 译文和没有译文的写入；手改过的（含原文已改的 b/en、footer.motto/ja）不动')
assert.equal(plan.kept, 2)
assert.deepEqual(plan.unmatched.sort(), ['en project.name gone', 'en site.text hero.description.0', 'en site.text hero.description.1', 'en site.text seo.description'].sort(), '对不上条目的手写译文报出来')
console.log('PASS legacy i18n import: site text paired by slot, hand-edited (even outdated) entries kept, unmatched legacy translations reported')
