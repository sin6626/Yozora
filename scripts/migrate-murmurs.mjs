// 把速记（思考）里的纯文字条目复制成碎碎念，保留原来的时间。只复制不删除：旧速记要不要删由站长在后台核对后自己决定。
// 重复运行不会重复写（正文和时间都相同的碎碎念已存在就跳过）。带引用、卡片类型的速记仍是“思考”，不搬。
// 用法：node scripts/migrate-murmurs.mjs [--prod] [--dry-run]，令牌读 .local/publish.json（同 pnpm draft，见 docs/writing-drafts.md）
import { coreUrl } from "./lib/core-url.mjs";
import { existsSync, readFileSync } from "node:fs";

const args = process.argv.slice(2);
const target = args.includes("--prod") ? "prod" : "local";
const dryRun = args.includes("--dry-run");
const configPath = new URL("../.local/publish.json", import.meta.url);
const server = existsSync(configPath) ? JSON.parse(readFileSync(configPath, "utf8"))[target] : undefined;
if (!server?.token) {
  console.error(`没有 ${target} 的配置，先在 .local/publish.json 填好 api、token`);
  process.exit(1);
}
if (target === "prod") console.error(`! 目标是线上：${server.api}`);

async function request(path, init = {}) {
  const res = await fetch(coreUrl(server.api, path), { ...init, headers: { "x-api-key": server.token, "content-type": "application/json", ...init.headers } });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`${init.method ?? "GET"} ${path} 失败：HTTP ${res.status} ${JSON.stringify(data)}`);
  return data;
}

const isPlainText = (item) => (!item.type || item.type === "text") && !item.ref && !item.ref_type && item.content?.trim();
const key = (content, created) => `${new Date(created).toISOString()}\n${content.trim()}`;

const recently = (await request("/recently/all")).data ?? [];
const existing = new Set();
for (let page = 1; ; page++) {
  const { data, pagination } = await request(`/murmurs?page=${page}&size=50`);
  for (const item of data) existing.add(key(item.content, item.created));
  if (!pagination.has_next_page) break;
}

const todo = recently.filter(isPlainText).filter((item) => !existing.has(key(item.content, item.created)));
// 按时间从旧到新写，后台列表的顺序和原来一致
todo.sort((a, b) => Date.parse(a.created) - Date.parse(b.created));
console.log(`速记 ${recently.length} 条，纯文字 ${recently.filter(isPlainText).length} 条，已迁移 ${existing.size} 条，本次要写 ${todo.length} 条${dryRun ? "（--dry-run，不写入）" : ""}`);

for (const item of todo) {
  if (!dryRun) await request("/murmurs", { method: "POST", body: JSON.stringify({ content: item.content.trim(), created: item.created }) });
  console.log(`${dryRun ? "将写入" : "已写入"} ${item.created.slice(0, 10)} ${item.content.trim().slice(0, 40).replace(/\s+/g, " ")}`);
}
