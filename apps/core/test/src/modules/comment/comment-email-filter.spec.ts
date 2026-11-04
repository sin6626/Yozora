import { lastValueFrom, of } from 'rxjs'
import { describe, expect, it } from 'vitest'

import { CommentFilterEmailInterceptor } from '~/modules/comment/comment.interceptor'

const run = (body: unknown, user?: unknown) => {
  const interceptor = new CommentFilterEmailInterceptor()
  const context = {
    getType: () => 'http',
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as any
  return lastValueFrom(interceptor.intercept(context, { handle: () => of(body) }))
}

describe('CommentFilterEmailInterceptor', () => {
  it('hides commenter emails in thread replies from visitors', async () => {
    const result: any = await run({
      replies: [{ id: 'r1', author: 'a', mail: 'secret@example.com', text: 'hi' }],
      remaining: 0,
      done: true,
    })
    expect(JSON.stringify(result)).not.toContain('secret@example.com')
    expect(result.replies[0].avatar).toBeTruthy()
  })

  it('still hides emails in the paginated list and nested replies', async () => {
    const result: any = await run({
      data: [{ id: 'c1', mail: 'a@example.com', replies: [{ id: 'r1', mail: 'b@example.com' }] }],
    })
    expect(JSON.stringify(result)).not.toMatch(/@example\.com/)
  })
})
