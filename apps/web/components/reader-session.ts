"use client";

import { useSyncExternalStore } from "react";
import { useT } from "./locale-provider";
import { realHref } from "../lib/address-typing";

// 读者登录状态（Core 的 Better Auth 会话）。每个访客各不相同，只能在浏览器里读，不能进服务端缓存。
// 登录 Cookie 由 Core 下发且 HttpOnly，所有请求都要 credentials: "include" 才会带上。
// provider：这次是用哪种第三方登录的（Core 在登录回调里写进会话），页头头像角标用；handle 是 GitHub 用户名。
export type Reader = { name: string; image?: string; isOwner: boolean; handle?: string; email?: string; provider?: string };
type State = { status: "loading" } | { status: "guest" } | { status: "reader"; reader: Reader };

const loadingState: State = { status: "loading" };
let state: State = loadingState;
let loaded: string | null = null;
const listeners = new Set<() => void>();

function set(next: State) {
  state = next;
  listeners.forEach((listener) => listener());
}

async function load(apiUrl: string) {
  try {
    const response = await fetch(`${apiUrl}/auth/get-session`, { credentials: "include" });
    const session = response.ok
      ? await response.json() as { session?: { provider?: string | null }; user?: { name?: string; image?: string | null; role?: string; handle?: string | null; email?: string | null } } | null
      : null;
    const user = session?.user;
    set(user ? {
      status: "reader",
      reader: {
        name: user.name || "读者",
        image: user.image ?? undefined,
        isOwner: user.role === "owner",
        handle: user.handle || undefined,
        email: user.email || undefined,
        provider: session?.session?.provider || undefined,
      },
    } : { status: "guest" });
  } catch {
    set({ status: "guest" });
  }
}

export function useReaderSession(apiUrl: string) {
  return useSyncExternalStore(
    (onChange) => {
      listeners.add(onChange);
      if (loaded !== apiUrl) {
        loaded = apiUrl;
        void load(apiUrl);
      }
      return () => listeners.delete(onChange);
    },
    () => state,
    // 服务端快照必须恒为“读取中”：页面里有好几处用到登录状态（页头、文末评论、评论悬浮窗），分在不同的 Suspense 里先后水合，
    // 若返回当前状态，后水合的那处拿到的是已读到的“游客/读者”，和服务端输出的“读取中”对不上，报 Hydration failed
    () => loadingState,
  );
}

// 读者登录方式：后台“设置 → 账户 → OAuth”里启用并填好密钥的才会出现（blog-data 的 getLoginProviders）。
export type LoginProvider = "github" | "google";
export const providerNames: Record<LoginProvider, string> = { github: "GitHub", google: "Google" };
// 授权页只放行官方地址，防止 Core 返回的跳转地址被篡改
const providerOrigins: Record<LoginProvider, string> = { github: "https://github.com/", google: "https://accounts.google.com/" };
const loginParams = ["login", "login_provider", "error", "error_description"];

// 登录失败时 Core（Better Auth）默认跳到它自己的英文错误页，页上的“返回首页”会把人带到 Core 根地址。
// 这里让失败也回到发起登录的页面：地址带 login=failed&login_provider=…，Better Auth 再追加 error=错误码。
// source：从评论区发起（回跳地址带 #comments）的错误显示在评论表单里，从页头发起的由夜航岛播报
// Better Auth 的错误码里有专门说明的几种，其余用通用说明
const knownErrors = ["state_mismatch", "access_denied", "invalid_code", "account_not_linked", "unable_to_get_user_info"] as const;
type KnownError = (typeof knownErrors)[number];
// 错误文案按当前语言拼（messages 的 loginErrors），这里只记错误码和登录方式
type LoginError = { code: string; provider: LoginProvider | null; source: "comments" | "header" };
let loginError: LoginError | null | undefined;
const noSubscribe = () => () => {};

function readLoginError() {
  if (loginError !== undefined) return loginError;
  const url = new URL(realHref());
  if (url.searchParams.get("login") !== "failed") return (loginError = null);
  const code = url.searchParams.get("error") || "unknown";
  const provider = url.searchParams.get("login_provider");
  loginError = {
    code,
    provider: provider === "github" || provider === "google" ? provider : null,
    source: url.hash === "#comments" ? "comments" : "header",
  };
  for (const key of loginParams) url.searchParams.delete(key);
  // 只提示一次：把参数从地址栏去掉，刷新后不再出现（带上 history.state，否则 Next 会当成路由更新）。
  queueMicrotask(() => history.replaceState(history.state, "", url));
  return loginError;
}

export function useLoginError(source: LoginError["source"]) {
  const error = useSyncExternalStore(noSubscribe, readLoginError, () => null);
  const t = useT().loginErrors;
  if (error?.source !== source) return null;
  const name = error.provider ? providerNames[error.provider] : t.unknownProvider;
  const describe = knownErrors.includes(error.code as KnownError) ? t[error.code as KnownError] : t.fallback;
  return `${describe(name)}${t.code(error.code)}`;
}

// 跳到第三方授权页，完成后 Core 再把访客送回发起登录的页面（hash 给 "comments" 时回到评论区）。
export async function signIn(apiUrl: string, provider: LoginProvider, hash?: string) {
  const page = new URL(realHref());
  for (const key of loginParams) page.searchParams.delete(key);
  if (hash !== undefined) page.hash = hash;
  const callbackURL = page.href;
  page.searchParams.set("login", "failed");
  page.searchParams.set("login_provider", provider);
  const errorCallbackURL = page.href;
  const response = await fetch(`${apiUrl}/auth/sign-in/social`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provider, callbackURL, errorCallbackURL, disableRedirect: true }),
  });
  const result = await response.json().catch(() => null) as { url?: string; message?: string } | null;
  if (!response.ok || !result?.url?.startsWith(providerOrigins[provider])) throw new Error(result?.message || "登录跳转失败");
  location.assign(result.url);
}

export async function signOut(apiUrl: string) {
  await fetch(`${apiUrl}/auth/sign-out`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: "{}" });
  set({ status: "guest" });
}
