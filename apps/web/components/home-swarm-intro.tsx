"use client";

import { useLayoutEffect } from "react";
import { htmlLang } from "../lib/i18n/config";
import type { Messages } from "../lib/i18n/messages";
import { useLocale, useT } from "./locale-provider";

// 首页蜂群开场（2026-11-10 站长定）：从别的网站来、或直接打开首页的那一次，第一屏先盖成空白夜色，
// 一群光标聚过来把第一屏（连同夜空）一笔一笔画出来，画完光标慢慢散开、整层淡出，露出真实页面。站内跳回首页照旧播 CSS 入场。
// 播不播由根布局 <head> 里的 swarmIntroScript 在绘制前决定（标上 html[data-swarm-intro="pending"]），这里只负责播。
// 动画引擎是 public/swarm-cursors.js（Joel Califa 的 Swarm 效果，经 Swarm Rebuild 改成网页脚本，文件头有署名和我们改过的地方），
// 只在要播的那一次才加载。1 倍速，只画第一屏：下半部分、页脚不交给它。
type Progress = { ready: boolean; started: boolean; complete: boolean; cursors: number; working: number; colors: string[]; done: number; total: number };
type Swarm = { start(): void; stop(reveal: boolean): void; isRunning(): boolean; progress(): Progress | null; root(): ShadowRoot | null };
declare global {
  interface Window {
    SwarmCursors?: Swarm;
    SwarmCursorsConfig?: Record<string, string>;
  }
}

// 一次页面加载里只看一次：站内跳走再跳回首页时不再播
let decided = false;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function loadEngine(): Promise<Swarm> {
  if (window.SwarmCursors) return Promise.resolve(window.SwarmCursors);
  window.SwarmCursorsConfig = { trigger: "none", hotkey: "" };
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "/swarm-cursors.js";
    script.async = true;
    script.onload = () => (window.SwarmCursors ? resolve(window.SwarmCursors) : reject(new Error("swarm-cursors 没有加载")));
    script.onerror = () => reject(new Error("swarm-cursors 没有加载"));
    document.head.append(script);
  });
}

// 夜空是 WebGL 画布，引擎读不到它的画面：请 starfield.tsx 拍一张当前夜空，铺成同位置的图片交给光标画
function skySnapshot(): HTMLImageElement | null {
  let url = "";
  window.dispatchEvent(new CustomEvent("yozora:sky-snapshot", { detail: (value: string) => (url = value) }));
  if (!url) return null;
  const img = document.createElement("img");
  img.className = "swarm-sky";
  img.alt = "";
  img.src = url;
  return img;
}

const escape = (text: string) => text.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
// 词典里的一句话（如“还剩 {left} / {total} 个元素”），数字加粗
function line(message: { template: string }, values: Record<string, string>) {
  return message.template
    .split(/(\{[A-Za-z][A-Za-z0-9]*\})/)
    .map((part) => {
      const name = /^\{([A-Za-z][A-Za-z0-9]*)\}$/.exec(part)?.[1];
      return name && name in values ? `<b>${escape(values[name])}</b>` : escape(part);
    })
    .join("");
}

// 底部进度条：画在蜂群自己的图层里（shadow root），跟着它出现和淡出；原版英文控制栏和开场图标藏掉
const hudStyle = `
.intro, .hud { display: none !important; }
.yz-hud { position: absolute; left: 50%; bottom: 24px; z-index: 6; display: flex; align-items: center; gap: 12px; padding: 9px 16px 9px 12px; border-radius: 999px; background: rgba(9, 7, 16, 0.9); border: 1px solid rgba(255, 255, 255, 0.1); box-shadow: 0 12px 32px rgba(0, 0, 0, 0.45); backdrop-filter: blur(14px); color: rgba(236, 232, 244, 0.72); font: 400 12.5px/1 -apple-system, "PingFang SC", "Noto Sans SC", system-ui, sans-serif; letter-spacing: 0; font-variant-numeric: tabular-nums; white-space: nowrap; pointer-events: none; opacity: 0; transform: translate(-50%, 12px); transition: opacity 0.4s ease, transform 0.45s cubic-bezier(0.2, 0.8, 0.2, 1); }
.yz-hud.on { opacity: 1; transform: translate(-50%, 0); }
.yz-hud b { color: #f6ead0; font-weight: 600; }
.yz-dots { display: flex; }
.yz-dots:empty { display: none; }
.yz-dots i { width: 14px; height: 14px; border-radius: 50%; margin-left: -4px; border: 1.5px solid rgba(9, 7, 16, 0.95); }
.yz-dots i:first-child { margin-left: 0; }
.yz-sep { width: 1px; height: 12px; background: rgba(255, 255, 255, 0.14); }
.yz-bar { width: 140px; height: 3px; border-radius: 2px; background: rgba(255, 255, 255, 0.12); overflow: hidden; }
.yz-bar i { display: block; height: 100%; width: 0; background: linear-gradient(90deg, #e0a6e8, #f6ead0); transition: width 0.3s ease; }
.yz-skip { color: rgba(236, 232, 244, 0.42); font-size: 11.5px; }
`;

function mountHud(root: ShadowRoot, t: Messages["swarm"], locale: string) {
  const style = document.createElement("style");
  style.textContent = hudStyle;
  const hud = document.createElement("div");
  hud.className = "yz-hud";
  hud.setAttribute("aria-hidden", "true");
  hud.innerHTML = `<span class="yz-dots"></span><span class="yz-cursors"></span><span class="yz-sep"></span><span class="yz-left"></span><span class="yz-bar"><i></i></span><span class="yz-sep"></span><span class="yz-skip">${escape(t.skip)}</span>`;
  root.append(style, hud);
  requestAnimationFrame(() => hud.classList.add("on"));
  const number = new Intl.NumberFormat(htmlLang(locale));
  const $ = (selector: string) => hud.querySelector<HTMLElement>(selector)!;
  return (p: Progress, seconds: string) => {
    const n = (value: number) => number.format(value);
    $(".yz-dots").innerHTML = p.colors.map((color) => `<i style="background:${escape(color)}"></i>`).join("");
    if (!p.ready) {
      $(".yz-cursors").innerHTML = line(t.gathering, { count: n(p.cursors) });
      $(".yz-left").textContent = t.scanning;
    } else {
      $(".yz-cursors").innerHTML = p.started && !p.complete ? line(t.cursors, { count: n(p.cursors), working: n(p.working) }) : `<b>${n(p.cursors)}</b>`;
      $(".yz-left").innerHTML = p.complete ? line(t.done, { seconds }) : p.started ? line(t.left, { left: n(p.total - p.done), total: n(p.total) }) : line(t.total, { total: n(p.total) });
    }
    $(".yz-bar i").style.width = p.total ? `${(p.done / p.total) * 100}%` : "0%";
  };
}

export default function HomeSwarmIntro() {
  const t = useT().swarm;
  const locale = useLocale();

  // 布局阶段（绘制前）接手：把 <head> 脚本留下的 CSS 遮罩换成真的遮罩元素（引擎拍快照时会跳过它）
  useLayoutEffect(() => {
    const html = document.documentElement;
    const entry = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    const landedHere = !entry || new URL(entry.name).pathname === location.pathname;
    if (decided || html.dataset.swarmIntro !== "pending" || !landedHere) {
      decided = true;
      if (html.dataset.swarmIntro === "pending") delete html.dataset.swarmIntro;
      return;
    }
    decided = true;
    html.dataset.swarmIntro = "playing";
    const cover = document.createElement("div");
    cover.className = "swarm-cover";
    cover.setAttribute("data-swarm-ignore", "");
    document.body.append(cover);

    let started = false;
    let cancelled = false;
    let sky: HTMLImageElement | null = null;
    let poll = 0;
    const ignored: Element[] = [];
    const restore = () => {
      cover.remove();
      for (const el of ignored) el.removeAttribute("data-swarm-ignore");
      if (sky) {
        const img = sky;
        sky = null;
        img.style.opacity = "0";
        setTimeout(() => img.remove(), 700);
      }
    };
    // 没播成（脚本没加载、出错）：去掉标记，第一屏照常播 CSS 入场
    const giveUp = () => {
      restore();
      delete html.dataset.swarmIntro;
    };
    // 播完或按 Esc 跳过：保留标记（不然首屏的 CSS 入场会在真实页面上再播一遍），离开首页时再去掉
    const onExit = () => {
      clearInterval(poll);
      restore();
      html.dataset.swarmIntro = "done";
    };

    const run = async () => {
      try {
        sessionStorage.setItem("swarm-intro", "1");
      } catch {}
      const swarm = await Promise.race([loadEngine(), sleep(6000).then(() => null)]);
      await document.fonts.ready;
      const hero = document.querySelector(".home-hero");
      await Promise.all([...(hero?.querySelectorAll("img") ?? [])].map((img) => (img.complete ? null : img.decode().catch(() => null))));
      await sleep(300);
      if (cancelled) return;
      if (!swarm) return giveUp();
      for (const el of document.querySelectorAll(".home-room, .site-footer, .home-hero-mascot.is-blink, canvas.starfield, nextjs-portal")) {
        el.setAttribute("data-swarm-ignore", "");
        ignored.push(el);
      }
      sky = skySnapshot();
      if (sky) document.body.append(sky);
      window.scrollTo(0, 0);
      window.addEventListener("swarm:exit", onExit, { once: true });
      started = true;
      const startedAt = performance.now();
      swarm.start();
      const root = swarm.root();
      const render = root ? mountHud(root, t, locale) : null;
      let finishing = false;
      poll = window.setInterval(async () => {
        const p = swarm.isRunning() ? swarm.progress() : null;
        if (!p) return;
        const seconds = ((performance.now() - startedAt) / 1000).toFixed(1);
        render?.(p, seconds);
        if (!p.complete || finishing) return;
        // 画完：光标在原地绕一会儿，再慢慢散开、整层淡出（引擎的 stop(true)）
        finishing = true;
        cover.remove();
        await sleep(700);
        if (!cancelled && swarm.isRunning()) swarm.stop(true);
      }, 150);
    };
    const timer = setTimeout(() => void run().catch(giveUp), 0);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      clearInterval(poll);
      window.removeEventListener("swarm:exit", onExit);
      if (!started) {
        // 开发模式严格模式会先卸载再挂载一次：还没开始就还原，让第二次挂载接着播
        cover.remove();
        decided = false;
        html.dataset.swarmIntro = "pending";
        return;
      }
      if (window.SwarmCursors?.isRunning()) window.SwarmCursors.stop(false);
      restore();
      delete html.dataset.swarmIntro;
    };
    // 只在挂载时决定一次；文案在开始时取用
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
