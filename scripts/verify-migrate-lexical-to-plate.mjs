import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtemp, readFile, readdir, rmdir, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { createHeadlessEditor } from '@lexical/headless'
import { allHeadlessNodes } from '@haklex/rich-headless'
import { $toProjectedMarkdown } from '../apps/core/src/utils/lexical-projection.util.ts'
import { complexDocData } from '../apps/core/test/src/modules/ai/complex-doc-data.ts'
import { collectMedia, toMarkdown, validateDocument } from '../apps/core/node_modules/@suzuri/editor/dist/schema/index.js'
import { lexicalToPlate } from './lib/lexical-to-plate.mjs'
import { migrateDatabase } from './migrate-lexical-to-plate.mjs'

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
const restarted = converted(state(list('number', [item(text('first')), { ...item(text('later')), value: 9 }])))
assert.equal(restarted.nodes[1].listRestart, 9)
assert.match(converted(state(para(text('a'), { type: 'linebreak' }, text('b')))).markdown, /a\\\nb/)

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
assert.ok(media.markdown.includes(`![封面](${cover.src})`), '带尺寸的图片投影为标准 Markdown')
assert.doesNotMatch(media.markdown, /<img\b/i)
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

// Real content: left/start alignment is the LTR default and carries no information.
const aligned = (format) => ({ ...para(text('左')), format })
const defaults = converted(state(aligned('left'), aligned('start'), { type: 'heading', tag: 'h2', format: 'start', children: [text('标题')] },
  { type: 'quote', format: 'start', children: [text('引用')] }, list('bullet', [{ ...item(text('项')), format: 'start' }], { format: 'start' })))
assert.deepEqual(defaults.nodes.map((n) => n.type), ['paragraph', 'paragraph', 'heading', 'blockquote', 'paragraph'])
assert.ok(defaults.nodes.every((n) => !Object.hasOwn(n, 'format') && !Object.hasOwn(n, 'align')))
assert.ok(defaults.report.warnings.some((w) => /alignment/.test(w)))
for (const format of ['center', 'right', 'end', 'justify']) assert.equal(convert(state(aligned(format))).report.status, 'blocked', format)
assert.equal(convert(state({ ...aligned('start'), direction: 'rtl' })).report.status, 'blocked')
console.log('PASS default alignment dropped, real alignment still blocks')

// Markdown import stores the source bullet character as node state; Suzuri lists have one marker.
const marked = converted(state(list('bullet', [item(text('星'))], { $: { mdListMarker: '*', blockId: 'x' } })))
assert.equal(marked.nodes[0].listType, 'bulleted')
assert.ok(marked.report.warnings.some((w) => /mdListMarker/.test(w)))
assert.equal(convert(state(list('bullet', [item(text('星'))], { $: { mdListMarker: '*', other: 1 } }))).report.status, 'blocked')

// Lexical $toggleLink writes rel=noreferrer by default (three real notes); the link itself survives.
const linkWith = (props) => state(para({ type: 'link', url: 'https://example.test', children: [text('链')], ...props }))
for (const rel of ['noreferrer', 'noopener noreferrer']) {
  const { nodes, report } = converted(linkWith({ rel, target: null }))
  assert.deepEqual(nodes[0].children[0], { type: 'link', url: 'https://example.test', children: [{ text: '链' }] })
  assert.ok(report.warnings.some((w) => w.includes(`rel=${rel}`)))
}
for (const props of [{ rel: 'nofollow' }, { title: '提示' }, { rel: 'noopener', target: '_self' }])
  assert.equal(convert(linkWith(props)).report.status, 'blocked', JSON.stringify(props))
console.log('PASS editor-default link rel, markdown list marker')

// Real posts pasted from Windows keep stray carriage returns. Haklex shows them as collapsed
// whitespace; Chrome breaks the line on a CR in Suzuri's pre-wrap text, leaving empty bullets.
const crs = converted(state(
  list('bullet', [item(text('\rZustand 还有')), item(text('一样\r的数据')), item(text('Vue', 1), text('\r'), text('React'))]),
  { type: 'heading', tag: 'h2', children: [text('标题\r')] }, para(text('\r\r'))))
assert.deepEqual(crs.nodes.map((n) => n.children.map((c) => c.text)), [['Zustand 还有'], ['一样 的数据'], ['Vue', ' ', 'React'], ['标题'], ['']])
assert.ok(!crs.markdown.includes('\r') && !crs.markdown.includes('&#xD;'))
assert.equal(converted(state({ type: 'code', children: [text('a\r'), { type: 'linebreak' }, text('b')] })).nodes[0].children[0].text, 'a\nb')
console.log('PASS stray carriage returns')
console.log('PASS Lexical → Plate mappings, Core projection, path inventory and loss blocking')

const cli = 'scripts/migrate-lexical-to-plate.mjs'
for (const [args, rejection] of [
  [[], /--mongo 和 --db/],
  [['--mongo', 'unused', '--db', 'other', '--allow-db', 'mismatch'], /--allow-db/],
  [['--mongo', 'unused', '--db', 'other', '--allow-db', 'other'], /--report/],
  [['--mongo', 'unused', '--db', 'sinpersonalspace-verify', '--report', '.', '--write', '--dry-run'], /不能同时/],
]) {
  const run = spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' })
  assert.equal(run.status, 1)
  assert.match(run.stderr, rejection)
}

const { ObjectId, BSON } = createRequire(new URL('../apps/core/package.json', import.meta.url))('mongodb')
const source = { contentFormat: 'lexical', content: JSON.stringify(state(para(text('正文')))), text: '旧投影' }
const draft = { _id: new ObjectId(), title: '草稿', ...source, history: [
  { ...source, version: 4, isFullSnapshot: true },
  { version: 3, isFullSnapshot: false, refVersion: 2, baseVersion: 2, contentFormat: 'lexical' },
  { ...source, version: 2, isFullSnapshot: true },
] }
// Exercise planning, file persistence and compare-before-write with an in-memory
// collection double. No Mongo client or listener is created.
async function checkDatabase(write, conflict = false) {
  const dir = await mkdtemp(join(process.cwd(), '.verify-lexical-'))
  const collections = []
  const logged = []
  let writes = 0
  const db = { databaseName: 'sinpersonalspace-verify', collection(name) {
    return {
      find(filter) {
        collections.push(name)
        if (name === 'drafts') {
          assert.deepEqual(filter.$or[1].history.$elemMatch, { contentFormat: 'lexical', isFullSnapshot: true })
          return [draft, { ...draft, _id: new ObjectId(), contentFormat: 'markdown', history: [draft.history[0]] }]
        }
        assert.deepEqual(filter, { contentFormat: 'lexical' })
        if (name === 'posts') return [{ _id: new ObjectId(), ...source, content: JSON.stringify(state({ type: 'gallery' })) }]
        return []
      },
      async updateOne(filter, update) {
        writes++
        assert.equal(name, 'drafts')
        const backupFile = (await readdir(dir)).find((file) => file.startsWith('backup-'))
        const backup = BSON.EJSON.parse(await readFile(join(dir, backupFile), 'utf8'))
        assert.ok(backup.documents[0]._id.equals(draft._id))
        assert.deepEqual(backup.documents[0].original.history, draft.history)
        assert.deepEqual(filter.history.$eq, writes === 1 ? draft.history : [draft.history[0]])
        const set = update.$set
        assert.equal(set['history.0.contentFormat'], 'plate')
        assert.equal(Object.hasOwn(set, 'history.2.content'), false, 'keep referenced baseline')
        assert.equal(Object.hasOwn(set, 'history.1.content'), false, 'keep delta')
        if (writes === 1) {
          assert.equal(set.contentFormat, 'plate')
          assert.equal(set.text.trim(), '正文')
        } else assert.equal(Object.hasOwn(set, 'content'), false)
        return { matchedCount: conflict ? 0 : 1 }
      },
    }
  } }
  try {
    const run = migrateDatabase(db, { report: dir, write }, (line) => logged.push(JSON.parse(line)))
    if (conflict) await assert.rejects(run, /备份后发生变动/)
    else await run
    assert.deepEqual(collections, ['posts', 'notes', 'pages', 'ai_translations', 'drafts'])
    assert.equal(writes, write ? conflict ? 1 : 2 : 0)
    const files = await readdir(dir)
    assert.equal(files.some((f) => f.startsWith('backup-')), write)
    const persisted = JSON.parse(await readFile(join(dir, files.find((f) => /^report-.*\.json$/.test(f))), 'utf8'))
    assert.deepEqual(persisted.documents, logged)
    assert.equal(logged[0].write, 'skipped')
    assert.equal(logged[1].diff.firstChangedLine, 1)
    assert.equal(logged[1].write, write ? conflict ? 'conflict' : 'written' : 'dry-run')
    assert.equal(logged[3].write, 'skipped')
    const md = await readFile(join(dir, files.find((f) => f.endsWith('.md'))), 'utf8')
    for (const token of ['gallery', 'history.2', '差量', '旧投影']) assert.ok(md.includes(token))
  } finally {
    for (const file of await readdir(dir)) await unlink(join(dir, file))
    await rmdir(dir)
  }
}
await checkDatabase(false)
await checkDatabase(true)
await checkDatabase(true, true)
console.log('PASS dry-run reports, BSON backup before writes, snapshot dependencies and concurrent edits (offline)')
