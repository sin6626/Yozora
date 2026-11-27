import type { DraftHistoryListItem, DraftModel } from '~/models/draft'

import { diffTextOf } from '~/utils/plate-text'

export interface VersionItem {
  version: number
  title: string
  savedAt: string
  isCurrent: boolean
  isFullSnapshot?: boolean
  refVersion?: number
  baseVersion?: number
}

/** 一个版本的正文，带它自己的格式（跨格式的历史里，每个版本可能是不同格式） */
export interface VersionContent {
  text: string
  content?: string
  contentFormat?: string
}

/**
 * 版本列表：第一项是草稿本身（Core 的 history 只存以前的版本，不含正在编辑的这一版），其余是历史，新的在前。
 * 只有草稿本身算“当前”，历史里最新的那一版也能恢复。
 */
export function buildVersionList(
  draft: Pick<DraftModel, 'version' | 'title' | 'updated'>,
  history: DraftHistoryListItem[],
): VersionItem[] {
  const past = history
    .filter((item) => item.version !== draft.version)
    .sort((a, b) => b.version - a.version)
    .map((item) => ({
      version: item.version,
      title: item.title,
      savedAt: item.savedAt,
      isCurrent: false,
      isFullSnapshot: item.isFullSnapshot,
      refVersion: item.refVersion,
      baseVersion: item.baseVersion,
    }))
  return [
    {
      version: draft.version,
      title: draft.title,
      savedAt: draft.updated,
      isCurrent: true,
    },
    ...past,
  ]
}

/** 两边都是 Lexical 才用富文本对比；否则每一边按自己的格式投影成 Markdown 再对比 */
export function diffSides(selected: VersionContent, current: VersionContent) {
  if (
    selected.contentFormat === 'lexical' &&
    current.contentFormat === 'lexical' &&
    selected.content &&
    current.content
  ) {
    return {
      kind: 'rich' as const,
      oldContent: selected.content,
      newContent: current.content,
    }
  }
  return {
    kind: 'text' as const,
    oldText: diffTextOf(selected),
    newText: diffTextOf(current),
  }
}
