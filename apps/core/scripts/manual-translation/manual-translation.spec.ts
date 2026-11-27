// 不用 AI 接口、由人（或 Agent）翻译文章 / 手记 / 页面，写进 Core 的 ai_translations，和后台 AI 翻译的结果完全同一种数据：
// 解析、还原、哈希都调用 Core 自己的代码，所以 Core 会把它当成有效译文（哈希对得上），列表、详情、按语言请求都会用上。
//
// 第一步 extract：把原文拆成要翻译的片段，写到 .local/manual-translation/<id>.source.json
//   MT_MODE=extract MT_IDS=<id>,<id> npx vitest run --config scripts/manual-translation/vitest.config.ts
// 第二步：照着 source.json 写 <id>.<lang>.json：{ title, subtitle?, summary?, tags?, text?（Markdown 原文时）, entries?（Lexical 时，片段 id → 译文），
//   overrides?（Lexical 时，Core 的提取器不管的字段，按路径直接替换，如 { "root.children.45.caption": "…" }：图片说明、标签、链接卡片描述等） }
// 第三步 apply：写入 Core（已有同语言译文时跳过，MT_FORCE=1 覆盖）
//   MT_MODE=apply MT_IDS=<id> MT_LANGS=en,ja [MT_MODEL=...] npx vitest run --config scripts/manual-translation/vitest.config.ts
// 刷新 refresh：给前台发 CONTENT_REFRESH，所有公开缓存失效（直接改了库里的翻译条目等、Core 不发事件时用）
//   MT_MODE=refresh npx vitest run --config scripts/manual-translation/vitest.config.ts
// 检查 check：对已有译文按同样的方法重算哈希，和库里的比较（用来确认这里的算法和 Core 一致）
//   MT_MODE=check MT_IDS=<id> MT_LANGS=en npx vitest run --config scripts/manual-translation/vitest.config.ts
// 写入后像 Core 一样给订阅了 TRANSLATION_CREATE / TRANSLATION_UPDATE 的 Webhook 发事件（用库里的密钥签名），前台缓存随之失效。
// 默认连本地开发库（pnpm dev 的 Mongo 27018、shrio-import-20261014），MONGO / DB 环境变量可改。
import { createHmac } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { MongoClient } from 'mongodb'
import type { Db } from 'mongodb'
import { test } from 'vitest'

import {
  parseLexicalForTranslation,
  restoreLexicalTranslation,
} from '~/modules/ai/ai-translation/lexical-translation-parser'
import { LexicalService } from '~/processors/helper/helper.lexical.service'
import { ContentFormat } from '~/shared/types/content-format.type'
import { computeContentHash } from '~/utils/content.util'
import { md5 } from '~/utils/tool.util'
import { findArticle, type Article } from './source'

const mode = process.env.MT_MODE
const ids = (process.env.MT_IDS ?? '').split(',').filter(Boolean)
const langs = (process.env.MT_LANGS ?? '').split(',').filter(Boolean)
const dir = resolve(__dirname, '../../../../.local/manual-translation')
const lexical = new LexicalService()

// 与 Core 的 BaseTranslationService.toArticleContent 相同：没有的字段是 undefined
function source(doc: Record<string, any>) {
  return {
    title: doc.title,
    text: doc.text,
    subtitle: doc.subtitle ?? undefined,
    summary: doc.summary ?? undefined,
    tags: doc.tags,
    contentFormat: doc.contentFormat,
    content: doc.content,
  }
}

const isLexical = (doc: Record<string, any>) => doc.contentFormat === ContentFormat.Lexical && doc.content

function extract({ refType, doc }: Article, id: string) {
  const entries: Record<string, string> = {}
  if (isLexical(doc)) {
    const { segments, propertySegments } = parseLexicalForTranslation(doc.content)
    for (const segment of segments) if (segment.translatable) entries[segment.id] = segment.text
    for (const property of propertySegments) entries[property.id] = property.text
  }
  const content = source(doc)
  const file = resolve(dir, `${id}.source.json`)
  writeFileSync(file, `${JSON.stringify({ refType, title: content.title, subtitle: content.subtitle, summary: content.summary, tags: content.tags, contentFormat: content.contentFormat, ...(isLexical(doc) ? { entries } : { text: content.text }) }, null, 2)}\n`)
  console.log(`extract ${id} → ${file}（${Object.keys(entries).length} 个片段）`)
}

// Lexical 译文的 text 是给搜索、RSS 等用的 Markdown（前台正文用 content）。Core 的转换器遇到它不认识的旧节点会整篇拒绝
// （AI 翻译时也一样会失败），这时退回按块拼出的纯文本，并打印原因。
function toMarkdown(content: string) {
  try {
    return lexical.lexicalToMarkdown(content)
  } catch (error) {
    const blocks: string[] = []
    const walk = (node: any): string => (node.type === 'text' ? node.text ?? '' : (node.children ?? []).map(walk).join(''))
    for (const block of JSON.parse(content).root?.children ?? []) {
      const text = walk(block).trim()
      if (text) blocks.push(text)
    }
    console.log(`Markdown 转换失败（${(error as Error).message}），text 改用纯文本`)
    return blocks.join('\n\n')
  }
}

// 路径形如 root.children.45.caption；路径不存在或原值不是字符串时报错，避免写错位置
function applyOverrides(content: string, overrides: Record<string, string>) {
  const state = JSON.parse(content)
  for (const [path, value] of Object.entries(overrides)) {
    const keys = path.split('.')
    const parent = keys.slice(0, -1).reduce((node: any, key) => node?.[key], state)
    const last = keys.at(-1)!
    if (typeof parent?.[last] !== 'string') throw new Error(`overrides 路径不对：${path}`)
    parent[last] = value
  }
  return JSON.stringify(state)
}

function build({ doc }: Article, translated: Record<string, any>) {
  const content = source(doc)
  const result: Record<string, any> = {
    title: translated.title ?? content.title,
    subtitle: translated.subtitle ?? content.subtitle,
    summary: translated.summary ?? content.summary,
    tags: translated.tags ?? content.tags,
  }
  if (isLexical(doc)) {
    const parsed = parseLexicalForTranslation(doc.content)
    const missing = [...parsed.segments.filter((s) => s.translatable).map((s) => s.id), ...parsed.propertySegments.map((p) => p.id)].filter((key) => !(key in (translated.entries ?? {})))
    if (missing.length) throw new Error(`还有 ${missing.length} 个片段没翻：${missing.slice(0, 10).join(', ')}`)
    result.content = applyOverrides(restoreLexicalTranslation(parsed, new Map(Object.entries(translated.entries))), translated.overrides ?? {})
    result.text = toMarkdown(result.content)
    result.contentFormat = ContentFormat.Lexical
    result.sourceBlockSnapshots = lexical.extractRootBlocks(doc.content).map((b) => ({ id: b.id ?? '', fingerprint: b.fingerprint, type: b.type, index: b.index }))
  } else {
    if (!translated.text) throw new Error('Markdown 原文需要 text')
    result.text = translated.text
    result.contentFormat = content.contentFormat ?? ContentFormat.Markdown
  }
  return {
    ...result,
    hash: computeContentHash(content, 'zh'),
    sourceMetaHashes: {
      title: md5(content.title),
      subtitle: content.subtitle ? md5(content.subtitle) : undefined,
      summary: content.summary ? md5(content.summary) : undefined,
      tags: content.tags?.length ? md5(content.tags.join('|||')) : undefined,
    },
  }
}

// 和 Core 发 Webhook 的方式相同：请求体 JSON，HMAC-SHA256（密钥是该 Webhook 记录的 secret）放在 X-Webhook-Signature256
async function notify(db: Db, event: string, payload: unknown) {
  const hooks = await db.collection('webhooks').find({ enabled: true, events: event }).toArray()
  for (const hook of hooks) {
    const body = JSON.stringify(payload)
    const signature = createHmac('sha256', hook.secret).update(body).digest('hex')
    const response = await fetch(hook.payloadUrl, { method: 'POST', body, headers: { 'content-type': 'application/json', 'x-webhook-event': event, 'x-webhook-signature256': signature } }).catch((error) => error)
    console.log(`webhook ${event} → ${hook.payloadUrl}：${response instanceof Error ? response.message : response.status}`)
  }
}

test('manual translation', async () => {
  if (!['extract', 'apply', 'check', 'refresh'].includes(mode ?? '')) throw new Error('MT_MODE 要是 extract、apply、check 或 refresh')
  mkdirSync(dir, { recursive: true })
  const client = await MongoClient.connect(process.env.MONGO ?? 'mongodb://127.0.0.1:27018')
  const db = client.db(process.env.DB ?? 'shrio-import-20261014')
  const translations = db.collection('ai_translations')
  try {
    if (mode === 'refresh') await notify(db, 'CONTENT_REFRESH', 'restore_done')
    for (const id of ids) {
      const article = await findArticle(db, id)
      if (mode === 'extract') {
        extract(article, id)
        continue
      }
      for (const lang of langs) {
        const existing = await translations.findOne({ refId: id, refType: article.refType, lang })
        if (mode === 'check') {
          const content = source(article.doc)
          const hash = computeContentHash(content, existing?.sourceLang ?? 'zh')
          console.log(`check ${id} ${lang}: 库里 ${existing?.hash} / 重算 ${hash} → ${existing?.hash === hash ? '一致' : '不一致'}`)
          continue
        }
        if (existing && !process.env.MT_FORCE) {
          console.log(`skip ${id} ${lang}：已有译文（MT_FORCE=1 覆盖）`)
          continue
        }
        const file = resolve(dir, `${id}.${lang}.json`)
        if (!existsSync(file)) throw new Error(`缺少译文文件 ${file}`)
        const built = build(article, JSON.parse(readFileSync(file, 'utf8')))
        const result = await translations.findOneAndUpdate(
          { refId: id, refType: article.refType, lang },
          {
            $set: { ...built, sourceLang: 'zh', sourceModified: article.doc.modified ?? article.doc.created ?? undefined, aiModel: process.env.MT_MODEL ?? 'claude-opus-5-5', aiProvider: 'manual' },
            $setOnInsert: { created: new Date() },
          },
          { upsert: true, returnDocument: 'after' },
        )
        console.log(`apply ${id} ${lang}：${built.title}`)
        await notify(db, existing ? 'TRANSLATION_UPDATE' : 'TRANSLATION_CREATE', { id: String(result?._id), refId: id, refType: article.refType, lang, title: built.title })
      }
    }
  } finally {
    await client.close()
  }
})
