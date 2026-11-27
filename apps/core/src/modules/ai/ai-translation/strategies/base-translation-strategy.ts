/* eslint-disable unicorn/better-regex */
import { Logger } from '@nestjs/common'
import JSON5 from 'json5'

import { throwIfAborted } from '~/utils/abort.util'
import {
  extractFirstJsonObject,
  extractLastJsonObject,
} from '~/utils/json.util'

import { AI_PROMPTS } from '../../ai.prompts'
import type { IModelRuntime } from '../../runtime'

export abstract class BaseTranslationStrategy {
  protected readonly logger: Logger

  constructor(loggerContext: string) {
    this.logger = new Logger(loggerContext)
  }

  protected parseModelJson<T extends Record<string, any>>(
    rawText: string,
    context: string,
  ): T {
    const trimmed = rawText.trim()
    const candidates = new Set<string>()

    const addCandidate = (value: string | null | undefined) => {
      if (!value) return
      const text = value.trim()
      if (!text) return
      candidates.add(text)
    }

    addCandidate(trimmed)

    const codeFenceMatch = trimmed.match(
      // eslint-disable-next-line regexp/no-super-linear-backtracking
      /^```(?:json|JSON)?\s*([\s\S]*?)\s*```$/,
    )
    addCandidate(codeFenceMatch?.[1])
    addCandidate(extractFirstJsonObject(trimmed))
    addCandidate(extractLastJsonObject(trimmed))
    if (codeFenceMatch?.[1]) {
      addCandidate(extractFirstJsonObject(codeFenceMatch[1]))
    }

    let lastError: unknown

    for (const candidate of candidates) {
      try {
        return JSON.parse(candidate) as T
      } catch (error) {
        // eslint-disable-next-line no-useless-assignment
        lastError = error
      }
      try {
        return JSON5.parse(candidate) as T
      } catch (error) {
        lastError = error
      }
    }

    this.logger.warn(
      `${context}: failed to parse model JSON. length=${rawText.length} head=${JSON.stringify(
        trimmed.slice(0, 240),
      )} tail=${JSON.stringify(trimmed.slice(-240))}`,
    )

    throw new Error(
      `${context}: invalid JSON output (${
        lastError instanceof Error ? lastError.message : String(lastError)
      })`,
    )
  }

  protected async callChunkTranslation(
    targetLang: string,
    chunk: {
      documentContext: string
      textEntries: Record<string, string>
      segmentMeta?: Record<string, string>
    },
    runtime: IModelRuntime,
    onToken?: (count?: number) => Promise<void>,
    signal?: AbortSignal,
  ): Promise<{ sourceLang: string; translations: Record<string, string> }> {
    const { systemPrompt, prompt, reasoningEffort } =
      AI_PROMPTS.translationChunk(targetLang, chunk)

    const messages = [
      { role: 'system' as const, content: systemPrompt },
      { role: 'user' as const, content: prompt },
    ]

    let fullText = ''
    if (runtime.generateTextStream) {
      for await (const c of runtime.generateTextStream({
        messages,
        temperature: 0.3,
        maxRetries: 2,
        reasoningEffort,
        signal,
      })) {
        throwIfAborted(signal)
        fullText += c.text
        if (onToken) await onToken()
      }
    } else {
      const result = await runtime.generateText({
        messages,
        temperature: 0.3,
        maxRetries: 2,
        reasoningEffort,
        signal,
      })
      fullText = result.text
    }

    return this.parseModelJson<{
      sourceLang: string
      translations: Record<string, string>
    }>(fullText, 'callChunkTranslation')
  }

  /** Translates content entries in token-bounded batches (meta entries ride in the first batch), retrying missing ids once. */
  protected async translateChunkedEntries(
    targetLang: string,
    ctx: {
      documentContext: string
      entries: Record<string, string>
      entryMeta: Record<string, string>
      metaEntries: Record<string, string>
      metaEntryMeta: Record<string, string>
    },
    output: Map<string, string>,
    runtime: IModelRuntime,
    onToken?: (count?: number) => Promise<void>,
    signal?: AbortSignal,
  ): Promise<string> {
    const {
      documentContext,
      entries: allEntries,
      entryMeta: allEntryMeta,
      metaEntries,
      metaEntryMeta,
    } = ctx
    const allTranslations = output
    let sourceLang = ''
    const MAX_BATCH_TOKENS = 4000
    const estimateTokens = (text: string) => Math.ceil(text.length / 3)

    const batches: Array<{
      textEntries: Record<string, string>
      segmentMeta: Record<string, string>
    }> = []
    let currentBatch: Record<string, string> = { ...metaEntries }
    let currentBatchMeta: Record<string, string> = { ...metaEntryMeta }
    let currentTokens = Object.values(metaEntries).reduce(
      (s, t) => s + estimateTokens(t),
      0,
    )
    let hasContentEntry = false

    for (const [id, text] of Object.entries(allEntries)) {
      const tokens = estimateTokens(text)
      if (hasContentEntry && currentTokens + tokens > MAX_BATCH_TOKENS) {
        batches.push({
          textEntries: currentBatch,
          segmentMeta: currentBatchMeta,
        })
        currentBatch = {}
        currentBatchMeta = {}
        currentTokens = 0
      }
      currentBatch[id] = text
      currentBatchMeta[id] = allEntryMeta[id] ?? 'text'
      currentTokens += tokens
      hasContentEntry = true
    }
    if (Object.keys(currentBatch).length > 0) {
      batches.push({
        textEntries: currentBatch,
        segmentMeta: currentBatchMeta,
      })
    }

    for (const batch of batches) {
      throwIfAborted(signal)
      const result = await this.callChunkTranslation(
        targetLang,
        {
          documentContext,
          textEntries: batch.textEntries,
          segmentMeta: batch.segmentMeta,
        },
        runtime,
        onToken,
        signal,
      )
      if (!sourceLang) sourceLang = result.sourceLang
      for (const [id, text] of Object.entries(result.translations)) {
        allTranslations.set(id, text)
      }

      const missingIds = Object.keys(batch.textEntries).filter(
        (id) => !(id in result.translations),
      )
      if (missingIds.length > 0) {
        const retryEntries: Record<string, string> = {}
        const retryMeta: Record<string, string> = {}
        for (const id of missingIds) {
          retryEntries[id] = batch.textEntries[id]
          if (batch.segmentMeta[id]) {
            retryMeta[id] = batch.segmentMeta[id]
          }
        }
        try {
          const retryResult = await this.callChunkTranslation(
            targetLang,
            {
              documentContext,
              textEntries: retryEntries,
              segmentMeta: retryMeta,
            },
            runtime,
            onToken,
            signal,
          )
          for (const [id, text] of Object.entries(retryResult.translations)) {
            allTranslations.set(id, text)
          }
          const stillMissing = missingIds.filter(
            (id) => !(id in retryResult.translations),
          )
          for (const id of stillMissing) {
            this.logger.warn(
              `Translation missing for segment ${id} after retry, falling back to original`,
            )
          }
        } catch {
          for (const id of missingIds) {
            this.logger.warn(
              `Translation retry failed for segment ${id}, falling back to original`,
            )
          }
        }
      }
    }

    return sourceLang
  }
}
