// 读出前台界面文字的中文原文（apps/web/lib/i18n/messages/zh.ts），拍平成“条目名 → 中文”，推给 Core、检查脚本都用它
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import vm from 'node:vm'

const root = new URL('../../', import.meta.url)
const require = createRequire(new URL('apps/web/package.json', root))
const ts = require('typescript')

export function runTs(path, requireMap = {}) {
  const source = readFileSync(new URL(path, root), 'utf8')
  const module = { exports: {} }
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText
  vm.runInNewContext(code, { module, exports: module.exports, require: (id) => requireMap[id] ?? require(id) })
  return module.exports
}

export function loadI18n() {
  const msg = runTs('apps/web/lib/i18n/msg.ts')
  const zh = runTs('apps/web/lib/i18n/messages/zh.ts', { '../msg': msg }).default
  return { msg, zh, source: msg.flatten(zh) }
}
