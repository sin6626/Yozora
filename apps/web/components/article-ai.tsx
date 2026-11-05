import { Sparkles } from "lucide-react";
import { getArticleAi, getArticleTranslation, type TranslationLanguage } from "../lib/blog-data";
import { htmlLang, languageName, localizeHref, type Locale } from "../lib/i18n/config";
import { getSiteLocales } from "../lib/i18n/data";
import { getLocale, getT } from "../lib/i18n/server";

// 文章、手记详情的 AI 摘要与翻译，跟着站点语言走：/en 等外文页面读后台已生成的翻译，没有翻译时显示中文原文并说明。
// 语言版本只列站点开着的语言（关掉的语言的地址会跳回中文）
export async function loadArticleAi(id: string) {
  const locale = await getLocale();
  const lang = locale === "zh" ? null : locale;
  const [ai, translation, locales] = await Promise.all([
    getArticleAi(id, lang ?? "zh").catch(() => ({ summary: null, languages: [] as TranslationLanguage[] })),
    lang ? getArticleTranslation(id, lang).catch(() => null) : null,
    getSiteLocales(),
  ]);
  // original：外文页面却只能显示中文原文时，标题和正文标 lang="zh-CN"
  return { ...ai, languages: ai.languages.filter((item) => locales.includes(item)), locale, translation, original: lang && !translation ? "zh-CN" : undefined };
}

type Loaded = Awaited<ReturnType<typeof loadArticleAi>>;

// 这篇有哪些语言版本：中文原文 + 已生成的翻译，当前显示的那种高亮。换语言会换整站根布局，所以用普通链接整页跳转。
export async function ArticleLanguages({ href, ai }: { href: string; ai: Loaded }) {
  if (!ai.languages.length) return null;
  const t = (await getT()).article;
  const current: Locale = ai.translation ? ai.locale : "zh";
  return (
    <nav className="article-languages" aria-label={t.alsoIn}>
      {(["zh", ...ai.languages] as Locale[]).map((lang) => (
        <a key={lang} href={localizeHref(href, lang)} hrefLang={htmlLang(lang)} lang={htmlLang(lang)} aria-current={lang === current ? "page" : undefined}>{languageName(lang)}</a>
      ))}
    </nav>
  );
}

export async function ArticleAiNotes({ ai }: { ai: Loaded }) {
  const t = (await getT()).article;
  return (
    <>
      {ai.translation && <p className="ai-note" role="note">{ai.translation.aiModel ? t.aiTranslatedBy(ai.translation.aiModel) : t.aiTranslated}</p>}
      {ai.original && <p className="ai-note" role="note">{t.onlyChinese}</p>}
      {ai.summary && (
        <aside className="ai-summary" aria-label={t.aiSummary}>
          <p className="ai-summary-label"><Sparkles size={14} aria-hidden="true" />{t.aiSummary}</p>
          <p>{ai.summary}</p>
        </aside>
      )}
    </>
  );
}
