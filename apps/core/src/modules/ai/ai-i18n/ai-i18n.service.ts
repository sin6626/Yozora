import { Injectable, Logger } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'

import { BizException } from '~/common/exceptions/biz.exception'
import { BusinessEvents, EventScope } from '~/constants/business-event.constant'
import { ErrorCodeEnum } from '~/constants/error-code.constant'
import { ConfigsService } from '~/modules/configs/configs.service'
import { ProjectModel } from '~/modules/project/project.model'
import { SnippetModel } from '~/modules/snippet/snippet.model'
import { EventManagerService } from '~/processors/helper/helper.event.service'
import { RedisService } from '~/processors/redis/redis.service'
import { InjectModel } from '~/transformers/model.transformer'
import { normalizeLanguageCode } from '~/utils/lang.util'

import { AI_PROMPTS } from '../ai.prompts'
import { AiService } from '../ai.service'
import {
  configuredI18nLanguages,
  enabledI18nLanguages,
} from '../ai-language.util'
import {
  I18N_KEY_PATHS,
  type I18nKeyPath,
  TranslationEntryModel,
} from '../ai-translation/translation-entry.model'
import { checkI18nTranslation, i18nGroupOf } from './ai-i18n.util'
import { I18nSourceModel } from './i18n-source.model'

/** One piece of Chinese text the blog shows, and where its translations live. */
interface I18nSource {
  keyPath: I18nKeyPath
  lookupKey: string
  /** What the admin page shows: entry name, the site text itself, or "作品名 <id>" */
  key: string
  source: string
  group: string
}

export interface I18nRunOptions {
  langs?: string[]
  group?: string
  onlyMissing?: boolean
  keyPaths?: I18nKeyPath[]
  /** `${keyPath}:${lookupKey}` of the only sources to consider */
  only?: Set<string>
}

interface I18nRunResult {
  at: string
  created: number
  failed: number
  skipped: number
}

type EntryCell = {
  text: string
  manual: boolean
  needsReview: boolean
  /** Only with `withStale`: the Chinese changed after this translation, so the blog no longer shows it */
  stale?: boolean
}

const BATCH_SIZE = 60
const YOZORA_SNIPPET = { reference: 'theme', name: 'yozora' }
const SITE_KEY_PATHS: I18nKeyPath[] = [
  'site.text',
  'project.name',
  'project.description',
]

// Every i18n entry is keyed by a stable identity (entry name, site text slot, project id), so a changed
// Chinese text keeps its entry and a hand-written translation of it gets flagged for review
const KEY_TYPE = 'entity'
const idOf = (item: { keyPath: string; lookupKey: string }) =>
  `${item.keyPath}:${item.lookupKey}`

const textAt = (root: unknown, path: string[]): unknown =>
  path.reduce<unknown>(
    (value, key) =>
      value && typeof value === 'object'
        ? (value as Record<string, unknown>)[key]
        : undefined,
    root,
  )

/** The Chinese site copy in snippet theme/yozora that the blog shows translated, by slot (`hero.title`, `hero.description.0`…). */
function yozoraSiteTexts(root: unknown): [string, unknown][] {
  const description = textAt(root, ['hero', 'description'])
  return [
    ['hero.title', textAt(root, ['hero', 'title'])],
    ...(Array.isArray(description)
      ? description.map((line, index): [string, unknown] => [`hero.description.${index}`, line])
      : []),
    ['footer.motto', textAt(root, ['footer', 'motto'])],
    ['copyright', textAt(root, ['copyright'])],
    ['techStack.title', textAt(root, ['techStack', 'title'])],
    ['techStack.description', textAt(root, ['techStack', 'description'])],
  ]
}

@Injectable()
export class AiI18nService {
  private readonly logger = new Logger(AiI18nService.name)

  // ponytail: in-process lock and last-run record; a Redis lock if Core ever runs as several processes
  private running = false
  private rerunAll = false
  private lastRun?: I18nRunResult

  constructor(
    @InjectModel(TranslationEntryModel)
    private readonly entryModel: MongooseModel<TranslationEntryModel>,
    @InjectModel(I18nSourceModel)
    private readonly sourceModel: MongooseModel<I18nSourceModel>,
    @InjectModel(SnippetModel)
    private readonly snippetModel: MongooseModel<SnippetModel>,
    @InjectModel(ProjectModel)
    private readonly projectModel: MongooseModel<ProjectModel>,
    private readonly configService: ConfigsService,
    private readonly aiService: AiService,
    private readonly eventManager: EventManagerService,
    private readonly redisService: RedisService,
  ) {}

  async getPublicConfig() {
    const ai = await this.configService.get('ai')
    return { enabled: !!ai.enableI18n, languages: enabledI18nLanguages(ai) }
  }

  async getPublicTranslations(lang: string) {
    const code = normalizeLanguageCode(lang)
    const { languages } = await this.getPublicConfig()
    if (!code || !languages.includes(code)) {
      throw new BizException(
        ErrorCodeEnum.ResourceNotFound,
        `语言 ${lang} 没有开启`,
      )
    }

    const { sources } = await this.collectSources()
    const translated = await this.freshTranslations(sources, [code])

    const messages: Record<string, string> = {}
    const site: Record<string, string> = {}
    const projects: Record<string, { name?: string; description?: string }> =
      {}
    for (const item of sources) {
      const text = translated.get(`${idOf(item)}:${code}`)?.text
      if (text === undefined) continue
      if (item.keyPath === 'ui.text') messages[item.lookupKey] = text
      else if (item.keyPath === 'site.text') site[item.source] = text
      else {
        const field = item.keyPath === 'project.name' ? 'name' : 'description'
        projects[item.lookupKey] = {
          ...projects[item.lookupKey],
          [field]: text,
        }
      }
    }
    return { lang: code, messages, site, projects }
  }

  async uploadSource(messages: Record<string, string>) {
    const existing = new Map(
      (await this.sourceModel.find().lean()).map((doc) => [doc.key, doc.text]),
    )
    const added = Object.keys(messages).filter((key) => !existing.has(key))
    const changed = Object.keys(messages).filter(
      (key) => existing.has(key) && existing.get(key) !== messages[key],
    )
    const removed = [...existing.keys()].filter((key) => !(key in messages))

    const updated = new Date()
    if (added.length || changed.length) {
      await this.sourceModel.bulkWrite(
        [...added, ...changed].map((key) => ({
          updateOne: {
            filter: { key },
            update: { $set: { text: messages[key], updated } },
            upsert: true,
          },
        })),
      )
    }
    if (removed.length) {
      await this.sourceModel.deleteMany({ key: { $in: removed } })
      await this.deleteEntries({
        keyPath: 'ui.text',
        lookupKey: { $in: removed },
      })
    }

    // Translations of changed entries are no longer served (their Chinese moved on): refresh the public
    // bundle now, so the blog falls back to the new Chinese even if the AI never gets to retranslate
    if (changed.length) {
      await this.notify(configuredI18nLanguages(await this.configService.get('ai')))
    }

    const toTranslate = [...added, ...changed]
    if (toTranslate.length && (await this.canAutoGenerate())) {
      this.start(
        {
          keyPaths: ['ui.text'],
          only: new Set(toTranslate.map((key) => `ui.text:${key}`)),
        },
        true,
      )
    }

    return { added, changed, removed }
  }

  async getStatus() {
    const ai = await this.configService.get('ai')
    return {
      running: this.running,
      ...(this.lastRun && { lastRun: this.lastRun }),
      languages: configuredI18nLanguages(ai),
      enabled: !!ai.enableI18n,
    }
  }

  /** The admin's "生成翻译": fails fast without an AI provider instead of failing in the background. */
  async generateNow(options: I18nRunOptions) {
    await this.aiService.getTranslationModel()
    this.start(options)
    return { started: true }
  }

  /** Starts a generation in the background. Returns false when an automatic one had to queue behind a running one. */
  start(options: I18nRunOptions, auto = false): boolean {
    if (this.running) {
      if (!auto) throw new BizException(ErrorCodeEnum.I18nGenerating)
      this.rerunAll = true
      return false
    }
    this.running = true
    void this.runLoop(options)
    return true
  }

  async getGroups() {
    const languages = configuredI18nLanguages(await this.configService.get('ai'))
    const { sources } = await this.collectSources()
    const translated = await this.freshTranslations(sources, languages)

    const groups = new Map<
      string,
      {
        group: string
        total: number
        languages: Record<
          string,
          { done: number; missing: number; review: number }
        >
      }
    >()
    for (const item of sources) {
      let group = groups.get(item.group)
      if (!group) {
        group = {
          group: item.group,
          total: 0,
          languages: Object.fromEntries(
            languages.map((lang) => [lang, { done: 0, missing: 0, review: 0 }]),
          ),
        }
        groups.set(item.group, group)
      }
      group.total++
      for (const lang of languages) {
        const cell = translated.get(`${idOf(item)}:${lang}`)
        const stats = group.languages[lang]
        if (!cell) stats.missing++
        else if (cell.needsReview) stats.review++
        else stats.done++
      }
    }
    return [...groups.values()]
  }

  /** `withStale`: also return translations whose Chinese changed since (marked stale), for tools that must not overwrite hand-written ones */
  async getEntries(group?: string, withStale = false) {
    const languages = configuredI18nLanguages(await this.configService.get('ai'))
    const { sources } = await this.collectSources()
    const items = group ? sources.filter((item) => item.group === group) : sources
    const translated = await this.freshTranslations(items, languages, withStale)

    return items.map((item) => ({
      keyPath: item.keyPath,
      lookupKey: item.lookupKey,
      key: item.key,
      source: item.source,
      translations: Object.fromEntries(
        languages.map((lang) => [
          lang,
          translated.get(`${idOf(item)}:${lang}`) ?? null,
        ]),
      ),
    }))
  }

  async saveEntry(input: {
    keyPath: I18nKeyPath
    lookupKey: string
    lang: string
    text: string
  }): Promise<EntryCell> {
    const lang = this.parseLang(input.lang)
    const { sources } = await this.collectSources()
    const item = sources.find(
      (source) =>
        source.keyPath === input.keyPath && source.lookupKey === input.lookupKey,
    )
    if (!item) throw new BizException(ErrorCodeEnum.EntryNotFound)

    const reason = checkI18nTranslation(item.source, input.text)
    if (reason) {
      throw new BizException(ErrorCodeEnum.I18nTranslationInvalid, reason)
    }

    await this.entryModel.updateOne(
      {
        keyPath: item.keyPath,
        lang,
        keyType: KEY_TYPE,
        lookupKey: item.lookupKey,
      },
      {
        $set: {
          sourceText: item.source,
          translatedText: input.text,
          manual: true,
          needsReview: false,
        },
      },
      { upsert: true },
    )
    await this.notify([lang])
    return { text: input.text, manual: true, needsReview: false }
  }

  async deleteEntry(input: {
    keyPath: I18nKeyPath
    lookupKey: string
    lang: string
  }) {
    const lang = this.parseLang(input.lang)
    const { deletedCount } = await this.entryModel.deleteOne({
      keyPath: input.keyPath,
      lookupKey: input.lookupKey,
      lang,
    })
    if (deletedCount) await this.notify([lang])
    return { deleted: deletedCount > 0 }
  }

  @OnEvent(BusinessEvents.SNIPPET_CREATE)
  @OnEvent(BusinessEvents.SNIPPET_UPDATE)
  async onSnippetChange(payload: { reference?: string; name?: string }) {
    if (
      payload?.reference === YOZORA_SNIPPET.reference &&
      payload.name === YOZORA_SNIPPET.name
    ) {
      await this.syncSiteText()
    }
  }

  @OnEvent(BusinessEvents.PROJECT_CREATE)
  @OnEvent(BusinessEvents.PROJECT_UPDATE)
  async onProjectChange() {
    await this.syncSiteText()
  }

  @OnEvent(BusinessEvents.PROJECT_DELETE)
  async onProjectDelete(payload: { id?: string }) {
    if (!payload?.id) return
    await this.deleteEntries({
      keyPath: { $in: ['project.name', 'project.description'] },
      lookupKey: payload.id,
    })
  }

  @OnEvent(BusinessEvents.OPTION_UPDATE)
  async onOptionUpdate(payload: { key?: string }) {
    if (payload?.key === 'seo') return this.syncSiteText()
    // AI settings saved (a language added, or added back after a while, or i18n switched on): catch every
    // enabled language up. Only missing and outdated entries go to the AI, so an up-to-date one costs nothing
    if (payload?.key === 'ai' && (await this.canAutoGenerate())) this.start({}, true)
  }

  private async syncSiteText() {
    // Project translations are served by id: an outdated one must leave the public bundle right away,
    // not only once the AI has retranslated it
    await this.notify(configuredI18nLanguages(await this.configService.get('ai')))
    if (await this.canAutoGenerate()) {
      this.start({ keyPaths: SITE_KEY_PATHS }, true)
    }
  }

  private async canAutoGenerate() {
    const ai = await this.configService.get('ai')
    if (!enabledI18nLanguages(ai).length) return false
    try {
      await this.aiService.getTranslationModel()
      return true
    } catch {
      return false
    }
  }

  private parseLang(input: string) {
    const lang = normalizeLanguageCode(input)
    if (!lang || lang === 'zh') {
      throw new BizException(ErrorCodeEnum.InvalidParameter, `lang ${input}`)
    }
    return lang
  }

  private async runLoop(first: I18nRunOptions) {
    let options: I18nRunOptions | undefined = first
    try {
      while (options) {
        this.rerunAll = false
        try {
          this.lastRun = await this.generate(options)
        } catch (error) {
          this.logger.error(`i18n generation failed: ${(error as Error).message}`)
          this.lastRun = {
            at: new Date().toISOString(),
            created: 0,
            failed: 0,
            skipped: 0,
          }
        }
        // Automatic triggers that arrived meanwhile: one full pass covers them all
        options = this.rerunAll ? {} : undefined
      }
    } finally {
      this.running = false
    }
  }

  private async generate(options: I18nRunOptions): Promise<I18nRunResult> {
    const configured = configuredI18nLanguages(await this.configService.get('ai'))
    const langs = options.langs?.length
      ? configured.filter((lang) =>
          options.langs!.some((input) => normalizeLanguageCode(input) === lang),
        )
      : configured

    const { sources, siteKnown } = await this.collectSources()
    const touched = new Set(await this.removeUnused(sources, siteKnown))
    try {
      return await this.translate(sources, langs, options, touched)
    } finally {
      await this.notify(touched)
    }
  }

  private async translate(
    sources: I18nSource[],
    langs: string[],
    options: I18nRunOptions,
    touched: Set<string>,
  ): Promise<I18nRunResult> {
    const pool = sources
      .filter(
        (item) =>
          (!options.group || item.group === options.group) &&
          (!options.keyPaths || options.keyPaths.includes(item.keyPath)) &&
          (!options.only || options.only.has(idOf(item))),
      )
      .sort((a, b) => (idOf(a) < idOf(b) ? -1 : 1))

    let created = 0
    let failed = 0
    let skipped = 0

    for (const lang of langs) {
      const existing = new Map(
        (
          await this.entryModel
            .find({ lang, keyPath: { $in: I18N_KEY_PATHS } })
            .select('keyPath lookupKey sourceText translatedText manual needsReview')
            .lean()
        ).map((entry) => [idOf(entry), entry]),
      )

      const todo = pool.filter((item) => {
        const entry = existing.get(idOf(item))
        if (!entry) return true
        return !options.onlyMissing && entry.sourceText !== item.source
      })
      skipped += pool.length - todo.length
      if (!todo.length) continue

      const runtime = await this.aiService.getTranslationModel()
      for (let start = 0; start < todo.length; start += BATCH_SIZE) {
        const batch = todo.slice(start, start + BATCH_SIZE)
        const prompt = AI_PROMPTS.uiTranslation(
          lang,
          Object.fromEntries(batch.map((item) => [idOf(item), item.source])),
        )

        let translations: Record<string, string>
        try {
          const result = await runtime.generateStructured({
            prompt: prompt.prompt,
            systemPrompt: prompt.systemPrompt,
            schema: prompt.schema,
            reasoningEffort: prompt.reasoningEffort,
          })
          translations = result.output.translations
        } catch (error) {
          this.logger.error(
            `i18n batch failed for lang=${lang}: ${(error as Error).message}`,
          )
          failed += batch.length
          continue
        }

        for (const item of batch) {
          const text = translations[idOf(item)]
          if (typeof text !== 'string' || checkI18nTranslation(item.source, text)) {
            failed++
            continue
          }
          const previous = existing.get(idOf(item))
          const key = {
            keyPath: item.keyPath,
            lang,
            keyType: KEY_TYPE,
            lookupKey: item.lookupKey,
          }
          const fields = {
            sourceText: item.source,
            translatedText: text,
            manual: false,
            // The owner's own wording was replaced because the Chinese changed: let them check the new one
            needsReview: !!(previous?.manual || previous?.needsReview),
          }
          // Only replace what this run read before asking the AI: a translation the owner saved meanwhile wins
          const written = previous
            ? (
                await this.entryModel.updateOne(
                  {
                    ...key,
                    sourceText: previous.sourceText,
                    translatedText: previous.translatedText,
                    manual: previous.manual ? true : { $ne: true },
                  },
                  { $set: fields },
                )
              ).matchedCount
            : (
                await this.entryModel.updateOne(
                  key,
                  { $setOnInsert: fields },
                  { upsert: true },
                )
              ).upsertedCount
          if (!written) {
            skipped++
            continue
          }
          created++
          touched.add(lang)
        }
      }
    }

    return { at: new Date().toISOString(), created, failed, skipped }
  }

  /** Drops site text and project translations nothing uses any more; returns the languages it touched. */
  private async removeUnused(sources: I18nSource[], siteKnown: boolean) {
    const filters: Record<string, unknown>[] = []
    for (const keyPath of SITE_KEY_PATHS) {
      if (keyPath === 'site.text' && !siteKnown) continue
      filters.push({
        keyPath,
        lookupKey: {
          $nin: sources
            .filter((item) => item.keyPath === keyPath)
            .map((item) => item.lookupKey),
        },
      })
    }
    return this.deleteEntries({ $or: filters }, false)
  }

  private async deleteEntries(filter: Record<string, unknown>, notify = true) {
    const doomed = await this.entryModel.find(filter).select('lang').lean()
    if (!doomed.length) return []
    await this.entryModel.deleteMany(filter)
    const langs = [...new Set(doomed.map((entry) => entry.lang))]
    if (notify) await this.notify(langs)
    return langs
  }

  private async notify(langs: Iterable<string>) {
    const list = [...new Set(langs)]
    if (!list.length) return
    // Public i18n endpoints go through Core's HTTP cache; clear it before the blog refetches
    await this.redisService.cleanCatch()
    await this.eventManager.emit(
      BusinessEvents.I18N_UPDATE,
      { langs: list },
      { scope: EventScope.TO_SYSTEM },
    )
  }

  /** Translations whose stored source still matches today's Chinese, keyed `${keyPath}:${lookupKey}:${lang}`. */
  private async freshTranslations(
    sources: I18nSource[],
    langs: string[],
    withStale = false,
  ) {
    const current = new Map(sources.map((item) => [idOf(item), item.source]))
    const entries = await this.entryModel
      .find({ keyPath: { $in: I18N_KEY_PATHS }, lang: { $in: langs } })
      .select('keyPath lookupKey lang sourceText translatedText manual needsReview')
      .lean()

    const cells = new Map<string, EntryCell>()
    for (const entry of entries) {
      const stale = current.get(idOf(entry)) !== entry.sourceText
      if (stale && (!withStale || !current.has(idOf(entry)))) continue
      cells.set(`${idOf(entry)}:${entry.lang}`, {
        text: entry.translatedText,
        manual: !!entry.manual,
        needsReview: !!entry.needsReview,
        ...(stale && { stale: true }),
      })
    }
    return cells
  }

  /** Every Chinese text the blog wants translated; `siteKnown` is false when snippet theme/yozora can't be parsed. */
  private async collectSources(): Promise<{
    sources: I18nSource[]
    siteKnown: boolean
  }> {
    const [uiSources, snippet, seo, projects] = await Promise.all([
      this.sourceModel.find().sort({ key: 1 }).lean(),
      this.snippetModel.findOne(YOZORA_SNIPPET).select('raw private').lean(),
      this.configService.get('seo'),
      this.projectModel.find().select('name description').lean(),
    ])

    const sources: I18nSource[] = uiSources
      .filter((doc) => doc.text.trim())
      .map((doc) => ({
        keyPath: 'ui.text',
        lookupKey: doc.key,
        key: doc.key,
        source: doc.text,
        group: i18nGroupOf('ui.text', doc.key),
      }))

    // A private snippet is not public: its text must not reach the public i18n endpoint. Its translations
    // are kept (siteKnown false), like when it can't be parsed, so making it public again needs no retranslation
    let siteKnown = true
    let siteTexts: [string, unknown][] = []
    if (snippet?.private) siteKnown = false
    else if (snippet) {
      try {
        siteTexts = yozoraSiteTexts(JSON.parse(snippet.raw))
      } catch {
        siteKnown = false
      }
    }
    for (const [slot, value] of [
      ...siteTexts,
      ['seo.description', seo?.description] as [string, unknown],
    ]) {
      if (typeof value !== 'string' || !value.trim()) continue
      const text = value.trim()
      sources.push({
        keyPath: 'site.text',
        lookupKey: slot,
        key: slot,
        source: text,
        group: i18nGroupOf('site.text', slot),
      })
    }

    for (const project of projects) {
      const id = String(project._id)
      for (const [keyPath, label, value] of [
        ['project.name', '作品名', project.name],
        ['project.description', '作品介绍', project.description],
      ] as const) {
        if (!value?.trim()) continue
        sources.push({
          keyPath,
          lookupKey: id,
          key: `${label} ${id}`,
          source: value,
          group: i18nGroupOf(keyPath, id),
        })
      }
    }

    return { sources, siteKnown }
  }
}
