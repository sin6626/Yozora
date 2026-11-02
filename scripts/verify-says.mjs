import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

// 检查一言的纯逻辑（apps/web/lib/says.ts）：按人分组计数、金句卡片图的折行（英文单词不拆、标点不放行首）、金句星图排布（句子再多也装得下）。
// 用法：node scripts/verify-says.mjs（pnpm verify）
const require = createRequire(new URL('../apps/web/package.json', import.meta.url))
const ts = require('typescript')
const source = readFileSync(new URL('../apps/web/lib/says.ts', import.meta.url), 'utf8')
const module = { exports: {} }
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { module, exports: module.exports })
const { authorsOf, wrapText, skyLayout } = module.exports
const plain = (value) => JSON.parse(JSON.stringify(value))

const says = [
  { id: 'a', text: '一', author: '少年捞大' },
  { id: 'b', text: '二', author: 'rap捞大' },
  { id: 'c', text: '三', author: ' 少年捞大 ' },
  { id: 'd', text: '四' },
  { id: 'e', text: '五', author: '康德' },
]
assert.deepEqual(plain(authorsOf(says)), [{ name: '少年捞大', count: 2 }, { name: 'rap捞大', count: 1 }, { name: '康德', count: 1 }], '说得多的在前，一样多按先出现的；去掉首尾空格；没写作者的不算')

// 量宽度：中日文 2，其他 1
const measure = (value) => [...value].reduce((width, char) => width + (/[　-鿿＀-￯]/.test(char) ? 2 : 1), 0)
assert.deepEqual(plain(wrapText('年少轻狂过，也曾垂头丧气过', measure, 10)), ['年少轻狂过，', '也曾垂头丧', '气过'], '“，”放不下时挂在上一行末尾，不放行首')
assert.deepEqual(plain(wrapText('当我用了GPT Pro 和 Claude Max 我将失去大脑', measure, 12)), ['当我用了GPT', 'Pro 和', 'Claude Max', '我将失去大脑'], '英文单词不拆开，行首行尾不留空格')
assert.deepEqual(plain(wrapText('第一行\n第二行', measure, 20)), ['第一行', '第二行'], '保留原来的换行')
assert.deepEqual(plain(wrapText('Supercalifragilistic', measure, 8)), ['Supercalifragilistic'], '一个词比整行还长时单独一行（不硬拆）')

// 金句星图排布：同样的输入同样的位置；每个星座的连线把它的星串成一棵树；没写作者的是孤星、不标名字
const many = Array.from({ length: 30 }, (_, i) => ({ id: `q${i}`, text: 'x', author: ['康德', '大帝', '少年捞大', 'Sin', ''][i % 5] || undefined, created: new Date(2026, 0, i + 1).toISOString() }))
const sky = plain(skyLayout(many))
assert.deepEqual(plain(skyLayout(many)), sky, '同样的输入排出同样的星图')
assert.equal(sky.stars.length, 30)
const named = sky.groups.filter((group) => group.name)
assert.deepEqual(named.map((group) => group.name), ['康德', '大帝', '少年捞大', 'Sin'], '每个人一个星座')
for (const group of sky.groups) {
  assert.equal(group.edges.length, group.stars.length - 1, `${group.name ?? '孤星'} 的连线是一棵树`)
  assert.ok(group.edges.flat().every((star) => group.stars.includes(star)), '连线只连自己星座里的星')
  assert.equal(Boolean(group.label), Boolean(group.name), '有名字的星座才标名字')
}
assert.equal(sky.groups.filter((group) => !group.name).length, 6, '没写作者的 6 句各是一颗孤星')
assert.equal(sky.stars[sky.groups[0].stars[0]].id, 'q0', '星座里最早的那句排在第一颗')

// 句子再多也装得下（2026-11-02 用户：句子多了圈根本装不下）：星都在星盘里、名字在画布里、星和星不重叠、可悬停的范围互不盖住、星多时光晕变淡；几百句也要算得快
const crowd = (count) => Array.from({ length: count }, (_, i) => ({
  id: `c${count}-${i}`, text: 'x', created: new Date(Date.UTC(2025, 0, 1) + i * 3600000).toISOString(),
  author: i % 5 === 4 ? undefined : i % 3 === 0 ? '捞大' : i % 7 === 0 ? 'Sin' : `朋友${i % 23}`,
}))
let lastGlow = Infinity
for (const count of [1, 5, 30, 120, 300, 600]) {
  const started = performance.now()
  const layout = plain(skyLayout(crowd(count)))
  const ms = performance.now() - started
  const middle = layout.size / 2
  assert.equal(layout.stars.length, count)
  assert.ok(layout.stars.every((star) => Math.hypot(star.x - middle, star.y - middle) <= layout.limit + 0.1), `${count} 句：星都在星盘里`)
  assert.ok(layout.groups.every((group) => !group.label || (group.label.x > 0 && group.label.x < layout.size && group.label.y > 10 && group.label.y < layout.size)), `${count} 句：名字在画布里`)
  let gap = Infinity
  for (let i = 0; i < layout.stars.length; i++) for (let j = i + 1; j < layout.stars.length; j++) gap = Math.min(gap, Math.hypot(layout.stars[i].x - layout.stars[j].x, layout.stars[i].y - layout.stars[j].y))
  const biggest = Math.max(...layout.stars.map((star) => star.r))
  assert.ok(gap >= biggest * 2 + 1, `${count} 句：星和星不重叠（最近 ${gap.toFixed(1)}，星半径 ${biggest}）`)
  assert.ok(layout.hit * 2 <= gap + 0.2, `${count} 句：可悬停的范围互不盖住（半径 ${layout.hit}，最近 ${gap.toFixed(1)}）`)
  assert.ok(layout.glow <= lastGlow, `${count} 句：星越多光晕越淡`)
  lastGlow = layout.glow
  assert.ok(ms < 300, `${count} 句排布用了 ${ms.toFixed(0)}ms`)
}

console.log('PASS 一言：按人分组、金句卡片折行、金句星图排布（1–600 句都装得下）')
