import { safeUrl } from "./safe-url";

// “思考”引用的东西（Core recently 的 type + metadata，字段见 apps/core/src/modules/recently/recently.schema.ts）。
// 后台填写或从外部抓来的，进页面前在这里整理一遍：地址只放行 http(s)，必填项缺了就不显示卡片，
// 数字只收合理范围，语言色只收 #十六进制（它会写进 style 里的 CSS 变量）。检查 scripts/verify-thinking.mjs。
export type ThinkingQuote =
  | { type: "book"; url: string; title: string; author: string; cover?: string; rating?: number }
  | { type: "media"; url: string; title: string; originalTitle?: string; cover?: string; rating?: number; description?: string; genre?: string }
  | { type: "music"; url: string; title: string; artist: string; album?: string; cover?: string; source?: string }
  | { type: "github"; url: string; owner: string; repo: string; description?: string; stars?: number; language?: string; languageColor?: string }
  | { type: "link"; url: string; title?: string; description?: string; image?: string }
  | { type: "academic"; url: string; title: string; authors: string[]; arxivId?: string }
  | { type: "code"; url: string; title: string; difficulty?: string; level?: 1 | 2 | 3; tags: string[]; platform?: string };

const text = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : undefined);
const texts = (value: unknown, max: number) => (Array.isArray(value) ? value.map(text).filter((item): item is string => Boolean(item)).slice(0, max) : []);
const rating = (value: unknown) => (typeof value === "number" && value >= 0 && value <= 10 ? value : undefined);
const levels: Record<string, 1 | 2 | 3> = { easy: 1, 简单: 1, medium: 2, 中等: 2, hard: 3, 困难: 3 };

export function parseQuote(type: unknown, metadata: unknown): ThinkingQuote | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const m = metadata as Record<string, unknown>;
  const url = safeUrl(text(m.url));
  if (!url) return null;
  const title = text(m.title);
  switch (type) {
    case "book": {
      const author = text(m.author);
      return title && author ? { type, url, title, author, cover: safeUrl(text(m.cover)), rating: rating(m.rating) } : null;
    }
    case "media":
      return title ? { type, url, title, originalTitle: text(m.originalTitle), cover: safeUrl(text(m.cover)), rating: rating(m.rating), description: text(m.description), genre: text(m.genre) } : null;
    case "music": {
      const artist = text(m.artist);
      return title && artist ? { type, url, title, artist, album: text(m.album), cover: safeUrl(text(m.cover)), source: text(m.source) } : null;
    }
    case "github": {
      const owner = text(m.owner);
      const repo = text(m.repo);
      const stars = typeof m.stars === "number" && Number.isSafeInteger(m.stars) && m.stars >= 0 ? m.stars : undefined;
      const color = text(m.languageColor);
      return owner && repo
        ? { type, url, owner, repo, description: text(m.description), stars, language: text(m.language), languageColor: color && /^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(color) ? color : undefined }
        : null;
    }
    case "link":
      return { type, url, title, description: text(m.description), image: safeUrl(text(m.image)) };
    case "academic":
      return title ? { type, url, title, authors: texts(m.authors, 6), arxivId: text(m.arxivId) } : null;
    case "code": {
      const difficulty = text(m.difficulty);
      return title ? { type, url, title, difficulty, level: difficulty ? levels[difficulty.toLowerCase()] : undefined, tags: texts(m.tags, 5), platform: text(m.platform) } : null;
    }
    default:
      return null;
  }
}
