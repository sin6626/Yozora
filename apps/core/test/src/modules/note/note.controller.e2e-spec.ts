import { APP_INTERCEPTOR } from '@nestjs/core'
import { Types } from 'mongoose'
import { createE2EApp } from 'test/helper/create-e2e-app'
import { authPassHeader } from 'test/mock/guard/auth.guard'
import { MockingCountingInterceptor } from 'test/mock/interceptors/counting.interceptor'
import { authProvider } from 'test/mock/modules/auth.mock'
import { commentProvider } from 'test/mock/modules/comment.mock'
import { configProvider } from 'test/mock/modules/config.mock'
import { gatewayProviders } from 'test/mock/modules/gateway.mock'
import { countingServiceProvider } from 'test/mock/processors/counting.mock'
import { eventEmitterProvider } from 'test/mock/processors/event.mock'
import { fileReferenceProvider } from 'test/mock/processors/file.mock'
import { vi } from 'vitest'

import { createRedisProvider } from '@/mock/modules/redis.mock'
import { apiRoutePrefix } from '~/common/decorators/api-controller.decorator'
import { AiSummaryService } from '~/modules/ai/ai-summary/ai-summary.service'
import { AiSlugBackfillService } from '~/modules/ai/ai-writer/ai-slug-backfill.service'
import { AiWriterService } from '~/modules/ai/ai-writer/ai-writer.service'
import { OptionModel } from '~/modules/configs/configs.model'
import { DraftModel } from '~/modules/draft/draft.model'
import { DraftService } from '~/modules/draft/draft.service'
import { DraftHistoryService } from '~/modules/draft/draft-history.service'
import { NoteController } from '~/modules/note/note.controller'
import { NoteModel } from '~/modules/note/note.model'
import { NoteService } from '~/modules/note/note.service'
import { SlugTrackerModel } from '~/modules/slug-tracker/slug-tracker.model'
import { SlugTrackerService } from '~/modules/slug-tracker/slug-tracker.service'
import { TopicModel } from '~/modules/topic/topic.model'
import { HttpService } from '~/processors/helper/helper.http.service'
import { ImageService } from '~/processors/helper/helper.image.service'
import { LexicalService } from '~/processors/helper/helper.lexical.service'
import { TranslationService } from '~/processors/helper/helper.translation.service'

import MockDbData from './note.e2e-mock.db'

describe('NoteController (e2e)', async () => {
  let model: MongooseModel<NoteModel>
  const translationServiceMock = {
    translateArticle: vi.fn(async (options) => ({
      ...options.originalData,
      title: options.targetLang
        ? `${options.originalData.title} [${options.targetLang}]`
        : options.originalData.title,
      text: options.targetLang
        ? `${options.originalData.text} [${options.targetLang}]`
        : options.originalData.text,
      isTranslated: Boolean(options.targetLang),
      ...(options.targetLang && {
        translationMeta: {
          sourceLang: 'zh',
          targetLang: options.targetLang,
          translatedAt: new Date('2026-03-14T00:00:00.000Z'),
        },
        availableTranslations: [options.targetLang],
      }),
    })),
    translateList: vi.fn(async ({ items, targetLang, applyResult }) =>
      items.map((item) =>
        applyResult(
          item,
          targetLang
            ? {
                isTranslated: true,
                title: `${item.title} [${targetLang}]`,
                translationMeta: {
                  sourceLang: 'zh',
                  targetLang,
                  translatedAt: new Date('2026-03-14T00:00:00.000Z'),
                },
              }
            : undefined,
        ),
      ),
    ),
    translateArticleList: vi.fn(async ({ articles, targetLang }) => {
      return new Map(
        articles.map((article) => [
          article.id,
          {
            ...article,
            title: targetLang
              ? `${article.title} [${targetLang}]`
              : article.title,
            text: targetLang ? `${article.text} [${targetLang}]` : article.text,
            isTranslated: Boolean(targetLang),
            ...(targetLang && {
              translationMeta: {
                sourceLang: 'zh',
                targetLang,
                translatedAt: new Date('2026-03-14T00:00:00.000Z'),
              },
            }),
          },
        ]),
      )
    }),
  }
  const proxy = createE2EApp({
    controllers: [NoteController],
    providers: [
      NoteService,
      ImageService,
      LexicalService,

      {
        provide: APP_INTERCEPTOR,
        useClass: MockingCountingInterceptor,
      },

      commentProvider,

      HttpService,
      configProvider,
      await createRedisProvider(),

      ...eventEmitterProvider,
      ...gatewayProviders,
      authProvider,

      countingServiceProvider,
      DraftHistoryService,
      DraftService,
      fileReferenceProvider,
      {
        provide: TranslationService,
        useValue: translationServiceMock,
      },
      SlugTrackerService,
      {
        provide: AiWriterService,
        useValue: {
          generateSlugByTitleViaOpenAI: vi
            .fn()
            .mockResolvedValue({ slug: 'generated-note-slug' }),
        },
      },
      {
        provide: AiSummaryService,
        useValue: {
          batchGetSummariesByRefIds: vi.fn().mockResolvedValue(new Map()),
        },
      },
      {
        provide: AiSlugBackfillService,
        useValue: {
          createBackfillTaskForNotes: vi
            .fn()
            .mockResolvedValue({ taskId: 'task-1', created: true }),
        },
      },
    ],
    imports: [],
    models: [NoteModel, OptionModel, DraftModel, SlugTrackerModel, TopicModel],
    async pourData(modelMap) {
      // @ts-ignore
      const { model: _model } = modelMap.get(NoteModel) as {
        model: MongooseModel<NoteModel>
      }
      model = _model
      for await (const data of MockDbData) {
        await _model.create(data)
      }
    },
  })

  afterAll(async () => {
    await model.deleteMany({})
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  test('GET /notes', async () => {
    const { app } = proxy
    const res = await app.inject({
      method: 'GET',
      url: `${apiRoutePrefix}/notes`,
    })
    const data = res.json()
    expect(res.statusCode).toBe(200)

    data.data.forEach((d) => {
      delete d.id
      delete d._id
    })
    expect(data).toMatchSnapshot()
  })

  test('GET /notes?lang=en translates list titles', async () => {
    const { app } = proxy
    const res = await app.inject({
      method: 'GET',
      url: `${apiRoutePrefix}/notes`,
      query: {
        lang: 'en',
      },
    })

    expect(res.statusCode).toBe(200)
    const data = res.json()

    expect(translationServiceMock.translateArticleList).toHaveBeenCalledOnce()
    expect(data.data[0]?.title).toContain('[en]')
  })

  const createdNoteData: Partial<NoteModel> = {
    title: 'Note 2',
    text: 'Content 2',
    slug: 'note-2',

    allowComment: true,
    // use cutsom date
    created: new Date('2023-01-17T11:01:57.851Z'),
  }

  test('POST /notes', async () => {
    const { app } = proxy
    const res = await app.inject({
      method: 'POST',
      url: `${apiRoutePrefix}/notes`,
      payload: createdNoteData,
      headers: {
        ...authPassHeader,
      },
    })

    const data = res.json()
    expect(res.statusCode).toBe(201)
    createdNoteData.id = data.id
    createdNoteData.nid = data.nid
    createdNoteData.slug = data.slug
    delete data.id
    expect(data).toMatchSnapshot()
  })

  test('GET /notes/:year/:month/:day/:slug', async () => {
    const { app } = proxy
    const res = await app.inject({
      method: 'GET',
      url: `${apiRoutePrefix}/notes/2023/1/17/note-2`,
    })

    expect(res.statusCode).toBe(200)
    const data = res.json()
    delete data.id
    delete data.data.id
    delete data.data.modified
    if (data.prev) {
      delete data.prev.id
    }
    if (data.next) {
      delete data.next.id
    }
    expect(data).toMatchSnapshot()
  })

  test('PATCH /notes/:id', async () => {
    const { app } = proxy
    const res = await app.inject({
      method: 'PATCH',
      url: `${apiRoutePrefix}/notes/${createdNoteData.id}`,
      payload: {
        title: 'Note 2 (updated)',
        text: `Content 2 (updated)`,
        slug: 'note-2-updated',
        mood: 'happy',
        weather: 'sunny',
      },
      headers: {
        ...authPassHeader,
      },
    })

    expect(res.statusCode).toBe(204)
    createdNoteData.slug = 'note-2-updated'
  })

  test('GET /notes/:year/:month/:day/:slug should resolve tracked old slug', async () => {
    const { app } = proxy
    const res = await app.inject({
      method: 'GET',
      url: `${apiRoutePrefix}/notes/2023/1/17/note-2`,
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().data.slug).toBe('note-2-updated')
  })

  test('GET /notes/:year/:month/:day/:slug should 404 when date mismatch', async () => {
    const { app } = proxy
    const res = await app.inject({
      method: 'GET',
      url: `${apiRoutePrefix}/notes/2023/1/16/note-2-updated`,
    })

    expect(res.statusCode).toBe(404)
  })

  test('Get patched note', async () => {
    const { app } = proxy
    const res = await app.inject({
      method: 'GET',
      url: `${apiRoutePrefix}/notes/${createdNoteData.id}`,
      headers: {
        ...authPassHeader,
      },
    })

    expect(res.statusCode).toBe(200)
    const data = res.json()
    delete data.id
    delete data.modified
    expect(data).toMatchSnapshot()
  })

  test('GET /list/:id', async () => {
    const { app } = proxy
    const res = await app.inject({
      method: 'GET',
      url: `${apiRoutePrefix}/notes/list/${createdNoteData.id}`,
    })

    expect(res.statusCode).toBe(200)
    const data = res.json()

    data.data.forEach((note) => {
      delete note.id
      delete note.modified
    })

    expect(data.data.some((note) => note.slug === createdNoteData.slug)).toBe(
      true,
    )
    expect(data).toMatchSnapshot()
  })

  test('GET /notes/nid/:nid', async () => {
    const { app } = proxy
    const res = await app.inject({
      method: 'GET',
      url: `${apiRoutePrefix}/notes/nid/${createdNoteData.nid}`,
    })

    expect(res.statusCode).toBe(200)
    const data = res.json()
    delete data.id
    delete data.data.id
    delete data.data.modified
    if (data.prev) {
      delete data.prev.id
    }
    if (data.next) {
      delete data.next.id
    }

    expect(data).toMatchSnapshot()
  })

  test('DEL /notes/:id', async () => {
    const { app } = proxy
    const res = await app.inject({
      method: 'DELETE',
      url: `${apiRoutePrefix}/notes/${createdNoteData.id}`,
      headers: {
        ...authPassHeader,
      },
    })

    expect(res.statusCode).toBe(204)
  })

  it('should got 404 when get deleted note', async () => {
    const { app } = proxy
    {
      const res = await app.inject({
        method: 'GET',
        url: `${apiRoutePrefix}/notes/${createdNoteData.id}`,
        headers: {
          ...authPassHeader,
        },
      })

      expect(res.statusCode).toBe(404)
    }
    {
      const res = await app.inject({
        method: 'GET',
        url: `${apiRoutePrefix}/notes/nid/${createdNoteData.nid}`,
        headers: {
          ...authPassHeader,
        },
      })

      expect(res.statusCode).toBe(404)
    }
  })

  test('GET /latest', async () => {
    const { app } = proxy
    const res = await app.inject({
      method: 'GET',
      url: `${apiRoutePrefix}/notes/latest`,
    })

    expect(res.statusCode).toBe(200)
    const data = res.json()
    delete data.data.id
    delete data.next.id
    expect(data).toMatchSnapshot()
  })

  let mockDataWithLocationNid = 0

  const createMockDataWithLocation = async () => {
    const note = await model.create({
      title: 'Note 3',
      text: 'Content 3',
      allowComment: true,
      coordinates: {
        latitude: 20,
        longitude: 20,
      },
      location: 'location',
    })
    mockDataWithLocationNid = note.nid
    return () => model.deleteOne({ _id: note._id })
  }

  test('GET /, should hide field when not login', async () => {
    const app = proxy.app

    await createMockDataWithLocation()
    const res = await app.inject({
      method: 'GET',
      url: `${apiRoutePrefix}/notes`,
    })

    const json = res.json()
    expect(json.data[0].coordinates).toBeUndefined()
    expect(json.data[0].location).toBeUndefined()
  })

  test('GET /, should show field when login', async () => {
    const app = proxy.app

    const res = await app.inject({
      method: 'GET',
      url: `${apiRoutePrefix}/notes`,
      query: {
        select: '+coordinates',
      },
      headers: {
        ...authPassHeader,
      },
    })

    const json = res.json()
    expect(json.data[0].coordinates).toBeDefined()
  })

  test('GET /nid/:nid, should hide field when not login', async () => {
    const app = proxy.app

    const res = await app.inject({
      method: 'GET',
      url: `${apiRoutePrefix}/notes/nid/${mockDataWithLocationNid}`,
    })

    const json = res.json()
    expect(json.data.coordinates).toBeUndefined()
    expect(json.data.location).toBeUndefined()
  })

  let mockDataWithPasswordNid = 0

  const createMockDataWithPassword = async () => {
    const note = await model.create({
      title: 'Note 4',
      text: 'Content 3',
      allowComment: true,
      slug: 'note-4',
      password: 'password',
      created: new Date('2021-03-22T00:00:00.000Z'),
    })
    mockDataWithPasswordNid = note.nid
    return () => model.deleteOne({ _id: note._id })
  }
  test('GET /nid/:nid, should ban if has password', async () => {
    const app = proxy.app

    await createMockDataWithPassword()
    const res = await app.inject({
      method: 'GET',
      url: `${apiRoutePrefix}/notes/nid/${mockDataWithPasswordNid}`,
    })

    expect(res.statusCode).toBe(403)
  })

  test('GET /:year/:month/:day/:slug, should ban if has password', async () => {
    const app = proxy.app

    const res = await app.inject({
      method: 'GET',
      url: `${apiRoutePrefix}/notes/2021/3/22/note-4`,
    })

    expect(res.statusCode).toBe(403)
  })

  test('GET /nid/:nid, should show if has password and pass', async () => {
    const app = proxy.app

    const res = await app.inject({
      method: 'GET',
      url: `${apiRoutePrefix}/notes/nid/${mockDataWithPasswordNid}`,
      query: {
        password: 'password',
      },
    })

    expect(res.statusCode).toBe(200)
  })

  test('GET /nid/:nid, should show if has login', async () => {
    const app = proxy.app

    const res = await app.inject({
      method: 'GET',
      url: `${apiRoutePrefix}/notes/nid/${mockDataWithPasswordNid}`,
      headers: {
        ...authPassHeader,
      },
    })

    expect(res.statusCode).toBe(200)
  })
  // 2026-11-12: a visitor could read a locked note in full (text, rich content, the plain password, location)
  // via GET /notes/:id, and see it in topic lists, neighbour lists and the "latest note" id.
  // Only GET /notes/nid/:nid with the right password may reveal a locked note to a visitor.
  describe('visitors never see locked or scheduled notes', () => {
    const topicId = new Types.ObjectId().toString()
    const coordinates = { latitude: 22.5, longitude: 113.9 }
    const lexical = JSON.stringify({ root: { children: [], type: 'root', version: 1 } })
    let open: any
    let locked: any
    let scheduled: any

    beforeAll(async () => {
      open = await model.create({ title: 'Open diary', text: 'open body', topicId, isPublished: true, location: 'Campus', coordinates, created: new Date('2030-01-01T00:00:00.000Z') })
      locked = await model.create({ title: 'Locked diary', text: 'locked body', contentFormat: 'lexical', content: lexical, password: 'pw12', topicId, isPublished: true, location: 'Dorm', coordinates, created: new Date('2030-01-02T00:00:00.000Z') })
      scheduled = await model.create({ title: 'Scheduled diary', text: 'future body', contentFormat: 'lexical', content: lexical, publicAt: new Date(Date.now() + 86_400_000), topicId, isPublished: true, created: new Date('2030-01-03T00:00:00.000Z') })
    })
    afterAll(async () => {
      await model.deleteMany({ _id: { $in: [open._id, locked._id, scheduled._id] } })
    })

    const get = (url: string, headers = {}) => proxy.app.inject({ method: 'GET', url: `${apiRoutePrefix}${url}`, headers })
    const leaks = (body: string) => ['locked body', 'pw12', 'Dorm', 'Locked diary', 'future body'].filter((s) => body.includes(s))

    test('GET /notes/:id refuses a locked note and never returns password or location', async () => {
      expect((await get(`/notes/${locked.id}`)).statusCode).toBe(403)
      expect((await get(`/notes/${scheduled.id}`)).statusCode).toBe(403)
      const res = await get(`/notes/${open.id}`)
      expect(res.statusCode).toBe(200)
      expect(res.json()).not.toHaveProperty('password')
      expect(res.json()).not.toHaveProperty('location')
      expect(res.json()).not.toHaveProperty('coordinates')
      const owner = await get(`/notes/${locked.id}`, authPassHeader)
      expect(owner.statusCode).toBe(200)
      expect(owner.json().location).toBe('Dorm')
    })

    test('GET /notes/topics/:id lists only notes a visitor may read', async () => {
      const res = await get(`/notes/topics/${topicId}?size=50`)
      expect(res.statusCode).toBe(200)
      expect(res.json().data.map((n) => n.title)).toEqual(['Open diary'])
      expect(leaks(res.body)).toEqual([])
    })

    test('GET /notes/list/:id skips locked neighbours and reveals nothing about a locked note', async () => {
      const around = await get(`/notes/list/${open.id}?size=10`)
      expect(leaks(around.body)).toEqual([])
      const self = await get(`/notes/list/${locked.id}?size=10`)
      expect(self.json()).toEqual({ data: [], size: 0 })
    })

    test('GET /notes/nid/:nid of a public note links past locked neighbours', async () => {
      const res = await get(`/notes/nid/${open.nid}`)
      expect(res.statusCode).toBe(200)
      expect(leaks(res.body)).toEqual([])
    })

    test('GET /notes/nid/:nid of a scheduled note hides the rich content as well as the text', async () => {
      const res = await get(`/notes/nid/${scheduled.nid}`)
      expect(res.statusCode).toBe(200)
      expect(res.json().data.text).toBe('')
      expect(res.json().data.content ?? '').toBe('')
    })

    test('the latest note id points at the newest note a visitor may read', async () => {
      const latest = await proxy.app.get(NoteService).getLatestNoteId()
      expect(latest.id).toBe(open.id)
    })
  })
})
