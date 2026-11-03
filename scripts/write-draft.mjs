// 本地写文章/手记，直接存进后台草稿箱（富文本格式），在后台打开草稿确认后由站长自己发布。脚本不提供发布。
// 用法：pnpm draft <文章.md> [--prod] [--dry-run]
//   默认写本地 Core；--prod 才写线上；--dry-run 只转换、检查并打印结果，不上传图片、不写草稿。
// 文件格式、令牌配置见 docs/writing-drafts.md。
import { coreUrl } from "./lib/core-url.mjs";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import yaml from "js-yaml";
import sharp from "sharp";
import { rgbaToThumbHash } from "thumbhash";
import { collectImageUrls, collectLinkCardUrls, lexicalToMarkdown, markdownToLexical } from "./lib/markdown-to-lexical.mjs";

const root = resolve(import.meta.dirname, "..");
const configPath = join(root, ".local/publish.json");
const cachePath = join(root, ".local/publish/uploads.json");
const versionsPath = join(root, ".local/publish/draft-versions.json");

const args = process.argv.slice(2);
const file = args.find((arg) => !arg.startsWith("--"));
const target = args.includes("--prod") ? "prod" : "local";
const dryRun = args.includes("--dry-run");
const force = args.includes("--force");
if (!file) fail("用法：pnpm draft <文章.md> [--prod] [--dry-run] [--force]");

function fail(message) {
  console.error(`✗ ${message}`);
  process.exit(1);
}

// 文件 = YAML 元数据 + Markdown 正文
const source = readFileSync(file, "utf8");
const match = source.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
if (!match) fail("文件开头要有 --- 包起来的元数据");
const front = yaml.load(match[1]) ?? {};
const body = match[2];

// 每种内容在草稿里的类型与专属字段（后台写文章/手记页从草稿 typeSpecificData 载入）
const kinds = {
  post: {
    refType: "posts",
    editPath: "posts/edit",
    required: ["title", "slug", "category"],
    async specific() {
      return {
        slug: front.slug,
        categoryId: await lookup("/categories", front.category, "分类"),
        tags: front.tags ?? [],
        summary: front.summary ?? "",
        copyright: true,
        isPublished: true,
      };
    },
  },
  note: {
    refType: "notes",
    editPath: "notes/edit",
    required: ["title"],
    async specific() {
      return {
        slug: front.slug,
        mood: front.mood ?? "",
        weather: front.weather ?? "",
        location: front.location ?? null,
        topicId: front.topic ? await lookup("/topics", front.topic, "话题") : null,
        bookmark: false,
        isPublished: true,
      };
    },
  },
};
const kind = kinds[front.type];
if (!kind) fail(`type 只能是 ${Object.keys(kinds).join(" / ")}`);
const missing = kind.required.filter((key) => !front[key]);
if (missing.length) fail(`缺少元数据：${missing.join("、")}`);

const config = existsSync(configPath) ? JSON.parse(readFileSync(configPath, "utf8")) : {};
const server = config[target];
if (!dryRun && !server?.token) fail(`没有 ${target} 的配置，先按 docs/writing-drafts.md 在 .local/publish.json 填好 api、admin、token`);
if (target === "prod") console.error(`! 目标是线上：${server?.api}`);

async function request(path, init = {}) {
  const res = await fetch(coreUrl(server.api, path), { ...init, headers: { "x-api-key": server.token, ...init.headers } });
  const data = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, data };
}

// 分类、话题按名字或 slug 换成 ID；找不到时列出可选项
async function lookup(path, wanted, label) {
  const { ok, data } = await request(path);
  if (!ok) fail(`读取${label}失败`);
  const found = data.data.find((item) => item.name === wanted || item.slug === wanted);
  if (!found) fail(`没有${label}「${wanted}」，可选：${data.data.map((item) => item.name).join("、")}`);
  return found.id;
}

// 图片元数据与后台编辑器插图时一致：原图宽高 + 缩到 100px 内算出的 thumbhash（Base64）；按 EXIF 方向转正
async function imageMeta(buffer) {
  const { data, info } = await sharp(buffer).rotate().resize(100, 100, { fit: "inside" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, orientation } = await sharp(buffer).metadata();
  const swapped = orientation >= 5;
  return {
    width: swapped ? height : width,
    height: swapped ? width : height,
    thumbhash: Buffer.from(rgbaToThumbHash(info.width, info.height, data)).toString("base64"),
  };
}

const cache = existsSync(cachePath) ? JSON.parse(readFileSync(cachePath, "utf8")) : {};
const fresh = {};

async function stillThere(url) {
  const res = await fetch(url, { method: "HEAD" }).catch(() => null);
  return res?.ok ?? false;
}

// 本机图片上传到图床（Core 的 /files/upload?type=image），按 目标 + 内容哈希 缓存，重跑不重复上传；
// 缓存里的地址失效（草稿删了、孤儿清理删了）就重新上传。网址图片原样引用，只下载下来算元数据。
async function prepareImage(url) {
  if (/^https?:\/\//.test(url)) {
    const key = `url:${url}`;
    if (cache[key]) return cache[key];
    const res = await fetch(url);
    if (!res.ok) fail(`下载不到图片：${url}`);
    return (fresh[key] = { src: url, ...(await imageMeta(Buffer.from(await res.arrayBuffer()))) });
  }
  const path = isAbsolute(url) ? url : resolve(dirname(file), decodeURI(url));
  if (!existsSync(path)) fail(`找不到图片：${path}`);
  if (/\.(heic|heif)$/i.test(path)) fail(`浏览器显示不了 HEIC：${path}，先导出成 JPG/PNG`);
  const buffer = readFileSync(path);
  const meta = await imageMeta(buffer);
  if (dryRun) return { src: url, ...meta };
  const key = `${target}:${createHash("sha256").update(buffer).digest("hex")}`;
  if (cache[key] && (await stillThere(cache[key].src))) return cache[key];
  const form = new FormData();
  form.append("file", new Blob([buffer]), basename(path));
  const { ok, status, data } = await request("/files/upload?type=image", { method: "POST", body: form });
  if (!ok) fail(`上传 ${basename(path)} 失败（${status}）：${data?.message ?? "图床未配置或令牌无效"}`);
  console.error(`↑ ${basename(path)} → ${data.url}`);
  return (fresh[key] = { src: data.url, ...meta });
}

const images = new Map();
for (const url of collectImageUrls(body)) images.set(url, await prepareImage(url));

// 链接卡片的标题与描述：取网页的 og:title / <title> 和 og:description / description；抓不到就只显示网址
const decodeHtml = (value) => value.replace(/&(amp|lt|gt|quot|#39);/g, (_, name) => ({ amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'" })[name]);
function metaContent(html, ...names) {
  for (const name of names) {
    const tag = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${name}["'][^>]*>`, "i"))?.[0];
    const content = tag?.match(/content=["']([^"']*)["']/i)?.[1];
    if (content) return decodeHtml(content.trim());
  }
}
async function prepareLink(url) {
  const key = `link:${url}`;
  if (cache[key]) return cache[key];
  try {
    const html = await (await fetch(url, { signal: AbortSignal.timeout(8000), headers: { "user-agent": "Mozilla/5.0 (pnpm draft link card)" } })).text();
    const title = metaContent(html, "og:title", "twitter:title") ?? decodeHtml(html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() ?? "");
    const description = metaContent(html, "og:description", "description");
    return (fresh[key] = { ...(title ? { title } : {}), ...(description ? { description } : {}) });
  } catch {
    console.error(`! 抓不到链接卡片信息，只显示网址：${url}`);
    return {};
  }
}

const links = new Map();
for (const url of collectLinkCardUrls(body)) links.set(url, await prepareLink(url));

const galleryLayout = front.gallery ?? "grid";
if (!["grid", "masonry", "carousel"].includes(galleryLayout)) fail("gallery 只能是 grid / masonry / carousel");
const state = markdownToLexical(body, { images, links, galleryLayout });
const text = lexicalToMarkdown(state);

if (dryRun) {
  const count = {};
  const walk = (node) => {
    count[node.type] = (count[node.type] ?? 0) + 1;
    node.children?.forEach(walk);
  };
  walk(state.root);
  console.log(JSON.stringify({ target, type: front.type, title: front.title, nodes: count, images: [...images.values()] }, null, 2));
  console.log(`\n--- 纯文本预览 ---\n${text.slice(0, 800)}`);
  process.exit(0);
}

const draft = {
  refType: kind.refType,
  title: front.title,
  text,
  contentFormat: "lexical",
  content: JSON.stringify(state),
  typeSpecificData: await kind.specific(),
};

// 文件里记着各目标的草稿 ID：有就更新同一份草稿（后台保留历史版本），草稿被删了就新建。
// 后台编辑器开着时每 10 秒会把它手里的内容存回去，和脚本互相覆盖；所以记住脚本上次写入后的版本号，
// 写之前草稿版本对不上（期间有人在后台改过）就停下，确认要覆盖时加 --force
const drafts = { ...front.drafts };
const versions = existsSync(versionsPath) ? JSON.parse(readFileSync(versionsPath, "utf8")) : {};
let saved;
if (drafts[target]) {
  const versionKey = `${target}:${drafts[target]}`;
  const current = await request(`/drafts/${drafts[target]}`);
  if (current.ok && versions[versionKey] && current.data.version !== versions[versionKey] && !force) {
    fail(`后台在脚本上次写入后改过这份草稿（v${versions[versionKey]} → v${current.data.version}），可能编辑器正开着。先关掉编辑器再写；确认要用文件内容覆盖，加 --force`);
  }
  saved = current.status === 404 ? null : await request(`/drafts/${drafts[target]}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(draft) });
  if (!saved) console.error("! 原草稿已不存在，新建一份");
}
saved ??= await request("/drafts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(draft) });
if (!saved.ok) fail(`写草稿失败（${saved.status}）：${saved.data?.message ?? JSON.stringify(saved.data)}`);

const id = saved.data.id ?? saved.data._id;
drafts[target] = id;
mkdirSync(dirname(versionsPath), { recursive: true });
writeFileSync(versionsPath, JSON.stringify({ ...versions, [`${target}:${id}`]: saved.data.version }, null, 2));
writeFileSync(file, `---\n${yaml.dump({ ...front, drafts }, { lineWidth: -1 })}---\n${body}`);
// 草稿写成功后图片才算被引用（孤儿清理不会删），这时才记进上传缓存
if (Object.keys(fresh).length) {
  mkdirSync(dirname(cachePath), { recursive: true });
  writeFileSync(cachePath, JSON.stringify({ ...cache, ...fresh }, null, 2));
}
console.log(`✓ 已存进${target === "prod" ? "线上" : "本地"}草稿箱：${front.title}`);
console.log(`  ${server.admin}/#/${kind.editPath}?draftId=${id}`);
