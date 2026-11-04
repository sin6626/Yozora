import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

const require = createRequire(new URL('../apps/web/package.json', import.meta.url))
const ts = require('typescript')
const source = readFileSync(new URL('../apps/web/lib/blog-data.ts', import.meta.url), 'utf8')
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
const lifetimes = [], tags = [], calls = []
const category = { id: 'category-id', name: '技术', slug: 'technology', type: 0, count: 1, created: '2026-10-22' }
const post = { id: 'post-id', title: '正文', text: 'body', slug: 'test', category, created: '2026-10-22', liked: true, content: 'unused JSON', copyright: false, related: [{ id: 'rel-b', title: '旧标题 B', slug: 'b' }, { id: 'rel-draft', title: '草稿', slug: 'draft' }, { id: 'rel-a', title: 'A', slug: 'a' }] }
const note = { id: 'note-id', nid: 5, title: '手记', text: 'note body', created: '2026-10-22', mood: '开心', weather: '晴', topic: { name: '近况', introduce: 'unused' }, password: 'secret', liked: true, content: 'unused JSON' }
const project = { id: 'project-id', name: '作品', description: '简介', avatar: 'https://example.com/a.png', text: 'unused', created: '2026-10-22' }
let invalidNavigation = false
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
  project: { getAll: async () => ({ data: [project] }) },
  comment: {
    getByRefId: async (refId, options) => {
      calls.push(['comments', refId, options])
      const reply = { id: 'reply-id', author: '回复者', mail: 'leak@example.com', ip: '1.2.3.4', agent: 'UA', text: '回复', created: '2026-10-23', parentCommentId: 'comment-id', avatar: 'https://example.com/r.png' }
      return {
        data: [{ id: 'comment-id', author: '快照名', readerId: 'reader-id', mail: 'leak@example.com', ip: '1.2.3.4', text: '评论', created: '2026-10-22', pin: true, isDeleted: false, location: '上海', replies: [reply], replyWindow: { hiddenCount: 2 } }],
        pagination: { total: 1, totalPage: 1 },
        readers: { 'reader-id': { name: '读者', image: 'https://example.com/a.png', email: 'reader@example.com' } },
      }
    },
  },
  search: {
    search: async (type, keyword) => { calls.push(['search', type, keyword]); return type === 'post' ? { data: [{ ...post, text: 'leak' }], pagination: { total: 1 } } : { data: [{ ...note, text: 'leak' }], pagination: { total: 1 } } },
    // 筛选结果按 id 取：Core 按相关度排好的 id（含一条公开列表里没有的）
    proxy: (type) => ({ get: async ({ params }) => { calls.push(['searchIds', type, params]); return { data: [{ id: 'hidden-id' }, { id: type === 'post' ? 'post-id' : 'note-id' }] } } }),
  },
  topic: { getAll: async () => ({ data: [{ id: 't1', name: '近况', slug: 'now', introduce: 'unused' }, { id: 't2', name: '空话题', slug: 'empty' }] }) },
  page: { getList: async () => ({ data: [{ id: 'page-id', subtitle: ' about me ' }] }), getBySlug: async () => detailError ? Promise.reject(detailError) : ({ id: 'page-id', title: '关于我', subtitle: 'about me', text: 'page body', contentFormat: 'lexical', content: 'unused JSON', allowComment: true }) },
  post: {
    getList: async (...args) => { calls.push(args); return { data: [post], pagination: { total: 1 } } },
    getPost: async () => { if (detailError) throw detailError; return post },
  },
}
const module = { exports: {} }
vm.runInNewContext(code, {
  module, exports: module.exports,
  require: (id) => id === 'server-only' ? {} : id === './excerpt' ? { excerpt: (value) => value ?? '', readingMinutes: () => 1 } : id === './social' ? { socialLinks: () => [], socialCards: () => [] } : id === './theme-config' ? { parseContentTranslations: () => ({ projects: {} }) } : id === './safe-url' ? { safeUrl: (value) => value && /^https?:\/\//i.test(value) ? value : undefined } : id === './api' ? { getApiClient: () => api } : id === 'next/cache' ? { cacheLife: (value) => lifetimes.push(value), cacheTag: (...value) => tags.push(...value) } : require(id),
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
assert.equal(JSON.stringify(topics), JSON.stringify([{ id: 't1', name: '近况', slug: 'now', count: 9 }]))
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
console.log('PASS public cache projections, key parameters, tag coverage and lifetime constraints')
const comments = await cache.getComments('post-id', 1)
assert.equal(JSON.stringify(calls.at(-1)), JSON.stringify(['comments', 'post-id', { page: 1, size: 10 }]))
assert.ok(tags.includes('blog:comments'))
const [thread] = comments.data
assert.equal(thread.author, '读者', '登录读者显示读者名而不是快照')
assert.equal(thread.avatar, 'https://example.com/a.png')
assert.equal(thread.pinned, true)
assert.equal(thread.hiddenReplies, 2)
assert.equal(thread.replies[0].parentId, 'comment-id')
assert.equal(/leak@|reader@|1\.2\.3\.4|"UA"/.test(JSON.stringify(comments)), false, '评论缓存不含邮箱、IP、UA')

