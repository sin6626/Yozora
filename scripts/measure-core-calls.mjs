// 量具：前台每打开一页，Next 服务器向 Core 发了几次请求（docs/architecture-cache-plan.md 第 0 步）。
// 在 Core 前面挂一个只计数的转发代理，前台要指向它启动：
//   node scripts/dev.mjs --core-only
//   MIX_SPACE_API_URL=http://127.0.0.1:2339 node scripts/dev.mjs --web-only
//   node scripts/measure-core-calls.mjs
// 不开浏览器：用 fetch 取整页 HTML（服务端流式渲染会把 Suspense 里的内容一起送完），代理收到的都是 Next 服务器的请求。
// 打印两组数：① 缓存都热了以后每页请求几次（第三次打开时计数）；② 发一次签名的 POST_UPDATE Webhook 后，
// 三种语言的首页、列表、详情同时打开，一共发了多少请求（对照 Core 每个 IP 10 秒 100 次的限流）。
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { createServer, request as httpRequest } from "node:http";

const core = new URL(process.env.CORE_URL ?? "http://127.0.0.1:2333");
const web = process.env.WEB_URL ?? "http://127.0.0.1:2323";
const port = Number(process.env.PROXY_PORT ?? 2339);
const secret = process.env.MIX_SPACE_WEBHOOK_SECRET
  ?? readFileSync(new URL("../.env.local", import.meta.url), "utf8").match(/^MIX_SPACE_WEBHOOK_SECRET=(.*)$/m)?.[1]?.trim();

let hits = [];
const proxy = createServer((req, res) => {
  hits.push(req.url.replace(/^\/api\/v\d/, "").split("?")[0].replace(/[a-f\d]{24}/gi, ":id").replace(/\/\d+(?=\/|$)/g, "/:n"));
  const upstream = httpRequest({ host: core.hostname, port: core.port, path: req.url, method: req.method, headers: req.headers }, (answer) => {
    res.writeHead(answer.statusCode ?? 502, answer.headers);
    answer.pipe(res);
  });
  upstream.on("error", () => { res.writeHead(502); res.end(); });
  req.pipe(upstream);
});
await new Promise((resolve) => proxy.listen(port, "127.0.0.1", resolve));

const json = async (path) => (await (await fetch(`${core.origin}${path}`)).json());
const post = (await json("/posts?size=1")).data[0];
const note = (await json("/notes?size=1")).data[0];
const postPath = `/posts/${encodeURIComponent(post.category.slug)}/${encodeURIComponent(post.slug)}`;
const pages = ["/", "/posts", postPath, "/notes", `/notes/${note.nid}`, "/timeline", "/murmurs", "/says", "/friends", "/projects", "/thinking", "/en", "/en/posts", `/en${postPath}`];

// 页面送完后 Next 可能还在后台把剩下的请求发完，等代理 500 毫秒没有新请求再算下一页，免得记到下一页头上
async function settle() {
  for (let seen = -1; seen !== hits.length;) {
    seen = hits.length;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

async function open(path) {
  const response = await fetch(`${web}${path}`, { redirect: "manual" });
  await response.text();
  await settle();
  return response.status;
}

function summary(list) {
  const counts = new Map();
  for (const hit of list) counts.set(hit, (counts.get(hit) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1]).map(([path, n]) => `${path}×${n}`).join("  ");
}

try {
  console.log("预热（开发模式首次要编译）…");
  for (const path of pages) { await open(path); await open(path); }

  console.log("\n① 缓存热了以后，每页请求 Core 的次数");
  let total = 0;
  for (const path of pages) {
    hits = [];
    const status = await open(path);
    total += hits.length;
    console.log(`${String(hits.length).padStart(3)}  ${path} (${status})  ${summary(hits)}`);
  }
  console.log(`合计 ${total}`);

  if (!secret) throw new Error("没有 MIX_SPACE_WEBHOOK_SECRET，跳过 ②");
  const body = JSON.stringify({ id: post.id });
  const hook = await fetch(`${web}/api/webhooks/mix-space`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-webhook-event": "POST_UPDATE", "x-webhook-signature256": createHmac("sha256", secret).update(body).digest("hex") },
    body,
  });
  console.log(`\n② Webhook POST_UPDATE → ${hook.status}`);
  hits = [];
  const started = Date.now();
  const burst = ["/", "/en", "/ja", "/posts", "/en/posts", postPath, `/en${postPath}`, "/notes", "/timeline"];
  await Promise.all(burst.map(open));
  await new Promise((resolve) => setTimeout(resolve, 3000)); // 过期后后台重新取的请求也算上
  console.log(`同时打开 ${burst.length} 页，${((Date.now() - started) / 1000).toFixed(1)} 秒内共 ${hits.length} 次（限流 10 秒 100 次）`);
  console.log(summary(hits));
} finally {
  proxy.close();
}
