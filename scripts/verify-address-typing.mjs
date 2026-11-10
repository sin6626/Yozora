import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

// 检查地址栏“删旧打新”的帧（apps/web/lib/address-typing.ts 的 typingFrames）：先删旧路径不同的尾巴、再打新的，
// 相同开头不动，每一帧都是以 / 开头的非空路径，相邻两帧不重复，帧数不超过上限太多，汉字不会被切成半个，最后一帧是新路径。
const require = createRequire(new URL('../apps/web/package.json', import.meta.url))
const ts = require('typescript')
const source = readFileSync(new URL('../apps/web/lib/address-typing.ts', import.meta.url), 'utf8')
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
const module = { exports: {} }
vm.runInNewContext(code, { module, exports: module.exports })
// vm 里出来的数组不是这一边的 Array，比较前复制一份
const typingFrames = (...args) => [...module.exports.typingFrames(...args)]

assert.deepEqual(typingFrames('/notes', '/posts', 12), ['/note', '/not', '/no', '/n', '/', '/p', '/po', '/pos', '/post', '/posts'])
// 相同开头不删
assert.deepEqual(typingFrames('/posts', '/posts/tech/a', 12), ['/posts/', '/posts/t', '/posts/te', '/posts/tec', '/posts/tech', '/posts/tech/', '/posts/tech/a'])
assert.deepEqual(typingFrames('/posts/tech/a', '/posts', 12), ['/posts/tech/', '/posts/tech', '/posts/tec', '/posts/te', '/posts/t', '/posts/', '/posts'])
// 回首页
assert.deepEqual(typingFrames('/notes', '/', 12), ['/note', '/not', '/no', '/n', '/'])

const pairs = [
  ['/', '/posts'],
  ['/posts', '/notes'],
  ['/posts/tech/nextjs-cache-layers', '/categories/瞎扯淡'],
  ['/categories/瞎扯淡', '/en/posts'],
  ['/en/posts', '/ja/notes/42'],
  ['/notes/41', '/notes/42'],
  ['/timeline', '/timeline/notes'],
]
for (const [from, to] of pairs) {
  for (const max of [4, 12, 24]) {
    const frames = typingFrames(from, to, max)
    const label = `${from} → ${to}（最多 ${max} 帧）`
    assert.equal(frames.at(-1), to, `${label}：最后一帧应是新路径`)
    assert.ok(frames.every((frame) => frame.startsWith('/')), `${label}：每帧以 / 开头：${frames}`)
    assert.ok(frames.every((frame, i) => frame !== (i ? frames[i - 1] : from)), `${label}：相邻帧不重复：${frames}`)
    assert.ok(frames.length <= max + 2, `${label}：帧数 ${frames.length} 超过上限`)
    assert.ok(frames.every((frame) => !/[\uD800-\uDBFF]$/.test(frame)), `${label}：不能切出半个字符`)
  }
}
assert.deepEqual(typingFrames('/a/😀😀', '/a', 12), ['/a/😀', '/a/', '/a'])

console.log('PASS 地址栏删旧打新：相同开头不动、先删后打、帧数有上限、不切半个字符、最后是新路径')
