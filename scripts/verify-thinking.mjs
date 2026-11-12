import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

// 检查“思考”引用卡片的解析（Core recently 的 type + metadata，后台填的、外部抓的都当不可信数据）：
// 地址只放行 http(s)，必填项缺了整张卡片不显示，评分/星标只收合理的数字，语言色只收 #十六进制（它会写进 CSS 变量），难度换成 1–3 档。
const require = createRequire(new URL('../apps/web/package.json', import.meta.url))
const ts = require('typescript')
function load(path) {
  const url = new URL(path, import.meta.url)
  const code = ts.transpileModule(readFileSync(url, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const module = { exports: {} }
  vm.runInNewContext(code, { module, exports: module.exports, URL, require: (name) => load(new URL(`${name}.ts`, url).href) })
  return module.exports
}
const { parseQuote } = load('../apps/web/lib/thinking.ts')
const plain = (value) => JSON.parse(JSON.stringify(value))

// 纯文字、未知类型、没有 metadata：没有卡片
for (const [type, metadata] of [['text', undefined], ['text', { url: 'https://a.example', title: 'x' }], ['podcast', { url: 'https://a.example', title: 'x' }], ['book', undefined], ['book', 'x'], ['book', []]]) {
  assert.equal(parseQuote(type, metadata), null, `${type} ${JSON.stringify(metadata)}`)
}

// 书：必填 url、title、author；封面只放行 http(s)；评分 0–10
assert.deepEqual(plain(parseQuote('book', { url: ' https://book.example/1 ', title: ' 被讨厌的勇气 ', author: '岸见一郎', cover: 'https://img.example/c.jpg', rating: 8.4, isbn: '978' })), {
  type: 'book', url: 'https://book.example/1', title: '被讨厌的勇气', author: '岸见一郎', cover: 'https://img.example/c.jpg', rating: 8.4,
})
assert.equal(parseQuote('book', { url: 'javascript:alert(1)', title: 't', author: 'a' }), null, '地址不是 http(s) 时不显示')
assert.equal(parseQuote('book', { url: '/relative', title: 't', author: 'a' }), null)
assert.equal(parseQuote('book', { url: 'https://b.example', title: ' ', author: 'a' }), null, '书名为空不显示')
assert.equal(parseQuote('book', { url: 'https://b.example', title: 't' }), null, '缺作者不显示')
const book = (extra) => parseQuote('book', { url: 'https://b.example', title: 't', author: 'a', ...extra })
assert.equal(book({ cover: 'javascript:alert(1)' }).cover, undefined)
for (const rating of [-1, 11, Number.NaN, '8', null]) assert.equal(book({ rating }).rating, undefined, `评分 ${rating}`)
assert.equal(book({ rating: 0 }).rating, 0)

// 影视、音乐
assert.deepEqual(plain(parseQuote('media', { url: 'https://m.example', title: '千与千寻', originalTitle: '千と千尋の神隠し', genre: '动画', rating: 9.4, description: '…', cover: 'ftp://x' })), {
  type: 'media', url: 'https://m.example', title: '千与千寻', originalTitle: '千と千尋の神隠し', rating: 9.4, description: '…', genre: '动画',
})
assert.equal(parseQuote('music', { url: 'https://y.example', title: '晴天' }), null, '音乐缺歌手不显示')
assert.deepEqual(plain(parseQuote('music', { url: 'https://y.example', title: '晴天', artist: '周杰伦', album: '叶惠美', source: '网易云音乐' })), {
  type: 'music', url: 'https://y.example', title: '晴天', artist: '周杰伦', album: '叶惠美', source: '网易云音乐',
})

// GitHub：星标是非负整数；语言色只收 #rgb / #rrggbb（会写进 style 的 CSS 变量，不能带 url() 之类）
const repo = (extra) => parseQuote('github', { url: 'https://github.com/mx-space/core', owner: 'mx-space', repo: 'core', ...extra })
assert.deepEqual(plain(repo({ stars: 512, language: 'TypeScript', languageColor: '#3178c6', description: 'd' })), {
  type: 'github', url: 'https://github.com/mx-space/core', owner: 'mx-space', repo: 'core', description: 'd', stars: 512, language: 'TypeScript', languageColor: '#3178c6',
})
for (const languageColor of ['red', '#12', 'url(https://evil.example)', '#123456; background: red', '#fff']) {
  assert.equal(repo({ languageColor }).languageColor, languageColor === '#fff' ? '#fff' : undefined, `语言色 ${languageColor}`)
}
for (const stars of [-3, 1.5, Number.POSITIVE_INFINITY, '10']) assert.equal(repo({ stars }).stars, undefined, `星标 ${stars}`)
assert.equal(parseQuote('github', { url: 'https://github.com/x', owner: 'x' }), null, '缺仓库名不显示')

// 链接：只要 url；标题、描述、配图都可选
assert.deepEqual(plain(parseQuote('link', { url: 'https://developer.mozilla.org/x', image: 'data:image/png;base64,AA' })), { type: 'link', url: 'https://developer.mozilla.org/x' })

// 论文：作者只收字符串，最多 6 个
assert.deepEqual(plain(parseQuote('academic', { url: 'https://arxiv.org/abs/1706.03762', title: 'Attention Is All You Need', authors: ['Vaswani', ' ', 3, 'Shazeer'], arxivId: '1706.03762' })), {
  type: 'academic', url: 'https://arxiv.org/abs/1706.03762', title: 'Attention Is All You Need', authors: ['Vaswani', 'Shazeer'], arxivId: '1706.03762',
})
assert.equal(parseQuote('academic', { url: 'https://a.example', title: 't', authors: Array.from({ length: 9 }, (_, i) => `A${i}`) }).authors.length, 6)

// 题目：难度换成档位（中英文都认，不认识的只显示原文），标签最多 5 个
const problem = (difficulty) => parseQuote('code', { url: 'https://leetcode.cn/problems/x/', title: '42. 接雨水', difficulty, tags: ['双指针', '单调栈'], platform: '力扣' })
assert.deepEqual(plain(problem('困难')), { type: 'code', url: 'https://leetcode.cn/problems/x/', title: '42. 接雨水', difficulty: '困难', level: 3, tags: ['双指针', '单调栈'], platform: '力扣' })
for (const [difficulty, level] of [['Easy', 1], ['简单', 1], ['medium', 2], ['中等', 2], ['HARD', 3], ['地狱', undefined], [undefined, undefined]]) {
  assert.equal(problem(difficulty).level, level, `难度 ${difficulty}`)
}
assert.equal(parseQuote('code', { url: 'https://a.example', title: 't', tags: 'x' }).tags.length, 0)

console.log('verify-thinking: 通过')
