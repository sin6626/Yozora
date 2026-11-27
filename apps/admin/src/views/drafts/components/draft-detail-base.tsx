import {
  Book as BookIcon,
  ChevronLeft,
  Code as CodeIcon,
  File as FileIcon,
  GitCompare,
  Pencil,
  RotateCcw,
  Trash2,
} from 'lucide-vue-next'
import {
  NButton,
  NEmpty,
  NPopconfirm,
  NScrollbar,
  NSpin,
  NTooltip,
} from 'naive-ui'
import { computed, defineComponent, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import type { DraftHistoryListItem, DraftModel } from '~/models/draft'
import type { PropType, VNode } from 'vue'
import type { VersionContent, VersionItem } from './draft-versions'

import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'

import { draftsApi } from '~/api/drafts'
import { SplitPanel, useMasterDetailLayout } from '~/components/layout'
import { RelativeTime } from '~/components/time/relative-time'
import { DraftRefType } from '~/models/draft'
import { RouteName } from '~/router/name'
import { diffTextOf } from '~/utils/plate-text'

import { buildVersionList } from './draft-versions'

export const refTypeConfig = {
  [DraftRefType.Post]: {
    label: '文章',
    icon: CodeIcon,
    editRoute: RouteName.EditPost,
  },
  [DraftRefType.Note]: {
    label: '手记',
    icon: BookIcon,
    editRoute: RouteName.EditNote,
  },
  [DraftRefType.Page]: {
    label: '页面',
    icon: FileIcon,
    editRoute: RouteName.EditPage,
  },
}

export interface DiffContentSlotProps {
  /** 选中的历史版本，带它自己的格式 */
  selected: VersionContent
  /** 草稿本身（当前版本） */
  current: VersionContent
  selectedVersion: number
  currentVersion: number
}

export const VersionListItem = defineComponent({
  name: 'VersionListItem',
  props: {
    item: {
      type: Object as PropType<VersionItem>,
      required: true,
    },
    isSelected: {
      type: Boolean,
      default: false,
    },
    onClick: {
      type: Function as PropType<() => void>,
      required: true,
    },
    onRestore: {
      type: Function as PropType<() => void>,
    },
    restoreLoading: {
      type: Boolean,
      default: false,
    },
  },
  setup(props) {
    return () => (
      <div
        class={[
          'group flex cursor-pointer items-center gap-3 px-4 py-2.5 transition-colors',
          props.isSelected
            ? 'bg-neutral-100 dark:bg-neutral-800'
            : 'hover:bg-neutral-50 dark:hover:bg-neutral-800/30',
        ]}
        onClick={props.onClick}
      >
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2">
            <span class="text-sm font-medium text-neutral-900 dark:text-neutral-100">
              v{props.item.version}
            </span>
            {props.item.isCurrent && (
              <span class="rounded bg-neutral-200 px-1.5 py-0.5 text-xs text-neutral-600 dark:bg-neutral-700 dark:text-neutral-300">
                当前
              </span>
            )}
            {props.item.isFullSnapshot !== undefined && (
              <span
                class={[
                  'rounded px-1.5 py-0.5 text-xs',
                  props.item.isFullSnapshot
                    ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-400'
                    : 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-400',
                ]}
                title={
                  props.item.isFullSnapshot
                    ? '全量快照，存储完整内容'
                    : '增量存储，仅保存与上一全量版本的差异'
                }
              >
                {props.item.isFullSnapshot ? '全量' : '增量'}
              </span>
            )}
            {props.item.refVersion !== undefined && (
              <span
                class="rounded bg-purple-100 px-1.5 py-0.5 text-xs text-purple-700 dark:bg-purple-900/50 dark:text-purple-400"
                title={`内容与 v${props.item.refVersion} 相同，无需存储`}
              >
                = v{props.item.refVersion}
              </span>
            )}
            {props.item.baseVersion !== undefined &&
              !props.item.isFullSnapshot && (
                <span
                  class="rounded bg-neutral-100 px-1.5 py-0.5 text-xs text-neutral-600 dark:bg-neutral-700 dark:text-neutral-400"
                  title={`基于 v${props.item.baseVersion} 的增量`}
                >
                  基于 v{props.item.baseVersion}
                </span>
              )}
            <span class="text-xs text-neutral-400 dark:text-neutral-500">
              <RelativeTime time={props.item.savedAt} />
            </span>
          </div>
          <p class="mt-0.5 truncate text-xs text-neutral-500 dark:text-neutral-400">
            {props.item.title || '无标题'}
          </p>
        </div>

        <div class="flex flex-shrink-0 items-center gap-2">
          {!props.item.isCurrent && props.onRestore && (
            <NPopconfirm
              positiveText="取消"
              negativeText="恢复"
              onNegativeClick={props.onRestore}
            >
              {{
                trigger: () => (
                  <NTooltip>
                    {{
                      trigger: () => (
                        <NButton
                          size="tiny"
                          quaternary
                          loading={props.restoreLoading}
                          class="opacity-0 group-hover:opacity-100"
                          onClick={(e: MouseEvent) => e.stopPropagation()}
                        >
                          {{
                            icon: () => (
                              <RotateCcw class="h-3.5 w-3.5 text-neutral-500" />
                            ),
                          }}
                        </NButton>
                      ),
                      default: () => '恢复此版本',
                    }}
                  </NTooltip>
                ),
                default: () => (
                  <span>确定要恢复到版本 {props.item.version}？</span>
                ),
              }}
            </NPopconfirm>
          )}
        </div>
      </div>
    )
  },
})

export const DraftDetailBase = defineComponent({
  name: 'DraftDetailBase',
  props: {
    draft: {
      type: Object as PropType<DraftModel>,
      required: true,
    },
    isMobile: {
      type: Boolean,
      default: false,
    },
    onBack: {
      type: Function as PropType<() => void>,
    },
    onDelete: {
      type: Function as PropType<(id: string) => void>,
      required: true,
    },
    diffContent: {
      type: Function as PropType<(props: DiffContentSlotProps) => VNode>,
      required: true,
    },
  },
  setup(props) {
    const router = useRouter()
    const queryClient = useQueryClient()
    const config = computed(() => refTypeConfig[props.draft.refType])
    const { isMobile: isInnerMobile } = useMasterDetailLayout()

    const showDiffPanel = ref(false)
    const selectedVersion = ref<number | null>(null)
    const selected = ref<VersionContent | null>(null)
    const isLoadingContent = ref(false)

    const { data: historyData, isLoading: historyLoading } = useQuery({
      queryKey: ['drafts', 'history', () => props.draft.id],
      queryFn: () => draftsApi.getHistory(props.draft.id),
      select: (res: any) =>
        Array.isArray(res) ? res : Array.isArray(res?.data) ? res.data : [],
    })

    const versionList = computed<VersionItem[]>(() =>
      historyData.value
        ? buildVersionList(
            props.draft,
            historyData.value as DraftHistoryListItem[],
          )
        : [],
    )

    const current = computed<VersionContent>(() => ({
      text: props.draft.text,
      content: props.draft.content,
      contentFormat: props.draft.contentFormat,
    }))

    const loadVersionContent = async (
      version: number,
    ): Promise<VersionContent | null> => {
      if (version === props.draft.version) return current.value
      try {
        const data = await draftsApi.getHistoryVersion(props.draft.id, version)
        return {
          text: data.text,
          content: data.content,
          contentFormat: data.contentFormat,
        }
      } catch (error) {
        console.error('Failed to load version:', error)
        return null
      }
    }

    // 默认选中最近的一个历史版本和当前版本对比
    watch(
      [() => props.draft.id, versionList],
      async ([, list]) => {
        const previous = list[1]
        if (previous) {
          selectedVersion.value = previous.version
          isLoadingContent.value = true
          selected.value = await loadVersionContent(previous.version)
          isLoadingContent.value = false
        } else {
          selectedVersion.value = null
          selected.value = null
        }
      },
      { immediate: true },
    )

    const handleSelectVersion = async (version: number) => {
      if (selectedVersion.value === version) {
        if (isInnerMobile.value) {
          showDiffPanel.value = true
        }
        return
      }
      selectedVersion.value = version
      isLoadingContent.value = true
      selected.value = await loadVersionContent(version)
      isLoadingContent.value = false

      if (isInnerMobile.value) {
        showDiffPanel.value = true
      }
    }

    const handleBackToVersionList = () => {
      showDiffPanel.value = false
    }

    const restoreMutation = useMutation({
      mutationFn: (version: number) =>
        draftsApi.restoreVersion(props.draft.id, version),
      onSuccess: () => {
        toast.success('版本已恢复')
        queryClient.invalidateQueries({ queryKey: ['drafts'] })
      },
      onError: () => {
        toast.error('恢复失败')
      },
    })

    const handleRestore = (version: number) => {
      restoreMutation.mutate(version)
    }

    const handleEdit = () => {
      router.push({
        name: config.value.editRoute,
        query: { draftId: props.draft.id },
      })
    }

    // 字数差按各自格式投影出的文字算（Plate 历史只存 content）
    const diffStats = computed(() => {
      if (!selected.value) return null
      const currentText = diffTextOf(current.value)
      const selectedText = diffTextOf(selected.value)
      if (!selectedText && !selected.value.content) return null
      const sameContent =
        selected.value.contentFormat === current.value.contentFormat &&
        (selected.value.content ?? '') === (current.value.content ?? '')
      return {
        diff: currentText.length - selectedText.length,
        isSame: currentText === selectedText && sameContent,
      }
    })

    const currentVersion = computed(() => versionList.value[0])
    const selectedVersionInfo = computed(() =>
      versionList.value.find((v) => v.version === selectedVersion.value),
    )

    const renderVersionList = () => (
      <>
        <div class="flex items-center gap-2 border-b border-neutral-200 px-4 py-2 dark:border-neutral-800">
          <GitCompare class="size-4 text-neutral-500" />
          <span class="text-sm font-medium text-neutral-700 dark:text-neutral-300">
            版本列表
          </span>
          <span class="text-xs text-neutral-400">
            ({versionList.value.length})
          </span>
        </div>
        <NScrollbar class="flex-1">
          <div>
            {versionList.value.map((item) => (
              <VersionListItem
                key={item.version}
                item={item}
                isSelected={selectedVersion.value === item.version}
                onClick={() => handleSelectVersion(item.version)}
                onRestore={
                  item.isCurrent ? undefined : () => handleRestore(item.version)
                }
                restoreLoading={restoreMutation.isPending.value}
              />
            ))}
          </div>
        </NScrollbar>
      </>
    )

    const renderDiffHeader = (showBack: boolean) => (
      <div
        class={[
          'flex flex-shrink-0 items-center justify-between border-b border-neutral-200 bg-white px-4 dark:border-neutral-800 dark:bg-neutral-900',
          showBack ? 'py-2' : 'h-10',
        ]}
      >
        <div class="flex items-center gap-2">
          {showBack && (
            <NButton
              quaternary
              circle
              size="small"
              onClick={handleBackToVersionList}
            >
              {{
                icon: () => <ChevronLeft class="size-4" />,
              }}
            </NButton>
          )}
          <div class="flex items-center gap-2 text-xs text-neutral-600 dark:text-neutral-400">
            {selectedVersionInfo.value && (
              <>
                <span>v{selectedVersion.value}</span>
                <span class="text-neutral-400">→</span>
                <span>v{currentVersion.value?.version} (当前)</span>
              </>
            )}
          </div>
        </div>

        {diffStats.value && !diffStats.value.isSame && (
          <div class="text-xs text-neutral-500">
            {diffStats.value.diff > 0
              ? `+${diffStats.value.diff}`
              : diffStats.value.diff}{' '}
            字
          </div>
        )}
      </div>
    )

    const renderDiffContent = (desktopEmpty: boolean) => {
      if (isLoadingContent.value) {
        return (
          <div class="flex h-full items-center justify-center">
            <NSpin />
          </div>
        )
      }

      if (desktopEmpty && !selectedVersion.value) {
        return (
          <div class="flex h-full flex-col items-center justify-center gap-3 border border-dashed border-neutral-300 bg-white dark:border-neutral-700 dark:bg-neutral-900">
            <div class="flex size-12 items-center justify-center rounded-full bg-neutral-100 dark:bg-neutral-800">
              <GitCompare class="size-6 text-neutral-500 dark:text-neutral-400" />
            </div>
            <p class="text-sm text-neutral-500 dark:text-neutral-400">
              选择一个历史版本查看差异
            </p>
          </div>
        )
      }

      if (diffStats.value?.isSame) {
        return (
          <div class="flex h-full flex-col items-center justify-center gap-3">
            <div class="flex size-12 items-center justify-center rounded-full bg-neutral-100 dark:bg-neutral-800">
              <GitCompare class="size-6 text-neutral-500 dark:text-neutral-400" />
            </div>
            <div class="text-center">
              <p class="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                与当前版本内容相同
              </p>
              {desktopEmpty && (
                <p class="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                  选择其他版本进行对比
                </p>
              )}
            </div>
          </div>
        )
      }

      if (
        selected.value &&
        (selected.value.text || selected.value.content) &&
        selectedVersion.value &&
        currentVersion.value
      ) {
        return (
          <div class="h-full overflow-hidden">
            {props.diffContent({
              selected: selected.value,
              current: current.value,
              selectedVersion: selectedVersion.value,
              currentVersion: currentVersion.value.version,
            })}
          </div>
        )
      }

      return (
        <div
          class={[
            'flex h-full flex-col items-center justify-center gap-3 p-4',
            desktopEmpty
              ? 'rounded-lg border border-dashed border-neutral-300 bg-white dark:border-neutral-700 dark:bg-neutral-900'
              : 'bg-white dark:bg-neutral-900',
          ]}
        >
          <p class="text-sm text-neutral-500 dark:text-neutral-400">
            无法加载版本内容
          </p>
        </div>
      )
    }

    return () => (
      <div class="flex h-full flex-col">
        <div class="flex h-12 flex-shrink-0 items-center justify-between border-b border-neutral-200 bg-white px-4 py-3 dark:border-neutral-800 dark:bg-neutral-900">
          <div class="flex items-center gap-3">
            {props.isMobile && props.onBack && (
              <NButton quaternary circle size="small" onClick={props.onBack}>
                {{
                  icon: () => <ChevronLeft class="size-4" />,
                }}
              </NButton>
            )}
            <div class="flex flex-col">
              <h3 class="text-base font-semibold text-neutral-900 dark:text-neutral-100">
                {props.draft.title || '无标题'}
              </h3>
              <div class="flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
                <span>{config.value.label}</span>
                <span>·</span>
                <span>v{props.draft.version}</span>
                <span>·</span>
                <RelativeTime time={props.draft.updated} />
              </div>
            </div>
          </div>

          <div class="flex items-center gap-2">
            <NButton size="small" onClick={handleEdit}>
              {{
                icon: () => <Pencil class="h-3.5 w-3.5" />,
                default: () => '编辑',
              }}
            </NButton>
            <NPopconfirm
              positiveText="取消"
              negativeText="删除"
              onNegativeClick={() => props.onDelete(props.draft.id)}
            >
              {{
                trigger: () => (
                  <NButton size="small" quaternary>
                    {{
                      icon: () => <Trash2 class="h-3.5 w-3.5 text-red-500" />,
                    }}
                  </NButton>
                ),
                default: () => (
                  <span class="max-w-48">
                    确定要删除草稿「{props.draft.title || '无标题'}」？
                  </span>
                ),
              }}
            </NPopconfirm>
          </div>
        </div>

        <div class="min-h-0 flex-1">
          {historyLoading.value ? (
            <div class="flex h-full items-center justify-center">
              <NSpin size="large" />
            </div>
          ) : versionList.value.length === 0 ? (
            <div class="flex h-full items-center justify-center">
              <NEmpty description="暂无历史版本" />
            </div>
          ) : isInnerMobile.value ? (
            <div class="relative h-full w-full overflow-hidden">
              <div
                class={[
                  'absolute inset-0 w-full transition-transform duration-300',
                  showDiffPanel.value && '-translate-x-full',
                ]}
              >
                <div class="flex h-full flex-col bg-white dark:bg-neutral-900">
                  {renderVersionList()}
                </div>
              </div>

              <div
                class={[
                  'absolute inset-0 w-full transition-transform duration-300',
                  !showDiffPanel.value && 'translate-x-full',
                ]}
              >
                <div class="flex h-full flex-col bg-neutral-50 dark:bg-neutral-950">
                  {renderDiffHeader(true)}
                  <div class="min-h-0 flex-1 overflow-hidden">
                    {renderDiffContent(false)}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <SplitPanel
              direction="horizontal"
              defaultSize={'300px'}
              min={'200px'}
              max={'300px'}
              resizeTriggerClass="z-[10]"
              class="h-full"
            >
              <div class="flex h-full flex-col bg-white dark:bg-neutral-900">
                {renderVersionList()}
              </div>
              <div class="flex h-full flex-col bg-neutral-50 dark:bg-neutral-950">
                {renderDiffHeader(false)}
                <div class="min-h-0 flex-1 overflow-hidden">
                  {renderDiffContent(true)}
                </div>
              </div>
            </SplitPanel>
          )}
        </div>
      </div>
    )
  },
})
