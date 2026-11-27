import {
  applyTranslatedSegments,
  extractHeadings,
  extractTranslatableSegments,
} from '@suzuri/editor/schema'
import { Injectable } from '@nestjs/common'

import { ContentFormat } from '~/shared/types/content-format.type'
import { projectPlateContent } from '~/utils/plate-content.util'

import type { IModelRuntime } from '../../runtime'
import type { ArticleContent } from '../ai-translation.types'
import type {
  ITranslationStrategy,
  TranslationResult,
  TranslationStrategyOptions,
} from '../translation-strategy.interface'
import { BaseTranslationStrategy } from './base-translation-strategy'

/**
 * Plate (@suzuri/editor) translation: every translatable text leaf is one entry
 * keyed by its path; code blocks, equations and inline code are skipped by
 * Suzuri and stay untouched. The translated envelope is re-validated (fingerprint
 * restamped) and projected to Markdown like a saved article.
 */
@Injectable()
export class PlateTranslationStrategy
  extends BaseTranslationStrategy
  implements ITranslationStrategy
{
  constructor() {
    super(PlateTranslationStrategy.name)
  }

  async translate(
    content: ArticleContent,
    targetLang: string,
    runtime: IModelRuntime,
    info: { model: string; provider: string },
    options: TranslationStrategyOptions,
  ): Promise<TranslationResult> {
    const { onToken, signal } = options
    const source = content.content!

    const entries: Record<string, string> = {}
    const entryMeta: Record<string, string> = {}
    for (const segment of extractTranslatableSegments(source)) {
      entries[segment.id] = segment.text
      entryMeta[segment.id] = 'text'
    }

    const metaEntries: Record<string, string> = { __title__: content.title }
    const metaEntryMeta: Record<string, string> = { __title__: 'meta.title' }
    if (content.subtitle) {
      metaEntries.__subtitle__ = content.subtitle
      metaEntryMeta.__subtitle__ = 'meta.subtitle'
    }
    if (content.summary) {
      metaEntries.__summary__ = content.summary
      metaEntryMeta.__summary__ = 'meta.summary'
    }
    if (content.tags?.length) {
      metaEntries.__tags__ = content.tags.join('|||')
      metaEntryMeta.__tags__ = 'meta.tags'
    }

    const translations = new Map<string, string>()
    let sourceLang: string
    if (Object.keys(entries).length === 0) {
      const result = await this.callChunkTranslation(
        targetLang,
        {
          documentContext: content.title,
          textEntries: metaEntries,
          segmentMeta: metaEntryMeta,
        },
        runtime,
        onToken,
        signal,
      )
      sourceLang = result.sourceLang
      for (const [id, text] of Object.entries(result.translations)) {
        translations.set(id, text)
      }
    } else {
      const outline = extractHeadings(source).map((heading) => heading.text)
      sourceLang = await this.translateChunkedEntries(
        targetLang,
        {
          documentContext: [content.title, ...outline].join('\n'),
          entries,
          entryMeta,
          metaEntries,
          metaEntryMeta,
        },
        translations,
        runtime,
        onToken,
        signal,
      )
    }

    const contentTranslations: Record<string, string> = {}
    for (const id of Object.keys(entries)) {
      const text = translations.get(id)
      if (text !== undefined) contentTranslations[id] = text
    }
    const envelope = applyTranslatedSegments(source, contentTranslations, {
      fingerprintPolicy: 'restamp',
    })
    const projected = projectPlateContent(JSON.stringify(envelope))
    const tags = translations.get('__tags__')

    return {
      sourceLang,
      title: translations.get('__title__') ?? content.title,
      text: projected.text,
      contentFormat: ContentFormat.Plate,
      content: projected.content,
      subtitle: translations.get('__subtitle__') ?? content.subtitle ?? null,
      summary: translations.get('__summary__') ?? content.summary ?? null,
      tags: tags ? tags.split('|||') : (content.tags ?? null),
      aiModel: info.model,
      aiProvider: info.provider,
    }
  }
}
