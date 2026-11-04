import { RefreshCw as RefreshIcon, Save as SaveIcon } from 'lucide-vue-next'
import { NAlert, NForm, NFormItem, NInput, NSkeleton, NTabPane, NTabs } from 'naive-ui'
import { computed, defineComponent, ref, watchEffect } from 'vue'
import { toast } from 'vue-sonner'

import { snippetsApi } from '~/api/snippets'
import { HeaderActionButton } from '~/components/button/header-action-button'
import { useLayout } from '~/layouts/content'
import type { SnippetModel } from '~/models/snippet'

import { readThemeForm, writeThemeForm } from './theme-form'
import type { Language, TextField, ThemeForm } from './theme-form'

// Yozora（前台）的站点文案：编辑的就是“配置与云函数”里的 theme/yozora 片段，不另存一份。
// 保存后 Core 发 SNIPPET_UPDATE，前台经 Webhook 立即更新。
const tabs: { language: Language; label: string; hint: string }[] = [
  { language: 'zh', label: '中文', hint: '写成空就是前台不显示这一项。' },
  { language: 'en', label: 'English', hint: '留空表示没有英文译文，英文页面显示中文。' },
  { language: 'ja', label: '日本語', hint: '留空表示没有日文译文，日文页面显示中文。' },
]

const fields: { key: TextField; label: string; placeholder: string; rows?: number }[] = [
  { key: 'heroTitle', label: '首屏标题', placeholder: '一个在深夜写代码的**大三学生**（**…** 是强调的字）' },
  { key: 'heroDescription', label: '首屏说明', placeholder: '一行一段', rows: 3 },
  { key: 'motto', label: '页脚那句话', placeholder: '头顶的星空，是心里的星空。' },
  { key: 'copyright', label: '文章版权说明', placeholder: '开了“版权注明”的文章末尾显示，例如：本文采用 CC BY-NC-SA 4.0 许可', rows: 2 },
  { key: 'techTitle', label: '技术栈标题', placeholder: '技术栈' },
  { key: 'techDescription', label: '技术栈说明', placeholder: '平时在用、正在学的东西' },
]

export default defineComponent({
  name: 'YozoraThemeView',
  setup() {
    const snippet = ref<SnippetModel | null>(null)
    const initial = ref<ThemeForm | null>(null)
    const form = ref<ThemeForm | null>(null)
    const loading = ref(true)
    const saving = ref(false)
    const error = ref('')

    const load = async () => {
      loading.value = true
      error.value = ''
      try {
        const found = (await snippetsApi.getGroupSnippets('theme')).find((item) => item.name === 'yozora') ?? null
        snippet.value = found
        if (!found) {
          error.value = '还没有 theme/yozora 配置片段，请先在“配置与云函数”里新建（引用 theme、名称 yozora、类型 JSON）。'
          return
        }
        initial.value = readThemeForm(found.raw)
        form.value = readThemeForm(found.raw)
      } catch (cause) {
        error.value = `读取失败：${(cause as Error).message}`
      } finally {
        loading.value = false
      }
    }
    load()

    const dirty = computed(() => Boolean(form.value && initial.value && JSON.stringify(form.value) !== JSON.stringify(initial.value)))

    const save = async () => {
      if (!snippet.value || !form.value || !initial.value) return
      saving.value = true
      try {
        const { id, created, modified, ...rest } = snippet.value as SnippetModel & { created?: string; modified?: string }
        const raw = writeThemeForm(snippet.value.raw, initial.value, form.value)
        await snippetsApi.update(id, { ...rest, raw })
        toast.success('已保存，前台马上更新')
        await load()
      } catch (cause) {
        toast.error(`保存失败：${(cause as Error).message}`)
      } finally {
        saving.value = false
      }
    }

    const { setActions } = useLayout()
    watchEffect(() => {
      setActions(
        <>
          <HeaderActionButton icon={<RefreshIcon />} onClick={load} name="重新读取" />
          <HeaderActionButton icon={<SaveIcon />} onClick={save} name="保存" variant="primary" disabled={!dirty.value || saving.value} />
        </>,
      )
    })

    const input = (value: string, update: (next: string) => void, placeholder: string, rows?: number) => (
      <NInput
        value={value}
        onUpdateValue={update}
        placeholder={placeholder}
        type={rows ? 'textarea' : 'text'}
        autosize={rows ? { minRows: rows } : undefined}
      />
    )

    return () => {
      if (loading.value) return <NSkeleton text repeat={6} />
      if (error.value || !form.value) return <NAlert type="warning">{error.value}</NAlert>
      const value = form.value
      return (
        <div class="mx-auto flex max-w-3xl flex-col gap-6">
          <p class="text-sm text-neutral-500">
            这里改的是“配置与云函数”里的 theme/yozora 片段；技术栈的图标行仍在那里的 techStack.rows 改。保存后前台马上更新。
          </p>
          <NTabs type="segment" animated>
            {tabs.map((tab) => (
              <NTabPane name={tab.language} tab={tab.label} key={tab.language}>
                <p class="mb-3 text-xs text-neutral-500">{tab.hint}</p>
                <NForm labelPlacement="top">
                  {fields.map((field) => (
                    <NFormItem label={field.label} key={field.key}>
                      {input(value[tab.language][field.key], (next) => (value[tab.language][field.key] = next), field.placeholder, field.rows)}
                    </NFormItem>
                  ))}
                </NForm>
              </NTabPane>
            ))}
          </NTabs>
          <NForm labelPlacement="top">
            <h3 class="mb-2 text-sm font-medium">各语言共用</h3>
            <NFormItem label="萌备号文字">{input(value.icpLabel, (next) => (value.icpLabel = next), '萌ICP备20265334号')}</NFormItem>
            <NFormItem label="萌备链接">{input(value.icpHref, (next) => (value.icpHref = next), 'https://icp.gov.moe/?keyword=20265334')}</NFormItem>
            <NFormItem label="页脚星带：GitHub 用户名">{input(value.github, (next) => (value.github = next), '留空就不显示写代码的星')}</NFormItem>
            <NFormItem label="页脚星带：力扣（中国站）用户名">{input(value.leetcode, (next) => (value.leetcode = next), '留空就不显示刷题的星')}</NFormItem>
          </NForm>
        </div>
      )
    }
  },
})
