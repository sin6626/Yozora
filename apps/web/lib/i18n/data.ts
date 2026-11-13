import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { coreFetch } from "../api";
import { defaultLocale, isLanguageCode, siteLocales } from "./config";

// 后台控制的 AI i18n（2026-11-05，docs/site-text-translation-plan.md）：Core 公开的两个接口，
// 用普通 fetch 直接读、不经 SDK——SDK 会把返回的键名改成驼峰，而这里的键是界面文字条目名、中文原文、作品 id，不能动。
// 缓存标签 i18n：Core 发 I18N_UPDATE、改了 AI 设置（OPTION_UPDATE）时 Webhook 让它失效。stale 300：根布局要用（见 AGENTS.md）。
// revalidate 必须等于 expire：根布局在 Suspense 外读这两份缓存，开发期 Next 校验静态外壳时会把“已过 revalidate、没过 expire”的条目
// 当成未命中、当场重取 Core，报 “encountered uncached data during prerendering or a navigation”（检查：scripts/verify-cache-life.mjs）。
const lifetime = { stale: 300, revalidate: 3600, expire: 3600 };

// 走 lib/api.ts 的 coreFetch：内网优先、公网兜底，带内部密钥
async function fetchCore(path: string): Promise<unknown> {
  const response = await coreFetch(path);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Core ${path} 返回 ${response.status}`);
  return response.json();
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const strings = (value: unknown) => Object.fromEntries(isObject(value) ? Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string") : []);

async function loadLanguages() {
  "use cache";
  cacheLife(lifetime);
  cacheTag("i18n");
  const data = await fetchCore("/ai/i18n");
  return siteLocales(isObject(data) && data.enabled === true && Array.isArray(data.languages) ? data.languages : []);
}

// 开着的语言：中文在最前。读不到 Core 时只有中文（不缓存这次失败，下次再读）
export async function getSiteLocales(): Promise<string[]> {
  return loadLanguages().catch(() => [defaultLocale]);
}

// site：站点文案按位置（hero.title、hero.description.0、footer.motto、seo.description……），带着它翻译的那句中文；
// 用的地方核对中文一致才用（片段刚改、两边缓存还没一起刷新时不会对错句子）
export type SiteTranslation = { source: string; text: string };
export type I18nBundle = {
  messages: Record<string, string>;
  site: Record<string, SiteTranslation>;
  projects: Record<string, { name?: string; description?: string }>;
};
const empty: I18nBundle = { messages: {}, site: {}, projects: {} };

async function loadBundle(lang: string): Promise<I18nBundle> {
  "use cache";
  cacheLife(lifetime);
  cacheTag("i18n");
  const data = await fetchCore(`/ai/i18n/${lang}`);
  if (!isObject(data)) return empty;
  const projects = isObject(data.projects) ? data.projects : {};
  const site = isObject(data.site) ? data.site : {};
  return {
    messages: strings(data.messages),
    site: Object.fromEntries(Object.entries(site).flatMap(([slot, value]) => (isObject(value) && typeof value.source === "string" && typeof value.text === "string" ? [[slot, { source: value.source, text: value.text }]] : []))),
    projects: Object.fromEntries(Object.entries(projects).flatMap(([id, value]) => (isObject(value) ? [[id, { name: typeof value.name === "string" ? value.name : undefined, description: typeof value.description === "string" ? value.description : undefined }]] : []))),
  };
}

// 一种语言的全部译文：界面文字（条目名 → 译文）、站点文案（位置 → 中文和译文）、作品（id → 名字和介绍）。
// 只有 Core 已经翻好、通过校验的；中文、读不到时是空的（页面显示中文）
export async function getI18nBundle(lang: string): Promise<I18nBundle> {
  if (lang === defaultLocale || !isLanguageCode(lang)) return empty;
  return loadBundle(lang).catch(() => empty);
}
