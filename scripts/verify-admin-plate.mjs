// 后台的 Plate（Suzuri）小工具：
// - hasRichContent 认 Plate 信封：只有空段落不算有内容（不会为空文章自动存草稿），有字或图片、表格等元素才算；
// - lexicalOverwriteError：已发布的旧版 Lexical 文章只能按 Lexical 保存，改存成 Plate 或 Markdown 一律拦下；
// - diffTextOf：草稿历史只存 content，Plate 的版本对比用派生出来的 Markdown。
// 用法：node scripts/verify-admin-plate.mjs（已并入 pnpm verify）
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import vm from 'node:vm'

const admin = new URL('../apps/admin/', import.meta.url)
const require = createRequire(new URL('../apps/web/package.json', import.meta.url))
const ts = require('typescript')
const schema = await import(new URL('node_modules/@suzuri/editor/dist/schema/index.js', admin))
const load = (path, mocks = {}) => {
  const module = { exports: {} }
  const code = ts.transpileModule(readFileSync(new URL(`src/${path}`, admin), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  vm.runInNewContext(code, { module, exports: module.exports, require: (id) => mocks[id] ?? require(id) })
  return module.exports
}

const { hasRichContent, richContentForComparison } = load('utils/rich-content.ts')
const { isRichFormat, lexicalOverwriteError, publishFormatError } = load('shared/types/base.ts')
const { diffTextOf, plateMarkdown } = load('utils/plate-text.ts', { '@suzuri/editor/schema': schema })

const envelope = (children) => JSON.stringify(schema.createEnvelope({ children }))
const empty = envelope([{ type: 'paragraph', children: [{ text: '' }] }, { type: 'paragraph', children: [{ text: '  ' }] }])
const words = envelope([{ type: 'paragraph', children: [{ text: '你好' }] }])
const image = envelope([{ type: 'image', url: 'https://img.example/a.png', children: [{ text: '' }] }])

assert.equal(hasRichContent(empty), false, '只有空段落的 Plate 信封不算有内容')
assert.equal(hasRichContent(JSON.parse(empty)), false, '对象形式同样认')
assert.equal(hasRichContent(words), true)
assert.equal(hasRichContent(image), true, '只有一张图片也算有内容')
assert.equal(hasRichContent(JSON.stringify({ root: { type: 'root', children: [] } })), false, 'Lexical 的判断不变')
const reordered = JSON.stringify({ schema: JSON.parse(words).schema, document: JSON.parse(words).document })
assert.equal(richContentForComparison(reordered), richContentForComparison(words), '键的顺序不同不算改动（不会多存一份草稿）')

assert.equal(isRichFormat('plate') && isRichFormat('lexical') && !isRichFormat('markdown'), true)
assert.match(lexicalOverwriteError('lexical', 'plate'), /Lexical/, '旧版 Lexical 不能存成 Plate')
assert.match(lexicalOverwriteError('lexical', 'markdown'), /Lexical/, '也不能存成 Markdown')
for (const [from, to] of [['lexical', 'lexical'], ['markdown', 'plate'], ['plate', 'plate'], [undefined, 'plate']]) {
  assert.equal(lexicalOverwriteError(from, to), null, `${from} → ${to} 可以保存`)
}

// 更新已有内容时现读库里的格式：从草稿箱 ?draftId= 打开关联草稿、恢复历史版本时页面里没有（或是过期的）已发布格式
const reads = []
const reader = (format) => async (id) => { reads.push(id); return format }
assert.match(await publishFormatError('post-1', 'plate', reader('lexical')), /Lexical/, '库里是 Lexical，草稿是 Plate：拦下')
assert.deepEqual(reads, ['post-1'], '按要更新的 id 去读')
assert.equal(await publishFormatError('post-1', 'plate', reader(undefined)), null, '没写格式的旧文章按 Markdown，可以改存')
assert.equal(await publishFormatError(undefined, 'plate', async () => { throw new Error('新建不该去读') }), null, '新建不用查')
assert.match(await publishFormatError('post-1', 'lexical', async () => { throw new Error('网络断了') }), /读不到/, '读不到格式时不放行')
for (const page of ['manage-posts', 'manage-notes', 'manage-pages']) {
  const source = readFileSync(new URL(`src/views/${page}/write.tsx`, admin), 'utf8')
  const submit = source.slice(source.indexOf('const handleSubmit'))
  assert.ok(/await publishFormatError\(\s*isString\(actualRefId\.value\)/.test(submit), `${page} 提交前按 actualRefId 现读格式`)
  assert.ok(submit.indexOf('publishFormatError') < submit.indexOf('.update(actualRefId.value'), `${page} 先查格式再更新`)
  assert.equal(/publishedFormat/.test(source), false, `${page} 不再用只在 loadPublished 里记下的格式`)
}

assert.equal(plateMarkdown(envelope([{ type: 'heading', level: 2, children: [{ text: '标题' }] }])), '## 标题')
assert.equal(plateMarkdown('{oops'), '', '坏内容得到空文本，不报错')
assert.equal(diffTextOf({ contentFormat: 'plate', content: words, text: '旧的' }), '你好', 'Plate 用派生的 Markdown 对比')
assert.equal(diffTextOf({ contentFormat: 'lexical', content: '{}', text: 'lexical text' }), 'lexical text')
assert.equal(diffTextOf({ contentFormat: 'markdown', text: 'md' }), 'md')

console.log('PASS admin plate helpers: empty-envelope detection, lexical overwrite guard (re-read before every update), Markdown diff text')
