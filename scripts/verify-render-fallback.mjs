// 真实的 RenderFallback（apps/web/components/render-fallback.tsx）在 Plate 正文通过校验、渲染时才出错的情况下兜底：
// ① 服务端：正文里的 Server Component 抛错（这里让代码框抛），用 Next 同款的流式渲染（renderToReadableStream）整页渲染，
//    页面不报错，正文换成 Markdown，正文外面的内容照常在 HTML 里——不会整段换成外层 Suspense 的“读取中”；
// ② 浏览器：接手服务端出错的那段时再渲染一次仍出错，ErrorBoundary 换成 Markdown；
// ③ 浏览器：Client Component（实况图播放器）只在浏览器里抛错，同样换成 Markdown，页面其他部分不受影响。
// verify-plate-content.mjs 为了用 renderToStaticMarkup 把它换成了直接返回 children 的替身，这里补上真实边界。
// 用法：node scripts/verify-render-fallback.mjs（已并入 pnpm verify）
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import { i18nServer } from './lib/i18n-mock.mjs'

const web = new URL('../apps/web/', import.meta.url)
const require = createRequire(new URL('package.json', web))
const ts = require('typescript')
const React = require('react')
const { createElement: h, Suspense } = React
const { renderToReadableStream } = require('react-dom/server')
const dist = new URL('node_modules/@suzuri/editor/dist/', web)
const schema = await import(new URL('schema/index.js', dist))
const staticEntry = await import(new URL('static/index.js', dist))

const load = (file, mocks = {}) => {
  const module = { exports: {} }
  const code = ts.transpileModule(readFileSync(new URL(`components/${file}`, web), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText
  vm.runInNewContext(code, { module, exports: module.exports, require: (id) => (id.endsWith('.css') ? {} : id in mocks ? mocks[id] : require(id)) })
  return module.exports
}
const RenderFallback = load('render-fallback.tsx').default
const LivePhoto = ({ videoUrl }) => {
  if (typeof window !== 'undefined' && window.__clientBoom) throw new Error('client boom')
  return h('span', { 'data-live': videoUrl })
}
const plate = (codeFrame) => load('plate-content.tsx', {
  '@suzuri/editor/schema': schema,
  '@suzuri/editor/static': staticEntry,
  '../lib/i18n/server': i18nServer(ts),
  './code-frame': { default: codeFrame, canHighlight: () => false, highlight: async () => '' },
  './image-lightbox': { default: ({ children }) => h('div', null, children) },
  './render-fallback': { default: RenderFallback },
  './plate-live-photo': { default: LivePhoto },
}).default

const envelope = JSON.stringify(schema.createEnvelope({ children: [
  { type: 'heading', level: 2, children: [{ text: 'Plate 标题' }] },
  { type: 'codeBlock', language: 'ts', children: [{ text: 'const a = 1' }] },
  { type: 'livePhoto', url: 'https://img.example/c.jpg', videoUrl: 'https://img.example/c.mp4', children: [{ text: '' }] },
] }))
const fallback = h('p', { 'data-fallback': '' }, 'Markdown 兜底')
// 详情页的样子：正文外面有标题、文末，整段在一个 Suspense 里
const page = async (Plate) => h(Suspense, { fallback: h('p', null, '外层读取中') },
  h('article', null, h('h1', null, '文章标题'), await Plate({ content: envelope, children: fallback }), h('footer', null, '文末')))

const ssr = async (tree) => {
  const errors = []
  const stream = await renderToReadableStream(tree, { onError: (error) => { errors.push(error.message) } })
  await stream.allReady
  return { html: await new Response(stream).text(), errors }
}

// ① 服务端子组件抛错
const Boom = () => { throw new Error('server boom') }
const server = await ssr(await page(plate(Boom)))
assert.deepEqual(server.errors, ['server boom'], '错误照常上报（Next 会记日志）')
assert.ok(server.html.includes('文章标题') && server.html.includes('文末'), '正文外面的内容还在 HTML 里')
assert.equal(server.html.includes('外层读取中'), false, '不会整段换成外层的读取中')
assert.equal(server.html.includes('Plate 标题'), false)
assert.equal(server.html.includes('Markdown 兜底'), false, '占位是空的（正常流式时不会先露出 Markdown），出错的正文由浏览器接手后换成 Markdown（见②）')

// 正常时照常是 Plate 正文
const fine = await ssr(await page(plate(({ code }) => h('pre', null, code))))
assert.deepEqual(fine.errors, [])
assert.ok(fine.html.includes('Plate 标题') && !fine.html.includes('Markdown 兜底'), '没出错时不显示兜底')

// ②③ 浏览器：在 linkedom 里接手服务端 HTML
const { parseHTML } = createRequire(new URL('../apps/core/package.json', import.meta.url))('linkedom')
const { createRoot, hydrateRoot } = require('react-dom/client')
const browser = async (html, tree) => {
  const dom = parseHTML(`<!doctype html><html><body><div id="root">${html}</div></body></html>`)
  Object.assign(globalThis, { window: dom.window, document: dom.document, HTMLElement: dom.HTMLElement, Node: dom.Node, IS_REACT_ACT_ENVIRONMENT: true })
  const caught = []
  const root = document.getElementById('root')
  const options = { onCaughtError: (error) => caught.push(error.message), onRecoverableError: () => {}, onUncaughtError: (error) => caught.push(`uncaught ${error.message}`) }
  await React.act(async () => { html ? hydrateRoot(root, tree, options) : createRoot(root, options).render(tree) })
  return { html: root.innerHTML, caught }
}
const quiet = console.error
console.error = () => {}
try {
  // ② 服务端出错的那段由浏览器重新渲染，Server Component 的错误在浏览器里同样抛出
  const serverTree = await page(plate(Boom))
  const hydrated = await browser(server.html, serverTree)
  assert.deepEqual(hydrated.caught, ['server boom'], 'ErrorBoundary 接住')
  assert.ok(hydrated.html.includes('Markdown 兜底') && hydrated.html.includes('文末'), '浏览器里仍是 Markdown，页面其他部分在')

  // ③ 服务端正常，只有浏览器里的 Client Component 抛错
  const clientTree = await page(plate(({ code }) => h('pre', null, code)))
  window.__clientBoom = true
  const client = await browser('', clientTree)
  assert.deepEqual(client.caught, ['client boom'], 'ErrorBoundary 接住 Client Component 的错误')
  assert.ok(client.html.includes('Markdown 兜底') && client.html.includes('文章标题') && client.html.includes('文末'), '正文换成 Markdown，其余照常')
  assert.equal(client.html.includes('Plate 标题'), false)
} finally {
  console.error = quiet
  for (const key of ['window', 'document', 'HTMLElement', 'Node', 'IS_REACT_ACT_ENVIRONMENT']) delete globalThis[key]
}

console.log('PASS real RenderFallback: server and client render errors inside a valid Plate body fall back to Markdown without taking down the page')
