// Mix Space 的 Webhook 事件 → 需要立即失效的缓存标签。每个事件名都必须是 Core 真的会发、也登记在
// apps/core/src/constants/business-event.constant.ts 里的（Core 的 Webhook 入口只放行登记过的事件），scripts/verify-webhook.mjs 会核对。
// blog:categories 同时挂在导航、分类和文章列表上；blog:pages 挂在导航上；blog:navigation 挂着站点设置、个人资料、登录方式和订阅开关。
const crud = ["CREATE", "UPDATE", "DELETE"] as const;
const kinds: Record<string, { tags: readonly string[]; actions?: readonly string[]; idless?: true }> = {
  POST: { tags: ["blog:posts", "blog:categories"] },
  NOTE: { tags: ["blog:notes"] },
  PAGE: { tags: ["blog:pages"] },
  CATEGORY: { tags: ["blog:categories"] },
  TOPIC: { tags: ["blog:notes"] },
  SAY: { tags: ["blog:says"] },
  RECENTLY: { tags: ["blog:recently"] },
  // 碎碎念：列表、首页右栏都挂在 blog:murmurs 上
  MURMUR: { tags: ["blog:murmurs"] },
  // 评论审核通过、置顶不发事件，靠 blog:comments 的短缓存兜底。
  COMMENT: { tags: ["blog:comments"] },
  PROJECT: { tags: ["blog:projects"] },
  LINK: { tags: ["blog:links"] },
  // AI 翻译新增、在后台修改或删除：外文页面的正文、标题、摘要都来自它；文章、手记列表和导航的译名也跟着变
  TRANSLATION: { tags: ["blog:ai", "blog:posts", "blog:notes", "blog:pages"] },
  // AI 摘要生成、在后台修改或删除：详情页摘要和列表摘要（getPosts/getNotes 也挂着 blog:ai）
  AI_SUMMARY: { tags: ["blog:ai"] },
  // 配置片段：theme/yozora（首屏、页脚、技术栈等站点文案）和 theme/leetcode-calendar（页脚力扣星带）
  SNIPPET: { tags: ["blog:theme", "activity-sky"] },
  // 后台“设置”任意一项（SEO、网站地址、评论、订阅、OAuth、友链申请开关、AI i18n 开关和语言……）
  OPTION: { tags: ["blog:navigation", "blog:links", "i18n"], actions: ["UPDATE"] },
  // AI i18n 的译文（界面文字、站点文案、作品名和介绍）生成、在后台修改或删除；载荷只有 { langs }
  I18N: { tags: ["i18n"], actions: ["UPDATE"], idless: true },
  // 个人资料（名字、头像、社交账号）
  OWNER: { tags: ["blog:navigation"], actions: ["UPDATE"] },
};

export const eventTags = new Map<string, readonly string[]>(
  Object.entries(kinds).flatMap(([kind, { tags, actions = crud }]) => actions.map((action) => [`${kind}_${action}`, tags] as const)),
);

// 载荷里没有内容 ID 的事件（其余事件的载荷必须带 24 位 ID，接收端据此挡掉格式不对的请求）
export const idlessEvents = new Set(Object.entries(kinds).flatMap(([kind, { actions = crud, idless }]) => (idless ? actions.map((action) => `${kind}_${action}`) : [])));

// 备份恢复后 Core 发出 CONTENT_REFRESH，载荷是字符串 "restore_done"，全部公开缓存失效。
export const allTags = Array.from(new Set([...Object.values(kinds).flatMap(({ tags }) => tags), "blog:navigation", "blog:theme"]));
