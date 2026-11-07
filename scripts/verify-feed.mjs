import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

// RSS 全文（apps/web/lib/feed.ts）：Markdown 转 HTML、危险内容去掉、相对地址补全、CDATA 里的 ]]> 安全拆开、XML 非法字符去掉。
const require = createRequire(new URL('../apps/web/package.json', import.meta.url))
const ts = require('typescript')
const code = ts.transpileModule(readFileSync(new URL('../apps/web/lib/feed.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
const module = { exports: {} }
vm.runInNewContext(code, { module, exports: module.exports, require, URL })
const { markdownToFeedHtml, cdata, escapeXml } = module.exports

const link = 'https://example.test/posts/tech/hello'
const html = await markdownToFeedHtml([
  '## 标题', '', '**粗体** 与 `code`', '', '| A | B |', '| - | - |', '| 1 | 2 |', '',
  '```js', 'const end = "]]>"', '```', '',
  '![图](https://img.example.test/a.png) ![相对](/media/b.png)', '',
  '[站内](/notes/1) [锚点](#part) [危险](javascript:alert(1))', '',
  '<script>alert(1)</script>', '', '<iframe src="https://evil.test"></iframe>', '', '<img src=x onerror="alert(1)">',
].join('\n'), link)

assert.ok(html.includes('<h2>标题</h2>') && html.includes('<strong>粗体</strong>') && html.includes('<code>code</code>'))
assert.ok(html.includes('<table>') && html.includes('<td>1</td>'), 'GFM 表格')
assert.ok(html.includes('<pre><code class="language-js">'), '代码块带语言')
assert.ok(html.includes('src="https://img.example.test/a.png"'), '绝对图片地址原样保留')
assert.ok(html.includes('src="https://example.test/media/b.png"'), '相对图片地址补成站点绝对地址')
assert.ok(html.includes('href="https://example.test/notes/1"') && html.includes('href="https://example.test/posts/tech/hello#part"'), '相对链接、锚点补全')
assert.ok(!/javascript:/i.test(html), 'javascript: 地址被去掉')
assert.ok(!/<script|<iframe|<img[^>]*onerror/i.test(html), `原始 HTML 不能变成元素：${html}`)

// CDATA：]]> 拆成两段，去掉 CDATA 标记后原文不变，且只在结尾出现一次完整的 ]]>
const raw = 'a ]]> b ]]]> c'
const wrapped = cdata(raw)
assert.equal(wrapped.replace(/<!\[CDATA\[|\]\]>/g, ''), raw)
assert.ok(wrapped.startsWith('<![CDATA[') && wrapped.endsWith(']]>'))
assert.equal(cdata(html).replace(/<!\[CDATA\[|\]\]>/g, ''), html)
// XML 1.0 不允许的控制字符去掉，换行和制表保留
assert.equal(cdata('a\u0000b\u000Bc\n\t'), '<![CDATA[abc\n\t]]>')
assert.equal(escapeXml('<a & "b">\u0008'), '&lt;a &amp; &quot;b&quot;&gt;')
console.log('verify-feed: ok')
