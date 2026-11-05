import { dbHelper } from 'test/helper/db-mock.helper'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { BusinessEvents } from '~/constants/business-event.constant'
import { AiI18nService } from '~/modules/ai/ai-i18n/ai-i18n.service'
import { checkI18nTranslation } from '~/modules/ai/ai-i18n/ai-i18n.util'
import { I18nSourceModel } from '~/modules/ai/ai-i18n/i18n-source.model'
import {
  articleTranslationLanguages,
  configuredI18nLanguages,
  enabledI18nLanguages,
} from '~/modules/ai/ai-language.util'
import { AiTranslationEventHandlerService } from '~/modules/ai/ai-translation/ai-translation-event-handler.service'
import { TranslationEntryModel } from '~/modules/ai/ai-translation/translation-entry.model'
import { TranslationEntryService } from '~/modules/ai/ai-translation/translation-entry.service'
import { CategoryModel } from '~/modules/category/category.model'
import { NoteModel } from '~/modules/note/note.model'
import { ProjectModel } from '~/modules/project/project.model'
import { SnippetModel } from '~/modules/snippet/snippet.model'
import { TopicModel } from '~/modules/topic/topic.model'
import { WebhookService } from '~/modules/webhook/webhook.service'

type Fields = Record<string, string>

describe('AI i18n', () => {
  let entries: ReturnType<typeof dbHelper.getModel<typeof TranslationEntryModel>>
  let sources: ReturnType<typeof dbHelper.getModel<typeof I18nSourceModel>>
  let snippets: ReturnType<typeof dbHelper.getModel<typeof SnippetModel>>
  let projects: ReturnType<typeof dbHelper.getModel<typeof ProjectModel>>

  let config: Record<string, any>
  let translate: (language: string, fields: Fields) => Fields
  let hasProvider: boolean
  const calls: { language: string; keys: string[] }[] = []
  const log: string[] = []
  const events: { event: string; payload: unknown }[] = []

  const runtime = {
    generateStructured: vi.fn(async ({ prompt }: { prompt: string }) => {
      const language = /TARGET_LANGUAGE: (.+)/.exec(prompt)![1]
      const fields = JSON.parse(prompt.split('## Fields to translate\n')[1])
      calls.push({ language, keys: Object.keys(fields) })
      return { output: { translations: translate(language, fields) } }
    }),
  }
  const aiService = {
    getTranslationModel: async () => {
      if (!hasProvider) throw new Error('No AI provider configured')
      return runtime
    },
  }

  let service: AiI18nService
  const idle = () =>
    vi.waitFor(async () =>
      expect((await service.getStatus()).running).toBe(false),
    )
  const entry = (keyPath: string, lookupKey: string, lang: string) =>
    entries.findOne({ keyPath, lookupKey, lang }).lean()
  const translatedKeys = () => calls.flatMap((call) => call.keys).sort()

  beforeAll(() => {
    entries = dbHelper.getModel(TranslationEntryModel)
    sources = dbHelper.getModel(I18nSourceModel)
    snippets = dbHelper.getModel(SnippetModel)
    projects = dbHelper.getModel(ProjectModel)
  })

  beforeEach(async () => {
    await dbHelper.clear()
    config = {
      ai: { enableI18n: true, i18nLanguages: ['en', 'ja'] },
      seo: { description: '夜深里也有月亮和星星陪我作伴' },
    }
    translate = (language, fields) =>
      Object.fromEntries(
        Object.entries(fields).map(([key, text]) => [key, `[${language}] ${text}`]),
      )
    hasProvider = true
    calls.length = 0
    log.length = 0
    events.length = 0
    service = new AiI18nService(
      entries as any,
      sources as any,
      snippets as any,
      projects as any,
      { get: async (key: string) => config[key] } as any,
      aiService as any,
      {
        emit: async (event: string, payload: unknown) => {
          log.push(`emit ${event}`)
          events.push({ event, payload })
        },
      } as any,
      { cleanCatch: async () => void log.push('cleanCatch') } as any,
    )
  })

  describe('source upload', () => {
    it('reports added, changed and removed entries and keeps only the latest table', async () => {
      expect(
        await service.uploadSource({ 'a.x': '你好', 'a.y': '再见，{name}' }),
      ).toEqual({ added: ['a.x', 'a.y'], changed: [], removed: [] })
      await idle()
      expect(await entries.countDocuments({ keyPath: 'ui.text' })).toBe(4)

      events.length = 0
      expect(
        await service.uploadSource({ 'a.x': '你好呀', 'b.z': '新的' }),
      ).toEqual({ added: ['b.z'], changed: ['a.x'], removed: ['a.y'] })
      await idle()

      const table = await sources.find().sort({ key: 1 }).lean()
      expect(table.map(({ key, text }) => [key, text])).toEqual([
        ['a.x', '你好呀'],
        ['b.z', '新的'],
      ])
      expect(await entries.countDocuments({ lookupKey: 'a.y' })).toBe(0)
      expect((await entry('ui.text', 'a.x', 'en'))?.translatedText).toBe(
        '[English] 你好呀',
      )
      expect(events).toContainEqual({
        event: BusinessEvents.I18N_UPDATE,
        payload: { langs: ['en', 'ja'] },
      })
    })

    it('translates only the entries that are new or whose Chinese changed', async () => {
      await service.uploadSource({ keep: '不变', edit: '旧', drop: '删' })
      await idle()
      calls.length = 0

      await service.uploadSource({ keep: '不变', edit: '新', add: '加' })
      await idle()
      expect(translatedKeys()).toEqual([
        'ui.text:add',
        'ui.text:add',
        'ui.text:edit',
        'ui.text:edit',
      ])

      calls.length = 0
      await service.uploadSource({ keep: '不变', edit: '新', add: '加' })
      await idle()
      expect(calls).toEqual([])
    })

    it('does not generate while AI i18n is off', async () => {
      config.ai.enableI18n = false
      await service.uploadSource({ a: '甲' })
      expect((await service.getStatus()).running).toBe(false)
      expect(calls).toEqual([])
      expect(await sources.countDocuments()).toBe(1)
    })
  })

  describe('checks before saving', () => {
    it.each([
      ['你好，{name}', 'Hello', '占位符'],
      ['你好，{name}', 'Hello, {user}', '占位符'],
      ['你好', 'Hello {name}', '占位符'],
      ['一个**学生**', 'a student', '**'],
      ['一个**学生**', 'a **student', '**'],
      ['好', '   ', '空'],
    ])('rejects %s → %s', (source, text, reason) => {
      expect(checkI18nTranslation(source, text)).toContain(reason)
    })

    it('lets an empty source have an empty translation', () => {
      expect(checkI18nTranslation('', '')).toBeUndefined()
      expect(checkI18nTranslation('  ', '')).toBeUndefined()
    })

    it('uses the same placeholder rule as the blog', () => {
      // {user_name} is not a placeholder on either side, so it is plain text the AI may translate
      expect(checkI18nTranslation('你好，{user_name}', 'Hello, user')).toBeUndefined()
      expect(checkI18nTranslation('你好，{name2}', 'Hello')).toMatch(/占位符/)
    })

    it('accepts reordered placeholders and moved emphasis', () => {
      expect(checkI18nTranslation('{a}比{b}多', '{b} is less than {a}')).toBeUndefined()
      expect(checkI18nTranslation('一个**大三学生**', 'a **third-year student**')).toBeUndefined()
    })

    it('never stores an AI translation that fails the check', async () => {
      translate = (language, fields) => ({
        ...Object.fromEntries(Object.keys(fields).map((key) => [key, 'broken'])),
        'ui.text:ok': `[${language}] 好`,
      })
      await service.uploadSource({
        greet: '你好，{name}',
        bold: '一个**学生**',
        ok: '好',
      })
      await idle()

      expect(
        (await entries.find({ keyPath: 'ui.text' }).lean()).map((e) => e.lookupKey),
      ).toEqual(['ok', 'ok'])
      expect((await service.getStatus()).lastRun).toMatchObject({ created: 2, failed: 4 })
      expect((await service.getPublicTranslations('en')).messages).toEqual({
        ok: '[English] 好',
      })
    })

    it('rejects an invalid hand-written translation with 422', async () => {
      await service.uploadSource({ greet: '你好，{name}' })
      await idle()
      await expect(
        service.saveEntry({ keyPath: 'ui.text', lookupKey: 'greet', lang: 'en', text: 'Hi' }),
      ).rejects.toMatchObject({ status: 422 })
      expect((await entry('ui.text', 'greet', 'en'))?.translatedText).toBe(
        '[English] 你好，{name}',
      )
    })
  })

  it('keeps hand-written translations until the Chinese changes, then retranslates and flags them', async () => {
    await service.uploadSource({ k: '原文', other: '别的' })
    await idle()
    expect(
      await service.saveEntry({ keyPath: 'ui.text', lookupKey: 'k', lang: 'en', text: 'Hand written' }),
    ).toEqual({ text: 'Hand written', manual: true, needsReview: false })

    calls.length = 0
    await service.generateNow({})
    await idle()
    expect(translatedKeys()).not.toContain('ui.text:k')
    expect(await entry('ui.text', 'k', 'en')).toMatchObject({ translatedText: 'Hand written', manual: true })

    await service.uploadSource({ k: '新原文', other: '别的' })
    await idle()
    expect(await entry('ui.text', 'k', 'en')).toMatchObject({
      translatedText: '[English] 新原文',
      manual: false,
      needsReview: true,
    })
    expect(await entry('ui.text', 'k', 'ja')).toMatchObject({ manual: false, needsReview: false })

    await service.saveEntry({ keyPath: 'ui.text', lookupKey: 'k', lang: 'en', text: 'Looked at it' })
    expect(await entry('ui.text', 'k', 'en')).toMatchObject({ manual: true, needsReview: false })
  })

  it('counts done, missing and review per group and language', async () => {
    config.ai.enableI18n = false
    await service.uploadSource({ 'header.a': '甲', 'header.b': '乙{n}', 'home.c': '丙' })
    await snippets.create({
      reference: 'theme',
      name: 'yozora',
      raw: JSON.stringify({
        hero: { title: '一个**大三学生**', description: ['第一行', ' 第二行 '] },
        footer: { motto: '' },
        techStack: { rows: [] },
      }),
    })
    const project = await projects.create({ name: 'Yozora', description: '我的博客' })

    await service.saveEntry({ keyPath: 'ui.text', lookupKey: 'header.a', lang: 'en', text: 'A' })
    await service.saveEntry({ keyPath: 'ui.text', lookupKey: 'header.b', lang: 'en', text: 'B {n}' })
    await service.uploadSource({ 'header.a': '甲', 'header.b': '乙乙{n}', 'home.c': '丙' })
    await service.generateNow({ langs: ['en'], group: 'header' })
    await idle()

    expect(await service.getGroups()).toEqual([
      { group: 'header', total: 2, languages: { en: { done: 1, missing: 0, review: 1 }, ja: { done: 0, missing: 2, review: 0 } } },
      { group: 'home', total: 1, languages: { en: { done: 0, missing: 1, review: 0 }, ja: { done: 0, missing: 1, review: 0 } } },
      { group: 'site', total: 4, languages: { en: { done: 0, missing: 4, review: 0 }, ja: { done: 0, missing: 4, review: 0 } } },
      { group: 'works', total: 2, languages: { en: { done: 0, missing: 2, review: 0 }, ja: { done: 0, missing: 2, review: 0 } } },
    ])

    expect(await service.getEntries('header')).toEqual([
      {
        keyPath: 'ui.text',
        lookupKey: 'header.a',
        key: 'header.a',
        source: '甲',
        translations: { en: { text: 'A', manual: true, needsReview: false }, ja: null },
      },
      {
        keyPath: 'ui.text',
        lookupKey: 'header.b',
        key: 'header.b',
        source: '乙乙{n}',
        translations: {
          en: { text: '[English] 乙乙{n}', manual: false, needsReview: true },
          ja: null,
        },
      },
    ])
    // Site text is keyed by slot, so the admin page shows where each text lives
    expect((await service.getEntries('site')).map((row) => [row.key, row.source])).toEqual([
      ['hero.title', '一个**大三学生**'],
      ['hero.description.0', '第一行'],
      ['hero.description.1', '第二行'],
      ['seo.description', '夜深里也有月亮和星星陪我作伴'],
    ])
    expect((await service.getEntries('works')).map((row) => row.key)).toEqual([
      `作品名 ${project.id}`,
      `作品介绍 ${project.id}`,
    ])
  })

  describe('public endpoints', () => {
    it('serve only the enabled languages, without zh and right-to-left ones', async () => {
      config.ai = { enableI18n: false, i18nLanguages: ['en'] }
      expect(await service.getPublicConfig()).toEqual({ enabled: false, languages: [] })
      await expect(service.getPublicTranslations('en')).rejects.toMatchObject({ status: 404 })

      config.ai = { enableI18n: true, i18nLanguages: ['en', 'ar', 'zh', 'EN', 'ko-KR', 'he'] }
      expect(await service.getPublicConfig()).toEqual({ enabled: true, languages: ['en', 'ko'] })
      await expect(service.getPublicTranslations('ja')).rejects.toMatchObject({ status: 404 })
    })

    it('return fresh translations keyed by entry name, Chinese text and project id', async () => {
      await snippets.create({
        reference: 'theme',
        name: 'yozora',
        raw: JSON.stringify({ footer: { motto: '头顶的星空，是心里的星空。' } }),
      })
      const project = await projects.create({ name: '星图', description: '一言星图' })
      config.ai.enableI18n = false
      await service.uploadSource({ 'locale.switched': '已切换到{name}', stale: '旧' })
      await service.generateNow({})
      await idle()
      await service.uploadSource({ 'locale.switched': '已切换到{name}', stale: '改过了' })
      config.ai.enableI18n = true

      expect(await service.getPublicTranslations('ja')).toEqual({
        lang: 'ja',
        messages: { 'locale.switched': '[Japanese] 已切换到{name}' },
        site: {
          'footer.motto': { source: '头顶的星空，是心里的星空。', text: '[Japanese] 头顶的星空，是心里的星空。' },
          'seo.description': { source: '夜深里也有月亮和星星陪我作伴', text: '[Japanese] 夜深里也有月亮和星星陪我作伴' },
        },
        projects: {
          [project.id]: { name: '[Japanese] 星图', description: '[Japanese] 一言星图' },
        },
      })
    })
  })

  describe('site text', () => {
    const yozora = (raw: object) =>
      snippets.updateOne(
        { reference: 'theme', name: 'yozora' },
        { $set: { raw: JSON.stringify(raw) } },
        { upsert: true },
      )

    it('follows snippet theme/yozora, SEO and projects, dropping what is no longer used', async () => {
      await yozora({ hero: { title: '旧标题' } })
      await service.onSnippetChange({ reference: 'theme', name: 'yozora' })
      await idle()
      expect(await entries.countDocuments({ keyPath: 'site.text' })).toBe(4)

      await yozora({ hero: { title: '新标题' } })
      await service.onSnippetChange({ reference: 'theme', name: 'other' })
      expect((await service.getStatus()).running).toBe(false)
      await service.onSnippetChange({ reference: 'theme', name: 'yozora' })
      await idle()
      const site = await entries.find({ keyPath: 'site.text', lang: 'en' }).lean()
      expect(site.map((e) => e.sourceText).sort()).toEqual(['夜深里也有月亮和星星陪我作伴', '新标题'])

      config.seo.description = '新的描述'
      await service.onOptionUpdate({ key: 'seo' })
      await idle()
      expect((await service.getPublicTranslations('en')).site).toEqual({
        'hero.title': { source: '新标题', text: '[English] 新标题' },
        'seo.description': { source: '新的描述', text: '[English] 新的描述' },
      })

      const project = await projects.create({ name: '作品', description: '介绍' })
      await service.onProjectChange()
      await idle()
      expect(await entries.countDocuments({ lookupKey: project.id })).toBe(4)
      await projects.deleteOne({ _id: project._id })
      await service.onProjectDelete({ id: project.id })
      expect(await entries.countDocuments({ lookupKey: project.id })).toBe(0)
    })

    it('flags a hand-written site translation for review when its Chinese changes', async () => {
      await yozora({ footer: { motto: '头顶的星空' } })
      await service.onSnippetChange({ reference: 'theme', name: 'yozora' })
      await idle()
      await service.saveEntry({ keyPath: 'site.text', lookupKey: 'footer.motto', lang: 'en', text: 'Stars overhead' })

      await yozora({ footer: { motto: '头顶的星空，是心里的星空。' } })
      await service.onSnippetChange({ reference: 'theme', name: 'yozora' })
      await idle()
      expect(await entry('site.text', 'footer.motto', 'en')).toMatchObject({
        sourceText: '头顶的星空，是心里的星空。',
        translatedText: '[English] 头顶的星空，是心里的星空。',
        manual: false,
        needsReview: true,
      })
    })

    it('never exposes a private snippet, and keeps its translations', async () => {
      await yozora({ hero: { title: '私下的标题' } })
      await service.onSnippetChange({ reference: 'theme', name: 'yozora' })
      await idle()
      await snippets.updateOne({ name: 'yozora' }, { $set: { private: true } })
      await service.generateNow({})
      await idle()

      const { site } = await service.getPublicTranslations('en')
      expect(Object.keys(site)).toEqual(['seo.description'])
      expect((await service.getEntries('site')).map((row) => row.key)).toEqual(['seo.description'])
      expect(await entries.countDocuments({ keyPath: 'site.text', lookupKey: 'hero.title' })).toBe(2)
    })

    it('serves the same Chinese in two slots with each slot’s own translation', async () => {
      await yozora({ hero: { title: '你好' }, footer: { motto: '你好' } })
      await service.onSnippetChange({ reference: 'theme', name: 'yozora' })
      await idle()
      await service.saveEntry({ keyPath: 'site.text', lookupKey: 'hero.title', lang: 'en', text: 'Hello!' })
      await service.saveEntry({ keyPath: 'site.text', lookupKey: 'footer.motto', lang: 'en', text: 'Greetings.' })
      const { site } = await service.getPublicTranslations('en')
      expect([site['hero.title'], site['footer.motto']]).toEqual([
        { source: '你好', text: 'Hello!' },
        { source: '你好', text: 'Greetings.' },
      ])
    })

    it('keeps site translations when the snippet cannot be parsed', async () => {
      await yozora({ hero: { title: '标题' } })
      await service.onSnippetChange({ reference: 'theme', name: 'yozora' })
      await idle()
      await snippets.updateOne({ name: 'yozora' }, { $set: { raw: '{ broken' } })
      await service.generateNow({})
      await idle()
      expect(await entries.countDocuments({ keyPath: 'site.text', sourceText: '标题' })).toBe(2)
    })
  })

  it('translates everything into a newly added language and nothing else', async () => {
    await service.uploadSource({ a: '甲', b: '乙' })
    await idle()
    await service.generateNow({})
    await idle()
    calls.length = 0

    config.ai.i18nLanguages = ['en', 'ja', 'ko']
    await service.onOptionUpdate({ key: 'ai' })
    await idle()
    expect(calls.map((call) => call.language)).toEqual(['Korean'])
    expect(await entries.countDocuments({ lang: 'ko' })).toBe(3)
  })

  it('catches a language up when it is added back after a while', async () => {
    await service.uploadSource({ a: '甲' })
    await idle()
    config.ai.i18nLanguages = ['en']
    await service.onOptionUpdate({ key: 'ai' })
    await idle()
    // While Japanese was off: a new entry and a changed one
    await service.uploadSource({ a: '甲甲', b: '乙' })
    await idle()
    calls.length = 0

    config.ai.i18nLanguages = ['en', 'ja']
    await service.onOptionUpdate({ key: 'ai' })
    await idle()
    expect(calls.map((call) => call.language)).toEqual(['Japanese'])
    expect((await entry('ui.text', 'a', 'ja'))?.translatedText).toBe('[Japanese] 甲甲')
    expect((await entry('ui.text', 'b', 'ja'))?.translatedText).toBe('[Japanese] 乙')
  })

  it('stops serving outdated translations as soon as the Chinese changes, even without an AI provider', async () => {
    await service.uploadSource({ a: '甲' })
    await idle()
    const project = await projects.create({ name: '星图', description: '一言星图' })
    await service.onProjectChange()
    await idle()
    hasProvider = false
    events.length = 0

    await service.uploadSource({ a: '甲甲' })
    expect(events.map(({ event }) => event)).toEqual([BusinessEvents.I18N_UPDATE])
    expect((await service.getPublicTranslations('en')).messages).toEqual({})

    events.length = 0
    await projects.updateOne({ _id: project._id }, { $set: { name: '新星图' } })
    await service.onProjectChange()
    expect(events.map(({ event }) => event)).toEqual([BusinessEvents.I18N_UPDATE])
    expect((await service.getPublicTranslations('en')).projects).toEqual({
      [project.id]: { description: '[English] 一言星图' },
    })
  })

  it('lists outdated translations only on request, marked stale', async () => {
    await service.uploadSource({ a: '甲' })
    await idle()
    await service.saveEntry({ keyPath: 'ui.text', lookupKey: 'a', lang: 'en', text: 'A' })
    hasProvider = false
    await service.uploadSource({ a: '甲甲' })
    expect((await service.getEntries('a'))[0].translations.en).toBeNull()
    expect((await service.getEntries('a', true))[0].translations.en).toEqual({ text: 'A', manual: true, needsReview: false, stale: true })
  })

  it('saves with keepManual only while the entry has no hand-written translation', async () => {
    await service.uploadSource({ a: '甲', b: '乙', c: '丙' })
    await idle()
    await service.saveEntry({ keyPath: 'ui.text', lookupKey: 'a', lang: 'en', text: 'Owner A' })
    await entries.deleteOne({ keyPath: 'ui.text', lookupKey: 'c', lang: 'en' })

    await expect(
      service.saveEntry({ keyPath: 'ui.text', lookupKey: 'a', lang: 'en', text: 'Legacy A', keepManual: true }),
    ).rejects.toMatchObject({ status: 409 })
    expect((await entry('ui.text', 'a', 'en'))?.translatedText).toBe('Owner A')

    await service.saveEntry({ keyPath: 'ui.text', lookupKey: 'b', lang: 'en', text: 'Legacy B', keepManual: true })
    expect(await entry('ui.text', 'b', 'en')).toMatchObject({ translatedText: 'Legacy B', manual: true })
    await service.saveEntry({ keyPath: 'ui.text', lookupKey: 'c', lang: 'en', text: 'Legacy C', keepManual: true })
    expect(await entry('ui.text', 'c', 'en')).toMatchObject({ translatedText: 'Legacy C', manual: true })
  })

  it('keeps a translation the owner saves while the AI is still working on it', async () => {
    await service.uploadSource({ 'a.x': '你好' })
    await idle()
    await service.saveEntry({ keyPath: 'ui.text', lookupKey: 'a.x', lang: 'en', text: 'Hi' })
    await service.uploadSource({ 'a.x': '你好呀', 'a.y': '再见' })
    await idle()
    calls.length = 0

    // The AI answers only after the owner saved both entries by hand
    runtime.generateStructured.mockImplementationOnce(async ({ prompt }: { prompt: string }) => {
      const fields = JSON.parse(prompt.split('## Fields to translate\n')[1])
      await service.saveEntry({ keyPath: 'ui.text', lookupKey: 'a.x', lang: 'en', text: 'Hello there' })
      await entries.deleteOne({ keyPath: 'ui.text', lookupKey: 'a.y', lang: 'en' })
      await service.saveEntry({ keyPath: 'ui.text', lookupKey: 'a.y', lang: 'en', text: 'Bye' })
      return { output: { translations: translate('English', fields) } }
    })
    await sources.updateOne({ key: 'a.x' }, { $set: { text: '你好啊' } })
    await sources.updateOne({ key: 'a.y' }, { $set: { text: '再见啦' } })
    await service.generateNow({ langs: ['en'] })
    await idle()

    expect((await entry('ui.text', 'a.x', 'en'))?.translatedText).toBe('Hello there')
    expect((await entry('ui.text', 'a.y', 'en'))?.translatedText).toBe('Bye')
  })

  it('runs one generation at a time', async () => {
    await service.uploadSource({ a: '甲' })
    await idle()
    let release!: () => void
    const blocked = new Promise<void>((resolve) => (release = resolve))
    runtime.generateStructured.mockImplementationOnce(async () => {
      await blocked
      return { output: { translations: {} } }
    })

    await service.uploadSource({ a: '甲', b: '乙' })
    expect((await service.getStatus()).running).toBe(true)
    await expect(service.generateNow({})).rejects.toMatchObject({ status: 409 })
    release()
    await idle()
  })

  it('refuses a manual generation without an AI provider', async () => {
    hasProvider = false
    await expect(service.generateNow({})).rejects.toThrow('No AI provider')
    expect((await service.getStatus()).running).toBe(false)
  })

  describe('event', () => {
    it('is registered for webhooks and carries only the languages, after clearing the HTTP cache', async () => {
      expect(BusinessEvents.I18N_UPDATE).toBe('I18N_UPDATE')
      expect(WebhookService.prototype.transformEvents(['I18N_UPDATE', 'NOPE'])).toEqual(['I18N_UPDATE'])

      await service.uploadSource({ a: '甲' })
      await idle()
      expect(events).toEqual([{ event: 'I18N_UPDATE', payload: { langs: ['en', 'ja'] } }])
      expect(log).toEqual(['cleanCatch', 'emit I18N_UPDATE'])

      await service.saveEntry({ keyPath: 'ui.text', lookupKey: 'a', lang: 'ja', text: '甲' })
      expect(await service.deleteEntry({ keyPath: 'ui.text', lookupKey: 'a', lang: 'en' })).toEqual({ deleted: true })
      expect(events.slice(1).map((e) => e.payload)).toEqual([{ langs: ['ja'] }, { langs: ['en'] }])
    })
  })
})

describe('article translation languages', () => {
  const ai = {
    translationTargetLanguages: ['zh', 'en'],
    i18nLanguages: ['ja', 'EN', 'ko-KR', 'ar', 'zh-CN', 'ja'],
  }

  it('fills in target languages an article has no translation for yet when it is updated', async () => {
    const createTranslationTask = vi.fn()
    const handler = new AiTranslationEventHandlerService(
      {
        extractIdFromEvent: (event: { id: string }) => event.id,
        isArticleVisible: () => true,
        getMetaLang: () => 'zh',
        toArticleContent: () => ({}),
        computeContentHash: () => 'current',
        cancelActiveTranslationTasks: async () => {},
      } as any,
      {
        get: async () => ({
          enableTranslation: true,
          enableAutoGenerateTranslation: true,
          translationTargetLanguages: ['en'],
          enableI18n: true,
          i18nLanguages: ['en', 'ko'],
        }),
      } as any,
      { findGlobalById: async () => ({ document: {} }) } as any,
      { createTranslationTask } as any,
      { find: () => ({ select: async () => [{ hash: 'current', lang: 'en', sourceLang: 'zh' }] }) } as any,
      {} as any,
    )
    // English is up to date; Korean was added to the i18n languages after the article was first translated
    await handler.handleUpdateArticle({ id: 'post-id' } as any)
    expect(createTranslationTask).toHaveBeenCalledWith({ refId: 'post-id', targetLanguages: ['ko'] })
  })

  it('adds the i18n languages only while AI i18n is on', () => {
    expect(configuredI18nLanguages(ai)).toEqual(['ja', 'en', 'ko'])
    expect(enabledI18nLanguages(ai)).toEqual([])
    expect(articleTranslationLanguages(ai)).toEqual(['zh', 'en'])
    expect(articleTranslationLanguages({ ...ai, enableI18n: true })).toEqual(['zh', 'en', 'ja', 'ko'])
  })

  it('drives category translation entries too, and the glossary hides the i18n entries', async () => {
    const entries = dbHelper.getModel(TranslationEntryModel)
    const categories = dbHelper.getModel(CategoryModel)
    await dbHelper.clear()
    await categories.create({ name: '瞎扯淡', slug: 'talk' })
    const service = new TranslationEntryService(
      entries as any,
      categories as any,
      dbHelper.getModel(NoteModel) as any,
      dbHelper.getModel(TopicModel) as any,
      {
        getTranslationModel: async () => ({
          generateStructured: async ({ prompt }: { prompt: string }) => {
            const fields = JSON.parse(prompt.split('## Fields to translate\n')[1])
            return { output: { translations: Object.fromEntries(Object.keys(fields).map((k) => [k, 'Rambling'])) } }
          },
        }),
      } as any,
      { get: async () => ({ ...ai, translationTargetLanguages: ['en'], enableI18n: true }) } as any,
      { getClient: () => ({ pipeline: () => ({ exec: async () => [] }) }) } as any,
    )

    await service.generateTranslations({})
    expect((await entries.find().lean()).map((e) => e.lang).sort()).toEqual(['en', 'ja', 'ko'])

    await entries.create({ keyPath: 'ui.text', keyType: 'entity', lang: 'en', lookupKey: 'a', sourceText: '甲', translatedText: 'A' })
    const glossary = await service.findEntries({})
    expect(glossary.pagination.total).toBe(3)
    expect(glossary.data.every((e) => e.keyPath === 'category.name')).toBe(true)
  })
})
