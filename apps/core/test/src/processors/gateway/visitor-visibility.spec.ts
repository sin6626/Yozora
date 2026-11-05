import { dbHelper } from 'test/helper/db-mock.helper'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { CategoryModel } from '~/modules/category/category.model'
import { NoteModel } from '~/modules/note/note.model'
import { PageModel } from '~/modules/page/page.model'
import { PostModel } from '~/modules/post/post.model'
import { VisitorEventDispatchService } from '~/processors/gateway/web/visitor-event-dispatch.service'
import { EventPayloadEnricherService } from '~/processors/helper/helper.event-payload.service'

// Real models, so `password` keeps its select:false projection: the check must not rely on a field the loader never reads.
describe('visitor broadcasts against real documents', () => {
  let notes: ReturnType<typeof dbHelper.getModel<typeof NoteModel>>
  let posts: ReturnType<typeof dbHelper.getModel<typeof PostModel>>
  let pages: ReturnType<typeof dbHelper.getModel<typeof PageModel>>
  let service: VisitorEventDispatchService
  const sent: unknown[] = []

  beforeAll(() => {
    notes = dbHelper.getModel(NoteModel)
    posts = dbHelper.getModel(PostModel)
    pages = dbHelper.getModel(PageModel)
    dbHelper.getModel(CategoryModel) // posts populate their category
  })
  beforeEach(async () => {
    await dbHelper.clear()
    sent.length = 0
    const record = (...args: unknown[]) => { sent.push(args) }
    service = new VisitorEventDispatchService(
      new EventPayloadEnricherService(posts as any, notes as any, pages as any),
      { broadcast: vi.fn(record), getSocketsOfRoom: async () => [{ id: 's1' }], server: { to: () => ({ emit: vi.fn(record) }) } } as any,
      {} as any,
      { translateArticle: async ({ originalData }: any) => originalData } as any,
      { getSocketMetadata: async () => ({}) } as any,
    )
  })

  const note = (extra: Record<string, unknown>) =>
    notes.create({ title: 'A note', text: 'protected body', nid: Math.floor(Math.random() * 1e6), ...extra })
  const translation = (refId: string, refType = 'notes') => ({ id: 't1', refId, refType, lang: 'en', title: 'Translated', text: 'translated protected body' })
  const pushAll = async (id: string, refType = 'notes') => {
    await (service as any).onTranslationCreate(translation(id, refType))
    await (service as any).onTranslationUpdate(translation(id, refType))
    if (refType === 'notes') {
      await (service as any).onNoteCreate({ id })
      await (service as any).onNoteUpdate({ id })
    }
  }

  it('never pushes a password-protected note or its translations', async () => {
    const locked = await note({ password: 'secret-pass' })
    expect((await notes.findById(locked.id).lean()) as any).not.toHaveProperty('password')
    await pushAll(locked.id)
    expect(sent).toEqual([])
  })

  it.each([
    ['unpublished', { isPublished: false }],
    ['scheduled for later', { publicAt: new Date(Date.now() + 86_400_000) }],
  ])('never pushes a note that is %s', async (_, extra) => {
    const hidden = await note(extra)
    await pushAll(hidden.id)
    expect(sent).toEqual([])
  })

  it('never pushes translations of an unpublished post or a deleted article', async () => {
    const draft = await posts.create({ title: 'Draft', text: 'draft body', slug: 'draft', categoryId: '000000000000000000000001', isPublished: false } as any)
    await pushAll(draft.id, 'posts')
    await pushAll('000000000000000000000099', 'posts')
    await pushAll('000000000000000000000099')
    expect(sent).toEqual([])
  })

  it('never pushes translations of an unknown kind of content', async () => {
    const open = await note({})
    await (service as any).onTranslationCreate(translation(open.id, 'recentlies'))
    await (service as any).onTranslationUpdate({ ...translation(open.id), refId: 'not-an-id' })
    expect(sent).toEqual([])
  })

  it('pushes translations of a published post and of a page to the article room', async () => {
    const post = await posts.create({ title: 'Live', text: 'live body', slug: 'live', categoryId: '000000000000000000000001' } as any)
    const page = await pages.create({ title: 'About', text: 'about', slug: 'about' } as any)
    await pushAll(post.id, 'posts')
    await pushAll(page.id, 'pages')
    expect(sent.length).toBe(4)
    expect((sent[0] as unknown[])[2]).toEqual({ rooms: [expect.stringContaining(post.id)] })
  })

  it('still pushes a public note and its translations, without any password', async () => {
    const open = await note({})
    await pushAll(open.id)
    expect(sent.length).toBe(4)
    expect(JSON.stringify(sent)).not.toContain('secret-pass')
  })
})
