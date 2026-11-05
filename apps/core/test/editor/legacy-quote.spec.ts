import 'reflect-metadata'

import { allHeadlessNodes } from '@haklex/rich-headless'
import { createHeadlessEditor } from '@lexical/headless'
import { Controller, Get } from '@nestjs/common'
import type { INestApplication } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { FastifyAdapter } from '@nestjs/platform-fastify'
import { Test } from '@nestjs/testing'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { HttpCacheInterceptor } from '~/common/interceptors/cache.interceptor'
import { RedisService } from '~/processors/redis/redis.service'
import { CacheService } from '~/processors/redis/cache.service'
import { JSONTransformInterceptor } from '~/common/interceptors/json-transform.interceptor'
import { LexicalService } from '~/processors/helper/helper.lexical.service'
import { ContentFormat } from '~/shared/types/content-format.type'

import { document, element, legacyQuote, repairedQuote } from '../../../../../../test/editor/fixtures.mjs'

vi.mock('~/global/env.global', async (original) => ({ ...await original<typeof import('~/global/env.global')>(), isTest: false }))
vi.mock('~/app.config', async (original) => {
  const config = await original<typeof import('~/app.config')>()
  return { ...config, REDIS: { ...config.REDIS, disableApiCache: false } }
})
const cache = new Map<string, unknown>()
let handlerCalls = 0

const canonical = (value: typeof repairedQuote) => {
  const editor = createHeadlessEditor({ nodes: allHeadlessNodes, onError(error) { throw error } })
  return JSON.stringify(editor.parseEditorState(JSON.stringify(value)).toJSON())
}
const legacyContent = canonical(legacyQuote)
const fixedContent = canonical(repairedQuote)
const lexical = new LexicalService()
const original = {
  title: 'Synthetic legacy quote', contentFormat: ContentFormat.Lexical,
  content: legacyContent, text: 'Old projection', version: 3, __v: 2,
  history: [{ version: 1, isFullSnapshot: true, contentFormat: ContentFormat.Lexical, content: legacyContent }],
}

@Controller()
class FixtureController {
  @Get('legacy')
  load() { handlerCalls++; return original }
}

describe('legacy Quote read and save boundaries', () => {
  let app: INestApplication
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [FixtureController], providers: [Reflector, LexicalService, JSONTransformInterceptor, HttpCacheInterceptor, {
        provide: CacheService, useValue: {
          get: async (key: string) => cache.get(key),
          set: async (key: string, value: unknown) => cache.set(key, JSON.parse(JSON.stringify(value))),
        },
      }, {
        provide: RedisService, useValue: { getApiCacheGeneration: async () => '0' },
      }],
    }).compile()
    app = module.createNestApplication(new FastifyAdapter())
    app.useGlobalInterceptors(app.get(JSONTransformInterceptor), app.get(HttpCacheInterceptor))
    await app.init()
    await app.getHttpAdapter().getInstance().ready()
  })
  afterAll(async () => { await app?.close() })

  it('returns a repaired view and projection without changing the source or raw history', async () => {
    const before = JSON.stringify(original)
    const response = await app.getHttpAdapter().getInstance().inject({ method: 'GET', url: '/legacy' })
    expect(response.statusCode).toBe(200)
    const view = response.json()
    expect(JSON.parse(view.content)).toEqual(JSON.parse(fixedContent))
    expect(view.text).toBe(lexical.lexicalToMarkdown(fixedContent).trim())
    expect(view.history[0].content).toBe(legacyContent)
    expect(JSON.stringify(original)).toBe(before)
  })

  it('repairs both cold and cached API responses without rewriting cached history', async () => {
    cache.clear()
    handlerCalls = 0
    const get = () => app.getHttpAdapter().getInstance().inject({ method: 'GET', url: '/legacy' })
    const cold = (await get()).json()
    const hot = (await get()).json()
    expect(handlerCalls).toBe(1)
    expect(hot).toEqual(cold)
    expect(hot.content).toBe(fixedContent)
    const [key, cached] = [...cache.entries()][0]
    expect(cached).toEqual(original)
    cache.set(key, { content_format: 'lexical', content: legacyContent, text: 'Old projection', history: original.history })
    expect((await get()).json().content).toBe(fixedContent)
    expect(handlerCalls).toBe(1)
    expect(cache.get(key)).toEqual({ content_format: 'lexical', content: legacyContent, text: 'Old projection', history: original.history })
  })

  it('is idempotent and preserves valid sibling paragraphs and nested documents', () => {
    expect(lexical.normalizeLegacyQuotes(legacyContent)).toBe(fixedContent)
    expect(lexical.normalizeLegacyQuotes(fixedContent)).toBe(fixedContent)
    const siblings = JSON.stringify(document(element('quote', [...repairedQuote.root.children[0].children, element('paragraph', [])])))
    expect(lexical.normalizeLegacyQuotes(siblings)).toBe(siblings)
    const nested = JSON.stringify(document(element('nested-doc', [], { content: legacyQuote })))
    const repaired = JSON.parse(lexical.normalizeLegacyQuotes(nested))
    expect(repaired.root.children[0].content).toEqual(repairedQuote)
    const conflicting = JSON.stringify(document(element('quote', [element('paragraph', repairedQuote.root.children[0].children, { $: { blockId: 'conflicting' } })])))
    expect(lexical.normalizeLegacyQuotes(conflicting)).toBe(conflicting)
  })

  it('canonicalizes only an explicit content write, retaining block identity and formatting', () => {
    const submitted = { contentFormat: ContentFormat.Lexical, content: legacyContent }
    lexical.populateText(submitted, original)
    expect(JSON.parse(submitted.content)).toEqual(JSON.parse(fixedContent))
    expect(original.content).toBe(legacyContent)
    const titleOnly: { title: string; content?: string } = { title: 'Changed title' }
    expect(lexical.populateText(titleOnly, original)).toBe(false)
    expect(titleOnly).toEqual({ title: 'Changed title' })
  })

  it('does not discard conflicting wrapper identities to make malformed content writable', () => {
    const unsafe = canonical(document(element('quote', [element('paragraph', repairedQuote.root.children[0].children, { $: { blockId: 'otherOld' }, format: 'right' })])))
    expect(() => lexical.populateText({ contentFormat: ContentFormat.Lexical, content: unsafe })).toThrow()
  })
})
