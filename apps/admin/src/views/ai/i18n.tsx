/**
 * AI → i18n：界面文字和站点文案的译文（AI 从中文翻成“设置 → AI → i18n 语言”里的每种语言）。
 * 左边按分组看每种语言翻完没有，右边逐条改；接口约定见 docs/site-text-translation-plan.md。
 */
import {
  ArrowLeft as ArrowLeftIcon,
  Earth as EarthIcon,
  Inbox as InboxIcon,
  Loader2 as LoaderIcon,
  RefreshCw as RefreshIcon,
  Sparkles as SparklesIcon,
  X as XIcon,
} from 'lucide-vue-next'
import {
  NButton,
  NCheckbox,
  NCheckboxGroup,
  NInput,
  NPopconfirm,
} from 'naive-ui'
import {
  computed,
  defineComponent,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
  watchEffect,
} from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import type {
  I18nEntry,
  I18nGroup,
  I18nLanguageStats,
  I18nStatus,
  I18nTranslation,
} from '~/api/ai'
import type { PropType } from 'vue'

import { aiApi } from '~/api/ai'
import { HeaderActionButton } from '~/components/button/header-action-button'
import { MasterDetailLayout, useMasterDetailLayout } from '~/components/layout'
import { useLayout } from '~/hooks/use-layout'
import { RouteName } from '~/router/name'
import { BusinessError } from '~/utils/request'

// 分组名是界面文字条目名的第一段（前台 zh.ts 的顶层键）；site 是站点文案，works 是作品名与介绍（projects 是作品页的界面文字）
const GROUP_LABELS: Record<string, string> = {
  common: '通用',
  locale: '语言',
  notFound: '404',
  header: '页头',
  nav: '导航',
  mobileMenu: '手机菜单',
  footer: '页脚',
  hero: '首屏',
  home: '首页',
  activity: '最近发生的事',
  siteActions: '喜欢与订阅',
  subscribe: '订阅',
  account: '账号',
  loginErrors: '登录错误',
  theme: '主题与天空',
  moon: '月亮',
  notifications: '播报',
  articleActions: '文章操作',
  list: '列表',
  entry: '列表条目',
  posts: '文章',
  notes: '手记',
  pages: '页面',
  article: '文章详情',
  murmurs: '碎碎念',
  lightbox: '看图',
  contactCard: '名片',
  comments: '评论',
  chat: '边读边聊',
  commentForm: '评论表单',
  friends: '友链',
  projects: '作品页',
  says: '一言',
  thinking: '思考',
  timeline: '时间线',
  tweet: '推文',
  search: '搜索',
  site: '站点文案',
  works: '作品名与介绍',
}
const groupLabel = (group: string) => GROUP_LABELS[group] ?? group

// 站点文案的 key 是它在哪（hero.title、footer.motto、seo.description……），界面文字是条目名，作品是“作品名 <id>”
const entryLabel = (entry: I18nEntry) => entry.key

const LanguageTag = defineComponent({
  props: {
    lang: { type: String, required: true },
    stats: { type: Object as PropType<I18nLanguageStats>, required: true },
  },
  setup(props) {
    return () => {
      const { done, missing, review } = props.stats
      const state = missing > 0 ? 'missing' : review > 0 ? 'review' : 'done'
      return (
        <span
          data-lang={props.lang}
          data-state={state}
          title={`${props.lang.toUpperCase()}：已翻 ${done}，缺 ${missing}，待复核 ${review}`}
          class={[
            'rounded px-1 py-0.5',
            state === 'done' &&
              'bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400',
            state === 'missing' &&
              'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400',
            state === 'review' &&
              'bg-violet-50 text-violet-600 dark:bg-violet-950/50 dark:text-violet-400',
          ]}
        >
          {props.lang.toUpperCase()}
          {missing > 0 && ` 缺 ${missing}`}
          {review > 0 && ` 复核 ${review}`}
        </span>
      )
    }
  },
})

// 一条译文：失焦或回车保存，Esc 撤回；Core 校验不过（422）时显示原因并回到原值
const TranslationCell = defineComponent({
  props: {
    entry: { type: Object as PropType<I18nEntry>, required: true },
    lang: { type: String, required: true },
    onChange: {
      type: Function as PropType<(value: I18nTranslation | null) => void>,
      required: true,
    },
  },
  setup(props) {
    const current = computed(() => props.entry.translations[props.lang] ?? null)
    const draft = ref(current.value?.text ?? '')
    const error = ref('')
    const saving = ref(false)
    watch(
      () => current.value?.text,
      (text) => (draft.value = text ?? ''),
    )

    const target = () => ({
      keyPath: props.entry.keyPath,
      lookupKey: props.entry.lookupKey,
      lang: props.lang,
    })

    const save = async () => {
      const original = current.value?.text ?? ''
      if (draft.value === original) return
      // 清空请用右边的 ×，空着失焦当作没改
      if (!draft.value.trim()) {
        draft.value = original
        return
      }
      saving.value = true
      error.value = ''
      try {
        await aiApi.updateI18nEntry({ ...target(), text: draft.value })
        props.onChange({ text: draft.value, manual: true, needsReview: false })
        toast.success('已保存')
      } catch (e) {
        error.value = e instanceof Error ? e.message : String(e)
        draft.value = original
      } finally {
        saving.value = false
      }
    }

    const clear = async () => {
      await aiApi.deleteI18nEntry(target())
      error.value = ''
      props.onChange(null)
      toast.success('已清空')
    }

    return () => (
      <div class="space-y-1" data-cell={props.lang}>
        <NInput
          type="textarea"
          size="small"
          autosize={{ minRows: 1, maxRows: 6 }}
          value={draft.value}
          placeholder="缺译文"
          status={error.value ? 'error' : undefined}
          disabled={saving.value}
          onUpdateValue={(v: string) => (draft.value = v)}
          onBlur={save}
          onKeydown={(e: KeyboardEvent) => {
            if (e.isComposing) return
            if (e.key === 'Enter') {
              e.preventDefault()
              ;(e.target as HTMLElement).blur()
            }
            if (e.key === 'Escape') {
              draft.value = current.value?.text ?? ''
              ;(e.target as HTMLElement).blur()
            }
          }}
        />
        {error.value && (
          <p role="alert" class="text-xs text-red-600 dark:text-red-400">
            没保存：{error.value}
          </p>
        )}
        <div class="flex min-h-5 items-center gap-1.5 whitespace-nowrap text-xs">
          {current.value?.manual && (
            <span class="rounded bg-neutral-100 px-1.5 py-0.5 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
              已手改
            </span>
          )}
          {current.value?.needsReview && (
            <span class="rounded bg-violet-50 px-1.5 py-0.5 text-violet-600 dark:bg-violet-950/50 dark:text-violet-400">
              待复核
            </span>
          )}
          {saving.value && <span class="text-neutral-400">保存中…</span>}
          {current.value && (
            <NPopconfirm onPositiveClick={clear}>
              {{
                trigger: () => (
                  <button
                    type="button"
                    aria-label="清空这条译文"
                    title="清空这条译文"
                    class="ml-auto rounded p-0.5 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-600 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
                  >
                    <XIcon class="size-3.5" />
                  </button>
                ),
                default: () => '清空这条译文？清空后前台显示中文',
              }}
            </NPopconfirm>
          )}
        </div>
      </div>
    )
  },
})

export default defineComponent({
  name: 'AII18nPage',
  setup() {
    const route = useRoute()
    const router = useRouter()
    const { setActions } = useLayout()
    const { isMobile } = useMasterDetailLayout()

    const status = ref<I18nStatus | null>(null)
    const groups = ref<I18nGroup[]>([])
    const groupsLoading = ref(true)
    const selected = ref<string | null>((route.query.group as string) || null)
    const entries = ref<I18nEntry[]>([])
    const entriesLoading = ref(false)
    const showDetailOnMobile = ref(false)
    const generating = ref(false)

    const languages = computed(() => status.value?.languages ?? [])
    const canGenerate = computed(
      () => !!status.value?.enabled && languages.value.length > 0,
    )
    const notice = computed(() => {
      if (!status.value) return null
      if (!status.value.enabled)
        return '还没有开 AI i18n：前台只有中文，也不会自动生成翻译。'
      if (languages.value.length === 0)
        return '还没有填 i18n 语言：前台只有中文。'
      return null
    })

    const fetchGroups = async () => {
      groupsLoading.value = true
      try {
        groups.value = await aiApi.getI18nGroups()
      } finally {
        groupsLoading.value = false
      }
    }

    const fetchEntries = async (group: string) => {
      entriesLoading.value = true
      try {
        const list = await aiApi.getI18nEntries(group)
        if (selected.value === group) entries.value = list
      } finally {
        entriesLoading.value = false
      }
    }

    watch(
      selected,
      (group) => {
        router.replace({
          name: RouteName.AiI18n,
          query: group ? { group } : {},
        })
        entries.value = []
        if (group) fetchEntries(group)
      },
      { immediate: true },
    )

    // 生成是异步的：每 3 秒查一次状态，直到不再 running，再刷新分组和条目
    let timer: ReturnType<typeof setTimeout> | undefined
    const poll = () => {
      clearTimeout(timer)
      timer = setTimeout(checkStatus, 3000)
    }
    const checkStatus = async () => {
      try {
        status.value = await aiApi.getI18nStatus()
      } catch {
        generating.value = false
        return
      }
      if (status.value.running) {
        generating.value = true
        poll()
        return
      }
      if (!generating.value) return
      generating.value = false
      const run = status.value.lastRun
      toast.success(
        run
          ? `生成完成：新增 ${run.created}，失败 ${run.failed}，跳过 ${run.skipped}`
          : '生成完成',
      )
      fetchGroups()
      if (selected.value) fetchEntries(selected.value)
    }

    const startGenerate = async (options: {
      langs?: string[]
      onlyMissing?: boolean
    }) => {
      try {
        await aiApi.generateI18n(options)
        toast.success('已开始生成翻译')
      } catch (e) {
        // 409：已经有一次在跑，接着等它跑完
        if (!(e instanceof BusinessError && e.statusCode === 409)) return
      }
      generating.value = true
      poll()
    }

    const openGenerate = () => {
      const onlyMissing = ref(false)
      const langs = ref<string[]>([...languages.value])
      dialog.create({
        title: '生成翻译',
        content: () => (
          <div class="flex flex-col gap-4 pt-2">
            <NCheckbox
              checked={onlyMissing.value}
              onUpdateChecked={(v: boolean) => (onlyMissing.value = v)}
            >
              只翻缺的（不重翻中文改过的）
            </NCheckbox>
            <div>
              <p class="mb-2 text-sm text-neutral-600 dark:text-neutral-400">
                语言
              </p>
              <NCheckboxGroup
                value={langs.value}
                onUpdateValue={(v) => (langs.value = v as string[])}
              >
                <div class="flex flex-wrap gap-3">
                  {languages.value.map((lang) => (
                    <NCheckbox
                      key={lang}
                      value={lang}
                      label={lang.toUpperCase()}
                    />
                  ))}
                </div>
              </NCheckboxGroup>
            </div>
          </div>
        ),
        positiveText: '开始生成',
        negativeText: '取消',
        onPositiveClick: () => {
          if (langs.value.length === 0) {
            toast.warning('至少选一种语言')
            return false
          }
          startGenerate({
            langs:
              langs.value.length === languages.value.length
                ? undefined
                : langs.value,
            onlyMissing: onlyMissing.value || undefined,
          })
        },
      })
    }

    const refresh = () => {
      checkStatus()
      fetchGroups()
      if (selected.value) fetchEntries(selected.value)
    }

    onMounted(() => {
      checkStatus()
      fetchGroups()
      watchEffect(() => {
        setActions(
          <div class="flex items-center gap-2">
            <HeaderActionButton
              icon={
                generating.value ? (
                  <LoaderIcon class="animate-spin" />
                ) : (
                  <SparklesIcon />
                )
              }
              name={generating.value ? '正在生成翻译' : '生成翻译'}
              variant="primary"
              disabled={generating.value || !canGenerate.value}
              onClick={openGenerate}
            />
            <HeaderActionButton
              icon={<RefreshIcon />}
              name="刷新"
              onClick={refresh}
            />
          </div>,
        )
      })
    })
    onBeforeUnmount(() => clearTimeout(timer))

    // 分组里每种语言的统计；Core 还没算到的语言当作全缺
    const statsOf = (group: I18nGroup) => {
      const langs = languages.value.length
        ? languages.value
        : Object.keys(group.languages)
      return langs.map((lang) => ({
        lang,
        stats: group.languages[lang] ?? {
          done: 0,
          missing: group.total,
          review: 0,
        },
      }))
    }

    const selectGroup = (group: string) => {
      selected.value = group
      if (isMobile.value) showDetailOnMobile.value = true
    }

    const updateTranslation = (
      entry: I18nEntry,
      lang: string,
      value: I18nTranslation | null,
    ) => {
      entry.translations[lang] = value
      fetchGroups()
    }

    const GroupList = () => (
      <div class="flex h-full flex-col">
        <div class="flex h-12 shrink-0 items-center border-b border-neutral-200 px-4 dark:border-neutral-800">
          <h2 class="text-sm font-medium text-neutral-900 dark:text-neutral-100">
            分组
          </h2>
        </div>
        <div class="min-h-0 flex-1 overflow-y-auto">
          {groupsLoading.value && groups.value.length === 0 ? (
            <div class="flex items-center justify-center py-24">
              <LoaderIcon class="size-6 animate-spin text-neutral-400 dark:text-neutral-500" />
            </div>
          ) : groups.value.length === 0 ? (
            <div class="flex flex-col items-center justify-center px-6 py-24 text-center">
              <InboxIcon class="mb-4 h-10 w-10 text-neutral-300 dark:text-neutral-700" />
              <p class="text-sm text-neutral-500">还没有 i18n 条目</p>
              <p class="mt-1 text-xs text-neutral-400">
                前台推送界面文字、保存站点文案后会出现在这里
              </p>
            </div>
          ) : (
            groups.value.map((group) => (
              <button
                type="button"
                key={group.group}
                data-group={group.group}
                aria-current={selected.value === group.group || undefined}
                onClick={() => selectGroup(group.group)}
                class={[
                  'block w-full border-b border-neutral-100 px-4 py-3 text-left transition-colors last:border-b-0 dark:border-neutral-800/50',
                  selected.value === group.group
                    ? 'bg-neutral-100 dark:bg-neutral-800'
                    : 'hover:bg-neutral-50 dark:hover:bg-neutral-800/30',
                ]}
              >
                <div class="flex items-baseline gap-2">
                  <h3 class="truncate text-sm font-medium text-neutral-900 dark:text-neutral-100">
                    {groupLabel(group.group)}
                  </h3>
                  {groupLabel(group.group) !== group.group && (
                    <span class="truncate font-mono text-xs text-neutral-400">
                      {group.group}
                    </span>
                  )}
                </div>
                <div class="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-neutral-400">
                  <span>{group.total} 条</span>
                  <div class="flex flex-wrap gap-1">
                    {statsOf(group).map(({ lang, stats }) => (
                      <LanguageTag key={lang} lang={lang} stats={stats} />
                    ))}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    )

    const EntryTable = () => {
      const group = selected.value!
      return (
        <div class="flex h-full flex-col">
          <div class="flex h-12 shrink-0 items-center gap-3 border-b border-neutral-200 px-4 dark:border-neutral-800">
            {isMobile.value && (
              <button
                type="button"
                aria-label="返回"
                onClick={() => (showDetailOnMobile.value = false)}
                class="-ml-2 flex size-8 items-center justify-center rounded-md text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
              >
                <ArrowLeftIcon class="size-5" />
              </button>
            )}
            <h2 class="text-sm font-medium text-neutral-900 dark:text-neutral-100">
              {groupLabel(group)}
            </h2>
            <span class="text-xs text-neutral-400">
              {entries.value.length} 条
            </span>
          </div>
          <div class="min-h-0 flex-1 overflow-auto">
            {entriesLoading.value && entries.value.length === 0 ? (
              <div class="flex items-center justify-center py-24">
                <LoaderIcon class="size-6 animate-spin text-neutral-400 dark:text-neutral-500" />
              </div>
            ) : entries.value.length === 0 ? (
              <p class="py-24 text-center text-sm text-neutral-500">
                这一组没有条目
              </p>
            ) : (
              <table class="w-full border-collapse text-sm">
                <thead class="sticky top-0 z-10 bg-white dark:bg-neutral-900">
                  <tr class="border-b border-neutral-200 text-left text-xs font-medium text-neutral-500 dark:border-neutral-800 dark:text-neutral-400">
                    <th class="w-48 min-w-[10rem] px-4 py-2 font-medium">
                      条目
                    </th>
                    <th class="min-w-[10rem] px-4 py-2 font-medium">中文</th>
                    {languages.value.map((lang) => (
                      <th
                        key={lang}
                        class="min-w-[11rem] px-2 py-2 font-medium"
                      >
                        {lang.toUpperCase()}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {entries.value.map((entry) => (
                    <tr
                      key={`${entry.keyPath}|${entry.lookupKey}`}
                      data-entry={entry.key}
                      class="border-b border-neutral-100 align-top dark:border-neutral-800/50"
                    >
                      <td class="px-4 py-3">
                        <code class="break-all text-xs text-neutral-500 dark:text-neutral-400">
                          {entryLabel(entry)}
                        </code>
                      </td>
                      <td class="whitespace-pre-wrap px-4 py-3 text-neutral-900 dark:text-neutral-100">
                        {entry.source}
                      </td>
                      {languages.value.map((lang) => (
                        <td key={lang} class="px-2 py-2">
                          <TranslationCell
                            entry={entry}
                            lang={lang}
                            onChange={(value) =>
                              updateTranslation(entry, lang, value)
                            }
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )
    }

    const EmptyDetail = () => (
      <div class="flex h-full flex-col items-center justify-center bg-neutral-50 text-center dark:bg-neutral-950">
        <div class="mb-4 flex size-16 items-center justify-center rounded-full bg-neutral-100 dark:bg-neutral-800">
          <EarthIcon class="size-8 text-neutral-400" />
        </div>
        <h3 class="mb-1 text-base font-medium text-neutral-900 dark:text-neutral-100">
          选择一个分组
        </h3>
        <p class="text-sm text-neutral-500 dark:text-neutral-400">
          从左侧选择分组，查看和修改每种语言的译文
        </p>
      </div>
    )

    return () => (
      <div class="absolute inset-0 flex flex-col">
        {notice.value && (
          <div
            role="status"
            class="flex shrink-0 flex-wrap items-center gap-x-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300"
          >
            <span>{notice.value}</span>
            <RouterLink
              to={{ name: RouteName.Setting, query: { group: 'ai' } }}
              class="font-medium underline"
            >
              去“设置 → AI”打开
            </RouterLink>
          </div>
        )}
        <div class="relative min-h-0 flex-1">
          <MasterDetailLayout
            showDetailOnMobile={showDetailOnMobile.value}
            defaultSize="350px"
            min="300px"
            max="400px"
          >
            {{
              list: GroupList,
              // 返回 null 时布局不会退回 empty 插槽，空状态直接放在 detail 里
              detail: () => (selected.value ? <EntryTable /> : <EmptyDetail />),
            }}
          </MasterDetailLayout>
        </div>
      </div>
    )
  },
})
