// 2026-11-11 图床从 MinIO（s3.sin6626.me/mx-images）搬到 Cloudflare R2（img.sin6626.me）后，把库里所有旧地址换成新地址。
// 默认只读统计；加 --apply 才写库。每个集合逐条深度遍历所有字符串字段（Lexical 正文是 JSON 字符串，地址在里面，直接按子串换），
// 只改含旧地址的文档。file_references 的 fileUrl 跟正文一起换，s3ObjectKey 不变（R2 里路径和原来一样）。
// 用法：先开隧道 ssh -N -L 127.0.0.1:27099:<mongo 容器 IP>:27017 root@服务器，再
//   node scripts/deploy/rewrite-image-host.mjs [--apply] [--uri mongodb://127.0.0.1:27099/mx-space]
// 也统计（不改）R2 内部地址 r2.cloudflarestorage.com：后台图床“自定义域名”空着时上传的图会是这种打不开的地址。
import { createRequire } from "node:module";

const { MongoClient } = createRequire(new URL("../../apps/core/package.json", import.meta.url))("mongodb");
const args = process.argv.slice(2);
const apply = args.includes("--apply");
const uri = args.includes("--uri") ? args[args.indexOf("--uri") + 1] : "mongodb://127.0.0.1:27099/mx-space";
const from = "https://s3.sin6626.me/mx-images/";
const to = "https://img.sin6626.me/";
const internal = "r2.cloudflarestorage.com";
// 日志类集合只是历史记录（Webhook 投递、云函数日志、访问统计），不改，也省得逐条读几万条
const skip = new Set(["webhook_events", "serverless_logs", "analyzes"]);

function rewrite(value) {
  if (typeof value === "string") return value.includes(from) ? value.split(from).join(to) : value;
  if (Array.isArray(value)) {
    let changed = false;
    const next = value.map((v) => {
      const r = rewrite(v);
      if (r !== v) changed = true;
      return r;
    });
    return changed ? next : value;
  }
  if (value && typeof value === "object" && value.constructor === Object) {
    let changed = false;
    const next = {};
    for (const [k, v] of Object.entries(value)) {
      const r = rewrite(v);
      if (r !== v) changed = true;
      next[k] = r;
    }
    return changed ? next : value;
  }
  return value;
}
const count = (value, needle) => (JSON.stringify(value).split(needle).length - 1);

const client = new MongoClient(uri, { directConnection: true });
await client.connect();
const db = client.db();
let total = 0, docs = 0, bad = 0;
for (const { name } of await db.listCollections({}, { nameOnly: true }).toArray()) {
  if (name.startsWith("system.") || skip.has(name)) continue;
  const col = db.collection(name);
  let hits = 0, changedDocs = 0, internalHits = 0;
  for await (const doc of col.find({})) {
    const n = count(doc, from);
    internalHits += count(doc, internal);
    if (!n) continue;
    hits += n;
    changedDocs++;
    if (apply) {
      const next = rewrite(doc);
      const res = await col.replaceOne({ _id: doc._id }, next);
      if (res.matchedCount !== 1) throw new Error(`${name} ${doc._id} 没有写进去`);
    }
  }
  if (hits || internalHits) console.log(`${name}: ${changedDocs} 条文档、${hits} 处旧地址${internalHits ? `，${internalHits} 处 R2 内部地址（未改）` : ""}`);
  total += hits; docs += changedDocs; bad += internalHits;
}
console.log(`${apply ? "已改" : "将改"}：${docs} 条文档、${total} 处旧地址；R2 内部地址 ${bad} 处`);
if (apply) {
  let left = 0;
  for (const { name } of await db.listCollections({}, { nameOnly: true }).toArray()) {
    if (name.startsWith("system.") || skip.has(name)) continue;
    for await (const doc of db.collection(name).find({})) left += count(doc, from);
  }
  console.log(`改完复查：还剩 ${left} 处旧地址`);
  if (left) process.exitCode = 1;
}
await client.close();
