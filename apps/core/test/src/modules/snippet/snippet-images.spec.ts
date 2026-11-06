import { createRedisProvider } from '@/mock/modules/redis.mock'
import { Test } from '@nestjs/testing'
import { getModelForClass } from '@typegoose/typegoose'
import { FileReferenceType } from '~/modules/file/file-reference.model'
import { FileReferenceService } from '~/modules/file/file-reference.service'
import { ServerlessService } from '~/modules/serverless/serverless.service'
import { snippetImageUrls } from '~/modules/snippet/snippet-images.util'
import { SnippetModel, SnippetType } from '~/modules/snippet/snippet.model'
import { SnippetService } from '~/modules/snippet/snippet.service'
import { DatabaseService } from '~/processors/database/database.service'
import { EventManagerService } from '~/processors/helper/helper.event.service'
import { CacheService } from '~/processors/redis/cache.service'
import { getModelToken } from '~/transformers/model.transformer'
import { redisHelper } from 'test/helper/redis-mock.helper'
import { vi } from 'vitest'

// 配置片段（如 theme/yozora）里填的图床图片要算“已引用”，否则 Core 每小时会把上传超过 60 分钟、没人引用的图片删掉
describe('snippet image references', async () => {
  const fileReferences = {
    updateReferencesForDocument: vi.fn(async () => {}),
    removeReferencesForDocument: vi.fn(async () => {}),
  }
  let service: SnippetService

  beforeAll(async () => {
    const redis = await redisHelper
    const app = await Test.createTestingModule({
      providers: [
        SnippetService,
        await createRedisProvider(),
        { provide: DatabaseService, useValue: {} },
        { provide: CacheService, useValue: redis.CacheService },
        { provide: ServerlessService, useValue: { isValidServerlessFunction: () => true, compileTypescriptCode: async (code: string) => code } },
        { provide: EventManagerService, useValue: { emit: vi.fn(async () => {}) } },
        { provide: FileReferenceService, useValue: fileReferences },
        { provide: getModelToken(SnippetModel.name), useValue: getModelForClass(SnippetModel) },
      ],
    }).compile()
    await app.init()
    service = app.get(SnippetService)
  })

  it('collects every http(s) url string in the JSON, once', () => {
    const raw = JSON.stringify({
      hero: { mascot: { back: 'https://s3.example.com/a.webp', front: 'https://s3.example.com/a.webp' }, shadow: { image: 'http://s3.example.com/b.webp', page: 'shin' } },
      list: ['https://s3.example.com/c.png', 'not a url', 3],
    })
    expect(snippetImageUrls(raw).sort()).toEqual(['http://s3.example.com/b.webp', 'https://s3.example.com/a.webp', 'https://s3.example.com/c.png'])
    expect(snippetImageUrls('not json')).toEqual([])
  })

  it('registers the images on create, update, and releases them on delete', async () => {
    const created = await service.create({
      name: 'images-test',
      reference: 'theme',
      type: SnippetType.JSON,
      private: false,
      raw: JSON.stringify({ hero: { shadow: { image: 'https://s3.example.com/one.webp' } } }),
    } as SnippetModel)
    const id = created.id
    expect(fileReferences.updateReferencesForDocument).toHaveBeenLastCalledWith(
      { text: '![](https://s3.example.com/one.webp)' }, id, FileReferenceType.Snippet,
    )

    await service.update(id, { name: 'images-test', reference: 'theme', type: SnippetType.JSON, private: false, raw: JSON.stringify({ hero: { shadow: { image: 'https://s3.example.com/two.webp' } } }) } as SnippetModel)
    expect(fileReferences.updateReferencesForDocument).toHaveBeenLastCalledWith(
      { text: '![](https://s3.example.com/two.webp)' }, id, FileReferenceType.Snippet,
    )

    await service.delete(id)
    expect(fileReferences.removeReferencesForDocument).toHaveBeenLastCalledWith(id, FileReferenceType.Snippet)
  })

  it('leaves function snippets alone', async () => {
    fileReferences.updateReferencesForDocument.mockClear()
    await service.create({ name: 'fn-test', reference: 'mine', type: SnippetType.Function, private: false, raw: 'export default async function handler() { return "https://x.example.com/a.png" }' } as SnippetModel)
    expect(fileReferences.updateReferencesForDocument).not.toHaveBeenCalled()
  })
})
