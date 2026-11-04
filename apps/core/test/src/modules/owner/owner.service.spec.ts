import { OwnerService } from '~/modules/owner/owner.service'
import { Types } from 'mongoose'
import { describe, expect, it, vi } from 'vitest'

describe('OwnerService.patchOwnerData', () => {
  it('emits OWNER_UPDATE with the owner id only, so the blog drops its profile cache', async () => {
    const readerId = new Types.ObjectId()
    const collection = {
      find: () => ({ sort: () => ({ limit: () => ({ next: async () => ({ _id: readerId }) }) }) }),
      updateOne: vi.fn(),
    }
    const emit = vi.fn()
    const service = new OwnerService(
      { db: { collection: () => collection } } as any,
      { updateOne: vi.fn() } as any,
      { updateReferencesForDocument: vi.fn() } as any,
      { emit } as any,
    )
    vi.spyOn(service, 'getOwnerInfo').mockResolvedValue({} as any)

    await service.patchOwnerData({ name: 'Moon', introduce: 'hi' } as any)

    expect(emit).toHaveBeenCalledWith('OWNER_UPDATE', { id: String(readerId) }, { scope: 4 })
  })
})
