import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { i18nServer } from './lib/i18n-mock.mjs'

const require = createRequire(new URL('../apps/web/package.json', import.meta.url))
const ts = require('typescript')
const i18n = i18nServer(ts)
const source = readFileSync(new URL('../apps/web/components/post-list.tsx', import.meta.url), 'utf8')
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText
let request
let failure = false
const api = {
  category: { getAllCategories: async () => ({ data: [{ id: 'category-id', name: '学习', slug: 'study&think' }] }) },
  post: { getList: async (...args) => {
    request = args
    if (failure) throw new Error('unavailable')
    return { data: [], pagination: { total: 0, totalPage: 0, hasPrevPage: false, hasNextPage: false } }
  } },
}
// list-filters.tsx 用真的（listHref 决定翻页、重试地址里是否保留筛选），它引用的组件换成空壳
const filtersModule = { exports: {} }
vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../apps/web/components/list-filters.tsx', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, {
  module: filtersModule, exports: filtersModule.exports, URLSearchParams,
  require: (id) => id === 'lucide-react' ? { X: () => null } : id === './locale-provider' ? { default: () => null } : id === '../lib/i18n/server' ? i18n : require(id),
})
let matched
const plain = (value) => JSON.parse(JSON.stringify(value))
const module = { exports: {} }
vm.runInNewContext(code, {
  module, exports: module.exports,
  require: (id) => id.endsWith('.css') ? {} : id === '../lib/i18n/server' ? i18n : id === './load-error' ? { default: function LoadError() {} } : id === './locale-provider' ? { default: (props) => require('react').createElement('a', props) } : id === './post-sidebar' ? { default: function PostSidebar() {} } : id === './sidebar-search' ? { default: function SidebarSearch() {} } : id === './reveal' ? { default: ({ as: Tag = 'div', index, kind, ...props }) => require('react').createElement(Tag, props) } : id === './entry' ? { default: function Entry() {}, EntryTag: function EntryTag() {} } : id === '../lib/date' ? { formatDate: (v) => String(v) } : id === '../lib/search-params' ? { readText: (v, max = 50) => typeof v === 'string' ? v.trim().slice(0, max) : '' } : id === './list-filters' ? filtersModule.exports : id === '../lib/blog-data' ? {
    getCategories: async () => (await api.category.getAllCategories()).data,
    getPosts: (page, id) => api.post.getList(page, 10, { categoryIds: id ? [id] : undefined }),
    getMatchedPosts: async (match, page) => {
      matched = [match, page]
      if (failure) throw new Error('unavailable')
      return { data: [], pagination: { total: 0, totalPage: 0 } }
    },
  } : require(id),
})
const render = (page, slug) => module.exports.default({ searchParams: Promise.resolve(page === undefined ? {} : { page }), params: slug === undefined ? undefined : Promise.resolve({ slug }) })
const is404 = (error) => error.digest === 'NEXT_HTTP_ERROR_FALLBACK;404'
await render(undefined, 'study%26think')
assert.equal(request[0], 1)
assert.equal(request[1], 10)
assert.deepEqual(Array.from(request[2].categoryIds), ['category-id'])
for (const page of ['0', '-1', '1.5', 'abc', ['1', '2'], '999999999999999999']) await assert.rejects(render(page), is404)
await assert.rejects(render('1', 'missing'), is404)
await assert.rejects(render('1', '%zz'), is404)
await assert.rejects(render('2'), is404)
const withParams = (searchParams, slug) => module.exports.default({ searchParams: Promise.resolve(searchParams), params: slug === undefined ? undefined : Promise.resolve({ slug }) })
// 分类、标签、搜索同时只生效一个：关键词优先于标签，分类页忽略 q 和 tag
await withParams({ q: '  Plate  ', tag: 'Vue' })
assert.deepEqual(plain(matched), [{ keyword: 'Plate' }, 1])
await withParams({ tag: ' 前端' })
assert.deepEqual(plain(matched), [{ tag: ' 前端' }, 1], '标签名原样保留（后台有带空格的标签）')
matched = undefined
await withParams({ q: 'Plate', tag: 'Vue' }, 'study%26think')
assert.equal(matched, undefined, '分类页不按关键词或标签筛')
assert.deepEqual(Array.from(request[2].categoryIds), ['category-id'])
failure = true
const errorView = await render('1', 'study&think')
assert.equal(errorView.type.name, 'LoadError')
assert.equal(errorView.props.href, '/categories/study%26think')
assert.equal((await withParams({ q: 'Plate', page: '2' })).props.href, '/posts?q=Plate&page=2', '筛选结果的重试、翻页地址保留关键词')
assert.equal((await withParams({ tag: 'View Transition API' })).props.href, '/posts?tag=View+Transition+API')
console.log('PASS post list category selection, page validation, empty page,404, error retry target, one filter at a time (search over tag, category ignores both), raw tag names, filter kept in page links')
