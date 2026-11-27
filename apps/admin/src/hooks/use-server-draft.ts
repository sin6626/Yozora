import { computed, onUnmounted, ref } from 'vue'
import type { DraftModel, DraftRefType, TypeSpecificData } from '~/models/draft'

import { draftsApi } from '~/api'
import { isRichFormat } from '~/shared/types/base'
import { hasRichContent, richContentForComparison } from '~/utils/rich-content'

export interface DraftData {
  title: string
  text: string
  contentFormat?: 'markdown' | 'lexical' | 'plate'
  content?: string
  images?: any[]
  meta?: Record<string, any>
  typeSpecificData: TypeSpecificData
}

export const useServerDraft = (
  refType: DraftRefType,
  options: {
    /** 关联的已发布内容 ID（编辑模式） */
    refId?: string
    /** 当前草稿 ID（从 URL 获取） */
    draftId?: string
    /** 自动保存间隔（毫秒） */
    interval?: number
    /** 获取当前数据的函数 */
    getData: () => DraftData
    /** 草稿首次创建时的回调（用于更新 URL） */
    onDraftCreated?: (draftId: string) => void
    /** title 为空使用默认值时的回调（用于同步 UI） */
    onTitleFallback?: (defaultTitle: string) => void
  },
) => {
  const {
    refId,
    interval = 10000,
    getData,
    onDraftCreated,
    onTitleFallback,
  } = options

  const draftId = ref<string | undefined>(options.draftId)
  const currentRefId = ref<string | undefined>(refId)
  const lastSavedVersion = ref(0)
  const isSaving = ref(false)
  const lastSavedTime = ref<Date | null>(null)
  const memoPreviousData = ref<string | null>(null)
  let pendingSave: Promise<void> | null = null
  let disposed = false
  let autoSaveTimer: ReturnType<typeof setInterval> | null = null

  const getSnapshot = (data: DraftData) =>
    JSON.stringify({
      ...data,
      text: isRichFormat(data.contentFormat) ? undefined : data.text,
      content: isRichFormat(data.contentFormat)
        ? richContentForComparison(data.content)
        : data.content,
    })

  const hasChanges = (data: DraftData) =>
    getSnapshot(data) !== memoPreviousData.value

  const hasContent = (data: DraftData) =>
    !!data.title.trim() ||
    (isRichFormat(data.contentFormat)
      ? hasRichContent(data.content)
      : !!data.text.trim())

  const doSave = (): Promise<void> => {
    if (disposed || pendingSave) return pendingSave ?? Promise.resolve()
    const data: DraftData = JSON.parse(JSON.stringify(getData()))
    if (!hasContent(data) && !memoPreviousData.value) return Promise.resolve()
    if (!hasChanges(data)) return Promise.resolve()

    if (!data.title.trim()) {
      data.title = 'Untitled'
      onTitleFallback?.(data.title)
    }
    const snapshot = getSnapshot(data)
    isSaving.value = true
    pendingSave = (async () => {
      try {
        const payload = {
          ...data,
          title: data.title.trim(),
          images: data.images?.filter((img) => img != null && img.src),
        }
        let response: DraftModel
        if (draftId.value) {
          response = await draftsApi.update(draftId.value, payload)
        } else {
          response = await draftsApi.create({
            ...payload,
            refType,
            refId: currentRefId.value,
          })
          draftId.value = response.id
          if (!disposed) onDraftCreated?.(response.id)
        }
        memoPreviousData.value = snapshot
        lastSavedVersion.value = response.version
        lastSavedTime.value = new Date()
      } catch (error) {
        console.error('[Draft] Save failed:', error)
      }
    })().finally(() => {
      isSaving.value = false
      pendingSave = null
    })
    return pendingSave
  }

  // 加载指定 ID 的草稿
  const loadDraftById = async (id: string): Promise<DraftModel | null> => {
    try {
      const draft = await draftsApi.getById(id)
      if (draft?.id) {
        draftId.value = draft.id
        lastSavedVersion.value = draft.version
        lastSavedTime.value = new Date(draft.updated)
        memoPreviousData.value = getSnapshot({
          title: draft.title,
          text: draft.text,
          contentFormat: draft.contentFormat,
          content: draft.content,
          images: draft.images,
          meta: draft.meta,
          typeSpecificData: draft.typeSpecificData || {},
        })
        // 更新关联的已发布内容 ID
        if (draft.refId) {
          currentRefId.value = draft.refId
        }
      }
      return draft
    } catch {
      return null
    }
  }

  // 按关联内容加载草稿
  const loadDraftByRef = async (
    type: DraftRefType,
    id: string,
  ): Promise<DraftModel | null> => {
    try {
      const draft = await draftsApi.getByRef(type, id)
      if (draft?.id) {
        draftId.value = draft.id
        lastSavedVersion.value = draft.version
        lastSavedTime.value = new Date(draft.updated)
        memoPreviousData.value = getSnapshot({
          title: draft.title,
          text: draft.text,
          contentFormat: draft.contentFormat,
          content: draft.content,
          images: draft.images,
          meta: draft.meta,
          typeSpecificData: draft.typeSpecificData || {},
        })
      }
      return draft
    } catch {
      return null
    }
  }

  // 获取新建草稿列表（无关联的草稿）
  const getNewDrafts = async (type: DraftRefType): Promise<DraftModel[]> => {
    try {
      return await draftsApi.getNewDrafts(type)
    } catch {
      return []
    }
  }

  // 创建新草稿（仅用于需要立即获取 draftId 的场景）
  const createDraft = async (
    initialTitle?: string,
  ): Promise<DraftModel | null> => {
    try {
      const response = await draftsApi.create({
        refType,
        refId: currentRefId.value,
        title: initialTitle?.trim() || 'Untitled',
        text: '',
        typeSpecificData: {},
      })
      draftId.value = response.id
      lastSavedVersion.value = response.version
      lastSavedTime.value = new Date(response.updated || response.created)
      return response
    } catch {
      return null
    }
  }

  // 删除草稿
  const deleteDraft = async () => {
    if (!draftId.value) return

    try {
      await draftsApi.delete(draftId.value)
      draftId.value = undefined
      lastSavedVersion.value = 0
      lastSavedTime.value = null
      memoPreviousData.value = null
    } catch (error) {
      console.error('[Draft] Delete failed:', error)
    }
  }

  // 开始自动保存
  const startAutoSave = () => {
    stopAutoSave()
    autoSaveTimer = setInterval(() => {
      const data = getData()
      if (hasChanges(data)) {
        void doSave()
      }
    }, interval)
  }

  // 停止自动保存
  const stopAutoSave = () => {
    if (autoSaveTimer) {
      clearInterval(autoSaveTimer)
      autoSaveTimer = null
    }
  }

  const saveImmediately = async () => {
    while (pendingSave) await pendingSave
    await doSave()
  }

  // 更新记忆数据（用于初始化后同步）
  const syncMemory = () => {
    memoPreviousData.value = getSnapshot(getData())
  }

  // 检查当前数据是否与已保存的草稿一致
  const checkIsSynced = (): boolean => {
    const data = getData()
    // 如果没有任何内容且没有保存过，视为同步
    if (!hasContent(data) && !memoPreviousData.value) return true
    return !hasChanges(data)
  }

  // 组件卸载时停止自动保存
  onUnmounted(() => {
    disposed = true
    stopAutoSave()
  })

  return {
    draftId: computed(() => draftId.value),
    /** 关联的已发布内容 ID（从草稿加载后更新） */
    refId: computed(() => currentRefId.value),
    isSaving: computed(() => isSaving.value),
    lastSavedTime: computed(() => lastSavedTime.value),
    lastSavedVersion: computed(() => lastSavedVersion.value),
    hasUnsavedChanges: computed(() => !checkIsSynced()),

    saveDraft: doSave,
    saveImmediately,
    loadDraftById,
    loadDraftByRef,
    getNewDrafts,
    createDraft,
    deleteDraft,
    startAutoSave,
    stopAutoSave,
    syncMemory,
    checkIsSynced,
  }
}
