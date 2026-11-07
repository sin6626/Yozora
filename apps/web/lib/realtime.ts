// Core 实时连接（/web）推来的消息 → 前台要做的事。纯函数，没有副作用，components/notifications.tsx 照着执行；
// 检查 scripts/verify-notifications.mjs。参照 Shiro 的 socket/handler.ts。
// Core 已在服务端过滤访客事件（未发布、加密、定时的内容不推，更新、删除只推给对应文章房间，见 visitor-event-dispatch.service.ts），
// 这里只按消息本身决定，不再向 Core 要任何没推过来的内容。

export type ArticleKind = "post" | "note" | "page";
// 当前在看的文章/手记/页面（详情页的 ArticleNotifications 登记），path 是去掉语言前缀的当前地址
export type RealtimeContext = { path: string; article: { kind: ArticleKind; id: string } | null };

// 播报文案的键（词典 notifications 下同名），图标见 lib/island-store.ts
export type RealtimeCopy =
  | "POST_CREATE" | "POST_UPDATE" | "POST_DELETE"
  | "NOTE_CREATE" | "NOTE_UPDATE" | "NOTE_DELETE"
  | "PAGE_UPDATE" | "PAGE_DELETE"
  | "RECENTLY_CREATE" | "SAY_CREATE";

export type RealtimeAction =
  | { type: "online"; count: number }
  | { type: "reads"; id: string; count: number }
  // title：新文章/手记的标题（外文页面会去换译名，titleId 是要译名的那篇）；text：思考、一言的正文摘录（原样中文）；href：“去看看”
  | { type: "announce"; copy: RealtimeCopy; icon: "post" | "note" | "update" | "remove" | "thinking" | "say"; title?: string; titleId?: string; text?: string; href?: string }
  // 让这篇的详情缓存失效再刷新页面（cache-actions.ts 的 refreshArticle）
  | { type: "refresh-article"; kind: ArticleKind; id: string }
  // 当前就在这份列表上：让列表缓存失效再刷新（cache-actions.ts 的 refreshAfterWrite）
  | { type: "refresh-list"; list: "recently" | "says" }
  // 正在看的这篇被删了：播报后跳回列表（不带语言前缀）
  | { type: "leave"; href: string };

const listOf: Record<ArticleKind, string> = { post: "/posts", note: "/notes", page: "/" };
const object = (value: unknown): Record<string, unknown> | null => (value && typeof value === "object" ? value as Record<string, unknown> : null);
const string = (value: unknown) => (typeof value === "string" && value.trim() ? value : undefined);
// 思考、一言的正文放在岛的第二行，只取开头一段
export const excerpt = (text: string, max = 40) => {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
};

export function realtimeActions(message: unknown, context: RealtimeContext): RealtimeAction[] {
  const envelope = object(message);
  const type = envelope?.type;
  const data = envelope?.data;
  const doc = object(data);
  const current = context.article;
  switch (type) {
    case "VISITOR_ONLINE":
    case "VISITOR_OFFLINE":
      return typeof doc?.online === "number" ? [{ type: "online", count: doc.online }] : [];

    // 阅读数：Core 给所有访客广播（POST /ack 之后），只更新正在看的那篇
    case "ARTICLE_READ_COUNT_UPDATE": {
      const id = string(doc?.id);
      return id && id === current?.id && typeof doc?.count === "number" && doc.count > 0 ? [{ type: "reads", id, count: doc.count }] : [];
    }

    case "POST_CREATE": {
      // Core 也会推未发布的文章（新建草稿时），不播
      if (doc?.isPublished !== true) return [];
      const category = string(object(doc.category)?.slug);
      const slug = string(doc.slug);
      const href = category && slug ? `/posts/${encodeURIComponent(category)}/${encodeURIComponent(slug)}` : "/posts";
      return [{ type: "announce", copy: "POST_CREATE", icon: "post", title: string(doc.title), titleId: string(doc.id), href }];
    }
    case "NOTE_CREATE": {
      if (!doc || doc.isPublished === false) return [];
      const nid = typeof doc.nid === "number" ? doc.nid : null;
      return [{ type: "announce", copy: "NOTE_CREATE", icon: "note", title: string(doc.title), titleId: string(doc.id), href: nid === null ? "/notes" : `/notes/${nid}` }];
    }
    case "RECENTLY_CREATE":
    case "SAY_CREATE": {
      const thinking = type === "RECENTLY_CREATE";
      const href = thinking ? "/thinking" : "/says";
      const text = string(thinking ? doc?.content : doc?.text);
      const announce: RealtimeAction = { type: "announce", copy: type, icon: thinking ? "thinking" : "say", text: text && excerpt(text) };
      // 就在这份列表上：刷新出新的一条，不用“去看看”
      return context.path === href ? [announce, { type: "refresh-list", list: thinking ? "recently" : "says" }] : [{ ...announce, href }];
    }

    // 修改：只推给正在看这篇的读者，带的是改后的整篇；换成最新内容
    case "POST_UPDATE":
    case "NOTE_UPDATE":
    case "PAGE_UPDATE": {
      const kind = type.slice(0, 4).toLowerCase() as ArticleKind;
      const id = string(doc?.id);
      if (!id || current?.kind !== kind || current.id !== id) return [];
      return [{ type: "announce", copy: type, icon: "update" }, { type: "refresh-article", kind, id }];
    }
    // 外文页面读的是 AI 译文；译文生成或改了也换上（只推给这篇的房间）
    case "TRANSLATION_CREATE":
    case "TRANSLATION_UPDATE": {
      const id = string(doc?.refId);
      return id && id === current?.id ? [{ type: "refresh-article", kind: current.kind, id }] : [];
    }

    // 删除：载荷就是 id 字符串
    case "POST_DELETE":
    case "NOTE_DELETE":
    case "PAGE_DELETE": {
      const kind = type.slice(0, 4).toLowerCase() as ArticleKind;
      if (typeof data !== "string" || current?.kind !== kind || current.id !== data) return [];
      return [{ type: "announce", copy: type, icon: "remove" }, { type: "leave", href: listOf[kind] }];
    }
    default:
      return [];
  }
}
