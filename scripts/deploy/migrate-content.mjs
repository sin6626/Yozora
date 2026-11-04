// 把本地才有的内容合并进线上库（2026-11-03 灰度上线用，对比结果见 scripts/deploy/diff-db.mjs）。默认只打印计划，加 --apply 才写。
//   先开隧道：ssh -N -L 127.0.0.1:27099:172.19.0.3:27017 root@服务器
//   node scripts/deploy/migrate-content.mjs [--apply]
// 原则：线上是基准，只“加上本地新增的”和“改掉本地修正过的”，线上独有的（线上新写的文章手记、真实评论、订阅者、会话、配置）一律不动。
// 不迁：测试数据（Test 1/2、富文本演示文章及其摘要译文、测试评论、测试碎碎念、测试草稿）、草稿、思考（已全部复制成碎碎念）、
// 站点设置（含本地开发用的地址和 OAuth）、云函数和 Shiro 主题配置、会话账号令牌、统计与日志。
// 本地库是从线上导入的，导入时把图片地址改成了本机 http://127.0.0.1:2333/objects/image/import-*.png；文章手记本身不迁（线上那份是对的），
// 本地补翻的译文里如果带这种地址，按两边正文里图片出现的顺序换回线上的 S3 地址。写入前检查：任何字符串里还有指向本地 Core 的地址（http://127.0.0.1:2333/、http://localhost:2333/）就整批不写
// （只查端口 2333：FRP 那篇讲的就是 localhost，正文里本来就有这个词）。
import { createRequire } from "node:module";

const { MongoClient } = createRequire(new URL("../../apps/core/package.json", import.meta.url))("mongodb");
const apply = process.argv.includes("--apply");
const local = new MongoClient("mongodb://127.0.0.1:27018/shrio-import-20261014");
const prod = new MongoClient("mongodb://127.0.0.1:27099/mx-space", { directConnection: true });
await Promise.all([local.connect(), prod.connect()]);
const [l, p] = [local.db(), prod.db()];
const all = async (db, name, query = {}) => db.collection(name).find(query).toArray();
const byId = (docs) => new Map(docs.map((doc) => [String(doc._id), doc]));

// 测试数据：本地独有的三篇文章（Test 1、Test 2、富文本组件对照演示）及挂在它们上的摘要译文；测试碎碎念
const prodPosts = byId(await all(p, "posts"));
const excludedPosts = (await all(l, "posts")).filter((post) => !prodPosts.has(String(post._id)));
const excludedRefs = new Set(excludedPosts.map((post) => String(post._id)));
const isTestMurmur = (murmur) => /^测试碎碎念/.test(murmur.content) || /^ces\s/.test(murmur.content);

// 本机图片地址 → 线上 S3 地址：同一篇文章 / 手记 / 页面，两边正文里图片按出现顺序一一对应
const imagePattern = /http:\/\/127\.0\.0\.1:2333\/objects\/image\/import-[a-f0-9]+\.[a-z]+|https:\/\/s3\.sin6626\.me\/mx-images\/[A-Za-z0-9/._-]+?\.(?:png|jpe?g|webp|gif)/g;
const urlMap = new Map();
for (const name of ["posts", "notes", "pages"]) {
  const prodDocs = byId(await all(p, name));
  for (const doc of await all(l, name)) {
    const other = prodDocs.get(String(doc._id));
    if (!other) continue;
    for (const field of ["text", "content", "images", "meta"]) {
      const mine = JSON.stringify(doc[field] ?? "").match(imagePattern) ?? [];
      const theirs = JSON.stringify(other[field] ?? "").match(imagePattern) ?? [];
      if (mine.length !== theirs.length) continue;
      mine.forEach((url, index) => url.startsWith("http://127.0.0.1") && urlMap.set(url, theirs[index]));
    }
  }
}
const remap = (value) => {
  if (typeof value === "string") return value.replace(/http:\/\/127\.0\.0\.1:2333\/objects\/image\/import-[a-f0-9]+\.[a-z]+/g, (url) => urlMap.get(url) ?? url);
  if (Array.isArray(value)) return value.map(remap);
  if (value && typeof value === "object" && value.constructor === Object) return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, remap(item)]));
  return value;
};
const localUrls = (value, path = "") => {
  if (typeof value === "string") return /https?:\/\/(?:127\.0\.0\.1|localhost):2333\//.test(value) ? [path] : [];
  if (Array.isArray(value)) return value.flatMap((item, index) => localUrls(item, `${path}[${index}]`));
  if (value && typeof value === "object" && value.constructor === Object) return Object.entries(value).flatMap(([key, item]) => localUrls(item, `${path}.${key}`));
  return [];
};
const imagesOnly = (a, b) => {
  const strip = (value) => JSON.stringify(value ?? null).replace(imagePattern, "IMG");
  return strip(a) === strip(b);
};

const plan = []; // { collection, op: "insert" | "replace" | "set", doc, fields?, label }
const add = (collection, op, doc, label, fields) => plan.push({ collection, op, doc: op === "set" ? doc : remap(doc), label, fields });
const skipped = [];

// 碎碎念、一言：线上没有，整条加上（去掉测试碎碎念）
const prodMurmurs = byId(await all(p, "murmurs"));
for (const murmur of await all(l, "murmurs")) {
  if (prodMurmurs.has(String(murmur._id))) continue;
  if (isTestMurmur(murmur)) skipped.push(`murmurs 测试：${murmur.content.slice(0, 30)}`);
  else add("murmurs", "insert", murmur, murmur.content.replace(/\s+/g, " ").slice(0, 30));
}
const prodSays = byId(await all(p, "says"));
for (const say of await all(l, "says")) if (!prodSays.has(String(say._id))) add("says", "insert", say, `${say.author}：${say.text.slice(0, 20)}`);

// 页面：只改副标题（正文的 content 两边一样，text 是本地 Core 重新生成的纯文本副本，不搬）
const prodPages = byId(await all(p, "pages"));
for (const page of await all(l, "pages")) {
  const other = prodPages.get(String(page._id));
  if (other && page.subtitle !== other.subtitle) add("pages", "set", { _id: page._id, subtitle: page.subtitle }, `${page.title} 副标题 ${other.subtitle} → ${page.subtitle}`, ["subtitle"]);
}

// AI 摘要、AI 译文：本地新增的加上，本地改过（不只是图片地址不同）的整条替换；测试文章上的不要
for (const name of ["ai_summaries", "ai_translations"]) {
  const prodDocs = byId(await all(p, name));
  for (const doc of await all(l, name)) {
    const label = `${doc.title ?? String(doc.summary ?? "").slice(0, 20)} [${doc.lang}]`;
    if (excludedRefs.has(String(doc.refId))) {
      skipped.push(`${name} 测试文章：${label}`);
      continue;
    }
    const other = prodDocs.get(String(doc._id));
    if (!other) add(name, "insert", doc, label);
    else if (!imagesOnly(doc, other)) add(name, "replace", doc, label);
  }
}

// 翻译条目（分类名等的译名）、首页配置片段 theme/yozora：线上没有的加上
const prodEntries = byId(await all(p, "translation_entries"));
for (const entry of await all(l, "translation_entries")) if (!prodEntries.has(String(entry._id))) add("translation_entries", "insert", entry, `${entry.keyPath} [${entry.lang}] ${entry.translatedText}`);
const yozoraSnippet = await l.collection("snippets").findOne({ reference: "theme", name: "yozora" });
if (yozoraSnippet && !(await p.collection("snippets").findOne({ reference: "theme", name: "yozora" }))) add("snippets", "insert", yozoraSnippet, "theme/yozora");

for (const post of excludedPosts) skipped.push(`posts 测试：${post.title}`);

const problems = plan.flatMap((item) => localUrls(item.doc).map((path) => `${item.collection} ${item.label} ${path}`));
const summary = plan.reduce((acc, item) => ({ ...acc, [`${item.collection} ${item.op}`]: (acc[`${item.collection} ${item.op}`] ?? 0) + 1 }), {});
for (const item of plan) console.log(`${item.op.padEnd(7)} ${item.collection.padEnd(19)} ${item.label}`);
console.log("\n不迁：");
for (const line of skipped) console.log(`  ${line}`);
console.log(`\n本机图片地址对应到线上的有 ${urlMap.size} 个`);
console.log("合计：", summary);
if (problems.length) {
  console.log(`\n还带本机地址，整批不写：\n  ${problems.join("\n  ")}`);
  process.exitCode = 1;
} else if (apply) {
  for (const item of plan) {
    const collection = p.collection(item.collection);
    if (item.op === "set") await collection.updateOne({ _id: item.doc._id }, { $set: Object.fromEntries(item.fields.map((field) => [field, item.doc[field]])) });
    else await collection.replaceOne({ _id: item.doc._id }, item.doc, { upsert: true });
  }
  console.log(`\n已写入 ${plan.length} 条`);
} else {
  console.log("\n（试运行，没有写入；加 --apply 才写）");
}
await Promise.all([local.close(), prod.close()]);
