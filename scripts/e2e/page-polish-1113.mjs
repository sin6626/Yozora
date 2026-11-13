// 2026-11-13 打磨：作品页与页面详情右侧栏。每项一组检查，改之前都会失败：
//   divider   没有标题的页面（关于我等）右侧栏不显示目录，可操作栏上面那条“和目录隔开”的线还在，孤零零飘着；有目录的文章照旧有线
//   projects  作品卡片：GitHub 地址显示成仓库名 + GitHub 图标（原来只写“项目地址”），右上角是做的年月（对得上 Core 的创建时间），
//             整张卡可点、去主链接（仓库，没有就预览、文档）
//   favicon   富文本链接前的网站小图标紧贴着文字（Haklex 只留 2.4px）
//   placeholder 输入框的占位提示和标签同一个颜色，浅色主题下“不公开，只用来通知审核结果”看着像已经填好的内容
// 需要先运行 pnpm dev。用法：node scripts/e2e/page-polish-1113.mjs [检查名…]
import assert from "node:assert/strict";
import { openBrowser, sleep } from "../headless-browser.mjs";

const web = process.env.WEB_URL ?? "http://127.0.0.1:2323";
const core = "http://127.0.0.1:2333";
const b = await openBrowser({ port: 9498 });
const waitFor = async (expression, ms = 20000) => {
  for (let t = 0; t < ms; t += 200) { if (await b.evaluate(expression).catch(() => false)) return true; await sleep(200); }
  return false;
};

const checks = {
  async divider() {
    await b.setViewport(1920, 991);
    const pages = (await (await fetch(`${core}/pages?size=20`)).json()).data;
    let checked = 0;
    for (const page of pages) {
      await b.goto(`${web}/${page.slug}`, 3000);
      assert.ok(await waitFor(`!!document.querySelector('.site-details .article-actions')`), `/${page.slug} 有右侧操作栏`);
      await sleep(600);
      const state = await b.evaluate(`({ toc: !!document.querySelector('.site-details .article-toc'), line: parseFloat(getComputedStyle(document.querySelector('.site-details .article-actions')).borderTopWidth) })`);
      if (state.toc) continue;
      checked += 1;
      assert.equal(state.line, 0, `/${page.slug} 没有目录，操作栏上面不该有分隔线`);
    }
    assert.ok(checked > 0, "本地库里要有一个没有标题的页面");
    const posts = (await (await fetch(`${core}/posts?size=50`)).json()).data;
    const rich = posts.find((post) => post.title.startsWith("富文本组件对照"));
    await b.goto(`${web}/posts/${rich.category.slug}/${rich.slug}`, 4000);
    assert.ok(await waitFor(`!!document.querySelector('.site-details .article-toc') && !!document.querySelector('.site-details .article-actions')`), "长文章有目录和操作栏");
    assert.equal(await b.evaluate(`parseFloat(getComputedStyle(document.querySelector('.site-details .article-actions')).borderTopWidth)`), 1, "有目录时目录和操作栏之间仍有一条线");
  },

  async projects() {
    await b.setViewport(1920, 991);
    const projects = (await (await fetch(`${core}/projects?size=20`)).json()).data;
    await b.goto(`${web}/projects`, 3000);
    assert.ok(await waitFor(`document.querySelectorAll('.project-card').length === ${projects.length}`), "每个作品一张卡");
    await sleep(1200); // 等进场动画播完
    const cards = await b.evaluate(`[...document.querySelectorAll('.project-card')].map((card) => {
      const time = card.querySelector('time'); const main = card.querySelector('.card-link')
      const repo = [...card.querySelectorAll('.project-card-links a')].map((a) => ({ text: a.textContent.trim(), href: a.href, github: !!a.querySelector('svg[data-icon="simple-icons:github"]') }))
      // 卡片右下角的空白处（描述下面、链接上面那一带不一定有字），点到的是哪个链接
      const r = card.getBoundingClientRect(); const hit = document.elementFromPoint(r.right - 12, r.top + r.height / 2)?.closest('a')
      const links = [...card.querySelectorAll('.project-card-links a')].map((a) => ({ text: a.textContent.trim(), lines: Math.round(a.getBoundingClientRect().height / parseFloat(getComputedStyle(a).lineHeight)) }))
      return { name: card.querySelector('h2, h3').textContent.trim(), date: time?.textContent.trim(), datetime: time?.getAttribute('datetime'), main: main?.href, hit: hit?.href, repo, links }
    })`);
    for (const project of projects) {
      const card = cards.find((item) => item.name === project.name);
      assert.ok(card, `有“${project.name}”的卡片`);
      const created = new Date(project.created);
      const shanghai = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit" }).format(created).replace("-", ".");
      assert.equal(card.date, shanghai, `“${project.name}”右上角是做的年月`);
      assert.equal(card.datetime, project.created);
      // Core 返回的字段是蛇形（project_url），前台 SDK 才转成驼峰
      const repo = project.project_url, main = repo || project.preview_url || project.doc_url;
      assert.equal(card.main, main, `“${project.name}”标题链到主链接`);
      assert.equal(card.hit, main, `点“${project.name}”卡片的空白处也去主链接`);
      const github = repo?.match(/^https:\/\/github\.com\/([^/]+\/[^/?#]+)/);
      if (github) assert.ok(card.repo.some((link) => link.text === github[1] && link.github && link.href === repo), `“${project.name}”的仓库链接显示 ${github[1]} 和 GitHub 图标：${JSON.stringify(card.repo)}`);
      assert.ok(card.links.every((link) => link.lines === 1), `“${project.name}”的链接都在一行里（仓库名太长就省略）：${JSON.stringify(card.links)}`);
    }
  },

  async favicon() {
    await b.setViewport(1920, 991);
    await b.goto(`${web}/notes/10`, 4000);
    assert.ok(await waitFor(`!!document.querySelector('.article-rich .rich-link-favicon')`, 40000), "手记 10 的富文本里有带网站小图标的链接");
    const gaps = await b.evaluate(`[...document.querySelectorAll('.article-rich .rich-link-favicon')].map((icon) => {
      const link = icon.closest('a'); const r = icon.getBoundingClientRect(); const range = document.createRange(); range.selectNodeContents(link)
      const text = [...range.getClientRects()].find((x) => x.left > r.right - 1 && x.width > 0)
      return text ? text.left - r.right : null
    }).filter((gap) => gap !== null)`);
    assert.ok(gaps.length > 0);
    for (const gap of gaps) assert.ok(gap >= 4, `小图标和文字之间要留出空隙（现在 ${gap.toFixed(1)}px）`);
  },

  async placeholder() {
    const contrast = `(() => {
      // rgb()/rgba() 是 0–255；color-mix 算出来的是 color(srgb r g b / a)，分量 0–1
      const parse = (c) => { const m = c.match(/[\\d.]+/g).map(Number); const scale = c.startsWith('color(') ? 255 : 1; return { rgb: m.slice(0, 3).map((v) => v * scale), a: m[3] ?? 1 } }
      const over = (top, bottom) => top.rgb.map((v, i) => v * top.a + bottom.rgb[i] * (1 - top.a))
      const lum = (rgb) => { const [r, g, b] = rgb.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }); return 0.2126 * r + 0.7152 * g + 0.0722 * b }
      const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05) }
      const input = document.querySelector('.link-apply-form input[name=email]'); const label = document.querySelector('.link-apply-form label[for="' + input.id + '"]')
      const bg = parse(getComputedStyle(input).backgroundColor); const field = bg.a < 1 ? over(bg, parse(getComputedStyle(document.body).backgroundColor)) : bg.rgb
      return { placeholder: ratio(over(parse(getComputedStyle(input, '::placeholder').color), { rgb: field }), field), label: ratio(over(parse(getComputedStyle(label).color), { rgb: field }), field) }
    })()`;
    for (const theme of ["light", "dark"]) {
      await b.setViewport(1920, 991);
      await b.goto(`${web}/debug`, 1500);
      await b.evaluate(`localStorage.setItem('theme', '${theme}')`);
      await b.goto(`${web}/friends`, 3000);
      assert.ok(await waitFor(`!!document.querySelector('.link-apply-form input[name=email]')`), "友链页有申请表单");
      const c = await b.evaluate(contrast);
      assert.ok(c.placeholder <= c.label * 0.85, `${theme}：占位提示要比标签淡（占位 ${c.placeholder.toFixed(2)}，标签 ${c.label.toFixed(2)}）`);
      assert.ok(c.placeholder >= 2.2, `${theme}：占位提示仍要看得清（${c.placeholder.toFixed(2)}）`);
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
  assert.deepEqual(b.errors, [], "页面没有报错");
  console.log("page-polish-1113: 通过");
} finally {
  await b.close();
}
