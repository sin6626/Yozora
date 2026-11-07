import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { getApiClient } from "./api";
import { safeUrl } from "./safe-url";
import { parseNoteMeta } from "./note-extras";
import { excerpt, readingMinutes } from "./excerpt";
import { socialCards, socialLinks } from "./social";
import { parseSiteContent, siteTranslation } from "./theme-config";
import { isLanguageCode, type Locale } from "./i18n/config";
import { getI18nBundle } from "./i18n/data";

// 站名读后台“SEO → 网站标题”（2026-11-04 站长定，取代 10-31 的“个人资料名字 + ’s Yozora”），页头、浏览器标题、RSS 一起变；
// 站长名字（首屏问候、页脚落款）仍读后台“个人资料”的昵称；描述读 SEO 的网站描述。
// siteOwnerName、siteName、siteDescription 只是读取失败或没填时的兜底。
export const siteOwnerName = "Sin";
export const siteName = "Sin’s Yozora";
export const siteDescription = "夜深里也有月亮和星星陪我作伴";

// "use cache" 函数抛出的错误会丢掉 SDK 附带的 HTTP status，
// 所以 404/403 要在缓存函数内部转成普通返回值，组件据此调用 notFound()。
function httpStatus(error: unknown) {
  return typeof error === "object" && error !== null && "status" in error ? error.status : undefined;
}

// Lexical 正文 JSON 只在 lexical 格式时缓存，给富文本渲染器用；Markdown 只需要 text。
function lexicalContent(doc: { contentFormat?: string; content?: string }) {
  return doc.contentFormat === "lexical" && typeof doc.content === "string" ? { content: doc.content } : {};
}

async function orNotFound<T>(request: Promise<T>) {
  try {
    return await request;
  } catch (error) {
    if (httpStatus(error) === 404) return null;
    throw error;
  }
}

// lang：外文页面传 en / ja，分类名和页面标题换成 Core 里的译文（没有译文的保持中文），见 getLocalizedNames。
export async function getNavigationData(lang: ContentLang = "zh") {
  "use cache";
  cacheLife({ stale: 300, revalidate: 3600, expire: 86400 });
  cacheTag("blog:navigation", "blog:categories", "blog:pages", "blog:ai");
  // 聚合接口的页面只有标题，副标题（导航“首页”面板里每个页面下面那句）从页面列表补上
  const [data, names, pages] = await Promise.all([
    getApiClient().aggregate.getAggregateData(),
    localizedNames(lang),
    getApiClient().page.getList(1, 50).then(({ data }) => data, () => []),
  ]);
  if (!Array.isArray(data.categories) || !Array.isArray(data.pageMeta)) {
    throw new Error("导航数据缺少分类或页面。");
  }
  const subtitles = new Map(pages.map((page) => [page.id, page.subtitle]));
  return {
    categories: data.categories.map(({ name, slug }) => ({ name: names?.categories[slug] ?? name, slug })),
    // 后台页面按“排序”字段排列（关于我在关于本站前面）。
    pageMeta: [...data.pageMeta].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).map(({ id, title, slug }) => ({
      title: names?.titles[id] ?? title,
      subtitle: (names?.subtitles[id] ?? subtitles.get(id))?.trim() || null,
      slug,
    })),
  };
}

// 站点级设置。对外地址取后台“网站地址”（Core 的 url.webUrl），sitemap、RSS 的完整链接都以它为准，不在前端写死域名；
// 评论开关取后台“评论设置”（是否关闭评论、是否允许游客评论）；站名、一句话描述、关键字取后台 SEO 设置，站长名字取“个人资料”的昵称。
export async function getSiteSettings() {
  "use cache";
  // 改个人资料、设置经 OWNER_UPDATE、OPTION_UPDATE 立即失效（后台 Webhook 要勾上这两个事件）；没勾时靠这里的过期时间。
  // stale 至少 300 秒：Next 只把 stale ≥ 5 分钟的缓存放进预渲染外壳，太短的话根布局的 generateMetadata 会被当成动态数据，
  // 整页静态的路由（/debug）会报 “encountered URL data in generateMetadata()”。回归测试 scripts/e2e/dev-issues.mjs。
  cacheLife({ stale: 300, revalidate: 300, expire: 3600 });
  cacheTag("blog:navigation");
  const { url, commentOptions, seo, user } = await getApiClient().aggregate.getAggregateData();
  const site = new URL(url.webUrl);
  if (!["http:", "https:"].includes(site.protocol)) throw new Error("后台网站地址必须是 HTTP(S)。");
  return {
    siteUrl: site.href.replace(/\/$/, ""),
    ownerName: user?.name?.trim() || siteOwnerName,
    name: seo?.title?.trim() || siteName,
    description: seo?.description?.trim() || siteDescription,
    keywords: (seo?.keywords ?? []).flatMap((word) => (typeof word === "string" && word.trim() ? [word.trim()] : [])),
    comments: { disabled: Boolean(commentOptions?.disableComment), allowGuest: commentOptions?.allowGuestComment !== false },
  };
}

// 后台“设置 → 账户 → OAuth”里启用的第三方登录（前端接了 GitHub 和 Google）。改动经 OPTION_UPDATE 失效，没勾事件时靠短缓存。
export async function getLoginProviders() {
  "use cache";
  cacheLife({ stale: 60, revalidate: 300, expire: 3600 });
  cacheTag("blog:navigation");
  const { data } = await getApiClient().proxy.auth.providers.get<{ data: string[] }>();
  // 前端目前支持 GitHub 和 Google 两种读者登录
  return Array.isArray(data) ? data.filter((provider): provider is "github" | "google" => provider === "github" || provider === "google") : [];
}

// 邮件订阅：后台开启订阅且配置了邮件服务时才可用；只放行文章、手记两类（Core 的 allow_types）。
export async function getSubscribeOptions() {
  "use cache";
  cacheLife({ stale: 60, revalidate: 300, expire: 3600 });
  cacheTag("blog:navigation");
  const status = await getApiClient().subscribe.check();
  const types = (status.allowTypes ?? []).filter((type): type is "post_c" | "note_c" => type === "post_c" || type === "note_c");
  return { enabled: Boolean(status.enable) && types.length > 0, types };
}

// 首页的自我介绍：后台“个人资料”的名字、头像、一句话介绍，以及“关于我”页面的地址（标题含“关于我”的页面，否则排第一的页面）。
// lang：社交平台名称用哪种语言（首屏、导航面板的悬停提示），默认中文；只用头像、名字的地方不用传
export async function getOwner(lang: ContentLang = "zh") {
  "use cache";
  cacheLife({ stale: 60, revalidate: 300, expire: 3600 });
  cacheTag("blog:navigation", "blog:pages");
  const { user, pageMeta } = await getApiClient().aggregate.getAggregateData();
  const pages = Array.isArray(pageMeta) ? [...pageMeta].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)) : [];
  const about = pages.find((page) => page.title.includes("关于我")) ?? pages[0];
  return {
    name: user.name?.trim() || user.username,
    avatar: safeUrl(user.avatar ?? undefined),
    introduce: user.introduce?.trim() || undefined,
    aboutHref: about?.slug ? `/${encodeURIComponent(about.slug)}` : undefined,
    // 能直接跳转的社交链接（首屏、导航面板）和微信、QQ 这类名片（只在首屏，点开看二维码和号码）
    socials: socialLinks(user.socialIds, lang),
    contacts: socialCards(user.socialIds, lang),
  };
}

export async function getSiteUrl() {
  return (await getSiteSettings()).siteUrl;
}

export async function getCategories(lang: ContentLang = "zh") {
  "use cache";
  cacheLife({ stale: 300, revalidate: 3600, expire: 86400 });
  cacheTag("blog:categories");
  const { data } = await getApiClient(lang).category.getAllCategories();
  return data.map(({ id, name, slug, type, count, created }) => ({
    id, name, slug, type, count, created,
  }));
}

// 列表里每条的摘要按这个顺序取，保证不冷清（用户 2026-10-29 定）：AI 摘要 → 自己写的摘要 → 正文开头。
// AI 摘要只读后台已生成的（getArticleAi，1 小时缓存，与详情页共用），读不到就往下退。
export type ListExcerpt = { text: string; source: "ai" | "summary" | "text" } | null;
async function listExcerpt(id: string, summary: string | null | undefined, text: string | null | undefined, lang: ContentLang): Promise<ListExcerpt> {
  const ai = await getArticleAi(id, lang).catch(() => null);
  if (ai?.summary) return { text: ai.summary, source: "ai" };
  if (summary?.trim()) return { text: summary.trim(), source: "summary" };
  const body = excerpt(text, 120);
  return body ? { text: body, source: "text" } : null;
}

// 列表里的一篇文章：普通列表（getPosts）和标签、搜索的结果（getMatchedPosts）共用这一种样子
const postSelect = ["title", "summary", "text", "created", "categoryId", "slug", "pin", "tags", "count"] satisfies NonNullable<NonNullable<Parameters<ReturnType<typeof getApiClient>["post"]["getList"]>[2]>["select"]>;
type ListedPost = Awaited<ReturnType<ReturnType<typeof getApiClient>["post"]["getList"]>>["data"][number];

async function postEntry(post: ListedPost, lang: ContentLang) {
  return {
    id: post.id,
    title: post.title,
    slug: post.slug,
    summary: post.summary,
    excerpt: await listExcerpt(post.id, post.summary, post.text, lang),
    stats: { minutes: readingMinutes(post.text), reads: post.count?.read ?? 0, likes: post.count?.like ?? 0 },
    tags: (post.tags ?? []).slice(0, 3),
    created: post.created,
    categoryId: post.categoryId,
    // Core 把置顶文章排在最前，页面需要标出来，否则看起来像排序错了。
    pinned: Boolean(post.pin),
    // 外文页面上这篇还没有译文，标题和摘录仍是中文
    original: lang !== "zh" && !(post as { isTranslated?: boolean }).isTranslated,
    category: post.category ? { name: post.category.name, slug: post.category.slug } : null,
  };
}

// 外文页面（lang 为 en / ja）由 Core 把已有译文换进标题、正文、摘要、标签和分类名，摘录和阅读时长也按译文算。
export async function getPosts(page: number, categoryId?: string, lang: ContentLang = "zh") {
  "use cache";
  cacheLife({ stale: 60, revalidate: 60, expire: 300 });
  cacheTag("blog:posts", "blog:categories", "blog:ai");
  const { data, pagination } = await getApiClient(lang).post.getList(page, 10, {
    categoryIds: categoryId ? [categoryId] : undefined,
    // text 只在服务端用来算摘录和阅读时长，不返回给页面
    select: postSelect,
  });
  return { data: await Promise.all(data.map((post) => postEntry(post, lang))), pagination: { ...pagination } };
}

// 标签、话题、搜索的结果和普通列表一样每页 10 条（Core 的分页字段同名，列表组件不用区分）
function paginate<T>(items: T[], page: number) {
  const size = 10;
  const totalPage = Math.max(1, Math.ceil(items.length / size));
  return {
    data: items.slice((page - 1) * size, page * size),
    pagination: { total: items.length, size, currentPage: page, totalPage, hasPrevPage: page > 1, hasNextPage: page < totalPage },
  };
}

// Core 的标签、话题、搜索接口只给 id 和标题，结果要完整条目（摘要、统计），所以先取全部文章做成索引再按 id 挑出来。
// ponytail: 每次缓存过期都把全部文章取一遍（每页 50 篇），文章上千篇时改成让 Core 直接按标签分页、搜索返回正文片段。
async function getPostIndex(lang: ContentLang) {
  "use cache";
  cacheLife({ stale: 60, revalidate: 60, expire: 300 });
  cacheTag("blog:posts", "blog:categories", "blog:ai");
  const client = getApiClient(lang);
  const first = await client.post.getList(1, 50, { select: postSelect });
  const rest = await Promise.all(Array.from({ length: first.pagination.totalPage - 1 }, (_, i) => client.post.getList(i + 2, 50, { select: postSelect })));
  return Promise.all([first, ...rest].flatMap(({ data }) => data).map((post) => postEntry(post, lang)));
}

// Core 的搜索支持 size（最多 50），SDK 的类型里没写；按相关度排好的前 50 条。
const searchIds = (type: "post" | "note", keyword: string) =>
  getApiClient().search.proxy(type).get<{ data: { id: string }[] }>({ params: { keyword, size: 50 } }).then(({ data }) => data.map(({ id }) => id));

function pick<T extends { id: string }>(index: T[], ids: string[]) {
  const byId = new Map(index.map((entry) => [entry.id, entry]));
  return ids.flatMap((id) => byId.get(id) ?? []);
}

// 文章的筛选：标签或搜索（分类走 getPosts，同一时间只生效一个）。标签名按中文原名原样传给 Core（有的带空格），
// 没有文章时 Core 返回 404，当作没有结果；外文页面显示译文条目。
export type PostMatch = { tag: string } | { keyword: string };
export async function getMatchedPosts(match: PostMatch, page: number, lang: ContentLang = "zh") {
  "use cache";
  cacheLife({ stale: 60, revalidate: 60, expire: 300 });
  cacheTag("blog:posts", "blog:categories", "blog:ai");
  const [ids, index] = await Promise.all([
    "tag" in match
      ? orNotFound(getApiClient().category.getTagByName(match.tag)).then((result) => (result?.data ?? []).map(({ id }) => id))
      : searchIds("post", match.keyword),
    getPostIndex(lang),
  ]);
  return paginate(pick(index, ids), page);
}

// 详情的正文译文由页面另取（getArticleTranslation），这里是中文原文；lang 只把面包屑里的分类名换成译文。
export async function getPost(category: string, slug: string, lang: ContentLang = "zh") {
  "use cache";
  cacheLife({ stale: 60, revalidate: 300, expire: 3600 });
  cacheTag("blog:posts", "blog:categories");
  const [post, names, timeline] = await Promise.all([
    orNotFound(getApiClient().post.getPost(category, slug)),
    localizedNames(lang),
    getTimeline(lang).catch(() => []),
  ]);
  if (!post) return null;
  cacheTag(`blog:post:${post.id}`);
  // 后台“关联阅读”：保持后台的先后顺序，标题和地址从时间线（只有已发布文章）换算，所以草稿和已删除的不会露出来
  const published = new Map(timeline.flatMap((item) => item.kind === "post" ? [[item.id, item]] : []));
  const related = ((post as { related?: { id: string }[] }).related ?? []).flatMap(({ id }) => {
    const item = published.get(id);
    return item ? [{ id, title: item.title, href: `/posts/${encodeURIComponent(item.category.slug)}/${encodeURIComponent(item.slug)}` }] : [];
  });
  return {
    related,
    copyright: post.copyright !== false,
    modified: (post as { modified?: string | null }).modified ?? null,
    id: post.id,
    title: post.title,
    summary: post.summary,
    text: post.text,
    contentFormat: post.contentFormat,
    allowComment: post.allowComment !== false,
    count: { read: post.count?.read ?? 0, like: post.count?.like ?? 0 },
    ...lexicalContent(post),
    created: post.created,
    category: post.category ? { name: names?.categories[post.category.slug] ?? post.category.name, slug: post.category.slug } : null,
  };
}

// 列表里的一篇手记：普通列表（getNotes）和话题、搜索的结果（getMatchedNotes）共用。手记没有手写摘要字段：AI 摘要 → 正文开头
type ListedNote = Awaited<ReturnType<ReturnType<typeof getApiClient>["note"]["getList"]>>["data"][number];

async function noteEntry(note: ListedNote, lang: ContentLang) {
  return {
    id: note.id,
    nid: note.nid,
    title: note.title,
    created: note.created,
    mood: note.mood,
    weather: note.weather,
    topic: note.topic?.name ?? null,
    // 后台“回忆项”：列表里用和置顶文章一样的北极星卡片，但不挪位置
    bookmark: Boolean(note.bookmark),
    original: lang !== "zh" && !(note as { isTranslated?: boolean }).isTranslated,
    excerpt: await listExcerpt(note.id, null, note.text, lang),
    stats: { minutes: readingMinutes(note.text), reads: note.count?.read ?? 0, likes: note.count?.like ?? 0 },
  };
}

// 外文页面由 Core 把已有译文换进标题、正文、心情、天气和话题名。
export async function getNotes(page: number, lang: ContentLang = "zh") {
  "use cache";
  cacheLife({ stale: 60, revalidate: 60, expire: 300 });
  cacheTag("blog:notes", "blog:ai");
  const { data, pagination } = await getApiClient(lang).note.getList(page, 10);
  return { data: await Promise.all(data.map((note) => noteEntry(note, lang))), pagination: { ...pagination } };
}

// 同 getPostIndex：公开列表里的全部手记（加密手记不在里面，话题和搜索结果里也就不会出现）。
async function getNoteIndex(lang: ContentLang) {
  "use cache";
  cacheLife({ stale: 60, revalidate: 60, expire: 300 });
  cacheTag("blog:notes", "blog:ai");
  const client = getApiClient(lang);
  const first = await client.note.getList(1, 50);
  const rest = await Promise.all(Array.from({ length: first.pagination.totalPage - 1 }, (_, i) => client.note.getList(i + 2, 50)));
  return Promise.all([first, ...rest].flatMap(({ data }) => data).map((note) => noteEntry(note, lang)));
}

// 手记的筛选：话题或搜索（同一时间只生效一个）。ponytail: 话题只取最新 50 篇，超过时再按页向 Core 要。
export type NoteMatch = { topicId: string } | { keyword: string };
export async function getMatchedNotes(match: NoteMatch, page: number, lang: ContentLang = "zh") {
  "use cache";
  cacheLife({ stale: 60, revalidate: 60, expire: 300 });
  cacheTag("blog:notes", "blog:ai");
  const [ids, index] = await Promise.all([
    "topicId" in match
      ? getApiClient().note.getNoteByTopicId(match.topicId, 1, 50, { sortBy: "created", sortOrder: -1 }).then(({ data }) => data.map(({ id }) => id))
      : searchIds("note", match.keyword),
    getNoteIndex(lang),
  ]);
  return paginate(pick(index, ids), page);
}

// 正文译文由页面另取；lang 只把心情、天气、话题和相邻手记的标题换成译文。
export async function getNote(nid: number, lang: ContentLang = "zh") {
  "use cache";
  cacheLife({ stale: 60, revalidate: 300, expire: 3600 });
  cacheTag("blog:notes", "blog:ai");
  const names = await localizedNames(lang);
  let result;
  try {
    result = await orNotFound(getApiClient().note.getNoteByNid(nid));
  } catch (error) {
    // Core 对设置了密码的手记返回 403。
    if (httpStatus(error) === 403) return { locked: true as const };
    throw error;
  }
  if (!result) return null;
  const { data: note, prev, next } = result;
  cacheTag(`blog:note:${note.id}`);
  // Mix Space 的 prev 是更新的一篇，next 是更早的一篇。
  const link = (item?: { id?: string; nid?: number; title?: string }) =>
    item?.nid && item.title ? { nid: item.nid, title: (item.id && names?.titles[item.id]) || item.title } : null;
  return {
    locked: false as const,
    id: note.id,
    nid: note.nid,
    title: note.title,
    text: note.text,
    contentFormat: note.contentFormat,
    allowComment: note.allowComment !== false,
    count: { read: note.count?.read ?? 0, like: note.count?.like ?? 0 },
    ...lexicalContent(note),
    created: note.created,
    mood: (note.mood && names?.moods[note.mood]) || note.mood,
    weather: (note.weather && names?.weathers[note.weather]) || note.weather,
    topic: note.topic ? { id: note.topic.id, name: names?.topics[note.topic.id] ?? note.topic.name, slug: note.topic.slug } : null,
    // 后台“日记设置”的封面图（meta.cover）与附加字段“横幅信息”（meta.banner），规则见 lib/note-extras.ts
    ...parseNoteMeta(note.meta),
    newer: link(prev),
    older: link(next),
  };
}

// lang：外文页面用后台“AI i18n”翻好的作品名和介绍（Core GET /ai/i18n/:lang 的 projects），没有的保持中文并标出原文语言。
export async function getProjects(lang: ContentLang = "zh") {
  "use cache";
  // 作品增删改经 PROJECT_* 事件立即失效（2026-11-04 起 Core 才登记这几个事件），没勾时靠短缓存；译文更新经 I18N_UPDATE 失效 i18n。
  cacheLife({ stale: 60, revalidate: 300, expire: 3600 });
  cacheTag("blog:projects", "i18n");
  const [{ data }, { projects: translated }] = await Promise.all([getApiClient().project.getAll(), getI18nBundle(lang)]);
  // 名字和介绍可以只译一项：各自没有译文时显示中文、单独标 zh-CN
  const original = (text: string | undefined) => (lang !== "zh" && !text ? ("zh-CN" as const) : undefined);
  return data.map(({ id, name, description, avatar, projectUrl, previewUrl, docUrl }) => ({
    id,
    name: translated[id]?.name ?? name,
    nameLang: original(translated[id]?.name),
    description: translated[id]?.description ?? description,
    descriptionLang: original(translated[id]?.description),
    avatar, projectUrl, previewUrl, docUrl,
  }));
}

// 站点那句话（后台 SEO 描述）：外文页面用后台“AI i18n”翻好的译文（位置 seo.description，中文要一致），没有时用中文。
export async function getSiteDescription(lang: ContentLang = "zh") {
  const [settings, { site }] = await Promise.all([getSiteSettings().catch(() => null), getI18nBundle(lang)]);
  const source = (settings?.description ?? siteDescription).trim();
  const translated = lang === "zh" ? undefined : siteTranslation(site, "seo.description", source);
  return { text: translated ?? source, original: lang !== "zh" && !translated };
}

// 站长维护的站点内容（首屏标题与说明、页脚那句话、萌备、星带账号、文章版权说明），都在配置片段 theme/yozora 里，规则见 lib/theme-config.ts
export async function getSiteContent(lang: ContentLang = "zh") {
  const [config, { site }] = await Promise.all([getThemeConfig().catch(() => null), getI18nBundle(lang)]);
  return parseSiteContent(config, lang, site);
}

// 站点主题配置（后台配置片段 theme/yozora，格式见 lib/theme-config.ts）。保存片段经 SNIPPET_* 事件立即失效，没勾时靠短缓存；
// 片段还没建时返回 null，页面用写死的默认值。SDK 返回的对象带方法，缓存前转成普通 JSON。
// stale 至少 300：留着给根布局 generateMetadata 用（2026-11-05 前经 getSiteDescription 读它），Next 只把 stale ≥ 5 分钟的缓存放进预渲染外壳，
// 短了 metadata 会被当成动态，整页静态的 /en/debug 就报 “encountered URL data in generateMetadata()”（e2e dev-issues.mjs）。
export async function getThemeConfig(): Promise<unknown> {
  "use cache";
  cacheLife({ stale: 300, revalidate: 300, expire: 3600 });
  cacheTag("blog:theme");
  const data = await orNotFound(getApiClient().snippet.getByReferenceAndName<unknown>("theme", "yozora"));
  return data === null ? null : JSON.parse(JSON.stringify(data));
}

// 时间线：全部已发布文章与公开手记，只取标题、日期和拼链接的字段，按发布时间倒序合并。
export async function getTimeline(lang: ContentLang = "zh") {
  "use cache";
  cacheLife({ stale: 60, revalidate: 300, expire: 3600 });
  cacheTag("blog:posts", "blog:notes", "blog:categories", "blog:ai");
  const [{ data }, names] = await Promise.all([getApiClient().aggregate.getTimeline({ sort: "desc" }), localizedNames(lang)]);
  const title = (id: string, original: string) => names?.titles[id] ?? original;
  const posts = (data.posts ?? []).flatMap((post) => post.category
    ? [{ kind: "post" as const, id: post.id, title: title(post.id, post.title), created: post.created, category: { name: names?.categories[post.category.slug] ?? post.category.name, slug: post.category.slug }, slug: post.slug }]
    : []);
  const notes = (data.notes ?? []).map((note) => ({ kind: "note" as const, id: note.id, title: title(note.id, note.title), created: note.created, nid: note.nid }));
  return [...posts, ...notes].sort((a, b) => Date.parse(b.created) - Date.parse(a.created));
}

// 首屏“喜欢本站”的计数（Core 的 GET /like_this）。点赞由浏览器直接 POST 给 Core（按访客 IP 每天一次），这里只读计数，缓存很短。
export async function getSiteLikes() {
  "use cache";
  cacheLife({ stale: 30, revalidate: 60, expire: 600 });
  cacheTag("blog:site-like");
  const value = await getApiClient().proxy.like_this.get<number>();
  return typeof value === "number" ? value : Number(value) || 0;
}

// 首页“最近发生的事”（同 Shiro）：Core 的 /activity/recent 返回评论、点赞、新文章、新手记、新碎碎念、新思考六类（没有一言），
// 这里只放五类：碎碎念首页上面有自己的一栏，不在这里重复（2026-11-04 用户要求）。
// 评论只含已公开、非悄悄话的。点赞没有 Webhook 事件，缓存短一些。文章只给了 slug，借时间线换算出带分类的地址。
export type RecentActivity = {
  key: string;
  kind: "comment" | "like" | "post" | "note" | "recent";
  created: string;
  title?: string;
  href: string | null;
  author?: string;
  avatar?: string;
  text?: string;
  onThinking?: boolean;
  deleted?: boolean;
};

// lang：文章、手记的标题换成译文（按时间线里的标题对照），评论、思考的内容保持中文。
export async function getRecentActivity(lang: ContentLang = "zh") {
  "use cache";
  cacheLife({ stale: 60, revalidate: 120, expire: 600 });
  cacheTag("blog:posts", "blog:notes", "blog:comments", "blog:recently", "blog:categories", "blog:ai");
  const [data, timeline, zhTimeline] = await Promise.all([getApiClient().activity.getRecentActivities(), getTimeline(lang), getTimeline()]);
  const posts = new Map(timeline.flatMap((item) => item.kind === "post" ? [[item.slug, `/posts/${encodeURIComponent(item.category.slug)}/${encodeURIComponent(item.slug)}`]] : []));
  // 动态里只有中文标题，按时间线的中文标题找到译文
  const translatedTitle = new Map(zhTimeline.map((item, index) => [item.title, timeline[index].title]));
  const record = data as unknown as Record<string, Array<Record<string, unknown>>>;
  const text = (value: unknown) => typeof value === "string" ? value : undefined;
  const title = (value: unknown) => { const original = text(value); return original && (translatedTitle.get(original) ?? original); };
  const href = (type: unknown, item: Record<string, unknown>) => {
    const kind = String(type).toLowerCase();
    if (kind.startsWith("note")) return item.nid ? `/notes/${item.nid}` : null;
    if (kind.startsWith("post")) return posts.get(text(item.slug) ?? "") ?? null;
    if (kind.startsWith("page")) return item.slug ? `/${encodeURIComponent(String(item.slug))}` : null;
    if (kind.startsWith("recent")) return "/thinking";
    return null;
  };
  const items: RecentActivity[] = [
    ...(record.comment ?? []).map((item) => ({
      key: `comment-${item.id}-${item.created}`, kind: "comment" as const, created: String(item.created),
      title: title(item.title),
      // 评论在思考下面时 Core 不给标题，组件显示“一条思考”
      onThinking: String(item.type).toLowerCase().startsWith("recent"),
      href: href(item.type, item), author: text(item.author), avatar: safeUrl(text(item.avatar)), text: excerpt(text(item.text), 80),
    })),
    ...(record.like ?? []).map((item) => ({ key: `like-${item.id}`, kind: "like" as const, created: String(item.created), title: title(item.title), deleted: !text(item.title), href: href(item.type, item) })),
    ...(record.post ?? []).map((item) => ({ key: `post-${item.id}`, kind: "post" as const, created: String(item.created), title: title(item.title), href: href("posts", item) })),
    ...(record.note ?? []).map((item) => ({ key: `note-${item.id}`, kind: "note" as const, created: String(item.created), title: title(item.title), href: href("notes", item) })),
    ...(record.recent ?? []).map((item) => ({ key: `recent-${item.id}`, kind: "recent" as const, created: String(item.created), href: "/thinking", text: excerpt(text(item.content), 80) })),
  ];
  return items.sort((a, b) => Date.parse(b.created) - Date.parse(a.created)).slice(0, 12);
}

// 友链：Core 对访客只返回已通过、已失联、已封禁三种状态（审核中、已拒绝不返回）。
// 友链增删改经 LINK_* 事件立即失效；后台审核通过申请不发事件，靠短缓存。
export async function getLinks() {
  "use cache";
  cacheLife({ stale: 60, revalidate: 300, expire: 3600 });
  cacheTag("blog:links");
  const data = await getApiClient().link.getAll();
  return data.data.map(({ id, name, url, avatar, description, type, state, hide }) => ({
    id, name, url, avatar, description, type, state, hide: Boolean(hide),
  }));
}

// 后台“友链设置”里是否开放申请。改动经 OPTION_UPDATE 失效，没勾时靠短缓存。
export async function getLinkApplyOpen() {
  "use cache";
  cacheLife({ stale: 60, revalidate: 300, expire: 3600 });
  cacheTag("blog:links");
  return Boolean(await getApiClient().link.canApplyLink());
}

// 一言：一次读全部（条数不多），按人看、抽一句都要用到全部；页面上再按 20 条分页
export async function getAllSays() {
  "use cache";
  cacheLife({ stale: 60, revalidate: 300, expire: 3600 });
  cacheTag("blog:says");
  const { data } = await getApiClient().say.getAll();
  return data.map(({ id, text, author, source, created }) => ({ id, text, author: author || undefined, source: source || undefined, created: String(created) }));
}

// 碎碎念：站长随手记的闲话（Core /murmurs），按页读，每页 20 条，从新到旧。
export async function getMurmurs(page = 1) {
  "use cache";
  cacheLife({ stale: 60, revalidate: 300, expire: 3600 });
  cacheTag("blog:murmurs");
  const { data, pagination } = await getApiClient().murmur.getList(page, 20);
  return {
    data: data.map(({ id, content, created, modified }) => ({ id, content, created, modified: modified ?? null })),
    pagination: { ...pagination },
  };
}

// 思考（Core 的速记）按 id 游标分页：before 取上一页最后一条的 id。
export async function getRecently(before?: string) {
  "use cache";
  cacheLife({ stale: 60, revalidate: 300, expire: 3600 });
  cacheTag("blog:recently");
  const size = 20;
  const { data } = await getApiClient().recently.getList({ before, size });
  // 引用是 Core 直接读出的原文档，只取拼链接需要的字段。
  const ref = (refType: unknown, value: unknown) => {
    const doc = typeof value === "object" && value ? value as Record<string, unknown> : null;
    if (!doc || typeof doc.title !== "string") return null;
    const text = (key: string) => typeof doc[key] === "string" ? doc[key] as string : undefined;
    return { type: String(refType), title: doc.title, slug: text("slug"), nid: typeof doc.nid === "number" ? doc.nid : undefined, categoryId: text("category") };
  };
  return {
    data: data.map((item) => ({
      id: item.id,
      content: item.content,
      created: item.created,
      ref: ref(item.refType, item.ref),
      up: item.up ?? 0,
      down: item.down ?? 0,
      comments: (item as { comments?: number }).comments ?? 0,
      allowComment: item.allowComment !== false,
    })),
    hasMore: data.length === size,
  };
}

// 评论：Core 对访客只返回已公开、非悄悄话的评论，邮箱已换成头像，IP/UA 不返回。
// 后台审核通过、置顶不发 Webhook 事件，所以缓存短一些；新增、编辑、删除经 COMMENT_* 事件立即失效。
// 全部读完：主评论逐页取，Core 只给每楼头尾几条回复，被折叠的中间部分用楼中楼接口按游标取回，再按时间排好。
// ponytail: 一次读完全部评论（最多 20 页 × 50 条主评论），评论上千条时改为页面上“加载更多”。
export async function getComments(refId: string) {
  "use cache";
  cacheLife({ stale: 30, revalidate: 60, expire: 300 });
  cacheTag("blog:comments");
  const comment = getApiClient().comment;
  type Raw = Awaited<ReturnType<typeof comment.getByRefId>>["data"][number];
  type RawReply = Raw["replies"][number];
  const readers: Record<string, { name?: string; image?: string | null; role?: string }> = {};
  const pages: Raw[] = [];
  let total = 0;
  for (let page = 1, totalPage = 1; page <= Math.min(totalPage, 20); page++) {
    const result = await comment.getByRefId(refId, { page, size: 50 });
    pages.push(...result.data);
    Object.assign(readers, result.readers);
    totalPage = result.pagination.totalPage;
    total = result.pagination.total;
  }
  const threads = await Promise.all(pages.map(async (thread) => {
    const replies: RawReply[] = [...thread.replies];
    for (let cursor = thread.replyWindow?.hiddenCount ? thread.replyWindow.nextCursor : undefined; cursor;) {
      const more = await comment.getThreadReplies(thread.id, { cursor, size: 50 });
      replies.push(...(more.replies as RawReply[]));
      Object.assign(readers, more.readers);
      cursor = more.done ? undefined : more.nextCursor;
    }
    const seen = new Set<string>();
    const ordered = replies.filter(({ id }) => !seen.has(id) && seen.add(id)).sort((a, b) => Date.parse(a.created) - Date.parse(b.created));
    return { thread, replies: ordered };
  }));
  const view = (item: Raw | RawReply) => {
    const reader = item.readerId ? readers[item.readerId] : undefined;
    return {
      id: item.id,
      author: reader?.name || item.author || "匿名",
      avatar: reader?.image || item.avatar,
      url: item.url,
      text: item.text,
      created: item.created,
      location: item.location,
      pinned: Boolean(item.pin),
      deleted: Boolean(item.isDeleted),
      parentId: item.parentCommentId ?? null,
      // 站长在后台或以站长身份登录发的评论，评论悬浮窗里放在右侧
      owner: reader?.role === "owner",
    };
  };
  return {
    data: threads.map(({ thread, replies }) => ({ ...view(thread), replies: replies.map(view) })),
    total,
  };
}

// AI 摘要与翻译：只读取后台已生成的内容（onlyDb），前端从不触发生成，费用完全由后台控制。
// 摘要经 AI_SUMMARY_*、翻译经 TRANSLATION_* 事件立即失效；没勾时缓存 1 小时。站点原文是中文，翻译只列出非中文的语言
// （站点有没有开这种语言由用的地方再看）。
export type TranslationLanguage = Locale;
const isTranslationLanguage = (value: unknown): value is TranslationLanguage => isLanguageCode(value) && value !== "zh";

export async function getArticleAi(id: string, lang: ContentLang = "zh") {
  "use cache";
  cacheLife({ stale: 300, revalidate: 3600, expire: 86400 });
  cacheTag("blog:ai", `blog:ai:${id}`);
  const ai = getApiClient().ai;
  const [summary, languages] = await Promise.all([
    ai.getSummary({ articleId: id, lang, onlyDb: true }).catch(() => null),
    ai.getAvailableLanguages(id).catch(() => []),
  ]);
  // Core 返回 { data: [...] }，SDK 类型写的是数组，两种都兼容。
  const list: unknown = Array.isArray(languages) ? languages : (languages as { data?: unknown })?.data;
  return {
    summary: typeof summary?.summary === "string" && summary.summary.trim() ? summary.summary.trim() : null,
    languages: Array.isArray(list) ? list.filter(isTranslationLanguage) : [],
  };
}

// 站点内容的语言：中文是原文，后台“i18n 语言”里开着的语言读 Core 里已有的译文。
export type ContentLang = Locale;

// 外文页面的“名字对照表”：文章、手记、页面的标题（AI 翻译），分类名、话题名、心情、天气（Core 的翻译条目）。
// 时间线、导航面板、搜索结果、相邻文章这些 Core 不按语言返回的地方，用它把中文换成译文；没有译文的保持中文。
// 唯一来源是 Core：列表接口带 ?lang= 时 Core 已把译文换进去，这里只是收集起来按 id 查。
export type LocalizedNames = {
  titles: Record<string, string>;
  subtitles: Record<string, string>;
  categories: Record<string, string>;
  topics: Record<string, string>;
  moods: Record<string, string>;
  weathers: Record<string, string>;
};

export async function getLocalizedNames(lang: TranslationLanguage): Promise<LocalizedNames> {
  "use cache";
  cacheLife({ stale: 60, revalidate: 300, expire: 3600 });
  cacheTag("blog:posts", "blog:notes", "blog:categories", "blog:pages", "blog:ai");
  const client = getApiClient(lang);
  const all = async <T>(load: (page: number) => Promise<{ data: T[]; pagination: { totalPage: number } }>) => {
    const first = await load(1);
    const rest = await Promise.all(Array.from({ length: Math.max(0, first.pagination.totalPage - 1) }, (_, index) => load(index + 2)));
    return [first, ...rest].flatMap((result) => result.data);
  };
  const [posts, notes, sourceNotes, { data: categories }, pages] = await Promise.all([
    all((page) => client.post.getList(page, 50)),
    all((page) => client.note.getList(page, 50)),
    all((page) => getApiClient().note.getList(page, 50)),
    client.category.getAllCategories(),
    all((page) => getApiClient().page.getList(page, 50)),
  ]);
  const pageTranslations = await Promise.all(pages.map(async (page) => ({ page, translation: await getArticleTranslation(page.id, lang).catch(() => null) })));
  const pageTitles = pageTranslations.map(({ page, translation }) => [page.id, translation?.title ?? page.title] as const);
  const source = new Map(sourceNotes.map((note) => [note.id, note]));
  const pairs = (field: "mood" | "weather") => Object.fromEntries(notes.flatMap((note) => {
    const original = source.get(note.id)?.[field];
    return original && note[field] ? [[original, note[field]]] : [];
  }));
  return {
    titles: Object.fromEntries([...[...posts, ...notes].map((item) => [item.id, item.title] as const), ...pageTitles]),
    subtitles: Object.fromEntries(pageTranslations.flatMap(({ page, translation }) => {
      const subtitle = translation?.subtitle ?? page.subtitle;
      return subtitle ? [[page.id, subtitle]] : [];
    })),
    categories: Object.fromEntries(categories.map((category) => [category.slug, category.name])),
    topics: Object.fromEntries(notes.flatMap((note) => (note.topic ? [[note.topic.id, note.topic.name]] : []))),
    moods: pairs("mood"),
    weathers: pairs("weather"),
  };
}

// 中文不需要对照表
const localizedNames = (lang: ContentLang) => (lang === "zh" ? Promise.resolve(null) : getLocalizedNames(lang).catch(() => null));

export async function getArticleTranslation(id: string, lang: TranslationLanguage) {
  "use cache";
  cacheLife({ stale: 300, revalidate: 3600, expire: 86400 });
  cacheTag("blog:ai", `blog:ai:${id}`);
  const translation = await orNotFound(getApiClient().ai.getTranslation({ articleId: id, lang }));
  if (!translation) return null;
  const doc = translation as typeof translation & { contentFormat?: string; content?: string };
  return {
    title: doc.title,
    subtitle: doc.subtitle,
    summary: doc.summary,
    text: doc.text,
    contentFormat: doc.contentFormat,
    ...lexicalContent(doc),
    sourceLang: doc.sourceLang,
    aiModel: doc.aiModel,
  };
}

// 页面（关于我等）的正文译文由页面另取（getArticleTranslation），这里是中文原文。
export async function getPage(slug: string) {
  "use cache";
  cacheLife({ stale: 300, revalidate: 3600, expire: 86400 });
  cacheTag("blog:pages");
  const page = await orNotFound(getApiClient().page.getBySlug(slug));
  if (!page) return null;
  cacheTag(`blog:page:${page.id}`);
  return {
    id: page.id,
    title: page.title,
    subtitle: page.subtitle,
    text: page.text,
    contentFormat: page.contentFormat,
    allowComment: page.allowComment !== false,
    ...lexicalContent(page),
  };
}

// 搜索关键词由访客输入；结果只含公开字段，文章/手记变动时随 Webhook 一并失效。
// Core 搜索默认返回第一页 10 条。
// 搜索在中文原文里匹配；外文页面把结果的标题和分类名换成译文。
export async function searchPosts(keyword: string, lang: ContentLang = "zh") {
  "use cache";
  cacheLife({ stale: 60, revalidate: 60, expire: 300 });
  cacheTag("blog:posts", "blog:ai");
  const [{ data, pagination }, names] = await Promise.all([getApiClient().search.search("post", keyword), localizedNames(lang)]);
  return {
    total: pagination.total,
    data: data.map((post) => ({
      id: post.id,
      title: names?.titles[post.id] ?? post.title,
      created: post.created,
      slug: post.slug,
      category: post.category ? { name: names?.categories[post.category.slug] ?? post.category.name, slug: post.category.slug } : null,
    })),
  };
}

export async function searchNotes(keyword: string, lang: ContentLang = "zh") {
  "use cache";
  cacheLife({ stale: 60, revalidate: 60, expire: 300 });
  cacheTag("blog:notes", "blog:ai");
  const [{ data, pagination }, names] = await Promise.all([getApiClient().search.search("note", keyword), localizedNames(lang)]);
  return {
    total: pagination.total,
    data: data.map((note) => ({ id: note.id, nid: note.nid, title: names?.titles[note.id] ?? note.title, created: note.created })),
  };
}

// 标签来自文章，文章变动（blog:posts）时一起失效。
export async function getTags() {
  "use cache";
  cacheLife({ stale: 300, revalidate: 3600, expire: 86400 });
  cacheTag("blog:posts");
  const { data } = await getApiClient().category.getAllTags();
  return data
    .map(({ name, count }) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

// 后台“话题”：名字、图标、简介、详细描述。话题本身没有篇数，用每个话题第一页的分页总数统计；话题很少，请求数可以接受。
export async function getTopics(lang: ContentLang = "zh") {
  "use cache";
  cacheLife({ stale: 300, revalidate: 3600, expire: 86400 });
  cacheTag("blog:notes");
  // 带 ?lang= 时 Core 已把话题名和简介换成译文（后台“翻译条目”）；详细描述 Core 不翻译，外文页面显示中文原文
  const client = getApiClient(lang);
  const { data } = await client.topic.getAll();
  const counts = await Promise.all(data.map((topic) => client.note.getNoteByTopicId(topic.id, 1, 1)));
  return data
    .map((topic, index) => ({
      id: topic.id,
      name: topic.name,
      slug: topic.slug,
      icon: safeUrl(topic.icon ?? undefined),
      introduce: topic.introduce?.trim() || undefined,
      description: topic.description?.trim() || undefined,
      count: counts[index].pagination.total,
    }))
    .filter((topic) => topic.count > 0)
    .sort((a, b) => b.count - a.count);
}

// ponytail: 一次取 50 条不分页，话题下手记超过 50 篇时再加分页。
export async function getNotesByTopic(topicId: string, lang: ContentLang = "zh") {
  "use cache";
  cacheLife({ stale: 60, revalidate: 300, expire: 3600 });
  cacheTag("blog:notes", "blog:ai");
  const [{ data, pagination }, names] = await Promise.all([getApiClient().note.getNoteByTopicId(topicId, 1, 50, { sortBy: "created", sortOrder: -1 }), localizedNames(lang)]);
  return {
    total: pagination.total,
    data: data.map((note) => ({ id: note.id, nid: note.nid, title: names?.titles[note.id] ?? note.title, created: note.created })),
  };
}

// 顶部导航悬停面板（navigation-menu.tsx）的数据，全部复用已有缓存：
// 首页面板的“此间”三个数字取 Core 的 /aggregate/site_info（文章数、手记数、全站字数、第一篇发布日期；SDK 会把字段转成驼峰），
// 文章面板按分类列出篇数和各分类最近 5 篇，手记面板按话题列出篇数和各话题最近 5 篇，时间线面板列出近期文章与手记。
// 建站天数在缓存函数里按当时时间算，最多晚一个缓存周期（1 小时）变化，跨零点那一会儿可能差一天。
export type NavigationEntry = { id: string; title: string; created: string; href: string; kind: "post" | "note" };

export async function getNavigationPanels(lang: ContentLang = "zh") {
  "use cache";
  cacheLife({ stale: 60, revalidate: 300, expire: 3600 });
  cacheTag("blog:posts", "blog:notes", "blog:categories", "blog:navigation", "blog:ai");
  const [site, categories, timeline, topics] = await Promise.all([
    getApiClient().proxy.aggregate.site_info.get<{ postCount?: number; noteCount?: number; totalWordCount?: number; firstPublishDate?: string }>(),
    getCategories(lang),
    getTimeline(lang),
    getTopics(lang).catch(() => []),
  ]);
  const entry = (item: Awaited<ReturnType<typeof getTimeline>>[number]): NavigationEntry => ({
    id: item.id,
    title: item.title,
    created: item.created,
    kind: item.kind,
    href: item.kind === "post"
      ? `/posts/${encodeURIComponent(item.category.slug)}/${encodeURIComponent(item.slug)}`
      : `/notes/${item.nid}`,
  });
  const posts = timeline.filter((item) => item.kind === "post");
  const topicNotes = await Promise.all(topics.map((topic) => getNotesByTopic(topic.id, lang).catch(() => ({ data: [] }))));
  const first = Date.parse(site.firstPublishDate ?? "");
  return {
    stats: {
      writings: (site.postCount ?? 0) + (site.noteCount ?? 0),
      words: site.totalWordCount ?? 0,
      days: Number.isFinite(first) ? Math.max(1, Math.ceil((Date.now() - first) / 86_400_000)) : null,
    },
    postCount: site.postCount ?? posts.length,
    noteCount: site.noteCount ?? timeline.length - posts.length,
    categories: categories.filter((category) => category.type === 0).map((category) => ({
      name: category.name,
      href: `/categories/${encodeURIComponent(category.slug)}`,
      count: category.count ?? 0,
      recent: posts.filter((item) => item.kind === "post" && item.category.slug === category.slug).slice(0, 5).map(entry),
    })),
    // 手记页按话题的 slug 筛选（和页内“按话题”抽屉一致），不能用名字
    topics: topics.map((topic, index) => ({
      name: topic.name,
      icon: topic.icon,
      count: topic.count,
      href: `/notes?topic=${encodeURIComponent(topic.slug)}`,
      recent: topicNotes[index].data.slice(0, 5).map((note): NavigationEntry => ({ id: note.id, title: note.title, created: note.created, kind: "note", href: `/notes/${note.nid}` })),
    })),
    recentNotes: timeline.filter((item) => item.kind === "note").slice(0, 5).map(entry),
    recentPosts: posts.slice(0, 5).map(entry),
    recent: timeline.slice(0, 5).map(entry),
  };
}
