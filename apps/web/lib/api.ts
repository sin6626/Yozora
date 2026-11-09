import "server-only";
import { AIController, ActivityController, AggregateController, CategoryController, CommentController, LinkController, MurmurController, NoteController, PageController, PostController, ProjectController, RecentlyController, SayController, SearchController, SnippetController, SubscribeController, TopicController, createClient } from "@mx-space/api-client";
import { fetchAdaptor } from "@mx-space/api-client/dist/adaptors/fetch";
import { headers } from "next/headers";
import { unstable_rethrow } from "next/navigation";
import { connect, isIP } from "node:net";
import { getApiUrl, getInternalApiUrl } from "./config";

// 每个请求最多等 8 秒；在本机构建部署包时要隔着慢线路取线上数据，scripts/deploy/build-web.mjs 用 MIX_SPACE_TIMEOUT_MS 放宽。
const timeout = Number(process.env.MIX_SPACE_TIMEOUT_MS) || 8000;

// 内网优先、公网兜底（2026-11-09，docs/architecture-cache-plan.md 第 3 步）。配了 MIX_SPACE_INTERNAL_API_URL 时，
// 服务端请求先走 Docker 内网；每 60 秒用 TCP 连一次内网（最多等 1.5 秒）确认连得上，连不上就这 60 秒都走公网，页面不用每次等 8 秒。
// GET 走内网遇到网络错误或超时（不是 HTTP 4xx/5xx），这一次改走公网重发，同样 60 秒内不再试内网。
// 非 GET 不重发（可能已经写进去了），直接走内网，失败就报错。检查：scripts/verify-api-routing.mjs
const retryAfter = 60_000;
const connectTimeout = 1500;
let probe: { until: number; ok: Promise<boolean> } | null = null;

function reachable(url: URL) {
  return new Promise<boolean>((resolve) => {
    const socket = connect({ host: url.hostname.replace(/^\[|\]$/g, ""), port: Number(url.port) || (url.protocol === "https:" ? 443 : 80), timeout: connectTimeout });
    const done = (ok: boolean) => {
      socket.destroy();
      resolve(ok);
    };
    socket.once("connect", () => done(true)).once("error", () => done(false)).once("timeout", () => done(false));
  });
}

function markDown() {
  probe = { until: Date.now() + retryAfter, ok: Promise.resolve(false) };
}

async function usableInternal(internal: string) {
  if (!probe || Date.now() >= probe.until) probe = { until: Date.now() + retryAfter, ok: reachable(new URL(internal)) };
  return probe.ok;
}

// 连不上、断开、超时；fetch 的这几种错误跨不同全局对象（测试里的 vm）也只能按 name 判断
const isNetworkError = (error: unknown) => ["TypeError", "TimeoutError"].includes((error as { name?: string } | null)?.name ?? "");

// url 是按公网地址拼好的完整地址，send 用给定地址真正发请求（每次调用都要新建超时信号）
async function viaCore<T>(url: string, method: string, send: (url: string) => Promise<T>): Promise<T> {
  const base = getApiUrl();
  const internal = getInternalApiUrl();
  const get = method.toUpperCase() === "GET";
  if (!internal || !url.startsWith(`${base}/`) || (get && !(await usableInternal(internal)))) return send(url);
  try {
    return await send(`${internal}${url.slice(base.length)}`);
  } catch (error) {
    if (!get || !isNetworkError(error)) throw error;
    markDown();
    return send(url);
  }
}

// 发给 Core 的附加请求头。internal：Next 缓存重建（getApiClient、coreFetch）带内部密钥 YOZORA_INTERNAL_KEY，
// Core 对“密钥对且没有转发读者 IP”的请求放行限流；现取客户端是替某位读者发的，永远不带密钥（拿不到读者 IP 时
// 也不带，按 Next 自己的 IP 限流），否则访客能触发的服务端函数会被当成内部请求、绕过限流。现取客户端再加读者 IP
function withHeaders(init: HeadersInit | undefined, ip: string | null, internal: boolean) {
  const result = new Headers(init);
  const key = process.env.YOZORA_INTERNAL_KEY;
  if (key && internal) result.set("x-yozora-internal-key", key);
  if (ip) {
    result.set("x-real-ip", ip);
    result.set("x-forwarded-for", ip);
  }
  // 普通对象：SDK 的请求选项把 headers 定为 Record<string, string>，适配器给 POST 补 Content-Type 时也只认普通对象
  return Object.fromEntries(result);
}

// 不经 SDK 的服务端请求（lib/i18n/data.ts：SDK 会把键名改成驼峰），给 Next 缓存重建用。path 以 / 开头；返回 Response，4xx/5xx 不抛错。
// 正文在重试范围内读完再返回：内网收到响应头后正文中途断开也算网络错误，改走公网
export function coreFetch(path: string, init: RequestInit = {}) {
  const method = init.method ?? "GET";
  return viaCore(`${getApiUrl()}${path}`, method, async (url) => {
    const response = await fetch(url, { ...init, method, headers: withHeaders(init.headers, null, true), cache: "no-store", signal: AbortSignal.timeout(timeout) });
    return new Response(await response.arrayBuffer(), response);
  });
}

// lang：外文页面向 Core 要内容时带上 ?lang=en|ja，Core 会把已有的译文换进去（文章、手记的标题和正文、分类名、话题、心情、天气，
// 来自后台的 AI 翻译和“翻译条目”）；没有译文的保持中文。用查询参数而不是 x-lang 请求头：Core 的接口缓存按地址区分。
function adapterFor(lang: string | undefined, ip: string | null, internal: boolean): typeof fetchAdaptor {
  type Options = Parameters<typeof fetchAdaptor.get>[1];
  const options = (value: Options) => ({ ...value, headers: withHeaders(value?.headers, ip, internal), cache: "no-store" as const, signal: AbortSignal.timeout(timeout) });
  return {
    ...fetchAdaptor,
    get(url, value) {
      const target = lang ? `${url}${url.includes("?") ? "&" : "?"}lang=${encodeURIComponent(lang)}` : url;
      return viaCore(target, "GET", (next) => fetchAdaptor.get(next, options(value)));
    },
    post: (url, value) => viaCore(url, "POST", (next) => fetchAdaptor.post(next, options(value))),
    put: (url, value) => viaCore(url, "PUT", (next) => fetchAdaptor.put(next, options(value))),
    patch: (url, value) => viaCore(url, "PATCH", (next) => fetchAdaptor.patch(next, options(value))),
    delete: (url, value) => viaCore(url, "DELETE", (next) => fetchAdaptor.delete(next, options(value))),
  };
}

function clientFor(lang: string | undefined, ip: string | null, internal: boolean) {
  return createClient(adapterFor(lang && lang !== "zh" ? lang : undefined, ip, internal))(getApiUrl(), {
    controllers: [ActivityController, AggregateController, CategoryController, PostController, NoteController, PageController, ProjectController, SearchController, TopicController, LinkController, MurmurController, SayController, RecentlyController, CommentController, SubscribeController, SnippetController, AIController],
    customThrowResponseError(error) {
      unstable_rethrow(error);
      throw error;
    },
  });
}

// 给放进 Next 缓存（"use cache"）的函数用：那里读不到请求头，不带读者 IP，靠内部密钥放行 Core 的限流
export function getApiClient(lang?: string) {
  return clientFor(lang, null, true);
}

// 读者 IP：Next 只监听 127.0.0.1、只有 openresty 能访问，它写的 x-real-ip / x-forwarded-for 可信。
// 先 x-real-ip，没有再取 x-forwarded-for 的第一个；不是 IP 的值不转发
async function readerIp() {
  const list = await headers();
  const value = list.get("x-real-ip")?.trim() || list.get("x-forwarded-for")?.split(",")[0]?.trim();
  return value && isIP(value) ? value : null;
}

// 给每次请求现取的函数用（不能放进 "use cache"，会读请求头）：把读者 IP 转给 Core，限流按读者算
export async function getLiveApiClient(lang?: string) {
  return clientFor(lang, await readerIp(), false);
}
