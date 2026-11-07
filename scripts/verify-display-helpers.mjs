import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

// 检查展示用的小工具：首页月相（已知新月、满月、上下弦的位置，亮面方向，新月/满月特殊处理）与 Markdown 摘录。
const require = createRequire(new URL('../apps/web/package.json', import.meta.url))
const ts = require('typescript')
function load(path) {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8')
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const module = { exports: {} }
  vm.runInNewContext(code, { module, exports: module.exports })
  return module.exports
}
const { moonPhase, moonLitPath, moonInfo } = load('../apps/web/lib/moon.ts')
const { excerpt, readingMinutes } = load('../apps/web/lib/excerpt.ts')
const { outdatedDays } = load('../apps/web/lib/date.ts')

const near = (phase, target) => Math.min(Math.abs(phase - target), 1 - Math.abs(phase - target))
// 2024-01-11 11:57 UTC 新月，2024-01-25 17:54 UTC 满月，2024-01-18 03:53 UTC 上弦，2024-02-02 23:18 UTC 下弦
assert.ok(near(moonPhase(Date.UTC(2024, 0, 11, 11, 57)), 0) < 0.03)
assert.ok(near(moonPhase(Date.UTC(2024, 0, 25, 17, 54)), 0.5) < 0.03)
assert.ok(near(moonPhase(Date.UTC(2024, 0, 18, 3, 53)), 0.25) < 0.03)
assert.ok(near(moonPhase(Date.UTC(2024, 1, 2, 23, 18)), 0.75) < 0.03)
assert.ok(moonPhase(Date.UTC(1990, 0, 1)) >= 0 && moonPhase(Date.UTC(1990, 0, 1)) < 1)

assert.equal(moonLitPath(0, 50, 50, 40), null)
assert.match(moonLitPath(0.5, 50, 50, 40), /A 40 40 0 1 1/)
// 上弦（右半亮）：外沿顺时针经过右侧；下弦外沿逆时针经过左侧
assert.match(moonLitPath(0.25, 50, 50, 40), /^M 50 10 A 40 40 0 0 1 50 90/)
assert.match(moonLitPath(0.75, 50, 50, 40), /^M 50 10 A 40 40 0 0 0 50 90/)
// 娥眉月交界线向亮面（右）鼓，盈凸月向暗面（左）鼓
assert.match(moonLitPath(0.1, 50, 50, 40), / 0 0 0 50 10 Z$/)
assert.match(moonLitPath(0.4, 50, 50, 40), / 0 0 1 50 10 Z$/)
// 悬停说明：满月那天亮面接近 100%、月龄约 15 天（平均朔望月推算，误差一天内）、接下来是新月；上弦时接下来是满月
const full = moonInfo(Date.UTC(2024, 0, 25, 17, 54))
assert.equal(full.name, '满月')
assert.ok(full.illumination >= 99 && Math.abs(full.age - 14.8) < 1 && full.next === '新月')
const quarter = moonInfo(Date.UTC(2024, 0, 18, 3, 53))
assert.equal(quarter.name, '上弦月')
assert.ok(quarter.next === '满月' && Math.abs(quarter.daysToNext - 7) <= 1)
assert.equal(moonInfo(Date.UTC(2024, 0, 11, 11, 57)).name, '新月')
// 摘录：去掉 Markdown 符号、实体、图片和链接地址，超长截断
assert.equal(excerpt('|*&#32;两个月的暑假*\n\n## 刚进出租屋\n\n看[这篇](https://a.b/c)和![图](x.png)'), '两个月的暑假 刚进出租屋 看这篇和')
assert.equal(excerpt('> 引用\n- 列表 `code`\n```js\nconst a = 1\n```\n结尾'), '引用 列表 code 结尾')
assert.equal(excerpt('一二三四五', 3), '一二三…')
// 正文里提到的标签和比较符号要保留，只去掉行首的引用符号（含嵌套）
assert.equal(excerpt('脚本放在<head> 中，a > b'), '脚本放在<head> 中，a > b')
assert.equal(excerpt('> > 嵌套引用'), '嵌套引用')
// 波浪号只在成对包住文字（删除线）时去掉，句尾撒娇的 ~~ 保留
assert.equal(excerpt('都是为了爱~~'), '都是为了爱~~')
assert.equal(excerpt('~~删掉~~的字'), '删掉的字')
assert.equal(excerpt(null), '')
// 列表信息行的阅读时长：按纯文本约 400 字一分钟，至少 1 分钟（代码块、链接地址不算字数）
assert.equal(readingMinutes('哈'), 1)
assert.equal(readingMinutes(null), 1)
assert.equal(readingMinutes('字'.repeat(2000)), 5)
assert.equal(readingMinutes('字'.repeat(800) + '\n```js\n' + 'x'.repeat(4000) + '\n```'), 2)
// 文章过期提示：最后修改（没改过看发布）距今超过 60 天才给出天数，正好 60 天、未来时间、无效时间都不提示
const day = 86_400_000
const now = Date.UTC(2026, 10, 7, 12)
assert.equal(outdatedDays(null, new Date(now - 61 * day).toISOString(), now), 61)
assert.equal(outdatedDays(null, new Date(now - 60 * day).toISOString(), now), null)
assert.equal(outdatedDays(null, new Date(now - 60 * day - 1000).toISOString(), now), null)
assert.equal(outdatedDays(new Date(now - 3 * day).toISOString(), new Date(now - 400 * day).toISOString(), now), null)
assert.equal(outdatedDays(new Date(now - 90 * day).toISOString(), new Date(now - 400 * day).toISOString(), now), 90)
assert.equal(outdatedDays(null, new Date(now + 90 * day).toISOString(), now), null)
assert.equal(outdatedDays(null, 'not a date', now), null)
console.log('PASS outdated post notice (> 60 days since last modified, else created)')
console.log('PASS moon phase dates, lit side, crescent/gibbous terminator, new and full moon, hover info; Markdown excerpt (tech stack config: verify-site-content.mjs)')
