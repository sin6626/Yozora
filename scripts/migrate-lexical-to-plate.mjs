import { mkdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import { toMarkdown } from '../apps/core/node_modules/@suzuri/editor/dist/schema/index.js'
import { lexicalToPlate } from './lib/lexical-to-plate.mjs'

const { MongoClient, BSON } = createRequire(new URL('../apps/core/package.json', import.meta.url))('mongodb')
const richFields = ['contentFormat', 'content', 'text']
const collections = ['posts', 'notes', 'pages', 'ai_translations', 'drafts']

function options(args) {
  const { values } = parseArgs({ args, options: {
    mongo: { type: 'string' }, db: { type: 'string' }, report: { type: 'string' },
    'allow-db': { type: 'string' }, 'dry-run': { type: 'boolean' }, write: { type: 'boolean' },
  } })
  if (!values.mongo?.trim() || !values.db?.trim()) throw new Error('必须显式传入 --mongo 和 --db。')
  if (values.db !== 'sinpersonalspace-verify' && values['allow-db'] !== values.db)
    throw new Error('该库不属于隔离测试库。需要 --allow-db 与 --db 完全相同。')
  if (!values.report?.trim()) throw new Error('必须传入 --report <目录>。')
  if (values.write && values['dry-run']) throw new Error('--write 和 --dry-run 不能同时使用。')
  return values
}

function markdownDiff(previous, next) {
  if (typeof previous !== 'string') return { stored: false, afterChars: next.length }
  let first = 0
  while (first < previous.length && first < next.length && previous[first] === next[first]) first++
  const identical = previous === next
  return {
    stored: true, identical, beforeChars: previous.length, afterChars: next.length,
    ...(!identical && {
      firstChangedLine: previous.slice(0, first).split('\n').length,
      beforeExcerpt: previous.slice(first, first + 80), afterExcerpt: next.slice(first, first + 80),
    }),
  }
}

// Core restores a reference by version, or applies its JSON delta to the
// nearest older full snapshot (and to the live draft when no base exists).
function protectedBases(history) {
  const protectedVersions = new Set()
  for (const [index, entry] of history.entries()) {
    if (entry.isFullSnapshot) continue
    if (entry.refVersion != null) protectedVersions.add(entry.refVersion)
    if (entry.baseVersion != null) protectedVersions.add(entry.baseVersion)
    protectedVersions.add(history.slice(index + 1).find((h) => h.isFullSnapshot)?.version)
  }
  return protectedVersions
}

function planDocument(collection, doc) {
  const rows = []
  const set = {}
  const history = collection === 'drafts' ? doc.history ?? [] : []
  const bases = protectedBases(history)
  function plan(source, prefix, reason) {
    if (source.contentFormat !== 'lexical') return
    const { envelope, report } = lexicalToPlate(source.content)
    const row = {
      collection, id: String(doc._id), title: source.title ?? doc.title ?? '', path: prefix || '$',
      ...(prefix && { version: source.version }), ...report, diff: null,
    }
    rows.push(row)
    if (reason) {
      row.status = 'blocked'
      row.warnings.push(reason)
    }
    if (!envelope || reason) {
      row.after = {}
      return
    }
    const result = toMarkdown(envelope)
    for (const diagnostic of result.diagnostics) row.warnings.push(diagnostic.message)
    if (!result.ok) {
      row.status = 'blocked'
      row.after = {}
      row.error = 'Suzuri 无法生成 Markdown'
      return
    }
    row.diff = markdownDiff(source.text, result.markdown)
    const key = prefix ? prefix + '.' : ''
    set[key + 'contentFormat'] = 'plate'
    set[key + 'content'] = JSON.stringify(envelope)
    set[key + 'text'] = result.markdown
  }
  plan(doc, '', bases.has(undefined) && '历史恢复可能使用当前正文作为基底，须保留原格式。')
  history.forEach((entry, i) => {
    if (entry.isFullSnapshot === true)
      plan(entry, `history.${i}`, bases.has(entry.version) && '差量或引用版本依赖这份全量快照，须保留原格式。')
  })
  return { rows, set }
}

// Preserve BSON types and field absence in the backup. Compare the same
// fields at write time, including the history array before using its indexes.
function originalFields(doc, collection) {
  const fields = collection === 'drafts' ? [...richFields, 'history'] : richFields
  return Object.fromEntries(fields.filter((key) => Object.hasOwn(doc, key)).map((key) => [key, doc[key]]))
}

function markdownReport(report) {
  const lines = [`# Lexical → Plate · ${report.mode}`, '', `数据库 ${report.db}，共有 ${report.documents.length} 项。`]
  if (report.backup) lines.push('', `原始字段备份 ${report.backup}`)
  for (const row of report.documents) {
    lines.push('', `## ${row.collection} / ${row.id} / ${row.path}`, '',
      `${JSON.stringify(row.title)} · ${row.status} · ${row.write}`, '',
      `节点计数 ${JSON.stringify(row.before)} → ${JSON.stringify(row.after)}`, '',
      `Markdown 差异 ${row.diff ? JSON.stringify(row.diff) : '未生成'}`)
    if (row.error) lines.push('', `错误 ${row.error}`)
    for (const entry of row.unsupported) lines.push('', `- ${entry.path} · ${entry.type} · ${entry.reason}`)
    for (const warning of row.warnings) lines.push('', `- ${warning}`)
  }
  return lines.join('\n') + '\n'
}

export async function migrateDatabase(db, { report: dir, write = false }, log = console.log) {
  const stamp = new Date().toISOString().replaceAll(':', '-')
  const output = { db: db.databaseName, mode: write ? 'write' : 'dry-run', documents: [] }
  const pending = []
  for (const collection of collections) {
    const lexical = { contentFormat: 'lexical' }
    const filter = collection === 'drafts'
      ? { $or: [lexical, { history: { $elemMatch: { ...lexical, isFullSnapshot: true } } }] }
      : lexical
    const projection = { title: 1, text: 1, contentFormat: 1, content: 1 }
    if (collection === 'drafts') projection.history = 1
    for await (const doc of db.collection(collection).find(filter, { projection })) {
      const { rows, set } = planDocument(collection, doc)
      for (const row of rows) {
        row.write = row.status === 'blocked' ? 'skipped' : write ? 'pending' : 'dry-run'
        output.documents.push(row)
      }
      if (write && Object.keys(set).length) {
        pending.push({ collection, id: doc._id, original: originalFields(doc, collection), set, rows })
      }
    }
  }
  await mkdir(dir, { recursive: true, mode: 0o700 })
  const fileOptions = { mode: 0o600, flag: 'wx', flush: true }
  if (pending.length) {
    output.backup = `backup-${stamp}.json`
    const documents = pending.map(({ collection, id, original }) => ({ collection, _id: id, original }))
    await writeFile(join(dir, output.backup), BSON.EJSON.stringify({ db: db.databaseName, documents }, { relaxed: false }), fileOptions)
  }
  try {
    for (const { collection, id, original, set, rows } of pending) {
      const filter = { _id: id }
      for (const key of [...richFields, ...(collection === 'drafts' ? ['history'] : [])])
        filter[key] = Object.hasOwn(original, key) ? { $eq: original[key], $exists: true } : { $exists: false }
      const changed = rows.filter((row) => row.write === 'pending')
      // A network failure after updateOne may have reached Mongo already.
      for (const row of changed) row.write = 'unconfirmed'
      const result = await db.collection(collection).updateOne(filter, { $set: set })
      for (const row of changed) row.write = result.matchedCount === 1 ? 'written' : 'conflict'
      if (result.matchedCount !== 1) throw new Error(`${collection}/${id} 在备份后发生变动，已停止写入。`)
    }
  } finally {
    for (const row of output.documents) log(JSON.stringify(row))
    await writeFile(join(dir, `report-${stamp}.json`), JSON.stringify(output, null, 2) + '\n', fileOptions)
    await writeFile(join(dir, `report-${stamp}.md`), markdownReport(output), fileOptions)
  }
  return output
}

if (import.meta.main) {
  let client
  try {
    const args = options(process.argv.slice(2))
    client = new MongoClient(args.mongo, { serverSelectionTimeoutMS: 5000 })
    await client.connect()
    await migrateDatabase(client.db(args.db), args)
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  } finally {
    await client?.close()
  }
}
