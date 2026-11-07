import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

// 检查手记详情的头图/横幅解析（后台 meta.cover、meta.banner）和左侧时间线“前后各 10 篇”的切片。
const require = createRequire(new URL('../apps/web/package.json', import.meta.url))
const ts = require('typescript')
function load(path) {
  const url = new URL(path, import.meta.url)
  const code = ts.transpileModule(readFileSync(url, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const module = { exports: {} }
  vm.runInNewContext(code, { module, exports: module.exports, require: (name) => load(new URL(`${name}.ts`, url).href) })
  return module.exports
}
const { parseNoteMeta, aroundCurrent } = load('../apps/web/lib/note-extras.ts')
const plain = (value) => JSON.parse(JSON.stringify(value))

// 没有 meta、meta 不是对象
for (const meta of [undefined, null, 'x', [], 1]) assert.deepEqual(plain(parseNoteMeta(meta)), { cover: null, banner: null })
// 头图只放行 http(s)
assert.equal(parseNoteMeta({ cover: ' https://img.example/a.webp ' }).cover, 'https://img.example/a.webp')
assert.equal(parseNoteMeta({ cover: 'javascript:alert(1)' }).cover, null)
assert.equal(parseNoteMeta({ cover: '/relative.png' }).cover, null)
assert.equal(parseNoteMeta({ cover: 42 }).cover, null)
// 横幅：字符串当 info；对象按 type，未知 type 退回 info；className、style 不认；空消息不显示
assert.deepEqual(plain(parseNoteMeta({ banner: '旧文，仅作记录' }).banner), { type: 'info', message: '旧文，仅作记录' })
assert.deepEqual(plain(parseNoteMeta({ banner: { type: 'warning', message: ' 注意 ', className: 'bg-red-500', style: { color: 'red' } } }).banner), { type: 'warning', message: '注意' })
for (const type of ['error', 'success', 'secondary']) assert.equal(parseNoteMeta({ banner: { type, message: 'm' } }).banner.type, type)
assert.equal(parseNoteMeta({ banner: { type: 'danger', message: 'm' } }).banner.type, 'info')
assert.equal(parseNoteMeta({ banner: { type: 'info' } }).banner, null)
assert.equal(parseNoteMeta({ banner: { message: '   ' } }).banner, null)
assert.equal(parseNoteMeta({ banner: ['m'] }).banner, null)

// 时间线切片：前后各 n 篇，靠边少几篇，不在列表里返回空
const items = Array.from({ length: 30 }, (_, i) => ({ id: `n${i}` }))
const ids = (list) => list.map(({ id }) => id)
assert.equal(aroundCurrent(items, 'n15').length, 21)
assert.deepEqual(ids(aroundCurrent(items, 'n15', 2)), ['n13', 'n14', 'n15', 'n16', 'n17'])
assert.deepEqual(ids(aroundCurrent(items, 'n0', 2)), ['n0', 'n1', 'n2'])
assert.deepEqual(ids(aroundCurrent(items, 'n29', 2)), ['n27', 'n28', 'n29'])
assert.deepEqual(plain(aroundCurrent(items, 'missing')), [])
assert.equal(aroundCurrent(items.slice(0, 5), 'n2').length, 5)

console.log('note extras: ok')
