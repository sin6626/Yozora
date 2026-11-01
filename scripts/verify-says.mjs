import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

// 检查一言的纯逻辑（apps/web/lib/says.ts）：按人分组计数、抽一句不重复、金句卡片图的折行（英文单词不拆、标点不放行首）。
// 用法：node scripts/verify-says.mjs（pnpm verify）
const require = createRequire(new URL('../apps/web/package.json', import.meta.url))
const ts = require('typescript')
const source = readFileSync(new URL('../apps/web/lib/says.ts', import.meta.url), 'utf8')
const module = { exports: {} }
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { module, exports: module.exports })
const { authorsOf, drawSay, wrapText, skyLayout } = module.exports
const plain = (value) => JSON.parse(JSON.stringify(value))

const says = [
  { id: 'a', text: '一', author: '少年捞大' },
  { id: 'b', text: '二', author: 'rap捞大' },
  { id: 'c', text: '三', author: ' 少年捞大 ' },
  { id: 'd', text: '四' },
  { id: 'e', text: '五', author: '康德' },
]
assert.deepEqual(plain(authorsOf(says)), [{ name: '少年捞大', count: 2 }, { name: 'rap捞大', count: 1 }, { name: '康德', count: 1 }], '说得多的在前，一样多按先出现的；去掉首尾空格；没写作者的不算')

assert.equal(drawSay(says, 'a', () => 0).id, 'b', '不和上一次抽到的重复')
assert.equal(drawSay([says[0]], 'a', () => 0).id, 'a', '只有一条时就是它')
assert.equal(drawSay([], undefined), undefined)

// 量宽度：中日文 2，其他 1
const measure = (value) => [...value].reduce((width, char) => width + (/[　-鿿＀-￯]/.test(char) ? 2 : 1), 0)
assert.deepEqual(plain(wrapText('年少轻狂过，也曾垂头丧气过', measure, 10)), ['年少轻狂过，', '也曾垂头丧', '气过'], '“，”放不下时挂在上一行末尾，不放行首')
assert.deepEqual(plain(wrapText('当我用了GPT Pro 和 Claude Max 我将失去大脑', measure, 12)), ['当我用了GPT', 'Pro 和', 'Claude Max', '我将失去大脑'], '英文单词不拆开，行首行尾不留空格')
assert.deepEqual(plain(wrapText('第一行\n第二行', measure, 20)), ['第一行', '第二行'], '保留原来的换行')
assert.deepEqual(plain(wrapText('Supercalifragilistic', measure, 8)), ['Supercalifragilistic'], '一个词比整行还长时单独一行（不硬拆）')

// 金句星图排布：同样的输入同样的位置；星都在圆内、互相不挤；每个星座的连线把它的星串成一棵树；没写作者的是孤星、不标名字
const many = Array.from({ length: 30 }, (_, i) => ({ id: `q${i}`, text: 'x', author: ['康德', '大帝', '少年捞大', 'Sin', ''][i % 5] || undefined, created: new Date(2026, 0, i + 1).toISOString() }))
const sky = plain(skyLayout(many))
assert.deepEqual(plain(skyLayout(many)), sky, '同样的输入排出同样的星图')
assert.equal(sky.stars.length, 30)
const center = sky.size / 2
assert.ok(sky.stars.every((star) => Math.hypot(star.x - center, star.y - center) <= sky.limit + 0.1), '星都在星盘里')
const gaps = sky.stars.flatMap((a, i) => sky.stars.slice(i + 1).map((b) => Math.hypot(a.x - b.x, a.y - b.y)))
assert.ok(Math.min(...gaps) >= 15.8, `两颗星至少隔 16（最近 ${Math.min(...gaps).toFixed(1)}）`)
const named = sky.groups.filter((group) => group.name)
assert.deepEqual(named.map((group) => group.name), ['康德', '大帝', '少年捞大', 'Sin'], '每个人一个星座')
for (const group of sky.groups) {
  assert.equal(group.edges.length, group.stars.length - 1, `${group.name ?? '孤星'} 的连线是一棵树`)
  assert.ok(group.edges.flat().every((star) => group.stars.includes(star)), '连线只连自己星座里的星')
  assert.equal(Boolean(group.label), Boolean(group.name), '有名字的星座才标名字')
}
assert.equal(sky.groups.filter((group) => !group.name).length, 6, '没写作者的 6 句各是一颗孤星')
assert.equal(sky.stars[sky.groups[0].stars[0]].id, 'q0', '星座里最早的那句排在第一颗')

console.log('PASS 一言：按人分组、抽一句、金句卡片折行、金句星图排布')
