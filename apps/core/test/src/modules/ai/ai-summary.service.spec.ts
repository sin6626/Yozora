import { Test } from '@nestjs/testing'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { BizException } from '~/common/exceptions/biz.exception'
import { CollectionRefTypes } from '~/constants/db.constant'
import { AiService } from '~/modules/ai/ai.service'
import { AiInFlightService } from '~/modules/ai/ai-inflight/ai-inflight.service'
import { AISummaryModel } from '~/modules/ai/ai-summary/ai-summary.model'
import { AiSummaryService } from '~/modules/ai/ai-summary/ai-summary.service'
import { AiTaskService } from '~/modules/ai/ai-task/ai-task.service'
import { ConfigsService } from '~/modules/configs/configs.service'
import { DatabaseService } from '~/processors/database/database.service'
import { EventManagerService } from '~/processors/helper/helper.event.service'
import { TaskQueueProcessor } from '~/processors/task-queue'
import { getModelToken } from '~/transformers/model.transformer'

describe('AiSummaryService', () => {
  let service: AiSummaryService
  let mockSummaryModel: any
  let mockDatabaseService: any
  let mockConfigService: any
  let mockEmit: ReturnType<typeof vi.fn>

  const mockArticle = {
    id: 'article-1',
    title: 'Test Article',
    text: 'This is test content for summary',
  }

  const mockSummary = {
    id: 'summary-1',
    refId: 'article-1',
    lang: 'zh',
    summary: 'This is a test summary',
    hash: '', // Will be set in tests
  }

  beforeEach(async () => {
    mockSummaryModel = {
      findOne: vi.fn(),
      find: vi.fn(),
      findById: vi.fn(),
      create: vi.fn(),
      deleteOne: vi.fn(),
      deleteMany: vi.fn(),
      paginate: vi.fn(),
      aggregate: vi.fn(),
    }

    mockDatabaseService = {
      findGlobalById: vi.fn(),
      findGlobalByIds: vi.fn().mockResolvedValue({ posts: [], notes: [] }),
      getModelByRefType: vi.fn(),
    }

    mockConfigService = {
      get: vi.fn().mockResolvedValue({
        enableSummary: true,
        enableAutoGenerateSummary: true,
        summaryTargetLanguages: ['zh'],
      }),
      waitForConfigReady: vi.fn().mockResolvedValue({
        ai: { enableSummary: true },
      }),
    }

    const mockAiInFlightService = {
      runWithStream: vi.fn(),
    }

    const mockAiService = {
      getSummaryModel: vi.fn(),
    }

    const mockTaskProcessor = {
      registerHandler: vi.fn(),
    }

    mockEmit = vi.fn()

    const module = await Test.createTestingModule({
      providers: [
        AiSummaryService,
        { provide: EventManagerService, useValue: { emit: mockEmit } },
        {
          provide: getModelToken(AISummaryModel.name),
          useValue: mockSummaryModel,
        },
        { provide: DatabaseService, useValue: mockDatabaseService },
        { provide: ConfigsService, useValue: mockConfigService },
        { provide: AiService, useValue: mockAiService },
        { provide: AiInFlightService, useValue: mockAiInFlightService },
        { provide: TaskQueueProcessor, useValue: mockTaskProcessor },
        {
          provide: AiTaskService,
          useValue: {
            crud: { createTask: vi.fn() },
            createSummaryTask: vi.fn(),
          },
        },
      ],
    }).compile()

    service = module.get(AiSummaryService)
  })

  describe('webhook events', () => {
    it('emits AI_SUMMARY_UPDATE with ids only when the owner edits a summary', async () => {
      const doc = { ...mockSummary, save: vi.fn() }
      mockSummaryModel.findById.mockResolvedValue(doc)

      await service.updateSummaryInDb('summary-1', 'edited')

      expect(mockEmit).toHaveBeenCalledWith(
        'AI_SUMMARY_UPDATE',
        { id: 'summary-1', refId: 'article-1', lang: 'zh' },
        { scope: 4 },
      )
    })

    it('emits AI_SUMMARY_DELETE when the owner deletes a summary', async () => {
      await service.deleteSummaryInDb('summary-1')

      expect(mockEmit).toHaveBeenCalledWith(
        'AI_SUMMARY_DELETE',
        { id: 'summary-1' },
        { scope: 4 },
      )
    })
  })

  describe('findValidSummary', () => {
    it('should return summary when hash matches', async () => {
      const text = mockArticle.text
      // Use the service's internal method to compute hash
      const expectedHash = (service as any).computeContentHash(text)

      const summaryWithHash = { ...mockSummary, hash: expectedHash }
      mockSummaryModel.findOne.mockResolvedValue(summaryWithHash)

      const result = await (service as any).findValidSummary(
        'article-1',
        'zh',
        text,
      )

      expect(result).toEqual(summaryWithHash)
      expect(mockSummaryModel.findOne).toHaveBeenCalledWith({
        refId: 'article-1',
        lang: 'zh',
        hash: expectedHash,
      })
    })

    it('should return null when no summary exists', async () => {
      mockSummaryModel.findOne.mockResolvedValue(null)

      const result = await (service as any).findValidSummary(
        'article-1',
        'zh',
        'some text',
      )

      expect(result).toBeNull()
    })
  })

  describe('wrapAsImmediateStream', () => {
    it('should return correct stream format with done event', async () => {
      const summary = { ...mockSummary, id: 'summary-123' }
      const { events, result } = (service as any).wrapAsImmediateStream(summary)

      const collectedEvents: any[] = []
      for await (const event of events) {
        collectedEvents.push(event)
      }

      expect(collectedEvents).toHaveLength(1)
      expect(collectedEvents[0]).toEqual({
        type: 'done',
        data: { resultId: 'summary-123' },
      })

      const resolvedResult = await result
      expect(resolvedResult).toEqual(summary)
    })
  })

  describe('streamSummaryForArticle', () => {
    it('should return cached summary when valid summary exists', async () => {
      const text = mockArticle.text
      const expectedHash = (service as any).computeContentHash(text)

      const existingSummary = {
        ...mockSummary,
        id: 'cached-summary',
        hash: expectedHash,
      }

      mockDatabaseService.findGlobalById.mockResolvedValue({
        document: mockArticle,
        type: CollectionRefTypes.Post,
      })
      mockSummaryModel.findOne.mockResolvedValue(existingSummary)

      const { events, result } = await service.streamSummaryForArticle(
        'article-1',
        { lang: 'zh' },
      )

      const collectedEvents: any[] = []
      for await (const event of events) {
        collectedEvents.push(event)
      }

      expect(collectedEvents).toHaveLength(1)
      expect(collectedEvents[0].type).toBe('done')
      expect(collectedEvents[0].data.resultId).toBe('cached-summary')

      const resolvedResult = await result
      expect(resolvedResult.id).toBe('cached-summary')
    })
  })

  // 2026-11-12: visitors could read (and trigger) the AI summary of a locked note
  describe('assertVisibleToVisitors', () => {
    const cases = [
      ['a published post', CollectionRefTypes.Post, { isPublished: true }, true],
      ['a draft post', CollectionRefTypes.Post, { isPublished: false }, false],
      ['a public note', CollectionRefTypes.Note, { isPublished: true, password: '' }, true],
      ['a locked note', CollectionRefTypes.Note, { isPublished: true, password: 'pw12' }, false],
      ['a scheduled note', CollectionRefTypes.Note, { isPublished: true, publicAt: new Date(Date.now() + 86_400_000) }, false],
      ['an unpublished note', CollectionRefTypes.Note, { isPublished: false }, false],
    ] as const
    it.each(cases)('%s', async (_name, type, document, visible) => {
      mockDatabaseService.findGlobalById.mockResolvedValue({ type, document: { ...mockArticle, ...document } })
      const check = service.assertVisibleToVisitors('article-1')
      if (visible) await expect(check).resolves.toBeUndefined()
      else await expect(check).rejects.toThrow(BizException)
    })

    it('treats a missing article as not visible', async () => {
      mockDatabaseService.findGlobalById.mockResolvedValue(null)
      await expect(service.assertVisibleToVisitors('missing')).rejects.toThrow(BizException)
    })
  })

  describe('resolveArticleForSummary', () => {
    it('should return document and type for valid article', async () => {
      mockDatabaseService.findGlobalById.mockResolvedValue({
        document: mockArticle,
        type: CollectionRefTypes.Post,
      })

      const result = await (service as any).resolveArticleForSummary(
        'article-1',
      )

      expect(result.document).toEqual(mockArticle)
      expect(result.type).toBe(CollectionRefTypes.Post)
    })

    it('should throw when article not found', async () => {
      mockDatabaseService.findGlobalById.mockResolvedValue(null)

      await expect(
        (service as any).resolveArticleForSummary('not-found'),
      ).rejects.toThrow()
    })

    it('should throw for Recently type', async () => {
      mockDatabaseService.findGlobalById.mockResolvedValue({
        document: mockArticle,
        type: CollectionRefTypes.Recently,
      })

      await expect(
        (service as any).resolveArticleForSummary('article-1'),
      ).rejects.toThrow()
    })
  })

  describe('getSummaryByArticleId', () => {
    it('should return valid summary from database', async () => {
      const text = mockArticle.text
      const expectedHash = (service as any).computeContentHash(text)

      mockDatabaseService.findGlobalById.mockResolvedValue({
        document: mockArticle,
        type: CollectionRefTypes.Post,
      })

      const existingSummary = { ...mockSummary, hash: expectedHash }
      mockSummaryModel.findOne.mockResolvedValue(existingSummary)

      const result = await service.getSummaryByArticleId('article-1', 'zh')

      expect(result).toEqual(existingSummary)
    })

    it('should return null when hash does not match', async () => {
      mockDatabaseService.findGlobalById.mockResolvedValue({
        document: mockArticle,
        type: CollectionRefTypes.Post,
      })

      mockSummaryModel.findOne.mockResolvedValue(null)

      const result = await service.getSummaryByArticleId('article-1', 'zh')

      expect(result).toBeNull()
    })
  })
})
