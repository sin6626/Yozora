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
  vm.runInNewContext(code, { module, exports: module.exports, require: (id) => mocks[id] ?? require(id), AbortController, AbortSignal, DOMException, setTimeout, clearTimeout })
  return module.exports
}

const { hasRichContent, richContentForComparison } = load('utils/rich-content.ts')
const { isRichFormat, lexicalOverwriteError, publishFormatError } = load('shared/types/base.ts')
const { diffTextOf, plateMarkdown } = load('utils/plate-text.ts', { '@suzuri/editor/schema': schema })

const { prepareInitialValue } = load('components/editor/plate/initial-value.ts', { '@suzuri/editor/schema': schema })
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

// 自动保存 → 重新打开 → 修链接 → 发布：Core 允许草稿带编辑中的占位链接（https://）保存，严格的编辑器初始化会抛错
const draft = schema.createEnvelope({ children: [
  { type: 'heading', level: 2, children: [{ text: '标题' }] },
  { type: 'paragraph', children: [{ text: '看 ' }, { type: 'link', url: 'https://', children: [{ text: '这里', bold: true }] }, { text: ' 和 ' }, { type: 'link', url: 'https://ok.example', children: [{ text: '那里' }] }] },
  { type: 'image', url: 'https://img.example/a.png', children: [{ text: '' }] },
] })
draft.document.children[1].children[1].url = 'https://' // createEnvelope 不校验，模拟 Core 草稿里存的样子
assert.equal(schema.validateDocument(draft).ok, false, '前提：占位链接过不了严格校验')
const reopened = prepareInitialValue(JSON.stringify(draft))
assert.equal(reopened.status, 'repaired', '能重新打开')
assert.deepEqual([...reopened.links], ['https://'], '只降级不合法的那个链接')
assert.ok(schema.validateDocument(reopened.value, { requireEnvelope: true }).ok, '打开的副本是合法信封')
const paragraph = reopened.value.document.children[1].children
assert.deepEqual([...paragraph.map((n) => n.type ?? n.text)], ['看 ', '这里', ' 和 ', 'link'], '占位链接的文字（连同加粗）留下，好链接不动')
assert.equal(paragraph[1].bold, true)
assert.equal(reopened.value.document.children[0].type, 'heading')
assert.equal(reopened.value.document.children[2].url, 'https://img.example/a.png', '其余内容原样')
assert.equal(draft.document.children[1].children[1].url, 'https://', '原稿对象没被改动')
// 用真实的 Suzuri 编辑器渲染一遍：原稿会让它初始化抛错，打开的副本不会
const adminRequire = createRequire(new URL('package.json', admin))
const { createElement } = adminRequire('react')
const { renderToString } = adminRequire('react-dom/server')
const { SuzuriEditor } = await import(new URL('node_modules/@suzuri/editor/dist/react/index.js', admin))
assert.throws(() => renderToString(createElement(SuzuriEditor, { initialValue: draft })), /url/, '前提：原稿直接交给编辑器会抛错')
assert.ok(renderToString(createElement(SuzuriEditor, { initialValue: reopened.value })).includes('这里'), '副本能在编辑器里打开')
const fixed = structuredClone(reopened.value)
fixed.document.children[1].children.splice(1, 1, { type: 'link', url: 'https://fixed.example', children: [{ text: '这里' }] })
assert.ok(schema.validateDocument(fixed, { requireEnvelope: true }).ok && schema.toMarkdown(fixed).markdown.includes('[这里](https://fixed.example)'), '修好链接后可以发布')
const valid = JSON.parse(words)
assert.equal(prepareInitialValue(valid).value, valid, '合法内容原样交给编辑器')
assert.equal(prepareInitialValue(undefined).status, 'ok')
const unknownNode = prepareInitialValue(envelope([{ type: 'banner', children: [{ text: '横幅文字' }] }]))
assert.equal(unknownNode.status, 'invalid', '修不好的不交给编辑器')
assert.ok(unknownNode.text.includes('横幅文字') && unknownNode.error, '只读显示原文和原因')
assert.equal(prepareInitialValue('{oops').status, 'invalid')

// 写作页和译文编辑共用持久上传（usePlateUploads）：只把 Core 返回的 http(s) 地址写进正文
const vue = adminRequire('vue')
const uploaded = []
const fakeFiles = { filesApi: { upload: async (file, type) => { uploaded.push(type); return { url: file.name === 'local' ? 'data:image/png;base64,AA' : `https://img.example/${file.name}` } } } }
const fakeMedia = { prepareCover: async (file) => ({ file, width: 3, height: 4 }), prepareClip: async (file) => file }
const loadUploads = () => load('components/editor/plate/uploads.ts', { vue, '~/api/files': fakeFiles, '../live-photo-media': fakeMedia, '@suzuri/editor/schema': schema })
const { usePlateUploads } = loadUploads()
const uploads = usePlateUploads()
const job = uploads.uploadImage({ name: 'a.png' })
assert.equal(uploads.pending.value, 1, '上传中计数')
assert.equal((await job).url, 'https://img.example/a.png')
assert.equal(uploads.pending.value, 0)
await assert.rejects(uploads.uploadImage({ name: 'local' }), /地址无效/, 'data: 地址不写进正文')
assert.equal((await uploads.uploadLivePhoto({ file: { name: 'c.jpg' }, kind: 'cover' })).naturalWidth, 3)
assert.equal((await uploads.uploadLivePhoto({ file: { name: 'c.mp4' }, kind: 'video' })).url, 'https://img.example/c.mp4')
assert.deepEqual(uploaded, ['image', 'image', 'image', 'file'], '封面传图床、短片传附件')
// 上传没完成时不许发布（那张图还没插进正文）；换文档、卸载时取消，取消的结果不插进正文
{
  let release
  const slowFiles = { filesApi: { upload: (file, type, signal) => new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason)
    release = () => resolve({ url: `https://img.example/${file.name}` })
    signal?.addEventListener('abort', () => reject(signal.reason))
  }) } }
  const { usePlateUploads: useSlow, pendingUploadsError } = load('components/editor/plate/uploads.ts', { vue, '~/api/files': slowFiles, '../live-photo-media': fakeMedia, '@suzuri/editor/schema': schema })
  const slow = useSlow()
  assert.equal(pendingUploadsError(), null)
  const first = slow.uploadImage({ name: 'slow.png' })
  assert.match(pendingUploadsError(), /1 个.*传完再发布/, '上传中发布要被拦下')
  release()
  await first
  assert.equal(pendingUploadsError(), null, '传完放行')
  const cancelled = slow.uploadImage({ name: 'gone.png' })
  slow.cancel()
  await assert.rejects(cancelled, /abort/i, '换文档后取消上传，不把图插进新文档')
  assert.equal(pendingUploadsError(), null)
  const late = slow.uploadImage({ name: 'late.png' })
  const lateRelease = release
  slow.cancel()
  lateRelease()
  await assert.rejects(late, /abort/i, '取消后才回来的结果也丢掉')
  const live = slow.uploadLivePhoto({ file: { name: 'c.jpg' }, kind: 'cover' })
  slow.cancel()
  await assert.rejects(live, /abort/i, '实况图同样跟着取消')
}
for (const [file, call] of [['views/manage-posts/write.tsx', ['.update(actualRefId.value', '.create(payload']], ['views/manage-notes/write.tsx', ['.update(actualRefId.value', '.create(']], ['views/manage-pages/write.tsx', ['.update(actualRefId.value', '.create(']], ['views/ai/components/translation-detail-panel.tsx', ['aiApi.updateTranslation(']]]) {
  const source = readFileSync(new URL(`src/${file}`, admin), 'utf8')
  const guard = source.indexOf('pendingUploadsError()')
  assert.ok(guard > 0, `${file} 发布前检查上传`)
  for (const c of call) assert.ok(source.indexOf(c, guard) > guard, `${file} 先检查上传再提交（${c}）`)
}
assert.match(readFileSync(new URL('src/components/editor/write-editor/PlateWriteEditor.tsx', admin), 'utf8'), /cancelUploads\(\)\s*\n\s*documentKey\.value\+\+/, '写作页换文档时取消上传')

// 每个用到 PlateEditor 的地方都要把这两个处理器传进去（不传就是 Suzuri 的 data:/blob: 默认值）
const { readdirSync } = await import('node:fs')
const sources = readdirSync(new URL('src/', admin), { recursive: true }).filter((f) => /\.tsx$/.test(f))
const usages = sources.flatMap((file) => {
  const source = readFileSync(new URL(`src/${file}`, admin), 'utf8')
  return [...source.matchAll(/<PlateEditor\b[\s\S]*?\/>/g)].map((m) => [file, m[0]])
})
assert.ok(usages.length >= 2, `找到写作页和译文编辑两处 PlateEditor（现在 ${usages.length} 处）`)
for (const [file, tag] of usages) {
  assert.ok(/onUploadImage=\{[^}]*uploadImage\}/.test(tag) && /onUploadLivePhoto=\{[^}]*uploadLivePhoto\}/.test(tag), `${file} 的 PlateEditor 要传持久上传处理器`)
}

console.log('PASS admin plate helpers: empty-envelope detection, lexical overwrite guard (re-read before every update), Markdown diff text, placeholder-link drafts reopen with the bad links downgraded, every PlateEditor uploads to persistent storage, publishing waits for uploads and switching documents cancels them')
