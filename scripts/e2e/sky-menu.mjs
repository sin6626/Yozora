// 浏览器回归测试：“今晚的天空”面板（components/sky-menu.tsx，2026-11-03 放进页头月亮按钮左边、手机菜单底部）。
// ① 面板只有三块小天空，按 夜紫 / 银河 / 墨黑 排，没有浅色 / 深色开关（那是旁边月亮按钮的事，用户 11-03 要求去掉）；
// ② 点一块天空：<html data-palette> 换掉（夜紫是去掉）、记进 localStorage（夜紫不存）、显示选中，背景星空真的换了颜色（量截图里的天空），深浅不变；
// ③ 望远镜按钮打开真实浮层，读屏名字里有当前配色，方向键换配色，Esc 关；④ 刷新后配色还在；
// ⑤ 页头工具区里望远镜紧挨在月亮按钮左边，从页头选的配色在别的页面也保持；手机菜单底部也有；无页面报错。
// ⑥ 2026-11-04 两次修复选中那块“多了一条线”：① 没选中时的 1px 淡边选中后还留在里面，夹在天空和底色缝之间成了单独一道亮线；
//    ② 悬停时那块往上抬 2px，旧位置那半个像素的圈没被擦掉，圈下面又多一道残影（1 倍屏可见）。量真实像素，圈里、圈外、换选后原来那块都要干净。
// 需要先运行 pnpm dev（默认 http://127.0.0.1:2323，可用 WEB_URL 覆盖）。用法：pnpm e2e
import assert from "node:assert/strict";
import { openBrowser, sleep } from "../headless-browser.mjs";

const base = process.env.WEB_URL ?? "http://127.0.0.1:2323";
const browser = await openBrowser({ port: 9392 });

const panel = () => browser.evaluate(`(() => {
  const panel = document.querySelector(".debug-sky .sky-panel");
  return {
    options: [...panel.querySelectorAll(".sky-option")].map((option) => ({ sky: option.dataset.sky, name: option.querySelector(".sky-name").textContent, checked: option.getAttribute("aria-checked") === "true" })),
    radios: panel.querySelectorAll('[role="radio"]').length,
  };
})()`);
const state = () => browser.evaluate(`({ palette: document.documentElement.dataset.palette ?? null, stored: localStorage.getItem("palette"), theme: document.documentElement.dataset.theme, storedTheme: localStorage.getItem("theme") })`);
const pick = async (sky) => {
  await browser.evaluate(`document.querySelector('.debug-sky .sky-panel [data-sky="${sky}"]').click()`);
  await sleep(1200);
};
// 正文左边空白处的天空（全站固定画布）在截图里的平均颜色
const skyColor = async () => {
  const png = (await browser.send("Page.captureScreenshot", { format: "png" })).result.data;
  return browser.evaluate(`(async () => {
    const image = new Image();
    image.src = "data:image/png;base64,${png}";
    await image.decode();
    const canvas = new OffscreenCanvas(300, 300);
    const context = canvas.getContext("2d");
    context.drawImage(image, 40, 600, 300, 300, 0, 0, 300, 300);
    const { data } = context.getImageData(0, 0, 300, 300);
    const sum = [0, 0, 0];
    for (let i = 0; i < data.length; i += 4) for (let c = 0; c < 3; c++) sum[c] += data[i + c];
    return sum.map((value) => Math.round(value / (data.length / 4)));
  })()`);
};
const distance = (a, b) => Math.hypot(...a.map((value, i) => value - b[i]));

try {
  await browser.setViewport(1920, 991);
  await browser.goto(`${base}/debug?palette=night`);
  await browser.evaluate(`localStorage.removeItem("theme"); document.querySelector("#debug-sky").scrollIntoView({ block: "center" })`);
  await sleep(1500);

  const first = await panel();
  assert.deepEqual(first.options.map((option) => option.sky), ["night", "galaxy", "ink"], "顺序：夜紫、银河、墨黑");
  assert.deepEqual(first.options.map((option) => option.name), ["夜紫", "银河", "墨黑"]);
  assert.ok(first.options[0].checked && !first.options[1].checked, `一开始是夜紫：${JSON.stringify(first.options)}`);
  assert.equal(first.radios, 3, "面板里只有三块天空，没有浅色 / 深色开关");

  const nightSky = await skyColor();
  await pick("galaxy");
  assert.deepEqual(await state(), { palette: "galaxy", stored: "galaxy", theme: "dark", storedTheme: null }, "换配色不动深浅");
  assert.ok((await panel()).options[1].checked, "显示银河选中");
  const galaxySky = await skyColor();
  assert.ok(distance(nightSky, galaxySky) > 6, `背景星空要跟着换：夜紫 ${nightSky} → 银河 ${galaxySky}`);

  await pick("ink");
  assert.equal((await state()).palette, "ink");
  const inkSky = await skyColor();
  assert.ok(distance(galaxySky, inkSky) > 6, `银河 ${galaxySky} → 墨黑 ${inkSky}`);

  await browser.goto(`${base}/debug`);
  assert.equal((await state()).palette, "ink", "刷新后配色还在");
  await browser.evaluate(`document.querySelector("#debug-sky").scrollIntoView({ block: "center" })`);
  await sleep(800);

  await pick("night");
  assert.deepEqual([(await state()).palette, (await state()).stored], [null, null], "夜紫是去掉 data-palette、不存");

  // 真实浮层：望远镜按钮的读屏名字带当前配色；打开后焦点进面板，方向键换配色，Esc 关
  const label = await browser.evaluate(`document.querySelector(".debug-sky .sky-trigger").getAttribute("aria-label")`);
  assert.equal(label, "今晚的天空：夜紫");
  await browser.evaluate(`document.querySelector(".debug-sky .sky-trigger").click()`);
  await sleep(500);
  assert.ok(await browser.evaluate(`!!document.querySelector(".sky-positioner .sky-popup")`), "点按钮打开浮层");
  await browser.evaluate(`document.querySelector('.sky-positioner [data-sky="night"]').focus()`);
  await browser.send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "ArrowRight", code: "ArrowRight", windowsVirtualKeyCode: 39 });
  await browser.send("Input.dispatchKeyEvent", { type: "keyUp", key: "ArrowRight", code: "ArrowRight", windowsVirtualKeyCode: 39 });
  await sleep(1000);
  assert.equal((await state()).palette, "galaxy", "方向键换到下一套");
  await browser.send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await browser.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await sleep(500);
  assert.ok(await browser.evaluate(`!document.querySelector(".sky-positioner .sky-popup")`), "Esc 关掉浮层");

  // 页头：望远镜紧挨在月亮按钮左边；从这里选墨黑，换到别的页面整页打开也保持
  await browser.goto(`${base}/posts?palette=night`);
  await sleep(1000);
  const tools = await browser.evaluate(`[...document.querySelector(".site-header-tools").children].map((el) => el.classList.contains("sky-trigger") ? "sky" : el.classList.contains("theme-toggle") ? "theme" : "other")`);
  assert.deepEqual(tools.slice(-2), ["sky", "theme"], `页头工具区最后两个是望远镜和月亮：${tools}`);
  await browser.evaluate(`document.querySelector(".site-header-tools .sky-trigger").click()`);
  await sleep(600);
  assert.equal(await browser.evaluate(`document.querySelector(".site-header").dataset.mode`), "bar");
  await browser.evaluate(`document.querySelector('.sky-positioner [data-sky="ink"]').click()`);
  await sleep(1200);
  await browser.goto(`${base}/notes`);
  assert.deepEqual([(await state()).palette, (await state()).stored], ["ink", "ink"], "页头选的墨黑换页后还在");

  // 手机：菜单底部也有望远镜
  await browser.setViewport(390, 844);
  await browser.goto(`${base}/posts`);
  await browser.evaluate(`document.querySelector(".mobile-menu-trigger").click()`);
  await sleep(800);
  assert.ok(await browser.evaluate(`!!document.querySelector(".mobile-menu-bottom .sky-trigger")`), "手机菜单底部有望远镜");

  // ⑥ 选中那块的边：用真实鼠标打开页头面板，截真实像素，沿那块竖着走一条线，从天空里 5px 一直走到外面 12px。
  //    强调色圈（和前后都差很多的那几行）之前：每个点都要落在“天空边缘颜色”和“底色缝颜色”之间（各放宽 8），否则是圈里面多了一条线（11-04 第一次）；
  //    圈之后：都要是浮层底色，否则是圈外面多了一条线——鼠标停在那块上时出现过（11-04 第二次：悬停往上抬 2px，旧位置半个像素的圈没擦掉）。
  //    换选以后，原来那块外面也要干干净净。1、1.25、2 倍屏（Windows 缩放、页面放大时是非整数倍）× 深浅主题 × 鼠标在不在上面
  const lum = (png, dpr, column, rows) => browser.evaluate(`(async () => {
    const image = new Image();
    image.src = "data:image/png;base64,${png}";
    await image.decode();
    const canvas = new OffscreenCanvas(image.width, image.height);
    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0);
    const x = Math.round(${column} * ${dpr});
    return JSON.stringify(${JSON.stringify(rows)}.map(([from, to]) => {
      const values = [];
      const step = to > from ? 1 : -1;
      for (let row = Math.round(from * ${dpr}); step > 0 ? row <= Math.round(to * ${dpr}) : row >= Math.round(to * ${dpr}); row += step) {
        const [r, g, b] = context.getImageData(x, row, 1, 1).data;
        values.push(Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b));
      }
      return values;
    }));
  })()`).then(JSON.parse);
  const tileRect = (sky) => browser.evaluate(`JSON.stringify(document.querySelector('.sky-positioner [data-sky="${sky}"] .sky-preview').getBoundingClientRect())`).then(JSON.parse);
  const mouse = async (x, y, click = false) => { for (const type of click ? ["mouseMoved", "mousePressed", "mouseReleased"] : ["mouseMoved"]) await browser.send("Input.dispatchMouseEvent", { type, x, y, button: "left", clickCount: 1 }); };
  const openPanel = async (theme, dpr) => {
    await browser.send("Emulation.setDeviceMetricsOverride", { width: 1920, height: 991, deviceScaleFactor: dpr, mobile: false });
    await browser.goto(`${base}/posts?palette=night`);
    await browser.evaluate(theme === "light" ? `localStorage.setItem("theme", "light")` : `localStorage.removeItem("theme")`);
    await browser.goto(`${base}/posts?palette=night`);
    await sleep(1200);
    const trigger = JSON.parse(await browser.evaluate(`JSON.stringify(document.querySelector(".site-header-tools .sky-trigger").getBoundingClientRect())`));
    await mouse(trigger.x + trigger.width / 2, trigger.y + trigger.height / 2, true);
    await mouse(200, 600);
    await sleep(800);
  };
  const edgeLines = [];
  for (const theme of ["dark", "light"]) {
    for (const dpr of [1, 1.25, 2]) {
      for (const hover of [false, true]) {
        await openPanel(theme, dpr);
        if (hover) {
          const tile = await tileRect("night");
          await mouse(tile.x + 8, tile.y + 8);
          await sleep(600);
        }
        const tile = await tileRect("night");
        const png = (await browser.send("Page.captureScreenshot", { format: "png" })).result.data;
        const [bottom, top] = await lum(png, dpr, tile.x + tile.width / 2, [[tile.bottom - 5, tile.bottom + 12], [tile.y + 5, tile.y - 12]]);
        for (const [side, rows] of Object.entries({ bottom, top })) {
          // 底色缝和浮层同色（--surface），最外面那个点就是它。第一次碰到它的地方是缝的开始：
          // 之前只能从天空色平滑过渡到底色；之后只能有一段不是底色的（强调色圈，最多 1.5px），再多一段就是多了一条线
          const surface = rows.at(-1);
          const near = (value) => Math.abs(value - surface) <= 8;
          const gap = rows.findIndex(near);
          const inside = rows.slice(0, gap).filter((value) => value > Math.max(rows[0], surface) + 8 || value < Math.min(rows[0], surface) - 8);
          const runs = rows.slice(gap).reduce((list, value, i, all) => (!near(value) && (i === 0 || near(all[i - 1])) ? [...list, 1] : !near(value) ? [...list.slice(0, -1), list.at(-1) + 1] : list), []);
          if (gap <= 0 || inside.length || runs.length !== 1 || runs[0] > Math.ceil(1.5 * dpr) + 2) edgeLines.push(`${theme} ${dpr}x ${hover ? "悬停" : "不悬停"} ${side}：${rows.join(",")}`);
        }
      }
      // 换选：真实鼠标点银河，再把鼠标移开；原来选中的夜紫外面不能留下圈的残影
      await openPanel(theme, dpr);
      const galaxy = await tileRect("galaxy");
      await mouse(galaxy.x + galaxy.width / 2, galaxy.y + galaxy.height / 2, true);
      await mouse(200, 600);
      await sleep(1200);
      const old = await tileRect("night");
      const png = (await browser.send("Page.captureScreenshot", { format: "png" })).result.data;
      const [below, above] = await lum(png, dpr, old.x + old.width / 2, [[old.bottom + 1, old.bottom + 12], [old.y - 1, old.y - 12]]);
      for (const [side, rows] of Object.entries({ below, above })) {
        if (rows.some((value) => Math.abs(value - rows.at(-1)) > 8)) edgeLines.push(`${theme} ${dpr}x 换选后原来那块 ${side}：${rows.join(",")}`);
      }
    }
  }
  await browser.evaluate(`localStorage.removeItem("theme"); localStorage.removeItem("palette")`);
  assert.deepEqual(edgeLines, [], `选中那块的边上多了线：\n${edgeLines.join("\n")}`);

  assert.deepEqual(browser.errors, [], `页面报错：${browser.errors.join("\n")}`);
  console.log(`PASS 今晚的天空：三块天空的顺序、没有深浅开关、点选换 data-palette 并记在 localStorage 且不动深浅、背景星空跟着换（夜紫 ${nightSky} → 银河 ${galaxySky} → 墨黑 ${inkSky}）、浮层读屏名字、方向键换配色、Esc 关闭、页头紧挨月亮且换页保持、手机菜单也有、选中那块的边上没有多一条线`);
} finally {
  await browser.evaluate(`localStorage.removeItem("palette"); localStorage.removeItem("theme")`).catch(() => {});
  browser.close();
}
