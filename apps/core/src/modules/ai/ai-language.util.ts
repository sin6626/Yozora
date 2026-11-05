import { normalizeLanguageCode } from '~/utils/lang.util'

import { DEFAULT_SUMMARY_LANG, LANGUAGE_CODE_TO_NAME } from './ai.constants'

/**
 * 从 Accept-Language header 或语言代码中提取主语言代码
 * 例如: "en-US,en;q=0.9" -> "en", "zh-CN" -> "zh"
 */
export function parseLanguageCode(lang?: string): string {
  if (!lang) return DEFAULT_SUMMARY_LANG
  return lang.split('-')[0].split(',')[0].toLowerCase()
}

/**
 * 获取语言的完整名称
 * 例如: "en" -> "English", "zh" -> "Chinese"
 */
export function getLanguageName(langCode: string): string {
  return LANGUAGE_CODE_TO_NAME[langCode] || langCode
}

export function resolveTargetLanguages(
  explicit?: string[],
  configured?: string[],
): string[] {
  return explicit?.length ? explicit : (configured ?? [])
}

// Right-to-left scripts need the whole layout mirrored, which the blog doesn't do yet
const UNSUPPORTED_I18N_LANGUAGES = new Set(['zh', 'ar', 'he', 'fa', 'ur'])

type I18nLanguageConfig = {
  enableI18n?: boolean
  i18nLanguages?: string[]
  translationTargetLanguages?: string[]
}

/** The configured "i18n 语言", normalized, without zh and right-to-left languages, deduped in order. */
export function configuredI18nLanguages(ai: I18nLanguageConfig): string[] {
  const langs = (ai.i18nLanguages ?? []).map((lang) =>
    normalizeLanguageCode(lang),
  )
  return [
    ...new Set(
      langs.filter(
        (lang): lang is string =>
          !!lang && !UNSUPPORTED_I18N_LANGUAGES.has(lang),
      ),
    ),
  ]
}

/** Languages the blog offers besides Chinese: empty while AI i18n is off. */
export function enabledI18nLanguages(ai: I18nLanguageConfig): string[] {
  return ai.enableI18n ? configuredI18nLanguages(ai) : []
}

/** Target languages for article and translation-entry auto translation: "翻译目标语言" ∪ enabled i18n languages. */
export function articleTranslationLanguages(ai: I18nLanguageConfig): string[] {
  const base = ai.translationTargetLanguages ?? []
  const seen = new Set(base.map((lang) => normalizeLanguageCode(lang) ?? lang))
  return [...base, ...enabledI18nLanguages(ai).filter((lang) => !seen.has(lang))]
}
