import { createEnvelope, SUZURI_SAMPLE_DOCUMENT } from '@suzuri/editor/schema'
import { BadRequestException } from '@nestjs/common'
import { describe, expect, it } from 'vitest'

import { zPrefer } from '~/common/zod'
import { PostSchema } from '~/modules/post/post.schema'
import { LexicalService } from '~/processors/helper/helper.lexical.service'
import { WriteBaseSchemaWithRefine } from '~/shared/schema/write-base.schema'
import { ContentFormat } from '~/shared/types/content-format.type'
import {
  applyContentPreference,
  computeContentHash,
  extractImagesFromContent,
  isRichContent,
} from '~/utils/content.util'
import {
  canonicalizePlateContentForHash,
  projectPlateContent,
} from '~/utils/plate-content.util'

const service = new LexicalService()

const envelopeOf = (children: unknown[]) =>
  JSON.stringify(createEnvelope({ children } as any))
const paragraph = (...children: unknown[]) => ({ type: 'paragraph', children })
const withLink = (url: string) =>
  envelopeOf([
    paragraph(
      { text: 'see ' },
      { type: 'link', url, children: [{ text: 'docs' }] },
      { text: '' },
    ),
  ])
const drifted = (content: string) => {
  const envelope = JSON.parse(content)
  envelope.schema.fingerprint = 'fnv1a64:0000000000000000'
  return JSON.stringify(envelope)
}

const cover = 'https://img.example/cover.jpg'
const clip = 'https://blog.example/objects/file/clip.mp4'
const image = 'https://img.example/photo.webp'
const mediaDoc = envelopeOf([
  { type: 'image', url: image, alt: 'photo', children: [{ text: '' }] },
  {
    type: 'livePhoto',
    url: cover,
    videoUrl: clip,
    alt: 'live',
    children: [{ text: '' }],
  },
  paragraph({ text: 'tail' }),
])

describe('Plate content (Core side of @suzuri/editor)', () => {
  describe('schemas', () => {
    it('accepts plate as a content format and requires content for it', () => {
      expect(
        PostSchema.shape.contentFormat.parse(ContentFormat.Plate),
      ).toBe('plate')
      const missing = WriteBaseSchemaWithRefine.safeParse({
        title: 't',
        text: '',
        contentFormat: ContentFormat.Plate,
      })
      expect(missing.success).toBe(false)
      expect(missing.error?.issues[0].message).toBe(
        'content is required when contentFormat is plate',
      )
      expect(zPrefer.parse('plate')).toBe('plate')
    })
  })

  describe('populateText', () => {
    it('protects published Lexical bodies while letting drafts change format', () => {
      const existing = { contentFormat: ContentFormat.Lexical, content: '{"root":{}}' }
      for (const update of [
        { contentFormat: ContentFormat.Markdown, text: 'draft' },
        { contentFormat: ContentFormat.Plate, content: mediaDoc },
      ]) {
        expect(() => service.populateText(update, existing)).toThrow(/must be migrated/)
        expect(() => service.populateDraftText(update, existing)).not.toThrow()
      }
    })

    it('validates a Plate envelope and derives Markdown text', () => {
      const content = envelopeOf([
        { type: 'heading', level: 2, children: [{ text: '标题' }] },
        paragraph({ text: '运行 ' }, { text: 'pnpm dev', code: true }),
      ])
      const doc = { contentFormat: ContentFormat.Plate, content, text: '' }
      expect(service.populateText(doc)).toBe(true)
      expect(doc.text).toBe('## 标题\n\n运行 `pnpm dev`')
      expect(doc.content).toBe(content)
    })

    it('rejects temporary media on publish and retains it in editable drafts', () => {
      for (const [url, temporary] of [
        [image, 'data:image/png;base64,AA=='],
        [cover, 'blob:https://blog.example/cover'],
        [clip, 'data:video/mp4;base64,AA=='],
      ]) {
        const doc = { contentFormat: ContentFormat.Plate, content: mediaDoc.replace(url, temporary) }
        expect(() => service.populateText(doc)).toThrow(BadRequestException)
        expect(service.populateDraftText(doc)).toBe(true)
      }
      expect(() => service.populateText({ contentFormat: ContentFormat.Plate,
        content: withLink('blob:https://blog.example/link') })).toThrow(BadRequestException)
      expect(projectPlateContent(mediaDoc.replace(clip, '/objects/file/clip.mp4')).text).toContain('/objects/file/')
    })

    it('projects the full sample, including the live photo', () => {
      const doc = {
        contentFormat: ContentFormat.Plate,
        content: JSON.stringify(createEnvelope(SUZURI_SAMPLE_DOCUMENT)),
        text: '',
      }
      service.populateText(doc)
      expect(doc.text).toContain('[Live Photo](')
      expect(doc.text).toContain('```')
    })

    it('rejects unknown nodes, unsafe links, bare documents and broken JSON with 400', () => {
      const banner = envelopeOf([paragraph({ text: 'x' })]).replace(
        '"paragraph"',
        '"banner"',
      )
      const bare = JSON.stringify({ children: [paragraph({ text: 'x' })] })
      for (const content of [
        banner,
        withLink('javascript:alert(1)'),
        bare,
        '{not json',
      ]) {
        const doc = { contentFormat: ContentFormat.Plate, content, text: '' }
        expect(() => service.populateText(doc)).toThrow(BadRequestException)
        expect(() => service.populateText(doc)).toThrow(/Invalid Plate content/)
      }
    })

    it('restamps an envelope whose fingerprint drifted after a Suzuri upgrade', () => {
      const current = envelopeOf([paragraph({ text: 'hello' })])
      const doc = {
        contentFormat: ContentFormat.Plate,
        content: drifted(current),
        text: '',
      }
      service.populateText(doc)
      expect(JSON.parse(doc.content).schema).toEqual(
        JSON.parse(current).schema,
      )
      expect(doc.text).toBe('hello')
    })

    it('rejects a schema id or version it does not know, even when restamping', () => {
      const envelope = JSON.parse(envelopeOf([paragraph({ text: 'x' })]))
      for (const schema of [
        { ...envelope.schema, id: 'yozora' },
        { ...envelope.schema, version: 99 },
      ]) {
        const doc = {
          contentFormat: ContentFormat.Plate,
          content: JSON.stringify({ ...envelope, schema }),
          text: '',
        }
        expect(() => service.populateText(doc)).toThrow(/Invalid Plate content/)
      }
    })

    it('keeps the stored content when an update only touches other fields', () => {
      const existing = {
        contentFormat: ContentFormat.Plate,
        content: envelopeOf([paragraph({ text: 'kept' })]),
        text: 'kept',
      }
      const patch: { title: string; text?: string } = { title: 'new' }
      expect(service.populateText(patch as any, existing)).toBe(false)
      expect(patch.text).toBeUndefined()
    })

    it('requires content when switching a Markdown document to Plate', () => {
      const existing = { contentFormat: ContentFormat.Markdown, text: 'md' }
      expect(() =>
        service.populateText({ contentFormat: ContentFormat.Plate }, existing),
      ).toThrow('content is required when contentFormat is plate')
    })

    it('leaves Markdown and Lexical behaviour unchanged', () => {
      const markdown = { contentFormat: ContentFormat.Markdown, text: '# hi' }
      expect(service.populateText(markdown)).toBe(false)
      const lexical = {
        contentFormat: ContentFormat.Lexical,
        text: '',
        content: JSON.stringify({
          root: {
            type: 'root',
            version: 1,
            children: [
              {
                type: 'paragraph',
                version: 1,
                children: [{ type: 'text', version: 1, text: 'lexical' }],
              },
            ],
          },
        }),
      }
      expect(service.populateText(lexical)).toBe(true)
      expect(lexical.text).toBe('lexical')
    })
  })

  describe('populateDraftText', () => {
    it('keeps a well-formed draft envelope with a placeholder link and its last good text', () => {
      const existing = {
        contentFormat: ContentFormat.Plate,
        content: envelopeOf([paragraph({ text: 'see' })]),
        text: 'see',
      }
      const doc = { content: withLink('https://') }
      expect(service.populateDraftText(doc as any, existing)).toBe(true)
      expect(doc.content).toBe(withLink('https://'))
      expect((doc as any).text).toBe('see')
    })

    it('still rejects draft content that is not an envelope at all', () => {
      const doc = { contentFormat: ContentFormat.Plate, content: '{"a":1}' }
      expect(() => service.populateDraftText(doc as any)).toThrow(
        BadRequestException,
      )
    })
  })

  describe('media references', () => {
    it('collects images plus the live photo cover and clip', () => {
      expect(
        extractImagesFromContent({
          contentFormat: ContentFormat.Plate,
          content: mediaDoc,
          text: '![ignored](https://img.example/markdown-only.png)',
        }),
      ).toEqual([image, cover, clip])
    })

    it('returns nothing for empty or malformed content', () => {
      for (const content of [undefined, '', '{oops']) {
        expect(
          extractImagesFromContent({
            contentFormat: ContentFormat.Plate,
            content,
            text: '',
          }),
        ).toEqual([])
      }
    })
  })

  describe('content helpers', () => {
    it('treats Plate as rich content', () => {
      expect(isRichContent({ contentFormat: ContentFormat.Plate })).toBe(true)
      expect(isRichContent({ contentFormat: ContentFormat.Lexical })).toBe(true)
      expect(isRichContent({ contentFormat: ContentFormat.Markdown })).toBe(
        false,
      )
    })

    it('hashes the document, not the fingerprint', () => {
      const content = envelopeOf([paragraph({ text: 'same' })])
      const base = {
        title: 't',
        text: 'ignored',
        contentFormat: ContentFormat.Plate,
      }
      expect(
        computeContentHash({ ...base, content }, 'zh'),
      ).toBe(computeContentHash({ ...base, content: drifted(content) }, 'zh'))
      expect(computeContentHash({ ...base, content }, 'zh')).not.toBe(
        computeContentHash(
          { ...base, content: envelopeOf([paragraph({ text: 'other' })]) },
          'zh',
        ),
      )
      expect(canonicalizePlateContentForHash('{oops')).toBe('{oops')
    })

    it('drops the Markdown text only when the client prefers the stored rich format', () => {
      const doc = {
        contentFormat: ContentFormat.Plate,
        content: '{}',
        text: 'md',
      }
      expect(applyContentPreference(doc, 'plate')).not.toHaveProperty('text')
      expect(applyContentPreference(doc, 'lexical')).toHaveProperty('text')
      const lexical = { ...doc, contentFormat: ContentFormat.Lexical }
      expect(applyContentPreference(lexical, 'lexical')).not.toHaveProperty(
        'text',
      )
    })

    it('projectPlateContent returns the stored string untouched when nothing drifted', () => {
      const content = envelopeOf([paragraph({ text: 'x' })])
      expect(projectPlateContent(content).content).toBe(content)
    })
  })
})
