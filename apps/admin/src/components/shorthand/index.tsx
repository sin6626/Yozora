import {
  NButton,
  NForm,
  NFormItem,
  NInput,
  NRadioButton,
  NRadioGroup,
  NSelect,
  NSpace,
  useDialog,
} from 'naive-ui'
import { reactive, ref } from 'vue'
import { toast } from 'vue-sonner'
import type { RecentlyModel, RecentlyRefTypes } from '~/models/recently'
import type { SelectOption } from 'naive-ui'
import type { ThinkingType } from './thinking-form'

import { pagesApi, recentlyApi } from '~/api'
import { searchApi } from '~/api/search'

import {
  autofill,
  draftFrom,
  problems,
  thinkingTypes,
  toPayload,
} from './thinking-form'

const refLabels: Record<RecentlyRefTypes, string> = {
  Post: '文章',
  Note: '手记',
  Page: '页面',
}

// 引用站内内容：输入关键词搜文章和手记（Core 的搜索接口），页面不多，取一次列表在本地按标题筛
function useRefSearch(initial: SelectOption[]) {
  const options = ref<SelectOption[]>(initial)
  const loading = ref(false)
  let pages: Promise<{ id: string; title: string }[]> | null = null
  let timer: ReturnType<typeof setTimeout> | undefined
  let latest = 0

  const search = (keyword: string) => {
    clearTimeout(timer)
    const query = keyword.trim()
    if (!query) return
    timer = setTimeout(async () => {
      const ticket = ++latest
      loading.value = true
      pages ??= pagesApi
        .getList({ size: 50 })
        .then((res) => res.data)
        .catch(() => [])
      const [posts, notes, pageList] = await Promise.all([
        searchApi
          .searchPosts({ keyword: query, size: 8 })
          .then((res) => res.data)
          .catch(() => []),
        searchApi
          .searchNotes({ keyword: query, size: 8 })
          .then((res) => res.data)
          .catch(() => []),
        pages,
      ])
      if (ticket !== latest) return
      options.value = [
        ...posts.map((item) => ({
          label: `文章｜${item.title}`,
          value: item.id,
        })),
        ...notes.map((item) => ({
          label: `手记｜${item.title}`,
          value: item.id,
        })),
        ...pageList
          .filter((item) => item.title.includes(query))
          .map((item) => ({ label: `页面｜${item.title}`, value: item.id })),
      ]
      loading.value = false
    }, 250)
  }
  return { options, loading, search }
}

export const useShorthand = () => {
  const modal = useDialog()

  // 新建和编辑共用：类型、看法、按类型填卡片信息、引用站内内容
  const open = (item?: RecentlyModel) => {
    const draft = reactive(draftFrom(item))
    const refs = useRefSearch(
      item?.ref && item.refType
        ? [
            {
              label: `${refLabels[item.refType]}｜${item.ref.title}`,
              value: item.ref.id,
            },
          ]
        : [],
    )

    return new Promise<RecentlyModel | null>((resolve, reject) => {
      const saving = ref(false)
      const save = async () => {
        const found = problems(draft)
        if (found.length) {
          toast.error(found[0])
          return
        }
        saving.value = true
        try {
          const payload = toPayload(draft)
          const res = item
            ? await recentlyApi.update(item.id, payload)
            : await recentlyApi.create(payload)
          toast.success(item ? '修改成功' : '保存成功')
          dialog.destroy()
          resolve(res)
        } catch (error) {
          reject(error)
        } finally {
          saving.value = false
        }
      }

      const fields = () =>
        thinkingTypes.find((type) => type.value === draft.type)!.fields
      const dialog = modal.create({
        title: item ? '编辑思考' : '思考',
        type: item ? 'info' : 'success',
        style: { width: 'min(40rem, 92vw)' },

        content() {
          return (
            <NForm
              labelPlacement="top"
              size="small"
              requireMarkPlacement="right"
              class="thinking-editor"
            >
              <NFormItem label="类型" showFeedback={false} class="mb-3">
                <NRadioGroup
                  value={draft.type}
                  onUpdateValue={(value: ThinkingType) => {
                    draft.type = value
                  }}
                  size="small"
                  aria-label="思考的类型"
                >
                  {thinkingTypes.map((type) => (
                    <NRadioButton
                      key={type.value}
                      value={type.value}
                      label={type.label}
                    />
                  ))}
                </NRadioGroup>
              </NFormItem>

              <NFormItem
                label="看法"
                required={draft.type === 'text'}
                showFeedback={false}
                class="mb-3"
              >
                <NInput
                  type="textarea"
                  value={draft.content}
                  onUpdateValue={(value) => {
                    draft.content = value
                  }}
                  placeholder={
                    draft.type === 'text'
                      ? '想到了什么'
                      : '读完、看完、听完的想法，可以不写'
                  }
                  autosize={{ minRows: 4, maxRows: 12 }}
                  aria-label="看法"
                />
              </NFormItem>

              {fields().length > 0 && (
                <div
                  class="grid grid-cols-1 gap-x-3 sm:grid-cols-2"
                  role="group"
                  aria-label="引用的东西"
                >
                  {fields().map((field) => (
                    <NFormItem
                      key={field.key}
                      label={field.label}
                      required={field.required}
                      showFeedback={false}
                      class={[
                        'mb-3',
                        field.kind === 'textarea' || field.key === 'url'
                          ? 'sm:col-span-2'
                          : '',
                      ]}
                    >
                      <NInput
                        type={field.kind === 'textarea' ? 'textarea' : 'text'}
                        autosize={
                          field.kind === 'textarea'
                            ? { minRows: 2, maxRows: 5 }
                            : undefined
                        }
                        value={draft.fields[field.key] ?? ''}
                        onUpdateValue={(value) => {
                          draft.fields[field.key] = value
                        }}
                        onBlur={() => {
                          if (field.key === 'url')
                            draft.fields = autofill(draft.type, draft.fields)
                        }}
                        placeholder={field.placeholder}
                        inputProps={{
                          'aria-label': field.label,
                          name: field.key,
                        }}
                      />
                    </NFormItem>
                  ))}
                </div>
              )}

              <NFormItem label="引用站内内容" showFeedback={false}>
                <NSelect
                  value={draft.ref}
                  onUpdateValue={(value: string | null) => {
                    draft.ref = value
                  }}
                  options={refs.options.value}
                  loading={refs.loading.value}
                  onSearch={refs.search}
                  filterable
                  remote
                  clearable
                  placeholder="输入标题搜索文章、手记或页面，可不选"
                  aria-label="引用站内内容"
                />
              </NFormItem>
            </NForm>
          )
        },
        action() {
          return (
            <NSpace>
              <NButton
                round
                type="primary"
                loading={saving.value}
                onClick={save}
              >
                保存
              </NButton>
              <NButton
                round
                onClick={() => {
                  void dialog.destroy()
                  resolve(null)
                }}
              >
                取消
              </NButton>
            </NSpace>
          )
        },
      })
    })
  }

  return {
    create: () => open(),
    edit: (item: RecentlyModel) => open(item),
  }
}
