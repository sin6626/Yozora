// 迁移旧手写译文（scripts/import-i18n-legacy.mjs）的纯逻辑，检查在 scripts/verify-legacy-i18n.mjs。
const LANGS = ['en', 'ja']
const at = (value, path) => path.reduce((current, key) => (current == null ? undefined : current[key]), value)
const text = (value) => (typeof value === 'string' && value.trim() ? value.trim() : undefined)

// 片段 theme/yozora 里的手写译文，按 Core 存站点文案的位置（hero.title、hero.description.0、seo.description……）配对。
// 同一句中文出现在两个位置时各是各的，不按中文合并
export function legacySiteTranslations(root, seoDescription) {
  const slots = [['hero.title', ['hero', 'title']], ['footer.motto', ['footer', 'motto']], ['copyright', ['copyright']], ['techStack.title', ['techStack', 'title']], ['techStack.description', ['techStack', 'description']]]
  const description = at(root, ['hero', 'description'])
  if (Array.isArray(description)) description.forEach((_, index) => slots.push([`hero.description.${index}`, ['hero', 'description', index]]))
  return Object.fromEntries(LANGS.map((lang) => {
    const i18n = at(root, ['i18n', lang]) ?? {}
    const pairs = slots.map(([slot, path]) => [slot, text(at(root, path)), text(at(i18n, path))])
    pairs.push(['seo.description', text(seoDescription), text(i18n.siteDescription)])
    return [lang, Object.fromEntries(pairs.filter(([, from, to]) => from && to).map(([slot, , to]) => [slot, to]))]
  }))
}

export function legacyProjectTranslations(root) {
  return Object.fromEntries(LANGS.map((lang) => [lang, at(root, ['i18n', lang, 'projects']) ?? {}]))
}

// entries：GET /ai/i18n/entries?withStale=1（Core 蛇形键）。手改过的条目（包括原文已经改过、前台不再显示的）一律不动；
// unmatched：片段里有、却找不到条目的手写译文，这时不能删片段里的 i18n
export function planImport(entries, { ui, site, projects }) {
  const writes = []
  let kept = 0
  let missing = 0
  const unmatched = new Set(LANGS.flatMap((lang) => [
    ...Object.keys(site[lang]).map((slot) => `${lang} site.text ${slot}`),
    ...Object.entries(projects[lang]).flatMap(([id, item]) => ['name', 'description'].filter((field) => text(item?.[field])).map((field) => `${lang} project.${field} ${id}`)),
  ]))
  for (const entry of entries) {
    const keyPath = entry.key_path ?? entry.keyPath
    const lookupKey = entry.lookup_key ?? entry.lookupKey
    for (const lang of LANGS) {
      const value = keyPath === 'ui.text' ? ui[lang]?.[lookupKey]
        : keyPath === 'site.text' ? site[lang][lookupKey]
        : keyPath === 'project.name' ? projects[lang][lookupKey]?.name
        : projects[lang][lookupKey]?.description
      if (!text(value)) {
        missing++
        continue
      }
      unmatched.delete(`${lang} ${keyPath} ${lookupKey}`)
      if (entry.translations?.[lang]?.manual) {
        kept++
        continue
      }
      writes.push({ keyPath, lookupKey, lang, text: value })
    }
  }
  return { writes, kept, missing, unmatched: [...unmatched] }
}

// 删片段里 i18n 的保存请求：Core 的保存接口没写的字段会用默认值（私密变回公开），所以带上最新读到的每个字段，
// 只换正文；baseRaw 是这次读到的正文，期间被改过就 409
export function snippetWithoutI18n(latest) {
  const { _id, id, created, updated, raw, ...fields } = latest
  const { i18n, ...rest } = JSON.parse(raw)
  return { ...fields, raw: JSON.stringify(rest, null, 2), baseRaw: raw }
}
