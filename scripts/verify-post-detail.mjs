import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { i18nServer } from './lib/i18n-mock.mjs'

const require = createRequire(new URL('../apps/web/package.json', import.meta.url))
const ts = require('typescript')
const i18n = i18nServer(ts)
const { renderToStaticMarkup } = require('react-dom/server')
const source = readFileSync(new URL('../apps/web/components/post-detail.tsx', import.meta.url), 'utf8')
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText
let failure
let siteCopyright = { text: '本文采用 CC BY-NC-SA 4.0 许可' }
let aiState = { summary: null, languages: [], locale: 'zh', translation: null }
let request
const post = { id: 'post-id', count: { read: 3, like: 1 }, title: '测试', created: '2026-10-22T00:00:00Z', category: { name: '学习', slug: 'study&think' }, text: '## 标题\n\n- 条目\n\n```js\nconst x = 1\n```\n\n| A | B |\n| - | - |\n| 1 | 2 |\n\n[链接](https://example.com)\n\n[危险](javascript:alert(1))\n\n<script>alert(1)</script>', related: [{ id: 'rel-a', title: '关联的那篇', href: '/posts/technology/a' }], copyright: true }
// 正文组件 article-body 用真实代码，富文本渲染器换成替身：只标记收到的 content 并原样输出兜底 children。
const { createElement } = require('react')
const bodyCode = ts.transpileModule(readFileSync(new URL('../apps/web/components/article-body.tsx', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText
const articleBody = { exports: {} }
vm.runInNewContext(bodyCode, {
  module: articleBody, exports: articleBody.exports,
  require: (id) => id.endsWith('.css') ? {} : id === 'next/cache' ? { cacheLife() {} } : id === 'shiki' ? { bundledLanguages: {}, codeToHtml: async () => '' } : id === '../lib/config' ? { getApiUrl: () => 'http://api.test' } : id === './code-copy' ? { default: ({ code }) => createElement('button', { 'data-copy': code }) } : id === '@haklex/rich-renderer-codeblock/icons' ? { LanguageIcon: ({ language }) => createElement('span', { 'data-lang': language }) } : id === './rich-content' ? { default: ({ content, apiUrl, children }) => createElement('div', { 'data-rich': content, 'data-api': apiUrl }, children) } : require(id),
})
const module = { exports: {} }
vm.runInNewContext(code, {
  module, exports: module.exports,
  require: (id) => id.endsWith('.css') ? {} : id === '../lib/i18n/server' ? i18n : id === './load-error' ? { default: function LoadError() {} } : id === './locale-provider' ? { default: (props) => require('react').createElement('a', props) } : id === './article-aside' ? { default: () => null } : id === './article-toc' ? { default: () => null } : id === './island-reading' ? { default: () => null } : id === '../lib/date' ? { formatDate: (v) => String(v) } : id === './notifications' ? { ArticleNotifications: () => null, ReadingCount: () => null, ReadCount: ({ count }) => `阅读 ${count}` } : id === './article-body' ? articleBody.exports : id === './comments' ? { default: () => null } : id === './article-ai' ? { loadArticleAi: async () => aiState, ArticleLanguages: () => null, ArticleAiNotes: () => null } : id === './article-stats' ? { default: ({ read }) => `阅读 ${read}` } : id === './post-copyright' ? { default: ({ license, link, author }) => `${license.text} ${link} ${author}` } : id === './post-outdated' ? { default: () => null } : id === '../lib/config' ? { getApiUrl: () => 'http://api.test' } : id === '../lib/blog-data' ? { getSiteContent: async () => ({ copyright: siteCopyright }), getSiteSettings: async () => ({ ownerName: 'Sin', siteUrl: 'https://example.test' }), getPost: async (...args) => { request = args; if (failure === 'missing') return null; if (failure) throw failure; return post } } : require(id),
})
const render = (category = 'study%26think', slug = 'test') => module.exports.default({ params: Promise.resolve({ category, slug }) })
const html = renderToStaticMarkup(await render())
assert.deepEqual(Array.from(request), ['study%26think', 'test', 'zh'])
assert.ok(html.includes('<h2 id="标题">标题</h2>') && html.includes('<li>条目</li>'), 'Markdown 标题带目录锚点 id')
// 目录锚点：重名标题加序号，去掉标点，空标题退回 section。
const slug = articleBody.exports.createSlugger()
assert.deepEqual(['Hello World!', 'Hello World', '什么是 zod？', '？？'].map(slug), ['hello-world', 'hello-world-1', '什么是-zod', 'section'])
assert.ok(html.includes('<table>') && html.includes('<pre>'))
assert.ok(html.includes('阅读 3'), '详情页显示阅读数')
assert.ok(html.includes('本文采用 CC BY-NC-SA 4.0 许可'), '开了版权注明的文章显示后台写的版权说明')
post.copyright = false
assert.equal(renderToStaticMarkup(await render()).includes('CC BY-NC-SA'), false, '关掉版权注明就不显示')
post.copyright = true
siteCopyright = null
assert.equal(renderToStaticMarkup(await render()).includes('CC BY-NC-SA'), false, '后台没写版权说明就不显示')
siteCopyright = { text: '本文采用 CC BY-NC-SA 4.0 许可' }
assert.ok(html.includes('aria-label="关联阅读"') && html.includes('href="/posts/technology/a"') && html.includes('关联的那篇'), '后台设的关联阅读出现在文末')
assert.ok(html.includes('href="https://example.com"'))
assert.equal(html.includes('<script'), false)
assert.equal(html.includes('href="javascript:'), false)
// 英文页面：有翻译时标题和正文换成译文；没有翻译时显示中文原文，标题与正文标 lang="zh-CN"
aiState = { summary: null, languages: ['en'], locale: 'en', translation: { title: 'Translated', text: '## Heading EN', contentFormat: 'markdown' } }
const translated = renderToStaticMarkup(await render())
assert.ok(translated.includes('>Translated</h1>') && translated.includes('<h2 id="heading-en">Heading EN</h2>'), '有翻译时标题和正文换成译文')
aiState = { summary: null, languages: [], locale: 'en', translation: null, original: 'zh-CN' }
const original = renderToStaticMarkup(await render())
assert.ok(original.includes('lang="zh-CN">测试</h1>') && original.includes('<div lang="zh-CN"><div class="article-body">'), '没有翻译时显示中文原文并标明语言')
aiState = { summary: null, languages: [], locale: 'zh', translation: null }
post.contentFormat = 'lexical'
post.content = '{"root":{"type":"root","version":1,"children":[],"format":"","indent":0,"direction":null}}'
const richHtml = renderToStaticMarkup(await render())
assert.ok(richHtml.includes('data-rich=') && richHtml.includes('data-api="http://api.test"'))
assert.ok(richHtml.includes('<h2 id="标题">标题</h2>'), 'Markdown 作为富文本的兜底 children 传入')
assert.equal(richHtml.includes('简化阅读版'), false)
delete post.content
assert.equal(renderToStaticMarkup(await render()).includes('data-rich='), false, 'lexical 但没有 content 时只用 Markdown')
delete post.text
assert.ok(renderToStaticMarkup(await render()).includes('暂时没有可展示的正文'))
failure = 'missing'
await assert.rejects(render(), (error) => error.digest === 'NEXT_HTTP_ERROR_FALLBACK;404')
failure = new Error('network')
const errorView = await render()
assert.equal(errorView.type.name, 'LoadError')
assert.equal(errorView.props.href, '/posts/study%26think/test')
await assert.rejects(render('%zz'), (error) => error.digest === 'NEXT_HTTP_ERROR_FALLBACK;404')
console.log('PASS detail routes, AI translation follows the site language with Chinese fallback, Markdown/GFM, HTML/script safety, Lexical rich renderer with Markdown fallback, 404 and retry')
