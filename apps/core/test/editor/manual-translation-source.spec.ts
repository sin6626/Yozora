import type { Db } from 'mongodb'
import { expect, it, vi } from 'vitest'
import { findArticle } from '../../scripts/manual-translation/source'

it('rejects Plate before checking, inserting or forcibly replacing any translation', async () => {
  const collection = vi.fn(() => ({ findOne: async () => ({ contentFormat: 'plate' }) }))
  const db = { collection } as unknown as Db
  await expect(findArticle(db, '123456789012345678901234')).rejects.toThrow(/manual translation.*Plate/i)
  expect(collection.mock.calls).toEqual([['posts']])
})
