import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readdirSync, readFileSync } from 'node:fs'
import vm from 'node:vm'

// 中文标点旁的加粗、斜体（2026-11-12 巡查发现）：CommonMark 规定 ** 前面是字、后面是标点（了**“…”**之上、引擎（Style）**处理）时
// 不算加粗的开头或结尾，于是正文、RSS、评论、碎碎念里露出 **。本地库 4 篇文章 9 处。全站 Markdown 都加 remark-cjk-friendly。
// ① 结构：apps/web 里每个把 remarkGfm 放进 remarkPlugins 的地方，同一个数组里都有 remarkCjkFriendly（以后新加渲染器不会漏）；
// ② 行为：用真的评论渲染器和 RSS 渲染器渲染库里出现过的几种写法，都得到 <strong>/<em>，不再留下 *。
const web = new URL('../apps/web/', import.meta.url)
const require = createRequire(new URL('package.json', web))
const ts = require('typescript')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')

const files = (dir) => readdirSync(new URL(dir, web), { withFileTypes: true }).flatMap((entry) =>
  entry.isDirectory() ? (entry.name === 'node_modules' || entry.name.startsWith('.') ? [] : files(`${dir}${entry.name}/`)) : /\.tsx?$/.test(entry.name) ? [`${dir}${entry.name}`] : [])
const renderers = []
for (const file of ['components/', 'lib/', 'app/'].flatMap(files)) {
  const source = readFileSync(new URL(file, web), 'utf8')
  for (const [list] of source.matchAll(/remarkPlugins[=:]\s*\{?\[[^\]]*\]/g)) {
    if (!list.includes('remarkGfm')) continue
    renderers.push(file)
    assert.ok(list.includes('remarkCjkFriendly'), `${file} 的 Markdown 没加 remarkCjkFriendly：${list}`)
  }
}
assert.ok(renderers.length >= 4, `应当找到文章、RSS、评论、碎碎念四处 Markdown，只找到：${renderers.join('、')}`)

const load = (file, jsx) => {
  const code = ts.transpileModule(readFileSync(new URL(file, web), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, ...(jsx ? { jsx: ts.JsxEmit.ReactJSX } : {}) } }).outputText
  const module = { exports: {} }
  vm.runInNewContext(code, { module, exports: module.exports, require, URL })
  return module.exports
}
const { default: CommentMarkdown } = load('components/comment-markdown.tsx', true)
const { markdownToFeedHtml } = load('lib/feed.ts')

const samples = [
  ['直接拉升到了**“Chromium 渲染引擎”**之上。', '<strong>“Chromium 渲染引擎”</strong>'],
  ['由浏览器的**样式计算引擎（Style Engine）**处理。', '<strong>样式计算引擎（Style Engine）</strong>'],
  ['里面可以写**任意合法的 JS 表达式（expression）**，不能写语句。', '<strong>任意合法的 JS 表达式（expression）</strong>'],
  ['这是*斜体（注）*的写法。', '<em>斜体（注）</em>'],
]
for (const [text, expected] of samples) {
  const comment = renderToStaticMarkup(React.createElement(CommentMarkdown, { text, zoom: () => '' }))
  assert.ok(comment.includes(expected) && !comment.includes('*'), `评论没认出：${text} → ${comment}`)
  const feed = await markdownToFeedHtml(text, 'https://example.test/posts/a')
  assert.ok(feed.includes(expected) && !feed.includes('*'), `RSS 没认出：${text} → ${feed}`)
}
console.log(`verify-markdown-cjk: 通过（${renderers.length} 处 Markdown 都带中文标点规则）`)
