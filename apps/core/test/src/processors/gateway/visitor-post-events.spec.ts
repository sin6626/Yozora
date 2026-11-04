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
