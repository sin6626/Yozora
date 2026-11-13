// "use cache" 的缓存时长不能有“过期但还能用”的窗口：每个 cacheLife 的 revalidate 必须等于 expire（且 ≥ 300，否则 Next 当成动态数据）。
// 原因（2026-11-13）：开发期 Next 校验静态外壳用 prerender 类型的渲染，它把“已过 revalidate、没过 expire”的条目当成未命中、当场重取 Core；
// 根布局（页头、导航、页脚、语言信息、metadata）读的缓存一起过期时，几次重取叠起来跨过静态阶段，就报
// “encountered uncached data during prerendering or a navigation”，栈指向最后读完的那个组件（Suspense 里的也算）。
// 正常请求拿到旧值、只在后台刷新，所以放过 5 分钟后第一次校验才报、再跑就过。没有窗口时，过期后正常请求先重取，校验看到的是新条目。
// 内容更新照旧靠 Webhook 让标签失效。根布局 generateMetadata 读的缓存另外要求 stale ≥ 300（2026-10-28 /debug 那次）。
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const web = join(root, 'apps/web')
// 用 Next 内置档位（带窗口）的地方：不在页面渲染里，或结果只取决于输入、不会过时
const namedProfiles = {
  'apps/web/lib/og.ts': 'hours', // 分享图路由读头像，不经页面渲染校验
  'apps/web/components/article-body.tsx': 'max', // 代码高亮，同样的输入永远同样的输出
}
const metadataReads = ['getSiteSettings', 'getThemeConfig', 'loadLanguages', 'loadBundle']

const files = (dir) => readdirSync(dir).flatMap((name) => {
  const path = join(dir, name)
  if (name === 'node_modules' || name.startsWith('.')) return []
  return statSync(path).isDirectory() ? files(path) : /\.tsx?$/.test(name) ? [path] : []
})

const number = (text, key) => Number(text.match(new RegExp(`${key}:\\s*(\\d+)`))?.[1])
const found = []
for (const path of ['lib', 'components', 'app'].flatMap((dir) => files(join(web, dir)))) {
  const source = readFileSync(path, 'utf8')
  const file = relative(root, path)
  for (const match of source.matchAll(/cacheLife\(([^)]*)\)/g)) {
    const before = source.slice(0, match.index)
    const owner = [...before.matchAll(/(?:function|const)\s+(\w+)/g)].at(-1)?.[1]
    const arg = match[1].trim()
    if (/^["']/.test(arg)) {
      assert.equal(arg.slice(1, -1), namedProfiles[file], `${file} ${owner}：用了带窗口的内置档位 ${arg}，改成 revalidate = expire 的对象`)
      continue
    }
    const literal = arg.startsWith('{') ? arg : source.match(new RegExp(`const ${arg}\\s*=\\s*(\\{[^}]*\\})`))?.[1]
    assert.ok(literal, `${file} ${owner}：读不出 cacheLife(${arg}) 的时长`)
    const life = { stale: number(literal, 'stale'), revalidate: number(literal, 'revalidate'), expire: number(literal, 'expire') }
    found.push({ file, owner, ...life })
  }
}

const problems = found.filter((life) => !(life.revalidate === life.expire && life.expire >= 300) || (metadataReads.includes(life.owner) && !(life.stale >= 300)))
assert.deepEqual(problems.map(({ file, owner, stale, revalidate, expire }) => `${file} ${owner}：stale ${stale} / revalidate ${revalidate} / expire ${expire}`), [], '这些缓存有过期窗口（revalidate ≠ expire）或根布局 metadata 读的 stale < 300')
assert.ok(found.length >= 20, `应找到全部对象形式的 cacheLife：${found.length}`)
for (const name of metadataReads) assert.ok(found.some((life) => life.owner === name), `没找到 ${name} 的 cacheLife`)
console.log(`PASS ${found.length} cacheLife objects have revalidate = expire (no stale window); root-layout metadata reads keep stale ≥ 300`)
