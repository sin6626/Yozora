import { BadRequestException, Injectable } from '@nestjs/common'
import {
  ContentFormat,
  isRichContentFormat,
} from '~/shared/types/content-format.type'
import type { DiffStrategy } from './diff'
import { jsonDiffStrategy, textDiffStrategy } from './diff'
import { DraftHistoryModel } from './draft.model'

export interface DraftStateSnapshot {
  version: number
  title: string
  text: string
  contentFormat: ContentFormat
  content?: string
  typeSpecificData?: string
  savedAt: Date
}

export interface HistoryPushResult {
  entry: DraftHistoryModel
  history: DraftHistoryModel[]
}

export class UnrestorableDraftVersion extends BadRequestException {
  constructor(version: number) {
    super(`Cannot restore draft version ${version}: missing or invalid history body`)
  }
}

@Injectable()
export class DraftHistoryService {
  private readonly MAX_HISTORY_VERSIONS = 100
  private readonly FULL_SNAPSHOT_INTERVAL = 5
  private readonly DIFF_SIZE_THRESHOLD = 0.7

  pushHistoryEntry(
    snapshot: DraftStateSnapshot,
    existingHistory: DraftHistoryModel[],
  ): HistoryPushResult {
    const entry = this.createHistoryEntry(
      snapshot.version,
      snapshot.title,
      snapshot.text,
      snapshot.typeSpecificData,
      snapshot.savedAt,
      existingHistory,
      snapshot.contentFormat,
      snapshot.content,
    )

    const history = [entry, ...existingHistory]
    if (
      history.length > this.MAX_HISTORY_VERSIONS &&
      this.canTrimHistory(history)
    ) {
      return { entry, history: this.trimHistoryWithFullSnapshot(history) }
    }

    return { entry, history }
  }

  hasContentChange(
    current: {
      title: string
      text: string
      content?: string
      contentFormat?: ContentFormat
      typeSpecificData?: string
    },
    incoming: {
      title?: string
      text?: string
      content?: string
      contentFormat?: ContentFormat
      typeSpecificData?: Record<string, any>
    },
  ): boolean {
    if (
      incoming.contentFormat !== undefined &&
      incoming.contentFormat !== current.contentFormat
    ) {
      return true
    }

    if (incoming.title !== undefined && incoming.title !== current.title) {
      return true
    }

    if (
      incoming.typeSpecificData !== undefined &&
      JSON.stringify(incoming.typeSpecificData) !== current.typeSpecificData
    ) {
      return true
    }

    const format =
      incoming.contentFormat ?? current.contentFormat ?? ContentFormat.Markdown
    if (isRichContentFormat(format)) {
      return (
        incoming.content !== undefined && incoming.content !== current.content
      )
    }

    return incoming.text !== undefined && incoming.text !== current.text
  }

  resolveHistoryEntry(
    entry: DraftHistoryModel,
    allHistory: DraftHistoryModel[],
  ): DraftHistoryModel {
    if (entry.isFullSnapshot) {
      return entry
    }

    const format = entry.contentFormat ?? ContentFormat.Markdown
    if (isRichContentFormat(format)) {
      const restoredContent = this.restoreFromHistory(
        entry.version,
        allHistory,
        this.getStrategy(format),
        'content',
      )
      return {
        ...entry,
        content: restoredContent,
        isFullSnapshot: true,
      }
    }

    const restoredText = this.restoreFromHistory(
      entry.version,
      allHistory,
      this.getStrategy(format),
      'text',
    )
    const base = allHistory.find(h =>
      h.version < entry.version && h.isFullSnapshot &&
      (h.contentFormat ?? ContentFormat.Markdown) === format,
    )
    const content = entry.content ?? base?.content

    return {
      ...entry,
      text: restoredText,
      content,
      isFullSnapshot: true,
    }
  }

  getHistorySummary(history: DraftHistoryModel[]): Array<{
    version: number
    title: string
    savedAt: Date
    isFullSnapshot: boolean
  }> {
    return history.map((h) => ({
      version: h.version,
      title: h.title,
      savedAt: h.savedAt,
      isFullSnapshot: h.isFullSnapshot ?? true,
    }))
  }

  // ── Private ──

  private getStrategy(
    contentFormat: ContentFormat = ContentFormat.Markdown,
  ): DiffStrategy {
    return isRichContentFormat(contentFormat)
      ? jsonDiffStrategy
      : textDiffStrategy
  }

  private getPrimaryField(contentFormat: ContentFormat): 'text' | 'content' {
    return isRichContentFormat(contentFormat) ? 'content' : 'text'
  }

  private createHistoryEntry(
    version: number,
    title: string,
    text: string,
    typeSpecificData: string | undefined,
    savedAt: Date,
    existingHistory: DraftHistoryModel[],
    contentFormat: ContentFormat = ContentFormat.Markdown,
    content?: string,
  ): DraftHistoryModel {
    const strategy = this.getStrategy(contentFormat)
    const primaryField = this.getPrimaryField(contentFormat)
    const primaryValue =
      primaryField === 'content' ? (content ?? '') : (text ?? '')

    const baseSnapshot = this.findNearestFullSnapshot(existingHistory)
    const baseValue = baseSnapshot?.[primaryField]
    const canDiff = version % this.FULL_SNAPSHOT_INTERVAL !== 1 &&
      (baseSnapshot?.contentFormat ?? ContentFormat.Markdown) === contentFormat &&
      baseValue !== undefined
    const patchText = canDiff ? strategy.createPatch(baseValue, primaryValue) : undefined
    if (
      patchText === undefined ||
      (patchText === '' && baseValue !== primaryValue) ||
      strategy.isOversized(patchText, primaryValue, this.DIFF_SIZE_THRESHOLD)
    ) {
      return {
        version,
        title,
        text: primaryField === 'text' ? primaryValue : undefined,
        contentFormat,
        content: primaryField === 'content' ? primaryValue : content,
        typeSpecificData,
        savedAt,
        isFullSnapshot: true,
      }
    }

    if (!patchText) {
      const result: DraftHistoryModel = {
        version,
        title,
        contentFormat,
        typeSpecificData,
        savedAt,
        isFullSnapshot: false,
        refVersion: baseSnapshot?.version,
        baseVersion: baseSnapshot?.version,
      }
      if (primaryField === 'text') {
        const diffContent =
          content !== baseSnapshot?.content ? content : undefined
        result.content = diffContent
      }
      return result
    }

    const result: DraftHistoryModel = {
      version,
      title,
      contentFormat,
      typeSpecificData,
      savedAt,
      isFullSnapshot: false,
      baseVersion: baseSnapshot?.version,
    }

    if (primaryField === 'text') {
      result.text = patchText
      const diffContent =
        content !== baseSnapshot?.content ? content : undefined
      result.content = diffContent
    } else {
      result.content = patchText
    }

    return result
  }

  private findNearestFullSnapshot(
    history: DraftHistoryModel[],
  ): DraftHistoryModel | undefined {
    return history.find((h) => h.isFullSnapshot)
  }

  private restoreFromHistory(
    targetVersion: number,
    history: DraftHistoryModel[],
    strategy: DiffStrategy,
    field: 'text' | 'content',
    visited = new Set<number>(),
  ): string {
    const entry = history.find(h => h.version === targetVersion)
    if (!entry || visited.has(targetVersion)) throw new UnrestorableDraftVersion(targetVersion)
    visited.add(targetVersion)

    if (entry.isFullSnapshot) {
      const body = entry[field]
      if (body === undefined) throw new UnrestorableDraftVersion(targetVersion)
      return body
    }
    const baseVersion = entry.refVersion ?? entry.baseVersion
    const base = baseVersion === undefined
      ? history.find(h => h.version < targetVersion && h.isFullSnapshot)
      : history.find(h => h.version === baseVersion)
    if (!base || (base.contentFormat ?? ContentFormat.Markdown) !==
      (entry.contentFormat ?? ContentFormat.Markdown)) {
      throw new UnrestorableDraftVersion(targetVersion)
    }
    const baseValue = this.restoreFromHistory(base.version, history, strategy, field, visited)
    if (entry.refVersion !== undefined) return baseValue
    const patch = entry[field]
    if (!patch) throw new UnrestorableDraftVersion(targetVersion)
    const restored = strategy.applyPatch(baseValue, patch)
    if (restored === baseValue) throw new UnrestorableDraftVersion(targetVersion)
    return restored
  }

  private trimHistoryWithFullSnapshot(
    history: DraftHistoryModel[],
  ): DraftHistoryModel[] {
    if (history.length <= this.MAX_HISTORY_VERSIONS) {
      return history
    }

    const trimmed = history.slice(0, this.MAX_HISTORY_VERSIONS)

    const trimmedVersions = new Set<number>(trimmed.map((h) => h.version))
    for (const entry of trimmed) {
      const baseVersion = entry.refVersion ?? entry.baseVersion
      if (baseVersion !== undefined && !trimmedVersions.has(baseVersion)) {
        const format = entry.contentFormat ?? ContentFormat.Markdown
        const strategy = this.getStrategy(format)
        const field = this.getPrimaryField(format)
        const resolvedValue = this.restoreFromHistory(
          entry.version,
          history,
          strategy,
          field,
        )
        if (field === 'content') {
          entry.content = resolvedValue
        } else {
          entry.text = resolvedValue
        }
        entry.isFullSnapshot = true
        entry.refVersion = undefined
        entry.baseVersion = undefined
      }
    }

    const hasFullSnapshot = trimmed.some((h) => h.isFullSnapshot)
    if (!hasFullSnapshot) {
      const baselineFullSnapshot = history
        .slice(this.MAX_HISTORY_VERSIONS)
        .find((h) => h.isFullSnapshot)
      if (baselineFullSnapshot) {
        trimmed[trimmed.length - 1] = baselineFullSnapshot
      }
    }

    return trimmed
  }

  private canTrimHistory(history: DraftHistoryModel[]): boolean {
    return history[0]?.isFullSnapshot === true
  }
}
