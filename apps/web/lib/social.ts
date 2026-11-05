import type { Locale } from "./i18n/config";

// 后台“设置 → 用户 → 社交链接”的平台：键名和后台 apps/admin/src/constants/social.ts 一一对应
// （scripts/verify-social-links.mjs 检查两边一致）。每项可以填 ID（自动拼成主页地址）或直接贴完整链接（http/https 原样使用）。
// 图标是 Iconify 离线图标集里的品牌标志（components/iconify-icon.tsx 渲染）：平时单色、跟随文字颜色，
// 鼠标移上去（或键盘聚焦）换成 color 里的品牌色（simple-icons 收录的官方色值；邮箱没有品牌色，用站点强调色）。
// 品牌色接近黑色的（dark）在熄灯时改成“品牌色圆底 + 白色图标”，否则黑图标在夜空上看不见。样式在 home-hero.css、navigation-menu.css。
// label 是中文名；en、ja 是英文、日文页面用的名称（悬停提示和读屏文字，别的外文用英文名），和中文一样的（GitHub、QQ 这类）不用写。
type Platform = { label: string; en?: string; ja?: string; icon: string; color: string; url: (id: string) => string };
// 别的语言（后台开着的 ko 等）没写名称时用英文名，再没有就用中文名
const nameOf = (platform: Pick<Platform, "label" | "en" | "ja">, lang: Locale) => (lang === "zh" ? platform.label : (lang === "ja" ? platform.ja : undefined) ?? platform.en ?? platform.label);
const darkBrands = new Set(["github", "douyin", "v2ex", "x", "steam"]);

const platforms: Record<string, Platform> = {
  github: { label: "GitHub", icon: "simple-icons:github", color: "#181717", url: (id) => `https://github.com/${id}` },
  bilibili: { label: "哔哩哔哩", en: "Bilibili", ja: "ビリビリ動画", icon: "simple-icons:bilibili", color: "#00A1D6", url: (id) => `https://space.bilibili.com/${id}` },
  weibo: { label: "微博", en: "Weibo", ja: "Weibo", icon: "simple-icons:sinaweibo", color: "#E6162D", url: (id) => `https://weibo.com/${id}` },
  netease: { label: "网易云音乐", en: "NetEase Cloud Music", ja: "NetEase Cloud Music", icon: "simple-icons:neteasecloudmusic", color: "#D43C33", url: (id) => `https://music.163.com/#/user/home?id=${id}` },
  juejin: { label: "掘金", en: "Juejin", ja: "Juejin", icon: "simple-icons:juejin", color: "#007FFF", url: (id) => `https://juejin.cn/user/${id}` },
  zhihu: { label: "知乎", en: "Zhihu", ja: "Zhihu", icon: "simple-icons:zhihu", color: "#0084FF", url: (id) => `https://www.zhihu.com/people/${id}` },
  xiaohongshu: { label: "小红书", en: "Xiaohongshu (RED)", ja: "RED（小紅書）", icon: "simple-icons:xiaohongshu", color: "#FF2442", url: (id) => `https://www.xiaohongshu.com/user/profile/${id}` },
  // 抖音与 TikTok 是同一个音符标志
  douyin: { label: "抖音", en: "Douyin", ja: "Douyin", icon: "simple-icons:tiktok", color: "#000000", url: (id) => `https://www.douyin.com/user/${id}` },
  csdn: { label: "CSDN", icon: "simple-icons:csdn", color: "#FC5531", url: (id) => `https://blog.csdn.net/${id}` },
  leetcode: { label: "力扣", en: "LeetCode", ja: "LeetCode", icon: "simple-icons:leetcode", color: "#FFA116", url: (id) => `https://leetcode.cn/u/${id}` },
  gitee: { label: "Gitee", icon: "simple-icons:gitee", color: "#C71D23", url: (id) => `https://gitee.com/${id}` },
  v2ex: { label: "V2EX", icon: "simple-icons:v2ex", color: "#1F1F1F", url: (id) => `https://www.v2ex.com/member/${id}` },
  x: { label: "X", icon: "simple-icons:x", color: "#000000", url: (id) => `https://x.com/${id}` },
  telegram: { label: "Telegram", icon: "simple-icons:telegram", color: "#26A5E4", url: (id) => `https://t.me/${id}` },
  youtube: { label: "YouTube", icon: "simple-icons:youtube", color: "#FF0000", url: (id) => `https://www.youtube.com/@${id}` },
  instagram: { label: "Instagram", icon: "simple-icons:instagram", color: "#E4405F", url: (id) => `https://www.instagram.com/${id}` },
  linkedin: { label: "LinkedIn", icon: "simple-icons:linkedin", color: "#0A66C2", url: (id) => `https://www.linkedin.com/in/${id}` },
  // Steam 的个人资料有两种：自定义 ID（/id/xxx）和 17 位数字 ID（/profiles/7656…）
  steam: { label: "Steam", icon: "simple-icons:steam", color: "#000000", url: (id) => (/^\d{17}$/.test(id) ? `https://steamcommunity.com/profiles/${id}` : `https://steamcommunity.com/id/${id}`) },
  email: { label: "邮箱", en: "Email", ja: "メール", icon: "mingcute:mail-fill", color: "var(--primary)", url: (id) => `mailto:${id}` },
};
// 旧数据里可能用 twitter 作键名（Shiro 时代），按 X 处理
const aliases: Record<string, string> = { twitter: "x" };

// 没有网页主页、点了没地方跳的平台（“名片”）：值是 { id?, qr? }（号码、二维码图片地址）或只填号码的字符串。
// 首屏和导航“首页”面板里排在直达链接后面、竖线隔开，点图标弹出名片（二维码 + 号码 + 复制）。
// 二维码由后台上传到图床，Core 保存个人资料时登记为已引用（apps/core 的 owner-images.util.ts）。
// Discord 的主页链接只有登录了 Discord 的人能打开，大家互加用的是用户名，所以也当名片（2026-10-31 用户定）。
// donate 是赞赏码（微信赞赏码或支付宝收款码），卡片上的说明换成“请我喝杯茶”，品牌色用站点“喜欢”的心形色。
const cardPlatforms: Record<string, Omit<Platform, "url">> = {
  wechat: { label: "微信", en: "WeChat", ja: "WeChat", icon: "simple-icons:wechat", color: "#07C160" },
  qq: { label: "QQ", icon: "simple-icons:qq", color: "#1EBAFC" },
  discord: { label: "Discord", icon: "simple-icons:discord", color: "#5865F2" },
  donate: { label: "赞赏", en: "Tip", ja: "投げ銭", icon: "mingcute:teacup-fill", color: "var(--love)" },
};

export const socialPlatformKeys = [...Object.keys(platforms), ...Object.keys(cardPlatforms)];

export type SocialLink = { key: string; label: string; href: string; icon: string; color: string; dark: boolean };

// lang：名称用哪种语言（站点语言，见 blog-data 的 getOwner），默认中文
export function socialLinks(ids: unknown, lang: Locale = "zh"): SocialLink[] {
  if (!ids || typeof ids !== "object") return [];
  return Object.entries(ids as Record<string, unknown>).flatMap(([rawKey, value]) => {
    const key = aliases[rawKey.toLowerCase()] ?? rawKey.toLowerCase();
    const platform = platforms[key];
    const text = typeof value === "string" ? value.trim() : "";
    if (!platform || !text) return [];
    const base = { key, label: nameOf(platform, lang), icon: platform.icon, color: platform.color, dark: darkBrands.has(key) };
    // 贴的是完整链接：只放行 http(s)，原样使用
    if (/^https?:\/\//i.test(text)) return /^https?:\/\/[^\s]+$/i.test(text) ? [{ ...base, href: text }] : [];
    if (key === "email") return /^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/.test(text) ? [{ ...base, href: platform.url(text) }] : [];
    // 填的是 ID：去掉问号后面的跟踪参数（如 B 站的 spm）和开头的 @，不能含空白或斜杠
    const id = text.split("?")[0].replace(/^@/, "");
    return /^[^\s/#]+$/.test(id) ? [{ ...base, href: platform.url(encodeURIComponent(id)) }] : [];
  });
}

export type SocialCard = { key: string; label: string; icon: string; color: string; dark: boolean; id?: string; qr?: string };

export function socialCards(ids: unknown, lang: Locale = "zh"): SocialCard[] {
  if (!ids || typeof ids !== "object") return [];
  return Object.entries(ids as Record<string, unknown>).flatMap(([rawKey, value]) => {
    const key = rawKey.toLowerCase();
    const platform = cardPlatforms[key];
    if (!platform) return [];
    const record = typeof value === "string" ? { id: value } : value && typeof value === "object" ? (value as Record<string, unknown>) : {};
    const id = typeof record.id === "string" ? record.id.trim() || undefined : undefined;
    const qr = typeof record.qr === "string" && /^https?:\/\/[^\s]+$/i.test(record.qr.trim()) ? record.qr.trim() : undefined;
    return id || qr ? [{ key, label: nameOf(platform, lang), icon: platform.icon, color: platform.color, dark: false, id, qr }] : [];
  });
}
