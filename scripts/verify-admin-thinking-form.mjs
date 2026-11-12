// 后台“思考”编辑框（apps/admin/src/components/shorthand/thinking-form.ts）：表单状态 ⇄ Core 的 recently 请求体。
// 检查：每种类型的必填项、地址和数字的格式、列表拆分、切换类型时只发当前类型的字段、编辑旧条目时原样带回、引用为空时发 null（Core 会清掉引用），
// 以及从链接自动补全 GitHub 仓库、arXiv 编号和力扣平台名。用法：node scripts/verify-admin-thinking-form.mjs（已并入 pnpm verify）
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

const require = createRequire(new URL('../apps/web/package.json', import.meta.url))
const ts = require('typescript')
const code = ts.transpileModule(readFileSync(new URL('../apps/admin/src/components/shorthand/thinking-form.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
const module = { exports: {} }
vm.runInNewContext(code, { module, exports: module.exports, URL })
const { thinkingTypes, draftFrom, problems, toPayload, autofill, quoteSummary } = module.exports
const plain = (value) => JSON.parse(JSON.stringify(value))
const eq = (actual, expected, message) => assert.deepEqual(plain(actual), plain(expected), message)

// 八种类型，和 Core 的 RecentlyTypeEnum 一致
eq(thinkingTypes.map((t) => t.value), ['text', 'book', 'media', 'music', 'github', 'link', 'academic', 'code'])

// 新建：纯文字，看法必填
const blank = draftFrom()
eq(plain(blank), { type: 'text', content: '', fields: {}, ref: null })
eq(problems(blank), ['请写下看法'])
eq(plain(toPayload({ ...blank, content: ' 想到一件事 ' })), { type: 'text', content: '想到一件事', ref: null })

// 书：缺必填项按表单顺序提示；看法可以不写
const book = { type: 'book', content: '', fields: { url: 'https://book.example/1' }, ref: null }
eq(problems(book), ['请填写书名', '请填写作者'])
book.fields.title = ' 被讨厌的勇气 '
book.fields.author = '岸见一郎'
eq(problems(book), [])
book.fields.rating = '11'
book.fields.cover = 'ftp://x'
eq(problems(book), ['封面要以 http:// 或 https:// 开头', '评分要是 0 到 10 的数字'])
book.fields.rating = '8.4'
book.fields.cover = ''
eq(plain(toPayload(book)), { type: 'book', content: '', metadata: { url: 'https://book.example/1', title: '被讨厌的勇气', author: '岸见一郎', rating: 8.4 }, ref: null })
eq(problems({ ...book, fields: { ...book.fields, url: 'book.example' } }), ['链接要以 http:// 或 https:// 开头'])

// 切换类型：共用的链接和标题留着，只发当前类型的字段
const asLink = { ...book, type: 'link' }
eq(plain(toPayload(asLink)), { type: 'link', content: '', metadata: { url: 'https://book.example/1', title: '被讨厌的勇气' }, ref: null })
// 切回纯文字：没有卡片信息，看法必填
eq(problems({ ...book, type: 'text' }), ['请写下看法'])
assert.equal(toPayload({ ...book, type: 'text', content: 'x' }).metadata, undefined)

// 列表：作者、标签按逗号、顿号、换行拆开
const paper = { type: 'academic', content: '', fields: { url: 'https://arxiv.org/abs/1706.03762', title: 'Attention', authors: 'Vaswani, Shazeer，Parmar、 \n' }, ref: null }
eq(toPayload(paper).metadata.authors, ['Vaswani', 'Shazeer', 'Parmar'])
// GitHub：星标是非负整数，语言色是 #十六进制
const repo = { type: 'github', content: '', fields: { url: 'https://github.com/mx-space/core', owner: 'mx-space', repo: 'core', stars: '1.5', languageColor: 'blue' }, ref: null }
eq(problems(repo), ['星标要是不小于 0 的整数', '语言色要写成 #3178c6 这样'])
repo.fields.stars = '512'
repo.fields.languageColor = '#3178c6'
eq(toPayload(repo).metadata, { url: 'https://github.com/mx-space/core', owner: 'mx-space', repo: 'core', stars: 512, languageColor: '#3178c6' })

// 引用：选了就发 id，没选发 null（编辑时清掉原来的引用）
assert.equal(toPayload({ ...blank, content: 'x', ref: '0123456789abcdef01234567' }).ref, '0123456789abcdef01234567')

// 编辑旧条目：原样带回表单（数字、列表转成文字），没有类型的旧数据当纯文字
eq(plain(draftFrom({ content: '旧的', ref: null })), { type: 'text', content: '旧的', fields: {}, ref: null })
const old = draftFrom({ type: 'code', content: '十几行', metadata: { url: 'https://leetcode.cn/problems/x/', title: '42. 接雨水', difficulty: '困难', tags: ['双指针', '单调栈'], platform: '力扣' }, ref: { id: 'a'.repeat(24), title: '文章' }, refType: 'Post' })
eq(plain(old), { type: 'code', content: '十几行', fields: { url: 'https://leetcode.cn/problems/x/', title: '42. 接雨水', difficulty: '困难', tags: '双指针, 单调栈', platform: '力扣' }, ref: 'a'.repeat(24) })
eq(plain(toPayload(old)).metadata, { url: 'https://leetcode.cn/problems/x/', title: '42. 接雨水', difficulty: '困难', tags: ['双指针', '单调栈'], platform: '力扣' })
assert.equal(draftFrom({ type: 'book', content: '', metadata: { url: 'u', title: 't', author: 'a', rating: 0 } }).fields.rating, '0')

// 粘贴链接时自动补全空着的字段（已填的不覆盖）
eq(autofill('github', { url: 'https://github.com/mx-space/core/tree/main' }), { url: 'https://github.com/mx-space/core/tree/main', owner: 'mx-space', repo: 'core' })
eq(autofill('github', { url: 'https://github.com/a/b', owner: '自己写的' }), { url: 'https://github.com/a/b', owner: '自己写的', repo: 'b' })
eq(autofill('academic', { url: 'https://arxiv.org/abs/1706.03762v7' }).arxivId, '1706.03762v7')
assert.equal(autofill('code', { url: 'https://leetcode.cn/problems/trapping-rain-water/' }).platform, '力扣')
assert.equal(autofill('code', { url: 'https://leetcode.com/problems/two-sum/' }).platform, 'LeetCode')
eq(autofill('book', { url: 'https://github.com/a/b' }), { url: 'https://github.com/a/b' }, '别的类型不补')
eq(autofill('github', { url: 'not a url' }), { url: 'not a url' })

// 列表里一条思考的卡片摘要
assert.equal(quoteSummary({ type: 'book', metadata: { title: '被讨厌的勇气', author: '岸见一郎' } }), '书｜《被讨厌的勇气》 · 岸见一郎')
assert.equal(quoteSummary({ type: 'github', metadata: { owner: 'mx-space', repo: 'core' } }), 'GitHub｜mx-space/core')
assert.equal(quoteSummary({ type: 'link', metadata: { url: 'https://developer.mozilla.org/x' } }), '网页｜developer.mozilla.org')
assert.equal(quoteSummary({ type: 'text' }), null)
assert.equal(quoteSummary({ content: 'x' }), null)

console.log('verify-admin-thinking-form: 通过')
