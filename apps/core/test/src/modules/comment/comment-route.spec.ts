import { RequestMethod } from '@nestjs/common'
import {
  GUARDS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants'
import { describe, expect, it, vi } from 'vitest'

import { AuthGuard } from '~/common/guards/auth.guard'

import { CommentController } from '~/modules/comment/comment.controller'

describe('CommentController routes', () => {
  it('uses explicit guest and reader write routes', () => {
    const prototype = CommentController.prototype

    expect(Reflect.getMetadata(PATH_METADATA, prototype.guestComment)).toBe(
      '/guest/:id',
    )
    expect(Reflect.getMetadata(PATH_METADATA, prototype.readerComment)).toBe(
      '/reader/:id',
    )
    expect(Reflect.getMetadata(PATH_METADATA, prototype.guestReplyByCid)).toBe(
      '/guest/reply/:id',
    )
    expect(Reflect.getMetadata(PATH_METADATA, prototype.readerReplyByCid)).toBe(
      '/reader/reply/:id',
    )

    expect(Reflect.getMetadata(METHOD_METADATA, prototype.guestComment)).toBe(
      RequestMethod.POST,
    )
    expect(Reflect.getMetadata(METHOD_METADATA, prototype.readerComment)).toBe(
      RequestMethod.POST,
    )
  })

  // 前台站长置顶评论（apps/web/components/comment-pin.tsx）直连这个接口：只认站长（AuthGuard 只放行 owner 会话或站长令牌，见 auth.guard.spec.ts），
  // 改完要清接口缓存，否则前台刷新会读回 15 秒内缓存的旧列表
  it('pins through an owner-only PATCH and clears the API cache', async () => {
    const prototype = CommentController.prototype
    expect(Reflect.getMetadata(PATH_METADATA, prototype.modifyCommentState)).toBe('/:id')
    expect(Reflect.getMetadata(METHOD_METADATA, prototype.modifyCommentState)).toBe(RequestMethod.PATCH)
    expect(Reflect.getMetadata(GUARDS_METADATA, prototype.modifyCommentState)).toContain(AuthGuard)

    const order: string[] = []
    const model = {
      findOne: () => ({ lean: () => ({ populate: async () => ({ ref: { _id: 'post-1' } }) }) }),
      updateMany: vi.fn(async () => order.push('unpin-others')),
      updateOne: vi.fn(async () => order.push('update')),
    }
    const redisService = { cleanCatch: vi.fn(async () => order.push('clean')) }
    const controller = new CommentController({ model } as any, {} as any, {} as any, {} as any, {} as any, redisService as any)
    await controller.modifyCommentState({ id: 'c1' } as any, { pin: true } as any)
    expect(model.updateOne).toHaveBeenCalledWith({ _id: 'c1' }, { pin: true })
    expect(order).toEqual(['unpin-others', 'update', 'clean'])
  })
})
