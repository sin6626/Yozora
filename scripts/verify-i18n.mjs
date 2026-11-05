// 站点语言的纯函数（2026-11-05 起语言由后台“AI i18n”决定，界面文字只写中文）：
// 地址怎么加/拆语言前缀、浏览器首选语言怎么挑、开着的语言怎么整理；msg/localize 怎么把 Core 的译文换上去、不合格的译文怎么挡掉；
// 前台和 Core 对译文的检查是否一致；旧手写译文（迁移数据）是否仍和中文原文对得上。
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { loadI18n, runTs } from './lib/i18n-source.mjs'

const config = runTs('apps/web/lib/i18n/config.ts')
const { pickLocale, splitLocale, localizeHref, siteLocales, isKnownLanguage, isLanguageCode, htmlLang, ogLocale, languageName } = config
const { msg, zh, source } = loadI18n()
const { flatten, localize, usable, placeholders } = msg
// 脚本里加载的模块在另一个 vm 环境，数组、对象的原型不同，比较前转成本环境的普通值
const plain = (value) => JSON.parse(JSON.stringify(value))

// 开着的语言：中文永远在最前；去重、去掉格式不对的和从右往左写的语言
assert.deepEqual(plain(siteLocales(['en', 'ja', 'en', 'zh', 'ar', 'EN', 'en-US', 1, 'ko'])), ['zh', 'en', 'ja', 'ko'])
assert.deepEqual(plain(siteLocales(null)), ['zh'])
const locales = ['zh', 'en', 'ja', 'ko']

// Accept-Language：按 q 权重挑第一个开着的语言，地区后缀不影响；都没开时返回 null（由调用方退回中文）
assert.equal(pickLocale('ja,en-US;q=0.9,en;q=0.8', locales), 'ja')
assert.equal(pickLocale('en-US,en;q=0.9', locales), 'en')
assert.equal(pickLocale('ko-KR', locales), 'ko', '后台新开的语言也能被挑中')
assert.equal(pickLocale('ko-KR,en;q=0.5', ['zh', 'en']), 'en', '没开的语言跳过')
assert.equal(pickLocale('zh-CN,zh;q=0.9,en;q=0.8', locales), 'zh')
assert.equal(pickLocale('fr-FR,fr;q=0.9,ja;q=0.5,en;q=0.4', locales), 'ja', '不支持的语言跳过，按权重取下一个')
assert.equal(pickLocale('en;q=0.2,ja;q=0.8', locales), 'ja', '权重高的优先，与书写顺序无关')
assert.equal(pickLocale('en;q=0,ja', locales), 'ja', 'q=0 表示不要')
assert.equal(pickLocale('fr,de', locales), null)
assert.equal(pickLocale('', locales), null)
assert.equal(pickLocale(null, locales), null)

assert.deepEqual({ ...splitLocale('/en/posts', locales) }, { locale: 'en', path: '/posts' })
assert.deepEqual({ ...splitLocale('/ko', locales) }, { locale: 'ko', path: '/' })
assert.deepEqual({ ...splitLocale('/ko/posts', ['zh', 'en']) }, { locale: null, path: '/ko/posts' }, '没开的语言不算前缀')
assert.deepEqual({ ...splitLocale('/me', locales) }, { locale: null, path: '/me' }, '两个字母的页面不是语言')
assert.deepEqual({ ...splitLocale('/posts', locales) }, { locale: null, path: '/posts' })
assert.deepEqual({ ...splitLocale('/english/x', locales) }, { locale: null, path: '/english/x' }, '只认完整的一段')

// 关掉的语言的旧链接要送回中文，但两三个字母的页面、接口不能误伤
for (const code of ['en', 'ko', 'ja', 'fr', 'yue']) assert.equal(isKnownLanguage(code), true, code)
for (const code of ['me', 'api', 'xx', 'posts', 'EN', '']) assert.equal(isKnownLanguage(code), false, code)
for (const code of ['ar', 'he', 'fa', 'ur']) assert.equal(isLanguageCode(code), false, `${code} 从右往左写，暂不支持`)

assert.equal(localizeHref('/posts', 'zh'), '/posts', '中文不加前缀')
assert.equal(localizeHref('/posts?tag=a', 'ko'), '/ko/posts?tag=a')
assert.equal(localizeHref('/', 'ja'), '/ja')
assert.equal(localizeHref('https://example.com', 'en'), 'https://example.com', '站外地址不动')
assert.equal(localizeHref('//cdn.example.com/x', 'en'), '//cdn.example.com/x')
assert.equal(localizeHref('#comments', 'en'), '#comments')

assert.equal(htmlLang('zh'), 'zh-CN')
assert.equal(htmlLang('ko'), 'ko')
assert.equal(ogLocale('zh'), 'zh_CN')
assert.equal(ogLocale('ko'), 'ko_KR')
assert.equal(ogLocale('en'), 'en_US')
assert.equal(languageName('zh'), '中文')
assert.equal(languageName('ja'), '日本語')
assert.equal(languageName('ko'), '한국어')
assert.equal(languageName('en'), 'English')

// msg：组件按中文原文里占位符的顺序传参；译文里可以换顺序，按名字换
const reading = msg.msg('正在读{kind}：{title}，已读 {percent}%')
assert.equal(reading('文章', '月亮', 30), '正在读文章：月亮，已读 30%')
const dictionary = { a: '你好', nested: { b: reading, c: msg.msg('共 {n} 篇') }, keep: '保持' }
assert.deepEqual(plain(flatten(dictionary)), { a: '你好', 'nested.b': '正在读{kind}：{title}，已读 {percent}%', 'nested.c': '共 {n} 篇', keep: '保持' })
const localized = localize(dictionary, {
  a: 'Hello',
  'nested.b': '{percent}% read of {kind} “{title}”',
  'nested.c': 'total {count}',
  keep: '',
})
assert.equal(localized.a, 'Hello')
assert.equal(localized.nested.b('post', 'Moon', 30), '30% read of post “Moon”', '换了顺序也按名字填')
assert.equal(localized.nested.c(3), '共 3 篇', '占位符对不上的译文不用，退回中文')
assert.equal(localized.keep, '保持', '原文不空、译文是空的，退回中文')
assert.equal(localize(dictionary, {}), dictionary, '没有译文时原样返回（中文页面）')
assert.equal(localize(dictionary, null), dictionary)

// 前台和 Core 的译文检查要一致（Core 保存前挡一次，前台用之前再挡一次）
const { checkI18nTranslation } = runTs('apps/core/src/modules/ai/ai-i18n/ai-i18n.util.ts')
const cases = [
  ['已切换到{name}', 'Switched to {name}', true],
  ['已切换到{name}', 'Switched to {lang}', false],
  ['已切换到{name}', 'Switched', false],
  ['{a}和{b}', '{b} and {a}', true],
  ['一个**大三学生**', 'a **third-year student**', true],
  ['一个**大三学生**', 'a third-year student', false],
  ['评论', ' ', false],
  ['', '', true],
]
for (const [from, to, ok] of cases) {
  assert.equal(usable(from, to), ok, `前台：${from} → ${to}`)
  assert.equal(checkI18nTranslation(from, to) === undefined, ok, `Core：${from} → ${to}`)
}
assert.deepEqual(plain(placeholders('{a}{b}{a}')), ['a', 'b'])

// 中文原文：只能是字符串和 msg，不能再写带判断的函数（AI 只翻一句话，分支要拆成几条）
const walk = (value, path) => {
  for (const [key, item] of Object.entries(value)) {
    const at = path ? `${path}.${key}` : key
    if (typeof item === 'function') assert.equal(typeof item.template, 'string', `${at} 是普通函数，请改成 msg("…{名字}…") 或拆成几条`)
    else if (item && typeof item === 'object') walk(item, at)
    else assert.equal(typeof item, 'string', `${at} 不是字符串`)
  }
}
walk(zh, '')
assert.ok(Object.keys(source).length > 400, '界面文字条目数不对，读 zh.ts 出错了？')

// 旧手写译文（迁移时导入 Core）：每条都对得上现在的中文原文
const legacy = JSON.parse(readFileSync(new URL('./data/i18n-legacy.json', import.meta.url), 'utf8'))
for (const lang of ['en', 'ja']) {
  for (const [key, text] of Object.entries(legacy[lang])) {
    assert.ok(key in source, `${lang} 的 ${key} 在中文里已经没有了`)
    assert.ok(usable(source[key], text), `${lang} 的 ${key} 和中文对不上：${text}`)
  }
}

// rich：整句话里的 {名字} 换成元素，其余文字可以另外套一层
const { rich } = runTs('apps/web/lib/i18n/rich.tsx')
const parts = rich('{author} 在 {target} 说：', { author: 'A', target: 'T' }, (text) => `<${text}>`)
assert.deepEqual(plain(parts.map((part) => part.props.children)), ['A', '<在>', 'T', '<说：>'])

console.log('PASS i18n locales, path prefixes, msg/localize, translation checks shared with Core, legacy translations, rich text')
