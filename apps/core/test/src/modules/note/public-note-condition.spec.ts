import { dbHelper } from 'test/helper/db-mock.helper'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { NoteModel } from '~/modules/note/note.model'
import { publicNoteCondition } from '~/modules/note/note.service'

// 访客能看到的手记：已发布、没有密码、没有定时公开或公开时间已到。手记列表、搜索、前台 RSS 全文都靠这个条件。
// 原来按不存在的旧字段 secret 过滤，时间还是服务启动那一刻，定时公开的手记会提前出现。
describe('public note condition', () => {
  let notes: ReturnType<typeof dbHelper.getModel<typeof NoteModel>>
  beforeAll(() => {
    notes = dbHelper.getModel(NoteModel)
  })
  beforeEach(() => dbHelper.clear())

  const note = (title: string, extra: Record<string, unknown> = {}) =>
    notes.create({ title, text: 'body', nid: Math.floor(Math.random() * 1e6), isPublished: true, ...extra })

  it('hides drafts, password notes and notes whose public time has not come', async () => {
    const day = 24 * 3600 * 1000
    await note('open')
    await note('past', { publicAt: new Date(Date.now() - day) })
    await note('future', { publicAt: new Date(Date.now() + day) })
    await note('locked', { password: 'x' })
    await note('draft', { isPublished: false })
    const titles = (await notes.find(publicNoteCondition()).lean()).map((n) => n.title).sort()
    expect(titles).toEqual(['open', 'past'])
  })

  it('uses the time of each query, not the time the service started', async () => {
    const soon = new Date(Date.now() + 60_000)
    await note('soon', { publicAt: soon })
    expect(await notes.countDocuments(publicNoteCondition())).toBe(0)
    expect(await notes.countDocuments(publicNoteCondition(new Date(soon.getTime() + 1000)))).toBe(1)
  })
})
