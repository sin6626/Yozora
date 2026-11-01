// 浏览器回归测试：文章、手记列表的筛选（2026-10-31 与用户约定的规则）。
// 曾经的问题：点标签、话题或在列表页搜索后，换成一个只有标题的结果页，没有摘要和统计；文章的分类那一行消失，页面上回不到完整列表。
// 现在：① 标签、搜索、话题的结果和普通列表同一种条目（摘要、阅读时长等）；② 文章的分类那一行一直在；
// ③ 标签和搜索在列表上方显示一枚“当前筛选 ×”，点 × 回到完整列表；④ 分类、标签、搜索同时只生效一个（分类页点标签会离开分类）；
// ⑤ 手记的话题排成一行（全部手记 / 各话题），当前话题高亮；⑥ 结果多于 10 条时分页且翻页保留筛选；
// ⑦ 宽屏（≥ 90rem）搜索、分类、标签在列表右边悬浮的筛选栏里，标签摊开最常用的 12 个、其余可展开收起；窄屏回到列表上方，标签收在抽屉里，抽屉有过渡且最多推开 14rem。
// 需要先运行 pnpm dev（默认 http://127.0.0.1:2323，可用 WEB_URL 覆盖）。用法：pnpm e2e
import assert from "node:assert/strict";
import { openBrowser, sleep } from "../headless-browser.mjs";

const base = process.env.WEB_URL ?? "http://127.0.0.1:2323";
const browser = await openBrowser({ port: 9368 });

const list = () => browser.evaluate(`(() => {
  const content = [...document.querySelectorAll(".site-content")].find((el) => el.offsetParent !== null) ?? document;
  const entries = [...content.querySelectorAll(".post-list .entry, .note-list .entry")];
  const row = content.querySelector(".post-categories");
  const chip = content.querySelector(".active-filter");
  return {
    path: location.pathname + location.search,
    heading: content.querySelector("h1")?.textContent,
    entries: entries.length,
    excerpts: entries.filter((entry) => entry.querySelector(".entry-excerpt")).length,
    stats: entries.filter((entry) => entry.querySelector(".entry-stats")).length,
    row: row ? [...row.querySelectorAll("a")].map((a) => ({ text: a.textContent, href: a.getAttribute("href"), current: a.getAttribute("aria-current") === "page" })) : null,
    chip: chip ? { text: chip.textContent, clear: chip.querySelector("a")?.getAttribute("href") } : null,
    pages: content.querySelector(".post-pagination") ? [...content.querySelectorAll(".post-pagination a")].map((a) => a.getAttribute("href")) : null,
  };
})()`);
const click = async (selector) => {
  await browser.evaluate(`[...document.querySelectorAll(${JSON.stringify(selector)})].find((el) => el.offsetParent !== null).click()`);
  await sleep(2500);
};

try {
  await browser.setViewport(1920, 991);

  await browser.goto(`${base}/posts?tag=Vue`);
  const tag = await list();
  assert.ok(tag.entries > 0 && tag.excerpts === tag.entries && tag.stats === tag.entries, `标签结果应是完整条目（摘要、统计）：${JSON.stringify(tag)}`);
  assert.ok(tag.row?.some((link) => link.href === "/posts"), `选了标签时分类那一行应还在：${JSON.stringify(tag.row)}`);
  assert.ok(tag.row.every((link) => !link.current), "选了标签时不应有分类处于选中");
  assert.ok(tag.chip?.text.includes("Vue") && tag.chip.clear === "/posts", `应显示“Vue ×”且 × 回到完整列表：${JSON.stringify(tag.chip)}`);

  await click(".active-filter a");
  const cleared = await list();
  assert.equal(cleared.path, "/posts", "点 × 应回到 /posts");
  assert.equal(cleared.chip, null, "回到完整列表后不应再有筛选标记");

  const category = cleared.row.find((link) => link.href.startsWith("/categories/"));
  await browser.goto(base + category.href);
  await click(".list-aside-tags .tag-chip");
  const fromCategory = await list();
  assert.match(fromCategory.path, /^\/posts\?tag=/, `分类页点标签应离开分类、只按标签筛：${fromCategory.path}`);
  assert.ok(fromCategory.row.every((link) => !link.current), "离开分类后分类那一行不应有选中项");

  await browser.goto(`${base}/posts?q=${encodeURIComponent("的")}`);
  const search = await list();
  assert.ok(search.entries > 0 && search.excerpts === search.entries, `搜索结果应是完整条目：${JSON.stringify(search)}`);
  assert.ok(search.row && search.chip?.text.includes("的") && search.chip.clear === "/posts", `搜索时应有分类那一行和“的 ×”：${JSON.stringify(search.chip)}`);
  if (search.entries === 10) assert.ok(search.pages?.some((href) => href.includes("q=") && href.includes("page=2")), `搜索结果多于一页时应分页且保留关键词：${JSON.stringify(search.pages)}`);

  await browser.goto(`${base}/notes?topic=current-situation`);
  const topic = await list();
  assert.ok(topic.entries > 0 && topic.excerpts === topic.entries, `话题结果应是完整条目：${JSON.stringify(topic)}`);
  assert.ok(topic.row?.some((link) => link.href === "/notes" && !link.current) && topic.row.some((link) => link.current && link.href.includes("topic=current-situation")), `手记话题应排成一行且当前话题选中：${JSON.stringify(topic.row)}`);

  await browser.goto(`${base}/notes?q=${encodeURIComponent("的")}`);
  const noteSearch = await list();
  assert.ok(noteSearch.entries > 0 && noteSearch.excerpts === noteSearch.entries && noteSearch.chip?.clear === "/notes", `手记搜索应是完整条目并有“的 ×”：${JSON.stringify(noteSearch)}`);

  // 宽屏（≥ 90rem）：筛选栏悬浮在列表右边（和文章目录同一个位置），搜索、分类、标签都在里面，标签直接摊开不用抽屉
  const layout = () => browser.evaluate(`(() => {
    const content = [...document.querySelectorAll(".site-content")].find((el) => el.offsetParent !== null);
    const aside = content.querySelector(".list-aside");
    const list = content.querySelector(".post-list, .note-list");
    const a = aside.getBoundingClientRect();
    const l = list.getBoundingClientRect();
    // checkVisibility：收起的 <details> 里的内容（content-visibility: hidden）和 display: none 都算看不见
    const shown = (el) => el.checkVisibility();
    return {
      position: getComputedStyle(aside).position,
      asideLeft: Math.round(a.left), asideBottom: Math.round(a.bottom), listRight: Math.round(l.right), listTop: Math.round(l.top),
      search: shown(aside.querySelector(".list-search")),
      categories: [...aside.querySelectorAll(".post-categories a")].filter(shown).length,
      tags: [...aside.querySelectorAll(".tag-chip")].filter(shown).length,
      drawer: [...aside.querySelectorAll(".tag-drawer")].some(shown),
    };
  })()`);
  await browser.goto(`${base}/posts`);
  const wide = await layout();
  assert.ok(wide.position === "fixed" && wide.asideLeft >= wide.listRight, `宽屏时筛选栏应悬浮在列表右边：${JSON.stringify(wide)}`);
  assert.ok(wide.search && wide.categories > 1 && wide.tags > 0 && !wide.drawer, `宽屏筛选栏里应有搜索、分类和直接摊开的标签：${JSON.stringify(wide)}`);

  // 标签多了不能把右栏拉得很长：只摊开最常用的 12 个，其余收在“展开全部”里，能展开也能收起；
  // 正在筛的标签就算不常用也直接显示（不用展开才看得到当前筛选）
  const tagState = () => browser.evaluate(`(() => {
    const section = [...document.querySelectorAll(".site-content .list-aside-tags")].find((el) => el.checkVisibility());
    const more = section.querySelector(".tag-more");
    return {
      visible: [...section.querySelectorAll(".tag-chip")].filter((el) => el.checkVisibility()).map((el) => el.firstChild.textContent),
      total: section.querySelectorAll(".tag-chip").length,
      toggle: more?.querySelector("summary")?.checkVisibility() ?? false,
      open: more?.open ?? null,
    };
  })()`);
  const collapsed = await tagState();
  assert.ok(collapsed.total > 12 && collapsed.visible.length === 12 && collapsed.toggle && collapsed.open === false, `标签多于 12 个时默认只显示 12 个并有“展开全部”：${JSON.stringify({ ...collapsed, visible: collapsed.visible.length })}`);
  await browser.evaluate(`[...document.querySelectorAll(".site-content .tag-more summary")].find((el) => el.checkVisibility()).click()`);
  await sleep(500);
  const expanded = await tagState();
  assert.equal(expanded.visible.length, expanded.total, "展开后显示全部标签");
  await browser.evaluate(`[...document.querySelectorAll(".site-content .tag-more summary")].find((el) => el.checkVisibility()).click()`);
  await sleep(500);
  assert.equal((await tagState()).visible.length, 12, "再点一次收起");
  const rare = expanded.visible.at(-1);
  await browser.goto(`${base}/posts?tag=${encodeURIComponent(rare)}`);
  const withRare = await tagState();
  assert.ok(withRare.visible.includes(rare), `正在筛的不常用标签“${rare}”应直接显示：${JSON.stringify(withRare.visible)}`);
  await browser.goto(`${base}/notes`);
  const notesWide = await layout();
  assert.ok(notesWide.position === "fixed" && notesWide.search && notesWide.categories > 1, `手记页宽屏也有右侧筛选栏（搜索、话题）：${JSON.stringify(notesWide)}`);
  // 话题在后台设了图片（近况有）就显示在话题名前面，和导航“手记”面板一样（曾经漏了）
  const topicIcons = await browser.evaluate(`[...document.querySelectorAll(".site-content .list-aside .post-categories a")].filter((a) => a.checkVisibility()).map((a) => ({ name: a.firstChild.textContent, icon: a.querySelector("img")?.getAttribute("src") ?? null }))`);
  assert.ok(topicIcons.some((topic) => topic.icon), `话题应显示后台设置的图片：${JSON.stringify(topicIcons)}`);

  // 窄一些（1280）：放不下右栏，筛选块回到列表上方，标签收在抽屉里
  await browser.setViewport(1280, 900);
  await browser.goto(`${base}/posts`);
  const narrow = await layout();
  assert.ok(narrow.position !== "fixed" && narrow.asideBottom <= narrow.listTop && narrow.drawer && narrow.tags === 0, `窄屏时筛选在列表上方、标签收在抽屉里：${JSON.stringify(narrow)}`);

  // 抽屉展开、收起有过渡；展开后最多把列表往下推一小段（标签多了在抽屉里滚动）。
  // Chrome 的 getAnimations() 不列出 ::details-content 上的过渡，所以逐帧量展开内容的高度
  const drawer = await browser.evaluate(`(async () => {
    const details = [...document.querySelectorAll(".tag-drawer")].find((el) => el.getClientRects().length > 0);
    const list = [...document.querySelectorAll(".post-list")].find((el) => el.offsetParent !== null);
    const listTop = list.getBoundingClientRect().top;
    const height = () => parseFloat(getComputedStyle(details, "::details-content").height);
    // 点下后逐帧记 500 毫秒的高度
    const sample = async () => {
      const heights = [];
      const end = performance.now() + 500;
      while (performance.now() < end) {
        await new Promise((r) => requestAnimationFrame(r));
        heights.push(height());
      }
      return heights;
    };
    details.querySelector("summary").click();
    const opening = await sample();
    const shift = list.getBoundingClientRect().top - listTop;
    details.querySelector("summary").click();
    const closing = await sample();
    return { opening, closing, shift };
  })()`);
  const open = drawer.opening.at(-1);
  const between = (heights) => heights.filter((h) => h > 0 && h < open).length;
  assert.ok(open > 0 && between(drawer.opening) >= 2, `展开标签抽屉应有高度过渡：${JSON.stringify(drawer.opening)}`);
  assert.ok(drawer.closing.at(-1) === 0 && between(drawer.closing) >= 2, `收起标签抽屉也应有过渡：${JSON.stringify(drawer.closing)}`);
  assert.ok(drawer.shift <= 14 * 16, `展开抽屉最多把列表往下推 14rem：${drawer.shift}px`);

  assert.deepEqual(browser.errors, [], `页面报错：${browser.errors.join("\n")}`);
  console.log(`PASS 标签/搜索/话题结果为完整条目（Vue ${tag.entries} 篇、搜索“的” ${search.entries} 篇、近况 ${topic.entries} 篇）、分类行常驻、“×”回到完整列表、分类页点标签离开分类、手记话题成行、宽屏右侧筛选栏（文章、手记）、窄屏筛选在上方、抽屉展开 ${between(drawer.opening)} 帧过渡到 ${Math.round(open)}px 且列表只下移 ${Math.round(drawer.shift)}px、收起 ${between(drawer.closing)} 帧过渡到 0`);
} finally {
  browser.close();
}
