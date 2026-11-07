import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

// 根布局出错时的兜底页 app/global-error.tsx（Next 只在根布局本身出错时才用它，开发模式很难在浏览器里触发，所以这里直接渲染组件）：
// 必须自己输出 <html>/<body>；不能依赖站内组件、词典和 globals.css 的变量（那时都没加载）；要有重试（调用 retry）和整页回首页。
const require = createRequire(new URL('../apps/web/package.json', import.meta.url))
const ts = require('typescript')
const { renderToStaticMarkup } = require('react-dom/server')
const source = readFileSync(new URL('../apps/web/app/global-error.tsx', import.meta.url), 'utf8')
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText
const imports = [...code.matchAll(/require\("([^"]+)"\)/g)].map((match) => match[1])
assert.deepEqual(imports.filter((id) => id !== 'react/jsx-runtime'), [], `global-error 不能引用站内模块：${imports}`)
const module = { exports: {} }
vm.runInNewContext(code, { module, exports: module.exports, require })
const GlobalError = module.exports.default
const html = renderToStaticMarkup(require('react').createElement(GlobalError, { error: new Error('x'), retry() {}, reset() {} }))
assert.match(html, /^<html[^>]*lang="zh-CN"[^>]*>(<head>.*<\/head>)?<body/)
assert.match(html, /<\/body><\/html>$/)
assert.ok(!html.includes('var(--'), '不能用 globals.css 的变量')
assert.match(html, /<button[^>]*>重试<\/button>/)
assert.match(html, /<a href="\/"[^>]*>回到首页<\/a>/)
// 重试按钮接的是 retry
let retried = false
const tree = GlobalError({ error: null, retry: () => { retried = true }, reset() {} })
const find = (node) => !node || typeof node !== 'object' ? undefined : node.type === 'button' ? node : [node.props?.children].flat().map(find).find(Boolean)
find(tree).props.onClick()
assert.ok(retried, '重试按钮没有调用 retry')
console.log('PASS global-error renders its own html/body, no site modules or CSS variables, retry and full-reload home link')
