// 2026-11-12 第二轮巡查（浅色主题、英文页面、浅色手机）发现的问题，每个问题一组检查，修之前都会失败：
//   table       富文本表格的样式没加载（单元格没有内边距、表格没有撑满），“正文 A”和“正常”贴在一起
//   toc         白板（Excalidraw）给读屏用的隐藏标题 “Canvas actions” 被收进了文章目录
//   outdated    没修改过的文章，过期提示写“最后修改于 N 天前”，和版权块“暂没有修改过”互相矛盾
//   copyright   版权块的文章链接显示成 study%26think（decodeURI 不解码 & 这类保留字符）
//   timeline    时间线标题换行时，小星落在整条的竖直中间，没对齐第一行
//   friends     英文友链页：本站信息的标签列被挤成两行、和值对不齐；两张名片不一样高
//   says        浅色主题一言星图的经纬线画到了图框外面
//   featured    手机上置顶/回忆卡片的边框贴着屏幕边缘
//   social      手机首屏社交图标换行时，竖线两边的分组被拆开
//   codelang    手机上代码块右下角的语言图标压在最后一行代码上
//   emptystate  404 页说明的最后一行只剩“了。”两个字
//   spacing     英文小标签（Tags、Pinned）用了给中文设的字距，字母被拉散
//   pagination  翻页那一行四个列表不一致：文章、手记第一页把“上一页”显示成纯文字、“下一页”是按钮，碎碎念、思考用空占位，
//               页码因此不在正中；碎碎念写“更早的”、思考写“更早”
//   aside       宽屏右侧的筛选栏（.list-aside）和文章目录（.site-details）是 position: fixed，页面滚到最底下时压在页脚的分隔线上
// 需要先运行 pnpm dev。用法：node scripts/e2e/audit-1112b.mjs [检查名…]（不写就全跑）
import assert from "node:assert/strict";
import { openBrowser, sleep } from "../headless-browser.mjs";

const web = process.env.WEB_URL ?? "http://127.0.0.1:2323";
const core = "http://127.0.0.1:2333";
const posts = (await (await fetch(`${core}/posts?size=50`)).json()).data;
const postUrl = (match) => {
  const post = posts.find(match);
  assert.ok(post, "本地库里要有这篇文章");
  return `/posts/${post.category.slug}/${post.slug}`;
};
const rich = postUrl((post) => post.title.startsWith("富文本组件对照"));
const zod = postUrl((post) => post.title === "Zod");

const b = await openBrowser({ port: 9497 });
const waitFor = async (expression, ms = 15000) => {
  for (let t = 0; t < ms; t += 200) { if (await b.evaluate(expression).catch(() => false)) return true; await sleep(200); }
  return false;
};
const open = async (path, { width = 1920, height = 991, theme = "dark" } = {}) => {
  await b.setViewport(width, height);
  await b.goto(`${web}/debug`, 1500);
  await b.evaluate(`localStorage.setItem('theme', ${JSON.stringify(theme)})`);
  await b.goto(`${web}${path}`, 3000);
};

const checks = {
  async table() {
    await open(rich, { theme: "light" });
    assert.ok(await waitFor(`!!document.querySelector('.article-rich table td')`), "富文本表格渲染出来");
    const table = await b.evaluate(`(() => {
      const td = document.querySelector('.article-rich table td'); const table = td.closest('table')
      return { padding: parseFloat(getComputedStyle(td).paddingLeft), table: table.getBoundingClientRect().width, box: table.parentElement.getBoundingClientRect().width }
    })()`);
    assert.ok(table.padding >= 8, `单元格要有内边距（现在 ${table.padding}px）`);
    assert.ok(table.table >= table.box - 1, `表格撑满（表格 ${table.table}px，外框 ${table.box}px）`);
    // 深色主题下，作者设了浅色底的单元格，字要看得清（对比度 ≥ 4.5）
    await open(rich);
    assert.ok(await waitFor(`!!document.querySelector('.article-rich table td')`));
    const contrast = await b.evaluate(`(() => {
      const rgb = (c) => c.match(/[\\d.]+/g).slice(0, 3).map(Number)
      const lum = (c) => { const [r, g, b] = rgb(c).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }); return 0.2126 * r + 0.7152 * g + 0.0722 * b }
      return [...document.querySelectorAll('.article-rich table [style*=background-color]')].map((cell) => {
        const style = getComputedStyle(cell); const [a, b] = [lum(style.color), lum(style.backgroundColor)].sort((x, y) => y - x)
        return { text: cell.textContent.trim(), ratio: (a + 0.05) / (b + 0.05) }
      })
    })()`);
    assert.ok(contrast.length > 0, "示例表格里有带底色的单元格");
    for (const cell of contrast) assert.ok(cell.ratio >= 4.5, `深色主题下“${cell.text}”看不清（对比度 ${cell.ratio.toFixed(2)}）`);
  },

  async toc() {
    await open(rich);
    assert.ok(await waitFor(`!!document.querySelector('.site-details .article-toc a')`), "目录出来");
    // 白板是懒加载的：滚到“白板”那一节，再往下一点，等 Excalidraw 挂上它给读屏用的隐藏标题
    const hidden = `[...document.querySelectorAll('.article-rich h2')].some((h) => h.textContent.trim() === 'Canvas actions')`;
    for (let i = 0; i < 40 && !(await b.evaluate(hidden)); i++) {
      await b.evaluate(`(() => { const h = [...document.querySelectorAll('.article-rich :is(h1, h2, h3)')].find((h) => h.textContent.includes('白板')); if (h) window.scrollTo(0, h.getBoundingClientRect().top + scrollY + ${(i % 4) * 300}) })()`);
      await sleep(500);
    }
    assert.ok(await b.evaluate(hidden), "白板加载出来（带着它的隐藏标题）");
    await sleep(500);
    const entries = await b.evaluate(`[...document.querySelectorAll('.site-details .article-toc a')].map((a) => a.textContent.trim())`);
    assert.ok(!entries.includes("Canvas actions"), `目录里不应有白板的隐藏标题：${entries.join("、")}`);
  },

  async outdated() {
    await open(zod);
    assert.ok(await waitFor(`!!document.querySelector('.post-outdated') && !!document.querySelector('#copyright')`), "Zod 有过期提示和版权块");
    const text = await b.evaluate(`({ notice: document.querySelector('.post-outdated').textContent, modified: document.querySelector('#copyright').textContent })`);
    if (text.modified.includes("暂没有修改过")) assert.doesNotMatch(text.notice, /修改/, `没修改过的文章，提示不能说“最后修改于”：${text.notice}`);
  },

  async copyright() {
    await open(zod);
    assert.ok(await waitFor(`!!document.querySelector('.post-copyright-url')`));
    const shown = await b.evaluate(`document.querySelector('.post-copyright-url').textContent`);
    assert.doesNotMatch(shown, /%[0-9a-f]{2}/i, `链接要显示成人能读的样子：${shown}`);
  },

  async timeline() {
    await open("/timeline", { width: 390, height: 844, theme: "light" });
    assert.ok(await waitFor(`!!document.querySelector('.timeline-item')`));
    await b.evaluate(`document.querySelectorAll('.timeline-month').forEach((m) => m.setAttribute('data-reveal-state', 'shown'))`);
    await sleep(1800);
    // 找标题换行的条目，比较小星中心和标题第一行中心
    const rows = await b.evaluate(`[...document.querySelectorAll('.timeline-item')].map((item) => {
      const link = item.querySelector('a'); const range = document.createRange(); range.selectNodeContents(link)
      const lines = [...range.getClientRects()]; const node = item.querySelector('.timeline-node').getBoundingClientRect()
      const tops = [...new Set(lines.map((r) => Math.round(r.top)))]
      return { title: link.textContent.trim(), lines: tops.length, first: lines[0].top + lines[0].height / 2, node: node.top + node.height / 2 }
    }).filter((row) => row.lines > 1)`);
    assert.ok(rows.length > 0, "手机上要有标题换行的条目");
    for (const row of rows) assert.ok(Math.abs(row.node - row.first) <= 3, `“${row.title}”的小星要对齐第一行（差 ${(row.node - row.first).toFixed(1)}px）`);
  },

  async friends() {
    for (const path of ["/en/friends", "/friends"]) {
      await open(path);
      assert.ok(await waitFor(`!!document.querySelector('.link-apply-form')`), `${path} 有申请表单`);
      const layout = await b.evaluate(`(() => {
        const rows = [...document.querySelectorAll('.link-apply-info > div')].map((row) => {
          const dt = row.querySelector('dt'); const dd = row.querySelector('dd')
          return { label: dt.textContent, dtHeight: dt.getBoundingClientRect().height, lineHeight: parseFloat(getComputedStyle(dt).lineHeight), ddLeft: dd.getBoundingClientRect().left }
        })
        const mine = document.querySelector('.link-apply-mine .friend-card').getBoundingClientRect()
        const yours = document.querySelector('.link-apply-preview .friend-card').getBoundingClientRect()
        return { rows, mine: { top: mine.top, height: mine.height }, yours: { top: yours.top, height: yours.height } }
      })()`);
      for (const row of layout.rows) assert.ok(row.dtHeight < row.lineHeight * 1.5, `${path}：标签“${row.label}”不能换行`);
      const lefts = layout.rows.map((row) => Math.round(row.ddLeft));
      assert.equal(new Set(lefts).size, 1, `${path}：每行的值左边对齐（${lefts.join("/")}）`);
      assert.ok(Math.abs(layout.mine.top - layout.yours.top) < 1 && Math.abs(layout.mine.height - layout.yours.height) < 1, `${path}：两张名片一样高（${layout.mine.height}/${layout.yours.height}）`);
    }
  },

  async says() {
    await open("/says", { theme: "light" });
    assert.ok(await waitFor(`!!document.querySelector('.say-plate-grid') && !!document.querySelector('.say-plate-frame')`), "浅色主题有星图图版");
    const rects = await b.evaluate(`(() => {
      const r = (el) => { const x = el.getBoundingClientRect(); return { left: x.left, right: x.right, top: x.top, bottom: x.bottom } }
      return { grid: r(document.querySelector('.say-plate-grid')), frame: r(document.querySelector('.say-plate-frame')) }
    })()`);
    for (const side of ["left", "top"]) assert.ok(rects.grid[side] >= rects.frame[side] - 0.5, `经纬线不能画到图框外（${side}：线 ${rects.grid[side]}，框 ${rects.frame[side]}）`);
    for (const side of ["right", "bottom"]) assert.ok(rects.grid[side] <= rects.frame[side] + 0.5, `经纬线不能画到图框外（${side}：线 ${rects.grid[side]}，框 ${rects.frame[side]}）`);
  },

  async featured() {
    await open("/posts", { width: 390, height: 844, theme: "light" });
    assert.ok(await waitFor(`!!document.querySelector('.entry.is-featured')`), "文章列表第一页有置顶文章");
    const rects = await b.evaluate(`(() => {
      const card = document.querySelector('.entry.is-featured').getBoundingClientRect()
      const title = (entry) => entry.querySelector('.entry-title').getBoundingClientRect().left
      return { left: card.left, right: card.right, width: innerWidth, featuredTitle: title(document.querySelector('.entry.is-featured')), normalTitle: title(document.querySelector('.entry:not(.is-featured)')) }
    })()`);
    assert.ok(rects.left >= 4 && rects.right <= rects.width - 4, `置顶卡片的边框不能贴着屏幕边（${rects.left}–${rects.right}，屏宽 ${rects.width}）`);
    assert.ok(Math.abs(rects.featuredTitle - rects.normalTitle) < 1, `置顶和普通条目的标题仍左对齐（${rects.featuredTitle}/${rects.normalTitle}）`);
  },

  async social() {
    await open("/", { width: 390, height: 844, theme: "light" });
    assert.ok(await waitFor(`document.querySelectorAll('.home-hero .home-hero-socials button').length > 1`), "首屏有两个以上的名片（微信、QQ…）");
    await sleep(1200);
    const tops = await b.evaluate(`[...document.querySelectorAll('.home-hero .home-hero-socials button')].map((button) => Math.round(button.getBoundingClientRect().top))`);
    assert.equal(new Set(tops).size, 1, `名片要在同一行，不能被拆开（各自的 top：${tops.join("/")}）`);
  },

  async codelang() {
    await open(zod, { width: 390, height: 844, theme: "light" });
    assert.ok(await waitFor(`!!document.querySelector('.article-body .code-frame .code-lang')`), "Zod 有带语言图标的代码块");
    const overlaps = await b.evaluate(`[...document.querySelectorAll('.article-body .code-frame')].filter((frame) => frame.querySelector('.code-lang')).map((frame) => {
      const icon = frame.querySelector('.code-lang').getBoundingClientRect()
      const range = document.createRange(); range.selectNodeContents(frame.querySelector('pre code') ?? frame.querySelector('pre'))
      const lines = [...range.getClientRects()].filter((r) => r.width > 0); const last = lines.at(-1)
      return { overlap: last.bottom > icon.top + 1 && last.top < icon.bottom - 1, lastBottom: last.bottom, iconTop: icon.top }
    }).filter((row) => row.overlap)`);
    assert.deepEqual(overlaps, [], "语言图标不能压在最后一行代码上");
  },

  async emptystate() {
    await open("/does-not-exist", { theme: "light" });
    assert.ok(await waitFor(`!!document.querySelector('.empty-state p:not(.empty-state-code)')`));
    const lastLine = await b.evaluate(`(() => {
      const p = document.querySelector('.empty-state p:not(.empty-state-code)'); const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT); const tops = []
      for (let node; (node = walker.nextNode());) for (let i = 0; i < node.length; i++) { const r = document.createRange(); r.setStart(node, i); r.setEnd(node, i + 1); const rect = r.getBoundingClientRect(); if (rect.width) tops.push(Math.round(rect.top)) }
      const last = Math.max(...tops); return { lines: new Set(tops).size, chars: tops.filter((t) => t === last).length }
    })()`);
    if (lastLine.lines > 1) assert.ok(lastLine.chars >= 4, `最后一行不能只剩 ${lastLine.chars} 个字`);
  },

  async spacing() {
    const spacing = (selector) => `(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return null; const s = getComputedStyle(el); return parseFloat(s.letterSpacing) / parseFloat(s.fontSize) })()`;
    await open("/en/posts");
    assert.ok(await waitFor(`!!document.querySelector('.list-aside-section > h2')`));
    for (const selector of [".list-aside-section > h2", ".entry-label"]) {
      const em = await b.evaluate(spacing(selector));
      if (em !== null) assert.ok(em <= 0.08, `英文的 ${selector} 字距要收紧（现在 ${em.toFixed(2)}em）`);
    }
    await open("/posts");
    assert.ok(await waitFor(`!!document.querySelector('.list-aside-section > h2')`));
    assert.ok((await b.evaluate(spacing(".list-aside-section > h2"))) >= 0.15, "中文小标签保持原来拉开的字距");
  },

  async pagination() {
    const navs = {};
    for (const path of ["/posts", "/murmurs", "/thinking"]) {
      await open(path, { theme: "light" });
      assert.ok(await waitFor(`!!document.querySelector('.post-pagination')`), `${path} 有翻页`);
      navs[path] = await b.evaluate(`(() => {
        const nav = document.querySelector('.post-pagination'); const box = nav.getBoundingClientRect()
        const links = [...nav.querySelectorAll('a')].map((a) => ({ text: a.textContent.trim(), bg: getComputedStyle(a).backgroundColor }))
        const plain = [...nav.children].filter((el) => el.tagName !== 'A' && el.textContent.trim()).map((el) => { const r = el.getBoundingClientRect(); return { text: el.textContent.trim(), center: r.left + r.width / 2 } })
        return { center: box.left + box.width / 2, links, plain }
      })()`);
    }
    // 第一页：没有“上一页”就什么都不放，不显示灰色的纯文字；页码在整行正中
    for (const path of ["/posts", "/murmurs"]) {
      const nav = navs[path];
      assert.equal(nav.plain.length, 1, `${path} 第一页只有页码是纯文字（现在：${nav.plain.map((p) => p.text).join("、")}）`);
      assert.ok(Math.abs(nav.plain[0].center - nav.center) < 1, `${path} 页码在正中（差 ${(nav.plain[0].center - nav.center).toFixed(1)}px）`);
    }
    // 碎碎念和思考的“更早”写法一样
    const older = (path) => navs[path].links.at(-1)?.text;
    assert.equal(older("/thinking"), older("/murmurs"), `碎碎念、思考的“更早”要同一个写法（${older("/murmurs")} / ${older("/thinking")}）`);
  },

  async aside() {
    // 篇数最少的分类页（内容短，一打开就看得到页脚），和很长的富文本文章
    const categories = (await (await fetch(`${core}/categories`)).json()).data.filter((c) => c.count > 0).sort((a, b) => a.count - b.count);
    for (const [path, selector] of [[`/categories/${categories[0].slug}`, ".list-aside"], [rich, ".site-details"]]) {
      await open(path, { theme: "light" });
      assert.ok(await waitFor(`!!document.querySelector(${JSON.stringify(selector)}) && !!document.querySelector('.site-footer')`), `${path} 有右侧栏和页脚`);
      await b.evaluate(`window.scrollTo(0, document.documentElement.scrollHeight)`);
      await sleep(800);
      const rects = await b.evaluate(`(() => {
        // 右侧栏看得见的区域：会滚动的那一层（现在是里面 sticky 的内层，原来是 fixed 的外层自己）。
        // 不能按子元素算：收起的标签被裁掉了，但它们的位置仍在下面
        const aside = document.querySelector(${JSON.stringify(selector)})
        const bottom = (aside.querySelector('.list-aside-inner, .site-details-inner') ?? aside).getBoundingClientRect().bottom
        const column = document.querySelector('.page-heading').getBoundingClientRect()
        return { bottom, left: aside.getBoundingClientRect().left, footer: document.querySelector('.site-footer').getBoundingClientRect().top, columnRight: column.right }
      })()`);
      assert.ok(rects.bottom <= rects.footer, `${path}：滚到底时右侧栏（下沿 ${rects.bottom.toFixed(0)}）不能压到页脚（${rects.footer.toFixed(0)}）`);
    }
  },
};

const only = process.argv.slice(2);
try {
  for (const [name, check] of Object.entries(checks)) {
    if (only.length && !only.includes(name)) continue;
    await check();
    console.log(`✓ ${name}`);
  }
  assert.deepEqual(b.errors.filter((error) => !/Date\.now\(\)/.test(error)), [], "页面没有报错（开发期 Date.now 那条另有会话在查）");
  console.log("audit-1112b: 通过");
} finally {
  await b.close();
}
