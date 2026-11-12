import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import type { ReturnModelType } from '@typegoose/typegoose'
import { createE2EApp } from 'test/helper/create-e2e-app'
import { authPassHeader } from 'test/mock/guard/auth.guard'

import { redisHelper } from '@/helper/redis-mock.helper'
import { apiRoutePrefix } from '~/common/decorators/api-controller.decorator'
import { BusinessEvents } from '~/constants/business-event.constant'
import { CollectionRefTypes } from '~/constants/db.constant'
import { DB_CONNECTION_TOKEN } from '~/constants/system.constant'
import { CategoryModel } from '~/modules/category/category.model'
import { CommentService } from '~/modules/comment/comment.service'
import { ConfigsService } from '~/modules/configs/configs.service'
import { NoteModel } from '~/modules/note/note.model'
import { PageModel } from '~/modules/page/page.model'
import { PostModel } from '~/modules/post/post.model'
import { RecentlyController } from '~/modules/recently/recently.controller'
import { RecentlyModel } from '~/modules/recently/recently.model'
import { RecentlyService } from '~/modules/recently/recently.service'
import { TopicModel } from '~/modules/topic/topic.model'
import { DatabaseService } from '~/processors/database/database.service'
import { EventManagerService } from '~/processors/helper/helper.event.service'
import { RedisService } from '~/processors/redis/redis.service'
import { scheduleManager } from '~/utils/schedule.util'
import { vi } from 'vitest'

// 思考（recently）的站内引用：访客只能看到公开内容的标题、链接需要的字段；草稿、加密和定时公开的手记一律不填；
// 推给访客的实时消息同样处理。站长（登录后）能看到未公开内容的标题，方便编辑。引用的 id 用 `ref` 字段保存，编辑时可以改和清除。
describe('recently references', async () => {
  let app: NestFastifyApplication
  let recently: ReturnModelType<typeof RecentlyModel>
  const ids: Record<string, string> = {}
  const emitted: { event: string; payload: unknown }[] = []

  const proxy = createE2EApp({
    controllers: [RecentlyController],
    providers: [
      RecentlyService,
      DatabaseService,
      { provide: DB_CONNECTION_TOKEN, useValue: {} },
      { provide: RedisService, useValue: (await redisHelper).RedisService },
      {
        provide: EventManagerService,
        useValue: {
          async emit(event: string, payload: unknown) {
            emitted.push({ event, payload: JSON.parse(JSON.stringify(payload)) })
          },
        },
      },
      { provide: ConfigsService, useValue: { get: () => ({ commentShouldAudit: false }) } },
      {
        provide: CommentService,
        useValue: { model: { countDocuments: () => 0, deleteMany: () => ({ deletedCount: 0 }) } },
      },
    ],
    models: [RecentlyModel, PostModel, NoteModel, PageModel, CategoryModel, TopicModel],
    async pourData(modelMap) {
      recently = modelMap.get(RecentlyModel)!.model as ReturnModelType<typeof RecentlyModel>
      const post = modelMap.get(PostModel)!.model as ReturnModelType<typeof PostModel>
      const note = modelMap.get(NoteModel)!.model as ReturnModelType<typeof NoteModel>
      const page = modelMap.get(PageModel)!.model as ReturnModelType<typeof PageModel>
      const category = await (modelMap.get(CategoryModel)!.model as ReturnModelType<typeof CategoryModel>).create({ name: '学习', slug: 'study' })
      const future = new Date(Date.now() + 86_400_000)
      const docs = {
        publicPost: await post.create({ title: '公开文章', slug: 'public', text: 'POST_BODY', summary: 'POST_SUMMARY', categoryId: category._id, isPublished: true }),
        draftPost: await post.create({ title: '草稿文章', slug: 'draft', text: 'DRAFT_BODY', categoryId: category._id, isPublished: false }),
        openNote: await note.create({ title: '公开手记', nid: 1, text: 'NOTE_BODY', location: 'NOTE_LOCATION', coordinates: { latitude: 1, longitude: 2 }, isPublished: true }),
        lockedNote: await note.create({ title: '加密手记', nid: 2, text: 'LOCKED_BODY', password: 'LOCKED_PASSWORD', isPublished: true }),
        futureNote: await note.create({ title: '定时手记', nid: 3, text: 'FUTURE_BODY', publicAt: future, isPublished: true }),
        about: await page.create({ title: '关于', slug: 'about', text: 'PAGE_BODY' }),
      }
      for (const [key, doc] of Object.entries(docs)) ids[key] = doc._id.toHexString()
    },
  })

  beforeEach(async () => {
    app = proxy.app
    emitted.length = 0
    await recently.deleteMany({})
    // 测试全局把 scheduleManager 换成了空函数，这里让实时推送照常执行
    vi.spyOn(scheduleManager, 'schedule').mockImplementation((callback: () => void) => { callback() })
  })

  const hidden = ['草稿文章', '加密手记', '定时手记', 'DRAFT_BODY', 'LOCKED_BODY', 'LOCKED_PASSWORD', 'FUTURE_BODY']
  const bodies = ['POST_BODY', 'POST_SUMMARY', 'NOTE_BODY', 'NOTE_LOCATION', 'PAGE_BODY', 'latitude']
  const seed = async () => {
    const refs = [
      ['publicPost', CollectionRefTypes.Post], ['draftPost', CollectionRefTypes.Post], ['openNote', CollectionRefTypes.Note],
      ['lockedNote', CollectionRefTypes.Note], ['futureNote', CollectionRefTypes.Note], ['about', CollectionRefTypes.Page],
    ] as const
    for (const [key, refType] of refs) {
      await recently.create({ content: `引用 ${key}`, type: 'text', ref: ids[key] as any, refType: refType as any })
    }
  }
  const refOf = (list: any[], key: string) => list.find((item) => item.content === `引用 ${key}`)?.ref ?? null

  test('creating with ref saves the reference and its type', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `${apiRoutePrefix}/recently`,
      headers: { ...authPassHeader },
      payload: { content: '看完了', ref: ids.publicPost },
    })
    expect(res.statusCode).toBe(201)
    const doc = await recently.findOne({ content: '看完了' }).lean()
    expect(doc?.ref?.toString()).toBe(ids.publicPost)
    expect(doc?.refType).toBe(CollectionRefTypes.Post)
    expect(res.json().ref.title).toBe('公开文章')
    expect(res.json().ref_type).toBe('Post')
  })

  test('creating with an unknown ref is rejected', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `${apiRoutePrefix}/recently`,
      headers: { ...authPassHeader },
      payload: { content: 'x', ref: '0123456789abcdef01234567' },
    })
    expect(res.statusCode).toBeGreaterThanOrEqual(400)
    expect(await recently.countDocuments()).toBe(0)
  })

  test('visitors only see public references, with link fields only', async () => {
    await seed()
    for (const url of ['/recently?size=20', '/recently/all']) {
      const res = await app.inject({ method: 'GET', url: `${apiRoutePrefix}${url}` })
      expect(res.statusCode).toBe(200)
      const raw = res.body
      for (const word of [...hidden, ...bodies]) expect(raw, `${url} 不该含 ${word}`).not.toContain(word)
      const list = res.json().data ?? res.json()
      expect(refOf(list, 'publicPost')).toMatchObject({ title: '公开文章', slug: 'public' })
      expect(refOf(list, 'openNote')).toMatchObject({ title: '公开手记', nid: 1 })
      expect(refOf(list, 'about')).toMatchObject({ title: '关于', slug: 'about' })
      for (const key of ['draftPost', 'lockedNote', 'futureNote']) expect(refOf(list, key), key).toBeNull()
    }
  })

  test('the latest entry hides a locked reference from visitors', async () => {
    await seed()
    const res = await app.inject({ method: 'GET', url: `${apiRoutePrefix}/recently/latest` })
    expect(res.statusCode).toBe(200)
    for (const word of [...hidden, ...bodies]) expect(res.body).not.toContain(word)
  })

  test('the owner sees titles of unpublished references, never bodies or passwords', async () => {
    await seed()
    const res = await app.inject({ method: 'GET', url: `${apiRoutePrefix}/recently/all`, headers: { ...authPassHeader } })
    const list = res.json().data ?? res.json()
    expect(refOf(list, 'draftPost')).toMatchObject({ title: '草稿文章' })
    expect(refOf(list, 'lockedNote')).toMatchObject({ title: '加密手记' })
    for (const word of ['DRAFT_BODY', 'LOCKED_BODY', 'LOCKED_PASSWORD', ...bodies]) expect(res.body).not.toContain(word)
  })

  test('live pushes to visitors never carry a locked reference', async () => {
    const created = await app.inject({
      method: 'POST',
      url: `${apiRoutePrefix}/recently`,
      headers: { ...authPassHeader },
      payload: { content: '悄悄引用', ref: ids.lockedNote },
    })
    expect(created.statusCode).toBe(201)
    expect(created.json().ref.title).toBe('加密手记')
    const id = created.json().id
    const updated = await app.inject({
      method: 'PUT',
      url: `${apiRoutePrefix}/recently/${id}`,
      headers: { ...authPassHeader },
      payload: { content: '还是悄悄引用', ref: ids.lockedNote },
    })
    expect(updated.statusCode).toBe(200)
    const pushes = emitted.filter(({ event }) => event === BusinessEvents.RECENTLY_CREATE || event === BusinessEvents.RECENTLY_UPDATE)
    expect(pushes.map(({ event }) => event)).toEqual([BusinessEvents.RECENTLY_CREATE, BusinessEvents.RECENTLY_UPDATE])
    for (const { payload } of pushes) {
      const raw = JSON.stringify(payload)
      for (const word of [...hidden, ...bodies]) expect(raw).not.toContain(word)
    }
  })

  test('editing can change and clear the reference, and switching to text drops the card', async () => {
    const created = await app.inject({
      method: 'POST',
      url: `${apiRoutePrefix}/recently`,
      headers: { ...authPassHeader },
      payload: { type: 'book', content: '好书', ref: ids.publicPost, metadata: { url: 'https://book.example', title: '书', author: '人' } },
    })
    const id = created.json().id
    const change = await app.inject({
      method: 'PUT',
      url: `${apiRoutePrefix}/recently/${id}`,
      headers: { ...authPassHeader },
      payload: { type: 'book', content: '好书', ref: ids.about, metadata: { url: 'https://book.example', title: '书', author: '人' } },
    })
    expect(change.statusCode).toBe(200)
    let doc = await recently.findById(id).lean()
    expect(doc?.ref?.toString()).toBe(ids.about)
    expect(doc?.refType).toBe(CollectionRefTypes.Page)

    const clear = await app.inject({
      method: 'PUT',
      url: `${apiRoutePrefix}/recently/${id}`,
      headers: { ...authPassHeader },
      payload: { type: 'text', content: '只留文字' },
    })
    expect(clear.statusCode).toBe(200)
    doc = await recently.findById(id).lean()
    expect(doc?.ref ?? null).toBeNull()
    expect(doc?.refType ?? null).toBeNull()
    expect(doc?.metadata ?? null).toBeNull()
    expect(doc?.type).toBe('text')
  })
})
