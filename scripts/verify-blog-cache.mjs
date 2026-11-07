import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { loadI18n, runTs } from './lib/i18n-source.mjs'

const require = createRequire(new URL('../apps/web/package.json', import.meta.url))
const ts = require('typescript')
const source = readFileSync(new URL('../apps/web/lib/blog-data.ts', import.meta.url), 'utf8')
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
const lifetimes = [], tags = [], calls = []
const themeConfig = { exports: runTs('apps/web/lib/theme-config.ts', { './i18n/msg': loadI18n().msg }) }
const noteExtras = runTs('apps/web/lib/note-extras.ts', { './safe-url': { safeUrl: (value) => value && /^https?:\/\//i.test(value) ? value : undefined } })
const i18nConfig = runTs('apps/web/lib/i18n/config.ts')
// 后台“AI i18n”翻好的译文（Core GET /ai/i18n/:lang），按语言替换
const emptyBundle = { messages: {}, site: {}, projects: {} }
let i18nBundles = {}
const category = { id: 'category-id', name: '技术', slug: 'technology', type: 0, count: 1, created: '2026-10-22' }
const post = { id: 'post-id', title: '正文', text: 'body', slug: 'test', category, created: '2026-10-22', liked: true, content: 'unused JSON', copyright: false, related: [{ id: 'rel-b', title: '旧标题 B', slug: 'b' }, { id: 'rel-draft', title: '草稿', slug: 'draft' }, { id: 'rel-a', title: 'A', slug: 'a' }] }
const note = { id: 'note-id', nid: 5, title: '手记', text: 'note body', created: '2026-10-22', mood: '开心', weather: '晴', topic: { id: 't1', name: '近况', slug: 'now', introduce: 'unused' }, meta: { cover: 'https://img.test/cover.webp', banner: { type: 'warning', message: '旧文', className: 'x' } }, password: 'secret', liked: true, content: 'unused JSON' }
const project = { id: 'project-id', name: '作品', description: '简介', avatar: 'https://example.com/a.png', text: 'unused', created: '2026-10-22' }
let invalidNavigation = false
let projectList = [project]
let themeSnippet = null
let detailError
const api = {
  aggregate: {
    getTimeline: async () => ({ data: { posts: [{ id: 'rel-a', title: 'A', slug: 'a', created: '2026-10-21', category }, { id: 'rel-b', title: '新标题 B', slug: 'b', created: '2026-10-20', category }], notes: [] } }),
    getAggregateData: async () => ({ categories: invalidNavigation ? null : [category], pageMeta: [{ id: 'page-id', title: '关于我', slug: 'about' }], user: { privateField: 'not for cache' } }) },
  category: {
    getAllCategories: async () => ({ data: [category] }),
    getAllTags: async () => ({ data: [{ name: 'Vue', count: 1, extra: 'x' }, { name: ' 前端', count: 3 }] }),
    getTagByName: async (name) => { calls.push(['tag', name]); if (name === 'missing') throw { status: 404 }; return { tag: name, data: [{ ...post, text: 'leak' }] } },
  },
  note: {
    getList: async (...args) => { calls.push(args); return { data: [note], pagination: { total: 1 } } },
    getNoteByTopicId: async (id, page, size, options) => { calls.push(['topic', id, page, size, options]); return id === 't1' ? { data: [{ ...note, text: 'leak' }], pagination: { total: 9 } } : { data: [], pagination: { total: 0 } } },
    getNoteByNid: async () => { if (detailError) throw detailError; return { data: note, prev: { nid: 6, title: '较新' }, next: { nid: 4 } } },
  },
  project: { getAll: async () => ({ data: projectList }) },
  snippet: { getByReferenceAndName: async () => themeSnippet },
  comment: {
    // 两页主评论；第一条主评论有 2 条回复被折叠（Core 只给头尾），要用楼中楼接口按游标取回
    getByRefId: async (refId, options) => {
      calls.push(['comments', refId, options])
      const reply = (id, created) => ({ id, author: '回复者', mail: 'leak@example.com', ip: '1.2.3.4', agent: 'UA', text: id, created, parentCommentId: 'comment-id', avatar: 'https://example.com/r.png' })
      const first = { id: 'comment-id', author: '快照名', readerId: 'reader-id', mail: 'leak@example.com', ip: '1.2.3.4', agent: 'UA', text: '评论', created: '2026-10-22', pin: true, isDeleted: false, location: '上海', replies: [reply('head', '2026-10-23'), reply('tail', '2026-10-26')], replyWindow: { hiddenCount: 2, nextCursor: 'head' } }
      const second = { id: 'old-id', author: '旧评论', text: '更早', created: '2026-10-01', replies: [], replyWindow: { hiddenCount: 0 } }
      return {
        data: options.page === 1 ? [first] : [second],
        pagination: { total: 2, totalPage: 2 },
        readers: { 'reader-id': { name: '读者', image: 'https://example.com/a.png', email: 'reader@example.com' } },
      }
    },
    getThreadReplies: async (rootId, params) => {
      calls.push(['thread', rootId, params])
      const middle = (id, created) => ({ id, author: '中间', readerId: 'owner-id', mail: 'leak@example.com', text: id, created, parentCommentId: 'comment-id' })
      return params.cursor === 'head'
        ? { replies: [middle('mid-1', '2026-10-24')], nextCursor: 'mid-1', remaining: 1, done: false, readers: { 'owner-id': { name: '站长', role: 'owner', email: 'owner@example.com' } } }
        : { replies: [middle('mid-2', '2026-10-25')], remaining: 0, done: true, readers: { 'owner-id': { name: '站长', role: 'owner', email: 'owner@example.com' } } }
    },
  },
  search: {
    search: async (type, keyword) => { calls.push(['search', type, keyword]); return type === 'post' ? { data: [{ ...post, text: 'leak' }], pagination: { total: 1 } } : { data: [{ ...note, text: 'leak' }], pagination: { total: 1 } } },
    // 筛选结果按 id 取：Core 按相关度排好的 id（含一条公开列表里没有的）
    proxy: (type) => ({ get: async ({ params }) => { calls.push(['searchIds', type, params]); return { data: [{ id: 'hidden-id' }, { id: type === 'post' ? 'post-id' : 'note-id' }] } } }),
  },
  topic: { getAll: async () => ({ data: [{ id: 't1', name: '近况', slug: 'now', introduce: '最近在做的事', description: '更长的一段介绍' }, { id: 't2', name: '空话题', slug: 'empty' }] }) },
  page: { getList: async () => ({ data: [{ id: 'page-id', subtitle: ' about me ' }] }), getBySlug: async () => detailError ? Promise.reject(detailError) : ({ id: 'page-id', title: '关于我', subtitle: 'about me', text: 'page body', contentFormat: 'lexical', content: 'unused JSON', allowComment: true }) },
  post: {
    getList: async (...args) => { calls.push(args); return { data: [post], pagination: { total: 1 } } },
    getPost: async () => { if (detailError) throw detailError; return post },
  },
}
const module = { exports: {} }
vm.runInNewContext(code, {
  module, exports: module.exports,
  require: (id) => id === 'server-only' ? {} : id === './excerpt' ? { excerpt: (value) => value ?? '', readingMinutes: () => 1 } : id === './social' ? { socialLinks: () => [], socialCards: () => [] } : id === './theme-config' ? themeConfig.exports : id === './note-extras' ? noteExtras : id === './i18n/config' ? i18nConfig : id === './i18n/data' ? { getI18nBundle: async (lang) => i18nBundles[lang] ?? emptyBundle } : id === './safe-url' ? { safeUrl: (value) => value && /^https?:\/\//i.test(value) ? value : undefined } : id === './api' ? { getApiClient: () => api } : id === 'next/cache' ? { cacheLife: (value) => lifetimes.push(value), cacheTag: (...value) => tags.push(...value) } : require(id),
})
const cache = module.exports
const navigation = await cache.getNavigationData()
assert.equal('user' in navigation, false)
assert.equal(navigation.pageMeta[0].subtitle, 'about me', '导航“首页”面板的页面副标题取自后台页面')
assert.equal((await cache.getCategories())[0].slug, 'technology')
const list = await cache.getPosts(2, 'category-id')
assert.equal(calls[0][0], 2)
assert.equal(calls[0][2].categoryIds[0], 'category-id')
assert.equal('liked' in list.data[0], false)
assert.equal('text' in list.data[0], false, '列表只返回摘录，不把正文带给页面')
const detail = await cache.getPost('technology', 'test')
assert.equal('liked' in detail, false)
assert.equal(JSON.stringify(detail.count), JSON.stringify({ read: 0, like: 0 }), '缺少计数时补 0')
assert.equal('content' in detail, false, 'Markdown 文章不缓存 content')
assert.equal(detail.text, 'body')
assert.ok(tags.includes('blog:post:post-id'))
assert.deepEqual(JSON.parse(JSON.stringify(detail.related)), [{ id: 'rel-b', title: '新标题 B', href: '/posts/technology/b' }, { id: 'rel-a', title: 'A', href: '/posts/technology/a' }], '关联阅读按后台顺序，只列时间线里已发布的文章')
assert.equal(detail.copyright, false, '后台“版权注明”开关原样带到详情')
// 6 次：导航、分类、文章列表、列表里读 AI 摘要（getArticleAi，2026-10-29 起列表摘要优先用 AI 摘要）、文章详情、详情换算关联阅读用的时间线
assert.equal(lifetimes.length, 6)
assert.ok(lifetimes.every(p => p.revalidate > 0 && p.expire > p.revalidate))
const notes = await cache.getNotes(3)
assert.equal(calls[1][0], 3)
assert.equal(notes.data[0].topic, '近况')
assert.equal('password' in notes.data[0] || 'text' in notes.data[0], false)
const noteDetail = await cache.getNote(5)
assert.equal('password' in noteDetail || 'liked' in noteDetail || 'content' in noteDetail, false)
assert.equal(JSON.stringify(noteDetail.newer), JSON.stringify({ nid: 6, title: '较新' }))
assert.equal(noteDetail.older, null)
assert.equal(JSON.stringify(noteDetail.topic), JSON.stringify({ id: 't1', name: '近况', slug: 'now' }), '详情里的话题带 id 和 slug，可以取话题卡片、链回话题筛选')
// 后台手记 meta 的头图与横幅，解析成普通 JSON 放进详情（"use cache" 只能返回普通对象）
assert.equal(JSON.stringify([noteDetail.cover, noteDetail.banner]), JSON.stringify(['https://img.test/cover.webp', { type: 'warning', message: '旧文' }]))
assert.equal('meta' in noteDetail, false)
assert.ok(tags.includes('blog:notes') && tags.includes('blog:note:note-id'))
const projects = await cache.getProjects()
assert.equal('text' in projects[0], false)
assert.ok(tags.includes('blog:projects'))
const page = await cache.getPage('about')
assert.equal(page.text, 'page body')
assert.equal(page.content, 'unused JSON', 'Lexical 页面缓存 content 给富文本渲染器')
assert.equal(page.allowComment, true, '评论区需要这篇内容自己的允许评论开关')
assert.ok(tags.includes('blog:pages') && tags.includes('blog:page:page-id'))
const foundPosts = await cache.searchPosts('关键词')
const foundNotes = await cache.searchNotes('关键词')
assert.ok(calls.some(c => c[0] === 'search' && c[1] === 'post' && c[2] === '关键词') && calls.some(c => c[0] === 'search' && c[1] === 'note'))
assert.equal(foundPosts.total, 1)
assert.equal('text' in foundPosts.data[0] || 'text' in foundNotes.data[0] || 'password' in foundNotes.data[0], false)
assert.equal(foundPosts.data[0].category.slug, 'technology')
const topics = await cache.getTopics()
assert.equal(JSON.stringify(topics), JSON.stringify([{ id: 't1', name: '近况', slug: 'now', introduce: '最近在做的事', description: '更长的一段介绍', count: 9 }]), '话题带上后台填的简介和详细描述')
const byTopic = await cache.getNotesByTopic('t1')
assert.equal(byTopic.total, 9)
assert.equal('text' in byTopic.data[0], false)
assert.equal(calls.at(-1)[4].sortOrder, -1)
const tagList = await cache.getTags()
assert.equal(JSON.stringify(tagList), JSON.stringify([{ name: ' 前端', count: 3 }, { name: 'Vue', count: 1 }]))
const plain = (value) => JSON.parse(JSON.stringify(value))
const tagged = await cache.getMatchedPosts({ tag: ' 前端' }, 1)
assert.equal(calls.filter((call) => call[0] === 'tag').at(-1)[1], ' 前端', '标签名原样传给 Core')
assert.equal(tagged.data[0].id, 'post-id')
assert.equal('text' in tagged.data[0], false, '筛选结果不带正文')
assert.equal(typeof tagged.data[0].excerpt?.text, 'string', '筛选结果和普通列表同一种条目（有摘要）')
assert.deepEqual(plain(tagged.pagination), { total: 1, size: 10, currentPage: 1, totalPage: 1, hasPrevPage: false, hasNextPage: false })
assert.equal((await cache.getMatchedPosts({ tag: 'missing' }, 1)).pagination.total, 0, '标签下没有文章时 Core 返回 404，当作没有结果')
const searchedPosts = await cache.getMatchedPosts({ keyword: '前端' }, 1)
assert.deepEqual(plain(calls.filter((call) => call[0] === 'searchIds').at(-1)), ['searchIds', 'post', { keyword: '前端', size: 50 }])
assert.deepEqual(searchedPosts.data.map((entry) => entry.id), ['post-id'], '公开列表里没有的 id 不出现')
const topicNotes = await cache.getMatchedNotes({ topicId: 't1' }, 1)
assert.equal(topicNotes.data[0].nid, 5)
assert.equal((await cache.getMatchedNotes({ keyword: '近况' }, 2)).data.length, 0, '超出页数时这一页为空（列表页据此 404）')
// 文章列表、手记列表各读一次 AI 摘要；筛选结果每次调用：getMatched* 与它读的全部条目索引各一次，索引里每条再读一次 AI 摘要
assert.equal(lifetimes.length, 31)
assert.ok(lifetimes.every(p => p.revalidate > 0 && p.expire > p.revalidate))
post.contentFormat = 'lexical'
assert.equal((await cache.getPost('technology', 'lexical')).content, 'unused JSON', 'Lexical 文章缓存 content 给富文本渲染器')
delete post.contentFormat
// 缓存函数抛出的错误会丢失 status，所以 404/403 必须在函数内转成返回值。
detailError = { status: 404 }
assert.equal(await cache.getPost('technology', 'missing'), null)
assert.equal(await cache.getNote(999), null)
assert.equal(await cache.getPage('missing'), null)
detailError = { status: 403 }
assert.equal((await cache.getNote(7)).locked, true)
detailError = { status: 500 }
await assert.rejects(cache.getPost('technology', 'broken'))
detailError = undefined
invalidNavigation = true
await assert.rejects(cache.getNavigationData(), /导航数据/)
// 外文页面没有译文的手记标题仍是中文：带 titleLang，展示组件据此标 lang="zh-CN"（Codex 复查：话题卡片、左侧时间线漏标）
assert.equal(byTopic.data[0].titleLang, undefined, '中文页面不标')
assert.equal((await cache.getNotesByTopic('t1', 'en')).data[0].titleLang, 'zh-CN', '外文页面没译文的标题标 zh-CN')
assert.ok((await cache.getTimeline('en')).every((item) => item.titleLang === 'zh-CN'), '时间线条目同样标')
console.log('PASS public cache projections, key parameters, tag coverage and lifetime constraints')
const comments = await cache.getComments('post-id')
assert.ok(tags.includes('blog:comments'))
assert.deepEqual([...calls.filter(([kind]) => kind === 'comments').slice(-2).map(([, , options]) => options.page)], [1, 2], '主评论按页读完')
assert.equal(comments.data.length, 2)
assert.equal(comments.total, 2)
const [thread] = comments.data
assert.equal(thread.author, '读者', '登录读者显示读者名而不是快照')
assert.equal(thread.avatar, 'https://example.com/a.png')
assert.equal(thread.pinned, true)
assert.equal('hiddenReplies' in thread, false)
assert.deepEqual([...thread.replies.map((reply) => reply.id)], ['head', 'mid-1', 'mid-2', 'tail'], '折叠的回复按时间补进头尾之间')
assert.equal(thread.replies[1].owner, true, '楼中楼接口返回的读者资料也用上（站长身份）')
assert.equal(thread.replies[0].parentId, 'comment-id')
assert.equal(/leak@|reader@|owner@|1\.2\.3\.4|"UA"/.test(JSON.stringify(comments)), false, '评论缓存不含邮箱、IP、UA')

// 作品名和介绍各自有没有译文（后台“AI i18n”翻的，Core GET /ai/i18n/:lang 的 projects）：没有的那一项显示中文并单独标 zh-CN，有的那一项不标
projectList = ['both', 'none', 'name', 'desc'].map((id) => ({ ...project, id, name: `中文名-${id}`, description: `中文介绍-${id}` }))
for (const lang of ['en', 'ja']) {
  i18nBundles = { [lang]: { ...emptyBundle, projects: { both: { name: `N-${lang}`, description: `D-${lang}` }, name: { name: `N-${lang}` }, desc: { description: `D-${lang}` } } } }
  const byId = Object.fromEntries((await cache.getProjects(lang)).map((item) => [item.id, item]))
  const shown = (id) => [byId[id].name, byId[id].nameLang, byId[id].description, byId[id].descriptionLang]
  assert.deepEqual(shown('both'), [`N-${lang}`, undefined, `D-${lang}`, undefined], `${lang} 两项都有译文`)
  assert.deepEqual(shown('none'), ['中文名-none', 'zh-CN', '中文介绍-none', 'zh-CN'], `${lang} 两项都没有译文`)
  assert.deepEqual(shown('name'), [`N-${lang}`, undefined, '中文介绍-name', 'zh-CN'], `${lang} 只译了名字：介绍标中文`)
  assert.deepEqual(shown('desc'), ['中文名-desc', 'zh-CN', `D-${lang}`, undefined], `${lang} 只译了介绍：名字标中文、介绍不标`)
}
assert.deepEqual((await cache.getProjects('zh')).map((item) => [item.nameLang, item.descriptionLang]), projectList.map(() => [undefined, undefined]), '中文页面不标')
projectList = [project]
i18nBundles = {}
