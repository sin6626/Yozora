import { describe, expect, it, vi } from 'vitest'

import { BusinessEvents } from '~/constants/business-event.constant'
import { VisitorEventDispatchService } from '~/processors/gateway/web/visitor-event-dispatch.service'

const setup = (doc: Record<string, unknown>) => {
  const broadcast = vi.fn()
  const toRoom = vi.fn()
  const service = new VisitorEventDispatchService(
    { enrichPayload: async () => doc } as any,
    {
      broadcast,
      getSocketsOfRoom: async () => [{ id: 's1' }],
      server: { to: () => ({ emit: toRoom }) },
    } as any,
    {} as any,
    { translateArticle: async ({ originalData }: any) => originalData } as any,
    { getSocketMetadata: async () => ({}) } as any,
  )
  return { service, broadcast, toRoom }
}

describe('visitor post broadcasts', () => {
  it('never pushes an unpublished post to visitors', async () => {
    const draft = { id: 'p1', title: 'Secret draft', text: 'secret body', isPublished: false }
    const { service, broadcast, toRoom } = setup(draft)

    await (service as any).onPostCreate({ id: 'p1' })
    await (service as any).onPostUpdate({ id: 'p1' })

    expect(JSON.stringify([broadcast.mock.calls, toRoom.mock.calls])).not.toContain('secret')
  })

  it('still announces a published post', async () => {
    const { service, broadcast } = setup({ id: 'p2', title: 'Hello', isPublished: true })
    await (service as any).onPostCreate({ id: 'p2' })
    expect(broadcast).toHaveBeenCalledWith(BusinessEvents.POST_CREATE, expect.objectContaining({ title: 'Hello' }))
  })
})

describe('visitor translation broadcasts', () => {
  const setupByEvent = (docs: Partial<Record<BusinessEvents, Record<string, unknown>>>) => {
    const broadcast = vi.fn()
    const service = new VisitorEventDispatchService(
      { enrichPayload: async (event: BusinessEvents, data: any) => docs[event] ?? data } as any,
      { broadcast } as any,
      {} as any,
      {} as any,
      {} as any,
    )
    return { service, broadcast }
  }
  const translation = (refType: string, refId = 'a1') => ({ id: 't1', refId, refType, lang: 'en', title: 'Secret title', text: 'secret body' })
  const events = ['onTranslationCreate', 'onTranslationUpdate'] as const

  it.each([
    ['an unpublished post', 'posts', { [BusinessEvents.POST_UPDATE]: { id: 'a1', isPublished: false } }],
    ['a locked note', 'notes', { [BusinessEvents.NOTE_UPDATE]: { id: 'a1', isPublished: true, password: 'x' } }],
    ['an unpublished note', 'notes', { [BusinessEvents.NOTE_UPDATE]: { id: 'a1', isPublished: false } }],
    ['a note scheduled for later', 'notes', { [BusinessEvents.NOTE_UPDATE]: { id: 'a1', isPublished: true, publicAt: new Date(Date.now() + 86_400_000) } }],
    ['an article that no longer exists', 'posts', {}],
    ['an unknown ref type', 'recentlies', {}],
  ])('never pushes the translation of %s', async (_, refType, docs) => {
    const { service, broadcast } = setupByEvent(docs)
    for (const handler of events) await (service as any)[handler](translation(refType))
    expect(broadcast).not.toHaveBeenCalled()
  })

  it.each([
    ['a published post', 'posts', { [BusinessEvents.POST_UPDATE]: { id: 'a1', isPublished: true } }],
    ['a public note', 'notes', { [BusinessEvents.NOTE_UPDATE]: { id: 'a1', isPublished: true, publicAt: new Date(Date.now() - 86_400_000) } }],
    ['a page', 'pages', { [BusinessEvents.PAGE_UPDATE]: { id: 'a1' } }],
  ])('pushes the translation of %s to its room', async (_, refType, docs) => {
    const { service, broadcast } = setupByEvent(docs)
    for (const handler of events) await (service as any)[handler](translation(refType))
    expect(broadcast).toHaveBeenCalledTimes(2)
    expect(broadcast.mock.calls[0][2]).toEqual({ rooms: [expect.stringContaining('a1')] })
  })
})
