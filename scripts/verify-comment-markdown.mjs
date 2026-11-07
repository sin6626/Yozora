import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

// 评论正文的 Markdown 放行规则（apps/web/components/comment-markdown.tsx，直接用真的 react-markdown 渲染）：
// 常见 GFM 都显示；图片只留 http(s)，懒加载、包成放大按钮；javascript: 等协议的链接和图片去掉；原始 HTML 只显示成文字、不变成元素；
// 链接新标签页且带 nofollow ugc；读者写的标题降三级。
const require = createRequire(new URL('../apps/web/package.json', import.meta.url))
const ts = require('typescript')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const source = readFileSync(new URL('../apps/web/components/comment-markdown.tsx', import.meta.url), 'utf8')
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText
const module = { exports: {} }
vm.runInNewContext(code, { module, exports: module.exports, require })
const { default: CommentMarkdown, commentUrl } = module.exports
const render = (text) => renderToStaticMarkup(React.createElement(CommentMarkdown, { text, zoom: (alt) => `放大图片${alt ? `：${alt}` : ''}` }))

// 图片：http(s) 保留，懒加载、不带来源，包成放大按钮
const image = render('看 ![月亮](https://example.com/moon.png)')
assert.match(image, /<button type="button" class="comment-zoom" aria-label="放大图片：月亮"><img src="https:\/\/example.com\/moon.png" alt="月亮" loading="lazy" decoding="async" referrerPolicy="no-referrer"\/><\/button>/i)
// 非 http(s) 的图片去掉
for (const src of ['javascript:alert(1)', 'data:image/png;base64,AAAA', '//evil.example/x.png', '/local.png']) {
  assert.ok(!render(`![x](${src})`).includes('<img'), `图片 ${src} 不应当显示`)
}
// 链接：javascript: 去掉（只留文字），http(s)/mailto 新标签页 + nofollow ugc
const evil = render('[点我](javascript:alert(1))')
assert.ok(!evil.includes('javascript:') && !evil.includes('<a'), `javascript: 链接应当去掉：${evil}`)
assert.match(evil, /点我/)
assert.match(render('[站点](https://example.com)'), /<a href="https:\/\/example.com" target="_blank" rel="noopener noreferrer nofollow ugc">站点<\/a>/)
assert.match(render('<https://example.com>'), /<a href="https:\/\/example.com" target="_blank"/)
assert.match(render('[信](mailto:a@b.c)'), /href="mailto:a@b.c"/)
// 原始 HTML 不变成元素，原样显示成文字
const html = render('写 <b>粗</b> 和 <script>alert(1)</script> <img src=x onerror=alert(1)>')
assert.ok(!/<(b|script)\b/.test(html) && !/<img/.test(html), `原始 HTML 不应当变成元素：${html}`)
assert.match(html, /&lt;b&gt;/)
// 常见 GFM
const gfm = render('# 标题\n\n## 小标题\n\n- 一\n- 二\n\n1. 甲\n\n> 引用\n\n`code` ~~删掉~~\n\n```js\nlet a = 1\n```\n\n| 名 | 值 |\n| - | - |\n| a | 1 |\n\n---')
for (const tag of ['<h3 class="comment-heading">标题</h3>', '<h4 class="comment-heading">小标题</h4>', '<ul>', '<ol>', '<blockquote>', '<code>code</code>', '<del>删掉</del>', '<pre><code class="language-js">', '<div class="comment-table"><table>', '<th>名</th>', '<td>1</td>', '<hr/>']) {
  assert.ok(gfm.includes(tag), `应当渲染 ${tag}：${gfm}`)
}
// 公用的放行函数
assert.equal(commentUrl('https://a.b/c.png', 'src'), 'https://a.b/c.png')
assert.equal(commentUrl('javascript:alert(1)', 'href'), '')
console.log('PASS comment markdown keeps http(s) images, common GFM, drops javascript: and raw HTML elements')
