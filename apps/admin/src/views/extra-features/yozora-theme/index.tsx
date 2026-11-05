import { RefreshCw as RefreshIcon, Save as SaveIcon } from 'lucide-vue-next'
import { NAlert, NButton, NForm, NFormItem, NInput, NSkeleton, NTabPane, NTabs, NTag } from 'naive-ui'
import { computed, defineComponent, ref, watchEffect } from 'vue'
import { toast } from 'vue-sonner'

import { projectsApi } from '~/api/projects'
import { snippetsApi } from '~/api/snippets'
import { HeaderActionButton } from '~/components/button/header-action-button'
import { useLayout } from '~/layouts/content'
import type { ProjectModel } from '~/models/project'
import type { SnippetModel } from '~/models/snippet'
import { BusinessError } from '~/utils/request'

import { applyThemeChanges, readThemeForm, themeChanges } from './theme-form'
import type { FieldValue, ForeignLanguage, Language, TextField, ThemeForm } from './theme-form'

// Yozora（前台）的站点文案：编辑的就是“配置与云函数”里的 theme/yozora 片段，不另存一份。
// 保存后 Core 发 SNIPPET_UPDATE，前台经 Webhook 立即更新。
const tabs: { language: Language; label: string; hint: string }[] = [
  { language: 'zh', label: '中文', hint: '每项三种状态：默认（没写，前台用自带的文案）、自定义、不显示。把文字删光也是不显示。' },
  { language: 'en', label: 'English', hint: '没有译文时英文页面显示中文；也可以设成英文页面不显示这一项。' },
  { language: 'ja', label: '日本語', hint: '没有译文时日文页面显示中文；也可以设成日文页面不显示这一项。' },
]

// 每种状态在中文和外文里的说法
const states = {
  zh: { unset: '默认', unsetHint: '没写：前台显示自带的默认文案', hide: '不显示', reset: '恢复默认', custom: '自定义' },
  foreign: { unset: '显示中文', unsetHint: '没有译文：这种语言的页面显示中文', hide: '这种语言不显示', reset: '删掉译文', custom: '译文' },
}

const fieldLabels: Record<string, string> = {
  'hero.title': '首屏标题',
  'hero.description': '首屏说明',
  'footer.motto': '页脚那句话',
  copyright: '文章版权说明',
  'techStack.title': '技术栈标题',
  'techStack.description': '技术栈说明',
  'footer.icp': '萌备',
  'accounts.github': 'GitHub 用户名',
  'accounts.leetcode': '力扣用户名',
  siteDescription: '站点描述',
  projects: '作品',
}
const changeLabel = (path: string[]) => {
  const [first, language, ...rest] = path
  if (first === 'i18n') return `${language === 'en' ? 'English' : '日本語'}：${fieldLabels[rest.join('.')] ?? fieldLabels[rest[0]] ?? rest.join('.')}`
  return fieldLabels[path.join('.')] ?? path.join('.')
}

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
    const projects = ref<ProjectModel[]>([])
    const initial = ref<ThemeForm | null>(null)
    const form = ref<ThemeForm | null>(null)
    const loading = ref(true)
    const saving = ref(false)
    const error = ref('')

    const load = async () => {
      loading.value = true
      error.value = ''
      try {
        // ponytail: 作品超过 50 个时这里要翻页
        const [group, projectList] = await Promise.all([snippetsApi.getGroupSnippets('theme'), projectsApi.getList({ size: 50 })])
        const found = group.find((item) => item.name === 'yozora') ?? null
        snippet.value = found
        projects.value = projectList.data
        if (!found) {
          error.value = '还没有 theme/yozora 配置片段，请先在“配置与云函数”里新建（引用 theme、名称 yozora、类型 JSON）。'
          return
        }
        const projectIds = projects.value.map((project) => project.id)
        initial.value = readThemeForm(found.raw, projectIds)
        form.value = readThemeForm(found.raw, projectIds)
      } catch (cause) {
        error.value = `读取失败：${(cause as Error).message}`
      } finally {
        loading.value = false
      }
    }
    load()

    const dirty = computed(() => Boolean(form.value && initial.value && JSON.stringify(form.value) !== JSON.stringify(initial.value)))

    // 只把改过的几项套到“保存那一刻”的最新片段上，并要求 Core 确认片段在这之后没再被改（baseRaw）。
    // 同一项在打开表单后被别处改过：报冲突、不保存；只是别的项被改过：合并后保存；读和写之间又被改了：重读再试。
    const save = async () => {
      if (!snippet.value || !form.value || !initial.value) return
      saving.value = true
      try {
        const changes = themeChanges(initial.value, form.value)
        for (let attempt = 0; attempt < 3; attempt++) {
          const latest = await snippetsApi.getById(snippet.value.id)
          const result = applyThemeChanges(snippet.value.raw, latest.raw, changes)
          if (result.raw === undefined) {
            toast.error(`这几项在你打开页面后已在别处被改过：${result.conflicts.map(changeLabel).join('、')}。点“重新读取”看最新内容（这里没保存的修改会丢掉）。`)
            return
          }
          const { id, created, modified, updated, ...rest } = latest as SnippetModel & { created?: string; modified?: string; updated?: string }
          try {
            await snippetsApi.update(id, { ...rest, raw: result.raw, baseRaw: latest.raw })
          } catch (cause) {
            if (cause instanceof BusinessError && cause.statusCode === 409) continue
            throw cause
          }
          toast.success('已保存，前台马上更新')
          await load()
          return
        }
        toast.error('保存失败：片段一直在被别处修改，请稍后再试')
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

    // 输入框 + 当前状态 + 切换按钮：没写时可以直接设成不显示，写了的可以改回默认
    const input = (value: FieldValue, update: (next: FieldValue) => void, placeholder: string, rows?: number, kind: keyof typeof states = 'zh') => {
      const words = states[kind]
      const state = value === null ? 'unset' : value.trim() === '' ? 'hide' : 'custom'
      return (
        <div class="flex w-full flex-col gap-1.5">
          <NInput
            value={value ?? ''}
            onUpdateValue={update}
            placeholder={value === null ? `${words.unsetHint}（例：${placeholder}）` : state === 'hide' ? '不显示这一项' : placeholder}
            type={rows ? 'textarea' : 'text'}
            autosize={rows ? { minRows: rows } : undefined}
          />
          <div class="flex items-center gap-2 text-xs">
            <NTag size="small" bordered={false} type={state === 'custom' ? 'success' : state === 'hide' ? 'warning' : 'default'}>
              {state === 'unset' ? words.unset : state === 'hide' ? words.hide : words.custom}
            </NTag>
            {state === 'unset' ? (
              <NButton size="tiny" quaternary onClick={() => update('')}>设为{words.hide}</NButton>
            ) : (
              <NButton size="tiny" quaternary onClick={() => update(null)}>{words.reset}</NButton>
            )}
          </div>
        </div>
      )
    }

    // 站点描述（中文在 设置 → SEO）和作品名、介绍（中文在作品页）的外文版：留空 = 没有译文，显示中文
    const translation = (current: FieldValue, update: (next: string) => void, original: string) => (
      <NInput value={current ?? ''} onUpdateValue={update} placeholder={original ? `留空显示中文：${original}` : '留空显示中文'} />
    )
    const translationFields = (value: ThemeForm, language: ForeignLanguage) => {
      const target = value.translations[language]
      return (
        <>
          <NFormItem label="站点描述（中文在 设置 → SEO → 网站描述）">
            {translation(target.siteDescription, (next) => (target.siteDescription = next), '')}
          </NFormItem>
          {projects.value.map((project) => (
            <NFormItem label={`作品：${project.name}`} key={project.id}>
              <div class="flex w-full flex-col gap-2">
                {translation(target.projects[project.id].name, (next) => (target.projects[project.id].name = next), project.name)}
                {translation(target.projects[project.id].description, (next) => (target.projects[project.id].description = next), project.description)}
              </div>
            </NFormItem>
          ))}
        </>
      )
    }

    return () => {
      if (loading.value) return <NSkeleton text repeat={6} />
      if (error.value || !form.value) return <NAlert type="warning">{error.value}</NAlert>
      const value = form.value
      return (
        <div class="mx-auto flex max-w-3xl flex-col gap-6">
          <p class="text-sm text-neutral-500">
            这里改的是“配置与云函数”里的 theme/yozora 片段；技术栈的图标行仍在那里的 techStack.rows 改（JSON）。保存后前台马上更新。
          </p>
          <NTabs type="segment" animated>
            {tabs.map((tab) => (
              <NTabPane name={tab.language} tab={tab.label} key={tab.language}>
                <p class="mb-3 text-xs text-neutral-500">{tab.hint}</p>
                <NForm labelPlacement="top">
                  {fields.map((field) => (
                    <NFormItem label={field.label} key={field.key}>
                      {input(value[tab.language][field.key], (next) => (value[tab.language][field.key] = next), field.placeholder, field.rows, tab.language === 'zh' ? 'zh' : 'foreign')}
                    </NFormItem>
                  ))}
                  {tab.language !== 'zh' && translationFields(value, tab.language)}
                </NForm>
              </NTabPane>
            ))}
          </NTabs>
          <NForm labelPlacement="top">
            <h3 class="mb-2 text-sm font-medium">各语言共用</h3>
            <NFormItem label="萌备号文字（文字和链接都填才显示）">{input(value.icpLabel, (next) => (value.icpLabel = next), '萌ICP备20265334号')}</NFormItem>
            <NFormItem label="萌备链接">{input(value.icpHref, (next) => (value.icpHref = next), 'https://icp.gov.moe/?keyword=20265334')}</NFormItem>
            <NFormItem label="页脚星带：GitHub 用户名">{input(value.github, (next) => (value.github = next), 'sin6626')}</NFormItem>
            <NFormItem label="页脚星带：力扣（中国站）用户名">{input(value.leetcode, (next) => (value.leetcode = next), 'sin-mt')}</NFormItem>
          </NForm>
        </div>
      )
    }
  },
})
