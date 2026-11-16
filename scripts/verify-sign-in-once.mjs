// 读者登录同一时间只发一次请求（2026-11-16 线上 Google 登录 state_mismatch）：
// 访问日志里 14:09:11、14:09:12 连着两次 POST /auth/sign-in/social（连点两下，按钮还没来得及变成禁用）。
// 每次请求都会重新下发防伪 Cookie，第二次覆盖第一次，浏览器跳去授权的却是第一次的地址，回来就对不上。
// 检查 apps/web/components/reader-session.ts 的 signIn：并发调用只发一次请求；这次结束（成功或失败）后能再登录。
// 用法：node scripts/verify-sign-in-once.mjs（已并入 pnpm verify）
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const require = createRequire(new URL("../apps/web/package.json", import.meta.url));
const ts = require("typescript");
const source = readFileSync(new URL("../apps/web/components/reader-session.ts", import.meta.url), "utf8");
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;

let calls = 0;
let fail = false;
const assigned = [];
const fetch = async (_url, init) => {
  calls += 1;
  await new Promise((resolve) => setTimeout(resolve, 20));
  if (fail) return { ok: false, json: async () => ({ message: "boom" }) };
  const { provider } = JSON.parse(init.body);
  return { ok: true, json: async () => ({ url: provider === "google" ? "https://accounts.google.com/o/oauth2/auth?state=x" : "https://github.com/login/oauth/authorize?state=x" }) };
};
const stubs = { react: { useSyncExternalStore() {} }, "./locale-provider": { useT() {} }, "../lib/address-typing": { realHref: () => "https://sin6626.me/notes/10" } };
const module = { exports: {} };
vm.runInNewContext(code, { module, exports: module.exports, require: (id) => stubs[id] ?? {}, fetch, URL, setTimeout, location: { assign: (url) => assigned.push(url) } });
const { signIn } = module.exports;

// 连点两下：只发一次请求，只跳一次
await Promise.all([signIn("https://sin6626.me/api/v2", "github"), signIn("https://sin6626.me/api/v2", "github")]);
assert.equal(calls, 1, `连点两下只能发一次登录请求，实际 ${calls} 次`);
assert.equal(assigned.length, 1);

// 这次结束后（比如从授权页按返回回来）能再登录
await signIn("https://sin6626.me/api/v2", "google");
assert.equal(calls, 2, "上一次结束后可以再发起登录");

// 失败后也能重试
fail = true;
await assert.rejects(signIn("https://sin6626.me/api/v2", "github"));
fail = false;
await signIn("https://sin6626.me/api/v2", "github");
assert.equal(calls, 4, "失败后可以重试");

console.log("PASS 读者登录同一时间只发一次请求");
