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
const { authorsOf, wrapText, skyLayout, skyFrames, placeCard } = module.exports
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

// 金句星图排布：同样的输入同样的位置；每个星座的连线把它的星串成一棵树；没写作者的各是一颗孤星；新的一句最亮
const many = Array.from({ length: 30 }, (_, i) => ({ id: `q${i}`, text: 'x', author: ['康德', '大帝', '少年捞大', 'Sin', ''][i % 5] || undefined, created: new Date(2026, 0, i + 1).toISOString() }))
const sky = plain(skyLayout(many, skyFrames.wide))
assert.deepEqual(plain(skyLayout(many, skyFrames.wide)), sky, '同样的输入排出同样的星图')
assert.equal(sky.stars.length, 30)
const named = sky.groups.filter((group) => group.name)
assert.deepEqual(named.map((group) => group.name), ['康德', '大帝', '少年捞大', 'Sin'], '每个人一个星座')
for (const group of sky.groups) {
  assert.equal(group.edges.length, group.stars.length - 1, `${group.name ?? '孤星'} 的连线是一棵树`)
  assert.ok(group.edges.flat().every((star) => group.stars.includes(star)), '连线只连自己星座里的星')
}
assert.equal(sky.groups.filter((group) => !group.name).length, 6, '没写作者的 6 句各是一颗孤星')
assert.equal(sky.stars[sky.groups[0].stars[0]].id, 'q0', '星座里最早的那句排在第一颗')
const brightness = new Map(sky.stars.map((star) => [star.id, star.b]))
assert.equal(brightness.get('q29'), 1, '最新的一句最亮')
assert.equal(brightness.get('q0'), 0.7, '最早的一句最暗也有 0.7，不和背景的星混在一起')

// 句子再多也装得下（2026-11-02 用户：句子多了圈根本装不下；同日改为整屏星空，横屏、竖屏各一份）：
// 星都在画面留白以内、星和星不重叠、可悬停的范围互不盖住、星多时光晕变淡；几百句也要算得快
const crowd = (count) => Array.from({ length: count }, (_, i) => ({
  id: `c${count}-${i}`, text: 'x', created: new Date(Date.UTC(2025, 0, 1) + i * 3600000).toISOString(),
  author: i % 5 === 4 ? undefined : i % 3 === 0 ? '捞大' : i % 7 === 0 ? 'Sin' : `朋友${i % 23}`,
}))
for (const [shape, frame] of Object.entries(skyFrames)) {
  let lastGlow = Infinity
  for (const count of [1, 5, 30, 120, 300, 600]) {
    const started = performance.now()
    const layout = plain(skyLayout(crowd(count), frame))
    const ms = performance.now() - started
    const px = layout.stars.map((star) => ({ x: (star.x / 100) * frame.width, y: (star.y / 100) * frame.height, r: star.r }))
    assert.equal(layout.stars.length, count)
    assert.ok(px.every((star) => star.x >= frame.padX - 0.5 && star.x <= frame.width - frame.padX + 0.5 && star.y >= frame.padTop - 0.5 && star.y <= frame.height - frame.padBottom + 0.5), `${shape} ${count} 句：星都在画面留白以内`)
    let gap = Infinity
    for (let i = 0; i < px.length; i++) for (let j = i + 1; j < px.length; j++) gap = Math.min(gap, Math.hypot(px[i].x - px[j].x, px[i].y - px[j].y))
    const biggest = Math.max(...px.map((star) => star.r))
    assert.ok(gap >= biggest * 2 + 1, `${shape} ${count} 句：星和星不重叠（最近 ${gap.toFixed(1)}px，星半径 ${biggest}）`)
    assert.ok(layout.hit * 2 <= gap + 0.5, `${shape} ${count} 句：可悬停的范围互不盖住（半径 ${layout.hit}，最近 ${gap.toFixed(1)}px）`)
    assert.ok(layout.glow <= lastGlow, `${shape} ${count} 句：星越多光晕越淡`)
    lastGlow = layout.glow
    assert.ok(ms < 300, `${shape} ${count} 句排布用了 ${ms.toFixed(0)}ms`)
  }
}

// 那句话的卡片放在不出画面、盖住别的星最少的一边（2026-11-02：卡片盖住旁边的星时那颗星悬停不到）
const frame = { width: 1000, height: 500, hit: 10 }
const at = (x, y) => ({ id: `${x}-${y}`, x, y, r: 3, b: 1, group: 0 })
const placed = (stars) => plain(placeCard({ ...frame, stars }, 0))
const covers = (stars, place) => {
  const [w, h, gx, gy] = [33.6, 40, 2.2, 4.4]
  const [star] = stars
  const left = place.side === 'right' ? star.x + gx : place.side === 'left' ? star.x - gx - w : star.x - place.f * w
  const top = place.side === 'above' ? star.y - gy - h : place.side === 'below' ? star.y + gy : star.y - place.f * h
  return { inside: left >= 0 && left + w <= 100 && top >= 0 && top + h <= 100, covered: stars.slice(1).filter((s) => s.x > left - 1 && s.x < left + w + 1 && s.y > top - 2 && s.y < top + h + 2).length }
}
assert.deepEqual(placed([at(40, 50)]), { side: 'right', f: 0.5 }, '旁边没有星时默认放右边居中')
assert.equal(placed([at(40, 50), at(55, 50)]).side, 'left', '右边有星就放左边')
assert.equal(placed([at(95, 50)]).side, 'left', '靠右边缘时放左边，不出画面')
// 用户本地的真实情形：五颗星左右上下都有，卡片总能找到一个不盖星的位置
const real = [at(51.3, 50.06), at(66.63, 46.69), at(33.37, 50.8), at(62.31, 77.1), at(44.9, 20.27)]
assert.deepEqual(covers(real, placed(real)), { inside: true, covered: 0 }, `星的左右上下都有星时也能找到不盖星的位置（${JSON.stringify(placed(real))}）`)
for (const edgeStar of [at(40, 4), at(40, 96), at(3, 50), at(97, 50), at(3, 4), at(97, 96)]) assert.equal(covers([edgeStar], placed([edgeStar])).inside, true, `贴边的星（${edgeStar.id}）卡片也不出画面`)

console.log('PASS 一言：按人分组、金句卡片折行、金句星图排布（横屏竖屏、1–600 句都装得下、新的亮、卡片不盖星）')
