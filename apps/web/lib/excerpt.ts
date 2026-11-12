// 把 Markdown 正文压成一行纯文本：去掉代码块、图片、链接地址、标题/引用/列表符号和强调符号，不追求完整解析。
export function plainText(markdown: string | null | undefined) {
  return (markdown ?? "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/&#?\w+;/g, " ")
    // 引用符号只在行首去掉（可能嵌套），正文里提到的 <head>、a > b 保留
    .replace(/^\s{0,3}(?:(?:>\s*)+|(?:#{1,6}|[-*+]|\d+\.)\s+)/gm, "")
    // 删除线只去掉成对的 ~~，句尾单独的 ~~ 是语气，保留
    .replace(/~~(\S(?:.*?\S)?)~~/g, "$1")
    // 下划线（Haklex 的 ++文字++）同样只去掉成对的，C++、a++ 保留
    .replace(/\+\+(\S(?:.*?\S)?)\+\+/g, "$1")
    .replace(/[*_`|#]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// 正文开头的摘录：用于列表没有摘要时兜底、首页碎碎念预览
export function excerpt(markdown: string | null | undefined, length = 90) {
  const text = plainText(markdown);
  return text.length > length ? `${text.slice(0, length).trimEnd()}…` : text;
}

// 阅读时长（分钟）：中文、日文按字数（每分钟约 400 字），英文等按词数（每分钟约 230 词），至少 1 分钟。
// 外文页面的列表用的是译文，只按字符数算会把英文估成中文的 3 倍长
export function readingMinutes(markdown: string | null | undefined) {
  const text = plainText(markdown);
  const cjk = text.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu)?.length ?? 0;
  const words = text.match(/[\p{L}\p{N}]+/gu)?.filter((word) => !/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(word)).length ?? 0;
  return Math.max(1, Math.round(cjk / 400 + words / 230));
}
