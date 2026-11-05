// 一次性：把 2026-11-05 之前手写的英文、日文词典（git 里的 en.ts、ja.ts）按新的条目名导出成“条目名 → 译文模板”，
// 存进 scripts/data/i18n-legacy.json，迁移时导入 Core 的翻译条目（标成手改过），AI 就不会重翻这批。
// 新的中文词典（zh.ts）把带参数的条目改成了 msg("…{名字}…")，几条带判断的拆成了几条；旧词典还是函数，
// 这里用“{名字}”当参数调用旧函数得到模板，拆开的那几条按下面的对照表单独取。
// 用法：node scripts/export-legacy-i18n.mjs [旧版本，默认 99d249a]
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import vm from 'node:vm'

const root = new URL('../', import.meta.url)
const require = createRequire(new URL('apps/web/package.json', root))
const ts = require('typescript')
const run = (source, requireMap = {}) => {
  const module = { exports: {} }
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { module, exports: module.exports, require: (id) => requireMap[id] ?? require(id) })
  return module.exports
}
const read = (path) => readFileSync(new URL(path, root), 'utf8')
const revision = process.argv[2] ?? '99d249a'
const old = (lang) => run(execFileSync('git', ['show', `${revision}:apps/web/lib/i18n/messages/${lang}.ts`], { cwd: root, encoding: 'utf8' })).default

const msgModule = run(read('apps/web/lib/i18n/msg.ts'))
const zh = run(read('apps/web/lib/i18n/messages/zh.ts'), { '../msg': msgModule }).default
const { flatten, usable } = msgModule
const source = flatten(zh)

const at = (object, path) => path.split('.').reduce((value, key) => (value == null ? undefined : value[key]), object)
const params = (path) => at(zh, path)?.params ?? []

// 拆开或改写过的条目：从旧函数里按情况取
const special = {
  'header.presence.listening': (d) => d.header.presence.listening('{title}'),
  'header.presence.listeningBy': (d) => d.header.presence.listening('{title}', '{artist}'),
  'header.presence.noteAppMedia': (d) => d.header.presence.note({ app: true, media: true, artist: false }),
  'header.presence.noteAppMediaArtist': (d) => d.header.presence.note({ app: true, media: true, artist: true }),
  'header.presence.noteApp': (d) => d.header.presence.note({ app: true, media: false, artist: false }),
  'header.presence.noteMedia': (d) => d.header.presence.note({ app: false, media: true, artist: false }),
  'header.presence.noteMediaArtist': (d) => d.header.presence.note({ app: false, media: true, artist: true }),
  'nav.wordsUnit': (d) => d.nav.words(1)[1],
  'nav.piecesUnit': (d) => d.nav.pieces(2)[1],
  'footer.skyHide': (d) => d.footer.skyToggle('{name}', true),
  'footer.skyShow': (d) => d.footer.skyToggle('{name}', false),
  'article.aiTranslated': (d) => d.article.aiTranslated(null),
  'article.aiTranslatedBy': (d) => d.article.aiTranslated('{model}'),
  'chat.trigger': (d) => d.chat.trigger(0),
  'chat.triggerCount': (d) => d.chat.trigger('{total}'),
  'loginErrors.state_mismatch': (d) => d.loginErrors.state_mismatch(),
  // 原来拆成前后两截的半句话，拼回一整句
  'activity.commented': (d) => `{author} ${d.activity.commentIn} {target} ${d.activity.said}`,
  'activity.wroteThinking': (d) => `${d.activity.wroteThinking} {thinking}${d.activity.postedSuffix}`.trim(),
  'activity.liked': (d) => `${d.activity.liked} {title}`.replace('： ', '：'),
  'activity.published': (d) => `${d.activity.published} {title}`.replace('： ', '：'),
  'subscribe.rss': (d) => `${d.subscribe.rssBefore}{rss}${d.subscribe.rssAfter}`,
  'commentForm.asName': (d) => `${d.commentForm.asBefore}{name}${d.commentForm.asAfter}`.trim(),
}
// 旧词典里没有的新条目（手写一次）
const manual = {
  en: { 'footer.sky': 'A star for each day of LeetCode and coding since {since}', 'notifications.quoted': '“{title}”' },
  ja: { 'footer.sky': '{since}から今日まで、LeetCode とコードを書いた日の星', 'notifications.quoted': '「{title}」' },
}

const output = {}
const problems = []
for (const lang of ['en', 'ja']) {
  const dictionary = old(lang)
  const entries = {}
  for (const [key, text] of Object.entries(source)) {
    let value = manual[lang][key]
    if (value === undefined && special[key]) value = special[key](dictionary)
    if (value === undefined) {
      const legacy = at(dictionary, key)
      value = typeof legacy === 'function' ? legacy(...params(key).map((name) => `{${name}}`)) : legacy
    }
    if (value === undefined) problems.push(`${lang} 缺 ${key}`)
    else if (!usable(text, value)) problems.push(`${lang} ${key}：占位符或 ** 对不上：${JSON.stringify(text)} → ${JSON.stringify(value)}`)
    else entries[key] = value
  }
  output[lang] = entries
}

mkdirSync(new URL('scripts/data/', root), { recursive: true })
writeFileSync(new URL('scripts/data/i18n-legacy.json', root), `${JSON.stringify(output, null, 2)}\n`)
console.log(`中文 ${Object.keys(source).length} 条；英文 ${Object.keys(output.en).length} 条，日文 ${Object.keys(output.ja).length} 条 → scripts/data/i18n-legacy.json`)
if (problems.length) {
  console.log(`没导出的 ${problems.length} 条：\n${problems.join('\n')}`)
  process.exitCode = 1
}
