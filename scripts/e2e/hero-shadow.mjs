// 浏览器回归测试：首屏头像后面的“影子”久遠 真（2026-11-05）。
// 站长的圆形头像后面藏着她的圆形头像：平时几乎被挡住、只在左下露一点边；鼠标移上头像（或 Tab 到她、触屏点一下站长头像）
// 她往左下滑出来，可以点，点了进她的人设页 /shin（外文页面带语言前缀）。减少动态效果时不做滑动过渡。
// 需要先运行 pnpm dev（默认 http://127.0.0.1:2323，可用 WEB_URL 覆盖）。用法：pnpm e2e
import assert from "node:assert/strict";
import { openBrowser, sleep } from "../headless-browser.mjs";

const base = process.env.WEB_URL ?? "http://127.0.0.1:2323";
const browser = await openBrowser({ port: 9347 });

// 影子和站长头像的位置，以及影子有多少面积落在站长头像外面（露出来的比例）
const measure = `(async () => {
  const link = document.querySelector(".home-shadow");
  const owner = document.querySelector(".home-portrait > .home-hero-avatar");
  if (!link || !owner) return null;
  owner.scrollIntoView({ block: "center" });
  const img = link.querySelector("img");
  await img.decode().catch(() => {});
  const s = link.getBoundingClientRect(), o = owner.getBoundingClientRect();
  // 两个圆：在影子圆里均匀取点，数落在站长圆外的比例
  const sc = [s.left + s.width / 2, s.top + s.height / 2], oc = [o.left + o.width / 2, o.top + o.height / 2];
  let inside = 0, outside = 0, outPoint = null;
  for (let x = -1; x <= 1; x += 0.05) for (let y = -1; y <= 1; y += 0.05) {
    if (x * x + y * y > 1) continue;
    const px = sc[0] + x * s.width / 2, py = sc[1] + y * s.height / 2;
    const dx = px - oc[0], dy = py - oc[1];
    if (dx * dx + dy * dy <= (o.width / 2) ** 2) inside++; else { outside++; if (!outPoint && x * x + y * y < 0.5) outPoint = [px, py]; }
  }
  const at = (p) => p && document.elementFromPoint(p[0], p[1])?.closest(".home-shadow") === link;
  return {
    href: link.getAttribute("href"),
    label: link.getAttribute("aria-label"),
    loaded: img.complete && img.naturalWidth > 0,
    size: [Math.round(s.width), Math.round(o.width)],
    exposed: outside / (inside + outside),
    ownerOnTop: document.elementFromPoint(oc[0], oc[1]) === owner,
    clickable: at(outPoint),
    outPoint,
    owner: oc,
    transition: getComputedStyle(link).transitionDuration,
  };
})()`;
const mouse = (x, y) => browser.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
const click = async (x, y) => { for (const type of ["mousePressed", "mouseReleased"]) await browser.send("Input.dispatchMouseEvent", { type, x, y, button: "left", buttons: type === "mousePressed" ? 1 : 0, clickCount: 1 }); };

try {
  await browser.setViewport(1920, 991);
  await browser.goto(`${base}/`);
  await mouse(5, 500);
  const rest = await browser.evaluate(measure);
  assert.ok(rest, "首屏没有影子头像");
  assert.equal(rest.href, "/shin", "影子应链到 /shin");
  assert.ok(rest.label, "影子链接没有读屏名字");
  assert.ok(rest.loaded, "影子头像图没有加载");
  assert.ok(rest.ownerOnTop, "站长头像应盖在影子上面");
  assert.ok(rest.exposed > 0 && rest.exposed < 0.2, `平时影子只该露一点边，现在露出 ${(rest.exposed * 100).toFixed(0)}%`);

  await mouse(...rest.owner);
  await sleep(900);
  const hover = await browser.evaluate(measure);
  assert.ok(hover.exposed > 0.45, `悬停后影子应滑出来，现在只露出 ${(hover.exposed * 100).toFixed(0)}%`);
  assert.ok(hover.ownerOnTop, "滑出后站长头像仍在上面");
  assert.ok(hover.clickable, "滑出来的影子点不到");

  // 鼠标从站长头像移到影子上，影子不能缩回去
  await mouse(...hover.outPoint);
  await sleep(900);
  const onShadow = await browser.evaluate(measure);
  assert.ok(onShadow.exposed > 0.45, "鼠标移到影子上时它缩回去了");

  await mouse(5, 500);
  await sleep(900);
  const back = await browser.evaluate(measure);
  assert.ok(back.exposed < 0.2, "鼠标离开后影子没有藏回去");

  // 键盘 Tab 到影子时也要滑出来
  await browser.evaluate(`document.querySelector(".home-shadow").focus()`);
  await sleep(900);
  assert.ok((await browser.evaluate(measure)).exposed > 0.45, "键盘聚焦影子时没有滑出来");
  await browser.evaluate(`document.activeElement.blur()`);

  // 点它进人设页
  await mouse(...rest.owner);
  await sleep(900);
  const ready = await browser.evaluate(measure);
  await mouse(...ready.outPoint);
  await click(...ready.outPoint);
  for (let i = 0; i < 60 && (await browser.evaluate("location.pathname")) !== "/shin"; i++) await sleep(100);
  assert.equal(await browser.evaluate("location.pathname"), "/shin", "点影子没有进人设页");

  // 外文页面带语言前缀
  await browser.goto(`${base}/en`);
  assert.equal((await browser.evaluate(measure)).href, "/en/shin", "英文页影子应链到 /en/shin");

  // 手机：没有悬停，点一下站长头像让她滑出来
  await browser.setViewport(390, 844);
  await browser.goto(`${base}/`);
  const phone = await browser.evaluate(measure);
  assert.ok(phone.exposed < 0.2, "手机上平时影子也该藏着");
  await browser.evaluate(`(() => { const o = document.querySelector(".home-portrait > .home-hero-avatar"); const r = o.getBoundingClientRect(); const init = { pointerType: "touch", bubbles: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }; o.dispatchEvent(new PointerEvent("pointerdown", init)); o.dispatchEvent(new PointerEvent("pointerup", init)); })()`);
  await sleep(900);
  const tapped = await browser.evaluate(measure);
  assert.ok(tapped.exposed > 0.45, "手机上点站长头像后影子没有滑出来");
  assert.ok(tapped.clickable, "手机上滑出来的影子点不到");

  // 浅色主题下没有她（站长定：她只在深色主题出现），悬停也不出来
  await browser.setViewport(1920, 991);
  await browser.evaluate(`localStorage.setItem("theme", "light")`);
  await browser.goto(`${base}/`);
  const light = await browser.evaluate(measure);
  await mouse(...light.owner);
  await sleep(900);
  assert.equal(await browser.evaluate(`document.querySelector(".home-shadow").checkVisibility()`), false, "浅色主题下不该出现影子");
  await mouse(5, 500);
  await browser.evaluate(`localStorage.removeItem("theme")`);

  // 减少动态效果：不做滑动过渡
  await browser.setViewport(1920, 991);
  await browser.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  await browser.goto(`${base}/`);
  assert.equal((await browser.evaluate(measure)).transition, "0s", "减少动态效果时影子不该有过渡");

  assert.deepEqual(browser.errors, [], `页面报错：${browser.errors.join("\n")}`);
  console.log("hero-shadow: 通过");
} finally {
  await browser.close();
}
