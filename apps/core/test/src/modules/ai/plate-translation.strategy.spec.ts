import { createEnvelope, validateDocument } from '@suzuri/editor/schema'
import { describe, expect, it, vi } from 'vitest'

import { PlateTranslationStrategy } from '~/modules/ai/ai-translation/strategies/plate-translation.strategy'
import { ContentFormat } from '~/shared/types/content-format.type'

const source = JSON.stringify(
  createEnvelope({
    children: [
      { type: 'heading', level: 2, children: [{ text: '安装' }] },
      {
        type: 'paragraph',
        children: [
          { text: '先运行 ' },
          { text: 'pnpm install', code: true },
          { text: '，再' },
          { text: '启动', bold: true },
          { text: '。' },
        ],
      },
      { type: 'codeBlock', language: 'ts', children: [{ text: 'const 名字 = 1' }] },
    ],
  } as any),
)

const article = {
  title: '入门',
  text: '',
  subtitle: '副标题',
  summary: '摘要',
  tags: ['前端', '工具'],
  contentFormat: ContentFormat.Plate,
  content: source,
}

function setup(drop: string[] = []) {
  const strategy = new PlateTranslationStrategy()
  const calls: Record<string, string>[] = []
  vi.spyOn(strategy as any, 'callChunkTranslation').mockImplementation(
    async (_lang: unknown, chunk: any) => {
      calls.push(chunk.textEntries)
      const translations: Record<string, string> = {}
      for (const [id, text] of Object.entries<string>(chunk.textEntries)) {
        if (!drop.includes(text)) {
          translations[id] = text
            .split('|||')
            .map((part) => `EN·${part}`)
            .join('|||')
        }
      }
      return { sourceLang: 'zh', translations }
    },
  )
  return { strategy, calls }
}

const translate = (strategy: PlateTranslationStrategy, content = article) =>
  strategy.translate(
    content as any,
    'en',
    {} as any,
    { model: 'm', provider: 'p' },
    {},
  )

describe('PlateTranslationStrategy', () => {
  it('translates text leaves and metadata, never inline code or code blocks', async () => {
    const { strategy, calls } = setup()
    const result = await translate(strategy)

    const sent = Object.values(calls[0])
    expect(sent).toContain('先运行 ')
    expect(sent).not.toContain('pnpm install')
    expect(sent).not.toContain('const 名字 = 1')

    const doc = JSON.parse(result.content!).document
    expect(doc.children[0].children[0].text).toBe('EN·安装')
    expect(doc.children[1].children.map((leaf: any) => leaf.text)).toEqual([
      'EN·先运行 ',
      'pnpm install',
      'EN·，再',
      'EN·启动',
      'EN·。',
    ])
    expect(doc.children[1].children[3].bold).toBe(true)
    expect(doc.children[2].children[0].text).toBe('const 名字 = 1')

    expect(result).toMatchObject({
      sourceLang: 'zh',
      title: 'EN·入门',
      subtitle: 'EN·副标题',
      summary: 'EN·摘要',
      tags: ['EN·前端', 'EN·工具'],
      contentFormat: ContentFormat.Plate,
      aiModel: 'm',
      aiProvider: 'p',
    })
    expect(result.text).toContain('## EN·安装')
    expect(result.text).toContain('`pnpm install`')
    expect(validateDocument(result.content!, { requireEnvelope: true }).ok).toBe(
      true,
    )
  })

  it('keeps the original text of a segment the model left out', async () => {
    const { strategy } = setup(['。'])
    const result = await translate(strategy)
    const leaves = JSON.parse(result.content!).document.children[1].children
    expect(leaves[4].text).toBe('。')
  })

  it('restamps a source envelope whose fingerprint drifted', async () => {
    const { strategy } = setup()
    const stale = JSON.parse(source)
    const fingerprint = stale.schema.fingerprint
    stale.schema.fingerprint = 'fnv1a64:0000000000000000'
    const result = await translate(strategy, {
      ...article,
      content: JSON.stringify(stale),
    })
    expect(JSON.parse(result.content!).schema.fingerprint).toBe(fingerprint)
  })

  it('translates only metadata when the body has no text', async () => {
    const { strategy, calls } = setup()
    const empty = JSON.stringify(
      createEnvelope({ children: [{ type: 'paragraph', children: [{ text: '' }] }] }),
    )
    const result = await translate(strategy, { ...article, content: empty })
    expect(calls).toHaveLength(1)
    expect(Object.keys(calls[0])).toEqual([
      '__title__',
      '__subtitle__',
      '__summary__',
      '__tags__',
    ])
    expect(result.title).toBe('EN·入门')
  })
})
