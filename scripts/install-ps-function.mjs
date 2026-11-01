// 把 scripts/functions/ps-update.ts 装进 Core 的云函数（引用 ps、名字 update，所有请求方法，公开读），地址是 <Core>/fn/ps/update。
// 第一次安装时生成密钥，存进 .local/presence.json（不进 git、权限 600），Mac 上的 Yohaku Companion 填这个密钥；
// 重复运行只更新函数代码，密钥不变；加 --rotate-key 换一个新密钥（Companion 里也要跟着改）。
// 用法：node scripts/install-ps-function.mjs [--prod] [--dry-run] [--rotate-key]，Core 地址和后台令牌读 .local/publish.json（同 pnpm draft）
import { randomBytes } from "node:crypto";
import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";

const args = process.argv.slice(2);
const target = args.includes("--prod") ? "prod" : "local";
const dryRun = args.includes("--dry-run");
const read = (url) => (existsSync(url) ? JSON.parse(readFileSync(url, "utf8")) : {});
const server = read(new URL("../.local/publish.json", import.meta.url))[target];
if (!server?.token) {
  console.error(`没有 ${target} 的配置，先在 .local/publish.json 填好 api、token`);
  process.exit(1);
}
if (target === "prod") console.error(`! 目标是线上：${server.api}`);

async function request(path, init = {}) {
  const res = await fetch(new URL(path, server.api), { ...init, headers: { "x-api-key": server.token, "content-type": "application/json", ...init.headers } });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`${init.method ?? "GET"} ${path} 失败：HTTP ${res.status} ${JSON.stringify(data)}`);
  return data;
}

const keysPath = new URL("../.local/presence.json", import.meta.url);
const keys = read(keysPath);
const existing = ((await request("/snippets/group/ps")).data ?? []).find((item) => item.type === "function" && item.name === "update");
const rotate = args.includes("--rotate-key") || !existing || !keys[target]?.key;
const key = rotate ? randomBytes(24).toString("base64url") : keys[target].key;
const body = {
  type: "function",
  reference: "ps",
  name: "update",
  method: "ALL",
  private: false,
  enable: true,
  comment: "站长正在用 / 在听（Yohaku Companion 的 MixSpace 兼容通道），源码 scripts/functions/ps-update.ts",
  raw: readFileSync(new URL("./functions/ps-update.ts", import.meta.url), "utf8"),
  // 不换密钥时不发 secret，Core 保留原来的
  ...(rotate ? { secret: { key } } : {}),
};

console.log(`${existing ? "更新" : "新建"}云函数 ps/update${rotate ? "，生成新密钥" : "，密钥不变"}${dryRun ? "（--dry-run，不写入）" : ""}`);
if (!dryRun) {
  if (existing) await request(`/snippets/${existing.id}`, { method: "PUT", body: JSON.stringify(body) });
  else await request("/snippets", { method: "POST", body: JSON.stringify(body) });
  if (rotate) {
    writeFileSync(keysPath, `${JSON.stringify({ ...keys, [target]: { key } }, null, 2)}\n`, { mode: 0o600 });
    chmodSync(keysPath, 0o600);
  }
}
console.log(`Companion 的 MixSpace 地址：${new URL("/fn/ps/update", server.api)}`);
console.log(`密钥在 .local/presence.json 的 ${target}.key`);
