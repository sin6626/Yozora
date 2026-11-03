// 对比两个 Core 的公开接口（旧 Shiro 用到的那些），在服务器上跑：
//   node compare-cores.mjs http://127.0.0.1:2333 http://127.0.0.1:2334
// 第一个是线上 Core（基准），第二个是要换上去的 Core。只发 GET，不带登录，不写库。
// 每个接口报告：状态码是否一致、基准里有而新 Core 里没有的字段（旧 Shiro 可能会读到 undefined）、新增字段、取值不同的字段（抽样）。
const [base, next] = process.argv.slice(2).map((url) => url.replace(/\/$/, ""));
if (!base || !next) {
  console.error("用法：node compare-cores.mjs <线上 Core 地址> <新 Core 地址>");
  process.exit(1);
}

const get = async (root, path) => {
  const response = await fetch(`${root}/api/v2${path}`, { headers: { "user-agent": "compare-cores" } });
  const text = await response.text();
  let body = text;
  try {
    body = JSON.parse(text);
  } catch {}
  return { status: response.status, body };
};

// 字段路径 → 取值；数组下标折叠成 []，所以只比较结构和第一层取值
const flatten = (value, prefix = "", out = new Map()) => {
  if (Array.isArray(value)) {
    out.set(`${prefix}[]#length`, value.length);
    value.forEach((item) => flatten(item, `${prefix}[]`, out));
  } else if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) flatten(item, prefix ? `${prefix}.${key}` : key, out);
    if (!Object.keys(value).length) out.set(prefix, "{}");
  } else if (!out.has(prefix)) out.set(prefix, value);
  return out;
};

const pick = async (path, choose) => {
  const { body } = await get(base, path);
  try {
    return choose(body);
  } catch {
    return undefined;
  }
};

const post = await pick("/posts?page=1&size=1", (body) => body.data[0]);
const note = await pick("/notes?page=1&size=1", (body) => body.data[0]);
const page = await pick("/pages?page=1&size=1", (body) => body.data[0]);
const topic = await pick("/topics/all", (body) => body.data[0]);
const tag = await pick("/categories?type=tag", (body) => body.data[0]?.name);
const project = await pick("/projects/all", (body) => body.data[0]);
const commented = await pick("/comments?page=1&size=1", (body) => body.data[0]?.ref);

const paths = [
  "/aggregate?theme=shiro",
  "/aggregate/top",
  "/aggregate/stat",
  "/aggregate/count_read_and_like",
  "/aggregate/count_site_words",
  "/aggregate/timeline",
  "/aggregate/sitemap",
  "/aggregate/feed",
  "/posts?page=1&size=10",
  post && `/posts/${post.category?.slug}/${post.slug}`,
  "/categories",
  "/categories?type=tag",
  post && `/categories/${post.category?.slug}`,
  tag && `/categories/${encodeURIComponent(tag)}?tag=true`,
  "/notes?page=1&size=10",
  "/notes/latest",
  note && `/notes/nid/${note.nid}`,
  note && `/notes/list/${note.id}?size=10`,
  topic && `/notes/topics/${topic.id}?page=1&size=10`,
  "/topics/all",
  topic && `/topics/slug/${topic.slug}`,
  page && `/pages/slug/${page.slug}`,
  "/says?page=1&size=10",
  "/recently?size=10",
  commented && `/comments/ref/${typeof commented === "string" ? commented : commented.id}?page=1&size=10`,
  "/links/all",
  "/links/audit",
  "/projects/all",
  project && `/projects/${project.id}`,
  "/subscribe/status",
  "/activity/rooms",
  "/activity/recent",
  "/auth/providers",
  "/auth/session",
  "/owner",
  "/owner/check_logged",
  "/fn/built-in/ip",
  "/search/post?keyword=a&page=1&size=10",
].filter(Boolean);

let problems = 0;
for (const path of paths) {
  const [a, b] = await Promise.all([get(base, path), get(next, path)]);
  const lines = [];
  if (a.status !== b.status) lines.push(`状态码 ${a.status} → ${b.status}`);
  if (typeof a.body === "string" || typeof b.body === "string") {
    if (a.body !== b.body) lines.push(`文本不同（${String(a.body).length} → ${String(b.body).length} 字）`);
  } else {
    const fa = flatten(a.body);
    const fb = flatten(b.body);
    const missing = [...fa.keys()].filter((key) => !fb.has(key) && !key.endsWith("#length"));
    const added = [...fb.keys()].filter((key) => !fa.has(key) && !key.endsWith("#length"));
    const changed = [...fa.keys()].filter((key) => fb.has(key) && JSON.stringify(fa.get(key)) !== JSON.stringify(fb.get(key)));
    if (missing.length) lines.push(`缺字段 ${missing.length}：${missing.slice(0, 12).join(", ")}`);
    if (added.length) lines.push(`多字段 ${added.length}：${added.slice(0, 8).join(", ")}`);
    if (changed.length) lines.push(`取值不同 ${changed.length}：${changed.slice(0, 6).map((key) => `${key}=${JSON.stringify(fa.get(key))?.slice(0, 40)}→${JSON.stringify(fb.get(key))?.slice(0, 40)}`).join("; ")}`);
  }
  if (a.status !== b.status || lines.some((line) => line.startsWith("缺字段"))) problems++;
  console.log(`${lines.length ? "≠" : "="} ${a.status} ${path}${lines.map((line) => `\n    ${line}`).join("")}`);
}
console.log(`\n${paths.length} 个接口，${problems} 个状态码不同或缺字段`);
