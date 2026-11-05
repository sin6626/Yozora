import type { I18nKeyPath } from '../ai-translation/translation-entry.model'

const PLACEHOLDER = /\{([A-Z_]\w*)\}/gi

const placeholdersOf = (text: string) =>
  [...new Set(Array.from(text.matchAll(PLACEHOLDER), (match) => match[1]))]
    .sort()

const emphasisCount = (text: string) => text.split('**').length - 1

const listOf = (names: string[]) =>
  names.length ? names.map((name) => `{${name}}`).join(' ') : '（无）'

/** Why `text` can't be stored as a translation of `source`, or undefined when it can. The blog runs the same check. */
export function checkI18nTranslation(
  source: string,
  text: string,
): string | undefined {
  if (source.trim() && !text.trim()) return '译文是空的'

  const expected = placeholdersOf(source)
  const actual = placeholdersOf(text)
  if (expected.join() !== actual.join()) {
    return `占位符应为 ${listOf(expected)}，译文里是 ${listOf(actual)}`
  }

  const emphasis = emphasisCount(source)
  if (emphasis !== emphasisCount(text)) {
    return `** 应出现 ${emphasis} 次，译文里是 ${emphasisCount(text)} 次`
  }
}

/** `header.presence.label` → `header`; site text → `site`; project name and description → `works` (the UI group `projects` is the projects page's own text). */
export function i18nGroupOf(keyPath: I18nKeyPath, lookupKey: string): string {
  if (keyPath === 'ui.text') return lookupKey.split('.')[0]
  if (keyPath === 'site.text') return 'site'
  return 'works'
}
