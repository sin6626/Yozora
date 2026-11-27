// Phase 0 spike: @suzuri/editor/schema works inside Core (Node 24, ESM, vitest + SWC).
import {
  applyTranslatedSegments,
  collectMedia,
  createEnvelope,
  extractTranslatableSegments,
  fromMarkdown,
  SUZURI_SAMPLE_DOCUMENT,
  toMarkdown,
  validateDocument,
} from '@suzuri/editor/schema'
import { describe, expect, it } from 'vitest'

const paragraph = (...children: Record<string, unknown>[]) => ({
  type: 'paragraph',
  children,
})

describe('@suzuri/editor schema spike', () => {
  it('accepts the sample document and its envelope', () => {
    const bare = validateDocument(SUZURI_SAMPLE_DOCUMENT)
    expect(bare.ok).toBe(true)
    const envelope = createEnvelope(SUZURI_SAMPLE_DOCUMENT)
    const result = validateDocument(JSON.stringify(envelope), {
      requireEnvelope: true,
    })
    expect(result).toMatchObject({ ok: true, fingerprintUpdated: false })
  })

  it('rejects fingerprint drift by default and restamps it on request', () => {
    const envelope = createEnvelope(SUZURI_SAMPLE_DOCUMENT)
    const stale = {
      ...envelope,
      schema: { ...envelope.schema, fingerprint: 'stale-fingerprint' },
    }
    expect(validateDocument(stale).ok).toBe(false)
    expect(validateDocument(stale, { fingerprintPolicy: 'strict' }).ok).toBe(
      false,
    )

    const restamped = validateDocument(stale, { fingerprintPolicy: 'restamp' })
    expect(restamped.ok).toBe(true)
    if (!restamped.ok) return
    expect(restamped.fingerprintUpdated).toBe(true)
    expect(restamped.envelope.schema.fingerprint).toBe(
      envelope.schema.fingerprint,
    )

    // restamp only forgives the fingerprint, never another schema or version
    const otherVersion = {
      ...stale,
      schema: { ...stale.schema, version: envelope.schema.version + 1 },
    }
    expect(
      validateDocument(otherVersion, { fingerprintPolicy: 'restamp' }).ok,
    ).toBe(false)
    const otherId = { ...stale, schema: { ...stale.schema, id: 'yozora' } }
    expect(validateDocument(otherId, { fingerprintPolicy: 'restamp' }).ok).toBe(
      false,
    )
  })

  it('rejects unknown nodes and javascript: links', () => {
    const unknown = validateDocument({
      children: [{ type: 'banner', children: [{ text: 'x' }] }],
    })
    expect(unknown.ok).toBe(false)

    const script = validateDocument({
      children: [
        paragraph({
          type: 'link',
          url: 'javascript:alert(1)',
          children: [{ text: 'click' }],
        }),
      ],
    })
    expect(script.ok).toBe(false)
  })

  it('projects the sample to Markdown and parses Markdown back', () => {
    const md = toMarkdown(SUZURI_SAMPLE_DOCUMENT)
    expect(md.ok).toBe(true)
    expect(md.markdown).toMatch(/^# /m)
    expect(md.markdown).toContain('```')
    expect(md.markdown).toContain('[Live Photo](')

    const parsed = fromMarkdown(
      '## 标题\n\n这是**加粗**和`行内代码`。\n\n```ts\nconst a = 1\n```\n',
    )
    expect(parsed.ok).toBe(true)
    expect(parsed.envelope?.schema.id).toBe('suzuri')
    const types = parsed.document?.children.map((node) => node.type)
    expect(types).toEqual(['heading', 'paragraph', 'codeBlock'])
    expect(validateDocument(parsed.envelope).ok).toBe(true)
  })

  it('collects images and live photos', () => {
    const media = collectMedia(SUZURI_SAMPLE_DOCUMENT)
    const kinds = media.map((ref) => ref.kind)
    expect(kinds).toContain('image')
    expect(kinds).toContain('live-photo')
    const live = media.find((ref) => ref.kind === 'live-photo')
    expect(live?.extra?.videoUrl).toMatch(/\.mp4$/)
  })

  it('round-trips translations without touching inline code', () => {
    const doc = {
      children: [
        paragraph(
          { text: '运行 ' },
          { text: 'pnpm dev', code: true },
          { text: ' 启动。' },
        ),
        {
          type: 'codeBlock',
          language: 'ts',
          children: [{ text: 'const a = 1' }],
        },
      ],
    }
    expect(validateDocument(doc).ok).toBe(true)
    const segments = extractTranslatableSegments(doc)
    expect(segments.map((s) => s.text)).toEqual(['运行 ', ' 启动。'])

    const translations = Object.fromEntries(
      segments.map((s) => [s.id, s.text === '运行 ' ? 'Run ' : ' to start.'] as const),
    )
    // a translation keyed at the inline-code leaf must be ignored
    translations['0.1'] = 'HACKED'
    const out = applyTranslatedSegments(doc, translations)
    const leaves = (out.document.children[0] as { children: { text: string }[] })
      .children
    expect(leaves.map((leaf) => leaf.text)).toEqual([
      'Run ',
      'pnpm dev',
      ' to start.',
    ])
  })
})
