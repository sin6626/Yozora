import assert from 'node:assert/strict'
import { createHeadlessEditor } from '@lexical/headless'
import { allHeadlessNodes } from '@haklex/rich-headless'
import { $toProjectedMarkdown } from '../apps/core/src/utils/lexical-projection.util.ts'
import { complexDocData } from '../apps/core/test/src/modules/ai/complex-doc-data.ts'
import { collectMedia, toMarkdown, validateDocument } from '../apps/core/node_modules/@suzuri/editor/dist/schema/index.js'
import { lexicalToPlate } from './lib/lexical-to-plate.mjs'

const text = (text, format = 0) => ({ type: 'text', text, format })
const para = (...children) => ({ type: 'paragraph', children })
const state = (...children) => ({ root: { type: 'root', children } })
const convert = (doc) => lexicalToPlate(JSON.stringify(doc))
function converted(doc) {
  const { envelope, report } = convert(doc)
  assert.equal(report.status, 'converted', JSON.stringify(report))
  assert.ok(validateDocument(JSON.stringify(envelope), { requireEnvelope: true }).ok)
  const result = toMarkdown(envelope)
  assert.ok(result.ok, JSON.stringify(result.diagnostics))
  return { nodes: envelope.document.children, envelope, markdown: result.markdown, report }
}

const marks = [[1, 'bold'], [2, 'italic'], [4, 'strikethrough'], [8, 'underline'], [16, 'code'], [128, 'highlight']]
for (const [bit, name] of marks) {
  const { nodes, markdown } = converted(state(para(text('word', bit))))
  assert.deepEqual(nodes[0].children, [{ text: 'word', [name]: true }])
  assert.match(markdown, /word/)
}
for (const [bit, name] of [[32, 'subscript'], [64, 'superscript'], [256, 'lowercase']]) {
  const { envelope, report } = convert(state(para(text('word', bit))))
  assert.equal(envelope, null)
  assert.match(report.unsupported[0].reason, new RegExp(name))
  assert.equal(report.unsupported[0].path, '$.root.children[0].children[0]')
}
assert.deepEqual(converted(state(para(text('both', 3)))).nodes[0].children, [{ text: 'both', bold: true, italic: true }])
const item = (...children) => ({ type: 'listitem', children })
const list = (listType, children, extra) => ({ type: 'list', listType, children, ...extra })
const nested = list('number', [item(text('one')), item(list('check', [
  { ...item(text('done')), checked: true }, { ...item(text('later')), checked: false },
])), item(text('two'))], { start: 4 })
const lists = converted(state(nested, list('bullet', [item(text('other'))])))
assert.deepEqual(lists.nodes.map((n) => [n.listType, n.indent, n.listStart, n.checked]), [
  ['numbered', 1, 4, undefined], ['task', 2, undefined, true], ['task', 2, undefined, false],
  ['numbered', 1, undefined, undefined], ['bulleted', 1, undefined, undefined],
])
assert.equal(lists.nodes[0].listId, lists.nodes[3].listId)
assert.match(lists.markdown, /4\. one\n +\* \[x\] done\n +\* \[ \] later\n5\. two/)

const cell = (s, props) => ({ type: 'tablecell', children: [para(text(s))], ...props })
const row = (...children) => ({ type: 'tablerow', children })
const table = { type: 'table', colWidths: [100, 200, 300], children: [
  row(cell('across', { headerState: 1, colSpan: 2 }), cell('down', { rowSpan: 2 })),
  row(cell('left'), cell('right')),
] }
const grid = converted(state(table))
assert.deepEqual(grid.nodes[0].columnWidths, [100, 200, 300])
assert.equal(grid.nodes[0].children[0].children[0].colSpan, 2)
assert.equal(grid.nodes[0].children[0].children[0].header, true)
assert.equal(grid.nodes[0].children[0].children[1].rowSpan, 2)
for (const value of ['across', 'down', 'left', 'right']) assert.ok(grid.markdown.includes(value))

const cover = { type: 'image', src: 'https://example.test/photo.jpg', altText: '封面', width: 640, height: 480,
  thumbhash: 'AAAA', caption: { editorState: state(para(text('图注', 1))) } }
const movie = { ...cover, type: 'live-photo', videoSrc: 'https://example.test/motion.mp4', caption: '实况图注' }
const media = converted(state(cover, movie))
const attributes = { url: cover.src, alt: '封面', width: 640, naturalWidth: 640, naturalHeight: 480, thumbhash: 'AAAA' }
assert.deepEqual(media.nodes, [
  { type: 'image', ...attributes, children: [{ text: '图注', bold: true }] },
  { type: 'livePhoto', ...attributes, videoUrl: movie.videoSrc, children: [{ text: '实况图注' }] },
])
for (const value of [cover.src, movie.videoSrc]) assert.ok(JSON.stringify(collectMedia(media.envelope)).includes(value))
for (const value of ['图注', '实况图注']) assert.ok(media.markdown.includes(value))

for (const variant of ['note', 'tip', 'important', 'warning', 'caution']) {
  const { nodes, markdown } = converted(state({
    type: 'alert-quote', alertType: variant, content: state(para(text('first', 1)), para(text('second'))),
  }))
  assert.equal(nodes[0].variant, variant)
  assert.ok(nodes[0].icon.trim())
  assert.deepEqual(nodes[0].children, [{ text: 'first', bold: true }, { text: '\n\n' }, { text: 'second' }])
  assert.match(markdown, /first[\s\S]*second/)
}

const panels = { type: 'tab', tabs: [
  { label: 'Linux', content: state(para(text('发行版'))) }, { label: 'macOS', content: state(para(text('苹果'))) },
] }
const mixed = converted(state(para(text('前'), { type: 'linebreak' }, { type: 'katex-inline', equation: 'x+y' },
  { type: 'katex-block', equation: 'E=mc^2' }, panels, text('后')),
  { type: 'link-card', url: 'https://example.test', title: '原文', description: '补充' },
  { type: 'code', language: 'js', children: [text('a'), { type: 'linebreak' }, { type: 'tab', text: '\t' }, text('b')] },
  para({ type: 'autolink', url: 'https://example.test', children: [text('自动')] })))
assert.deepEqual(mixed.nodes.map((n) => n.type), ['paragraph', 'equation', 'heading', 'paragraph', 'heading', 'paragraph', 'paragraph', 'paragraph', 'codeBlock', 'paragraph'])
assert.equal(mixed.nodes[0].children[1].text, '\n')
assert.equal(mixed.nodes[0].children[2].latex, 'x+y')
assert.equal(mixed.nodes[1].latex, 'E=mc^2')
assert.equal(mixed.nodes[8].children[0].text, 'a\n\tb')
assert.match(mixed.markdown, /#### Linux[\s\S]*发行版[\s\S]*#### macOS[\s\S]*苹果/)
assert.match(mixed.markdown, /\[原文\]\(https:\/\/example.test\) — 补充/)

// Use the original Core fixture and Core's real projection for shared blocks.
const sample = state(...complexDocData.root.children.filter((n) => !['mermaid', 'details'].includes(n.type)))
const adapted = converted(sample)
assert.equal(adapted.report.before.banner, 1)
assert.equal(adapted.report.after.callout, 3)
const common = { root: { ...complexDocData.root, children: complexDocData.root.children.slice(0, 1) } }
const editor = createHeadlessEditor({ nodes: allHeadlessNodes, onError(e) { throw e } })
editor.setEditorState(editor.parseEditorState(JSON.stringify(common)))
assert.equal(converted(common).markdown.trim(), editor.read(() => $toProjectedMarkdown(() => '')).trim())
for (const phrase of ['Building a Modern Editor', 'createHeadlessEditor', 'Architecture diagram', 'Three-layer architecture',
  'Performance Tips', 'Version', 'Changes', 'Node separation', 'Official Documentation']) {
  assert.ok(adapted.markdown.includes(phrase), phrase)
}
const bad = convert(state({ type: 'gallery', children: [{ type: 'mermaid' }] }, {
  type: 'alert-quote', alertType: 'tip', content: state({ type: 'unknown' }),
}))
assert.equal(bad.envelope, null)
assert.deepEqual(bad.report.unsupported.map(({ type, path }) => [type, path]), [
  ['gallery', '$.root.children[0]'], ['mermaid', '$.root.children[0].children[0]'],
  ['unknown', '$.root.children[1].content.root.children[0]'],
])
assert.deepEqual({ ...bad.report.after }, {})
assert.equal(bad.report.before.root, 2)
for (const doc of [state(para({ type: 'link', url: 'javascript:alert(1)', children: [text('bad')] })),
  state({ type: 'alert-quote', alertType: 'tip', content: state(table) }), state({ type: 'tab', tabs: [] })]) {
  const result = convert(doc)
  assert.equal(result.envelope, null)
  assert.ok(result.report.error)
}
assert.equal(lexicalToPlate('{').report.status, 'blocked')
console.log('PASS Lexical → Plate mappings, Core projection, path inventory and loss blocking')
