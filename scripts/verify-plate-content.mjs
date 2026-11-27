// Plate 正文（apps/web/components/plate-content.tsx）用真实的 @suzuri/editor 渲染：
// 合法信封出站点样式的正文（标题 id、代码框、可放大的图片、按 data-tone 上色的提示框、实况图、公式），
// 坏信封、坏 JSON、未知节点一律退回传进来的 Markdown 兜底，不让详情页报错。
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import { i18nServer } from './lib/i18n-mock.mjs'

const web = new URL('../apps/web/', import.meta.url)
const require = createRequire(new URL('package.json', web))
const ts = require('typescript')
const { createElement } = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const dist = new URL('node_modules/@suzuri/editor/dist/', web)
const schema = await import(new URL('schema/index.js', dist))
const staticEntry = await import(new URL('static/index.js', dist))
const i18n = i18nServer(ts)
const zh = await i18n.getT()

const load = (file, mocks) => {
  const module = { exports: {} }
  const code = ts.transpileModule(readFileSync(new URL(`components/${file}`, web), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText
  vm.runInNewContext(code, {
    module,
    exports: module.exports,
    require: (id) => (id.endsWith('.css') ? {} : id in mocks ? mocks[id] : require(id)),
  })
  return module.exports
}

// 代码框用真实组件，Shiki 换成空语言表走同步分支（Fizz 不支持异步组件）
const codeFrame = load('code-frame.tsx', {
  'next/cache': { cacheLife() {} },
  shiki: { bundledLanguages: {}, codeToHtml: async () => '' },
  './code-copy': { default: ({ code }) => createElement('button', { 'data-copy': code }) },
  '@haklex/rich-renderer-codeblock/icons': { LanguageIcon: () => null },
})
const plate = load('plate-content.tsx', {
  '@suzuri/editor/schema': schema,
  '@suzuri/editor/static': staticEntry,
  '../lib/i18n/server': i18n,
  './code-frame': codeFrame,
  './image-lightbox': { default: ({ children }) => createElement('div', { 'data-lightbox': '' }, children) },
  './render-fallback': { default: ({ children }) => children },
  './plate-live-photo': { default: (props) => createElement('span', { 'data-live': props.videoUrl, 'data-cover': props.url }) },
}).default

const fallback = createElement('p', { 'data-fallback': '' }, 'Markdown 兜底')
const render = async (content, variant) => renderToStaticMarkup(await plate({ content, variant, children: fallback }))

const envelope = schema.createEnvelope({
  children: [
    { type: 'heading', level: 2, children: [{ text: '安装' }] },
    { type: 'heading', level: 2, children: [{ text: '安装' }] },
    { type: 'paragraph', children: [{ text: '运行 ' }, { text: 'pnpm dev', code: true }] },
    { type: 'codeBlock', language: 'TS', children: [{ text: 'const a = 1' }] },
    { type: 'image', url: 'https://img.example/a.webp', alt: '星空', width: '60%', children: [{ text: '图注' }] },
    { type: 'livePhoto', url: 'https://img.example/c.jpg', videoUrl: 'https://img.example/c.mp4', children: [{ text: '' }] },
    { type: 'callout', variant: 'warning', icon: '⚠️', children: [{ text: '小心' }] },
    { type: 'equation', latex: 'e^{i\\pi}+1=0', children: [{ text: '' }] },
  ],
})

const html = await render(JSON.stringify(envelope))
assert.ok(html.includes('class="article-body article-plate"'), '外层沿用 Markdown 正文的 article-body')
assert.ok(html.includes('suzuri-root'), 'Suzuri 正文根元素在 .article-plate 里，样式变量只在这里生效')
assert.ok(html.includes('id="安装"') && html.includes('id="安装-2"'), '标题带目录用的 id，重名加序号')
assert.ok(html.includes('class="code-frame"') && html.includes('data-copy="const a = 1"'), '代码块走站内代码框和复制按钮')
assert.ok(/<button type="button" class="plate-zoom" aria-label="星空"><img src="https:\/\/img.example\/a.webp"/.test(html), '图片包成放大按钮')
assert.ok(html.includes('width:60%'), '图片保留调过的宽度')
assert.ok(html.includes('data-live="https://img.example/c.mp4"'), '实况图交给轻量播放器')
assert.ok(html.includes('class="plate-callout" data-tone="warning"') && html.includes('data-variant="warning"'), '提示框按 data-tone 上色，外层保留 data-variant')
assert.ok(html.includes('class="katex'), '公式用 KaTeX 渲染')
assert.equal(html.includes('data-fallback'), false)

const note = await render(JSON.stringify(envelope), 'note')
assert.ok(note.includes('class="article-body article-body-note article-plate"'), '手记沿用衬线正文的类名')

const drifted = structuredClone(envelope)
drifted.schema.fingerprint = 'fnv1a64:0000000000000000'
assert.ok((await render(JSON.stringify(drifted))).includes('id="安装"'), 'Suzuri 升级后指纹漂移的正文照常渲染')

const unknown = { ...envelope, document: { children: [{ type: 'banner', children: [{ text: 'x' }] }] } }
for (const [label, content] of [
  ['坏 JSON', '{oops'],
  ['裸文档', JSON.stringify(envelope.document)],
  ['未知节点', JSON.stringify(unknown)],
  ['不安全链接', JSON.stringify({ ...envelope, document: { children: [{ type: 'paragraph', children: [{ type: 'link', url: 'javascript:alert(1)', children: [{ text: 'x' }] }] }] } })],
  ['别的 schema', JSON.stringify({ ...envelope, schema: { ...envelope.schema, id: 'other' } })],
]) {
  assert.equal(await render(content), '<p data-fallback="">Markdown 兜底</p>', `${label}退回 Markdown`)
}

console.log('PASS Plate body renders with site code frames, zoomable images, callout tones, live photos and KaTeX; invalid envelopes fall back to Markdown')
