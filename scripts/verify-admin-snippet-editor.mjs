// 后台“配置与云函数”的片段编辑器（apps/admin/src/views/extra-features/snippets/composables/use-snippet-editor.ts）
// 和“Yozora 主题”表单都能改 theme/yozora：谁拿着旧内容保存，都不能静默盖掉另一边的修改。
// 这里用假的 snippetsApi 模拟 Core 的 baseRaw 规则（库里 raw 不等于 baseRaw 就 409）。用法：node scripts/verify-admin-snippet-editor.mjs（已并入 pnpm verify）
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

const require = createRequire(new URL('../apps/web/package.json', import.meta.url))
const ts = require('typescript')
const transpile = (path) => ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
const load = (path, mocks = {}) => {
  const module = { exports: {} }
  vm.runInNewContext(transpile(path), { module, exports: module.exports, require: (id) => { if (!(id in mocks)) throw new Error(`没有替身：${id}`); return mocks[id] } })
  return module.exports
}

class BusinessError extends Error {
  constructor(message, statusCode) { super(message); this.statusCode = statusCode }
}
let database
const sent = []
const toasts = []
const api = {
  getById: async () => structuredClone(database),
  getGroupSnippets: async () => [structuredClone(database)],
  update: async (id, data) => {
    sent.push(structuredClone(data))
    if (data.baseRaw !== undefined && data.baseRaw !== database.raw) throw new BusinessError('配置片段已在别处被修改，请重新读取后再保存', 409)
    const { baseRaw, ...rest } = data
    database = { ...database, ...rest }
    return structuredClone(database)
  },
  create: async (data) => { sent.push(structuredClone(data)); return { ...data, id: 'created' } },
}
const ref = (value) => ({ value })
const editorModule = load('../apps/admin/src/views/extra-features/snippets/composables/use-snippet-editor.ts', {
  'es-toolkit/compat': { omit: (object, keys) => Object.fromEntries(Object.entries(object).filter(([key]) => !keys.includes(key))) },
  'js-yaml': { dump: JSON.stringify, load: JSON.parse },
  json5: { default: { parse: JSON.parse, stringify: JSON.stringify } },
  vue: { ref, computed: (get) => ({ get value() { return get() } }), reactive: (value) => value, watch: () => {} },
  'vue-sonner': { toast: { success: (text) => toasts.push(['success', text]), error: (text) => toasts.push(['error', text]) } },
  '~/api': { snippetsApi: api },
  '~/utils/request': { BusinessError },
  '../../../../models/snippet': { SnippetModel: class { type = 'json'; raw = '{}' }, SnippetType: { JSON: 'json', JSON5: 'json5', Function: 'function', YAML: 'yaml', Text: 'text' }, defaultServerlessFunction: '' },
})
const form = load('../apps/admin/src/views/extra-features/yozora-theme/theme-form.ts')
const start = () => {
  database = { id: 'yozora', type: 'json', name: 'yozora', reference: 'theme', raw: JSON.stringify({ footer: { motto: 'old' }, techStack: { rows: [] } }) }
  sent.length = 0
  toasts.length = 0
}
// 和主题页 save() 一样：只改的那项套到最新内容上，带 baseRaw
const saveThemeForm = async (openedRaw, edit) => {
  const initial = form.readThemeForm(openedRaw)
  const next = structuredClone(initial)
  edit(next)
  const latest = await api.getById('yozora')
  const result = form.applyThemeChanges(openedRaw, latest.raw, form.themeChanges(initial, next))
  if (!result.raw) return result
  return api.update('yozora', { ...latest, raw: result.raw, baseRaw: latest.raw })
}

// 顺序一：先打开 JSON 编辑器 → 主题表单保存新页脚 → 回到旧编辑器只加图标行再保存
start()
const editor = editorModule.useSnippetEditor(ref('yozora'))
await editor.fetchSnippet('yozora')
await saveThemeForm(database.raw, (next) => { next.zh.motto = 'new from theme form' })
const edited = JSON.stringify({ footer: { motto: 'old' }, techStack: { rows: [[{ name: 'Vue', icon: 'skill-icons:vuejs-dark' }]] } }, null, 2)
editor.updateEditorValue(edited)
assert.equal(await editor.save(), null, '旧编辑器保存被拒绝')
assert.equal(sent.at(-1).baseRaw, JSON.stringify({ footer: { motto: 'old' }, techStack: { rows: [] } }), 'JSON 编辑器保存时带上打开时 Core 里的原文（不是编辑器里格式化过的）')
assert.equal(JSON.parse(database.raw).footer.motto, 'new from theme form', '主题表单的新页脚没有被旧编辑器盖掉')
assert.equal(editor.editorValue.value, edited, '没保存的编辑还在编辑器里')
assert.ok(toasts.some(([kind, text]) => kind === 'error' && text.includes('别处')), `提示是因为别处改过：${JSON.stringify(toasts)}`)

// 重新读取后再改就能保存，之后接着改也不会被自己上一次的保存挡住
await editor.fetchSnippet('yozora')
editor.updateEditorValue(JSON.stringify({ ...JSON.parse(database.raw), techStack: { rows: [[{ name: 'Vue', icon: 'skill-icons:vuejs-dark' }]] } }, null, 2))
assert.ok(await editor.save(), '重新读取后保存成功')
assert.deepEqual(JSON.parse(database.raw), { footer: { motto: 'new from theme form' }, techStack: { rows: [[{ name: 'Vue', icon: 'skill-icons:vuejs-dark' }]] } })
editor.updateEditorValue(JSON.stringify({ ...JSON.parse(database.raw), copyright: 'x' }, null, 2))
assert.ok(await editor.save(), '同一个编辑器连续保存两次都成功')

// 顺序二：先打开主题表单 → JSON 编辑器保存 → 主题表单再保存同一项：报冲突，不覆盖
start()
const openedByForm = database.raw
const editor2 = editorModule.useSnippetEditor(ref('yozora'))
await editor2.fetchSnippet('yozora')
editor2.updateEditorValue(JSON.stringify({ footer: { motto: 'from json editor' }, techStack: { rows: [] } }, null, 2))
assert.ok(await editor2.save())
const conflict = await saveThemeForm(openedByForm, (next) => { next.zh.motto = 'from theme form' })
assert.deepEqual(JSON.parse(JSON.stringify(conflict.conflicts ?? null)), [['footer', 'motto']], `主题表单改同一项：报冲突 ${JSON.stringify(conflict)}`)
assert.equal(JSON.parse(database.raw).footer.motto, 'from json editor', 'JSON 编辑器的修改没有被盖掉')

// 新建片段没有旧版本，不带 baseRaw
start()
const creator = editorModule.useSnippetEditor(ref(null))
creator.updateEditorValue('{"a":1}')
assert.ok(await creator.save())
assert.equal('baseRaw' in sent.at(-1), false, '新建不带 baseRaw')
console.log('PASS admin snippet editor and Yozora theme form never silently overwrite each other; stale saves are refused and edits stay in the editor')
