import type {
  SuzuriLivePhotoUploadHandler,
  SuzuriUploadHandler,
} from '@suzuri/editor/react'
import type { SuzuriDocumentInput, SuzuriEnvelope } from '@suzuri/editor/schema'
import type { PropType } from 'vue'
import type { Root } from 'react-dom/client'

import { SuzuriEditor } from '@suzuri/editor/react'
import { toMarkdown } from '@suzuri/editor/schema'
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { defineComponent, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import type { PlateInitialValue } from './initial-value'

import { prepareInitialValue } from './initial-value'

import '@fontsource-variable/noto-serif-sc'
import '@suzuri/editor/style.css'
import 'katex/dist/katex.min.css'
import './plate-editor.css'

// Vue 挂 React 的 Suzuri（Plate 54）编辑器，仿 rich/RichEditor.tsx：props 变了重新 render，
// 内容变化回传带 schema 身份的信封和它的 Markdown 投影（Core 保存时会按同样规则重新生成 text）。
// 换 documentKey 会重建编辑器并清空撤销历史。深浅色跟着 <html class="dark">（Suzuri 的变量认 .dark 祖先）。
// 初值先经 prepareInitialValue：占位链接等不合法的链接降成文字再打开并提示，修不好就只读显示原文，不让编辑器初始化时抛错。
export const PlateEditor = defineComponent({
  props: {
    initialValue: [String, Object, Array] as PropType<SuzuriDocumentInput>,
    documentKey: { type: String, default: 'default' },
    placeholder: String,
    variant: {
      type: String as PropType<'article' | 'note'>,
      default: 'article',
    },
    readOnly: Boolean,
    onUploadImage: Function as PropType<SuzuriUploadHandler>,
    onUploadLivePhoto: Function as PropType<SuzuriLivePhotoUploadHandler>,
  },
  emits: {
    change: (_envelope: SuzuriEnvelope) => true,
    textChange: (_text: string) => true,
  },
  setup(props, { emit, expose }) {
    const container = ref<HTMLDivElement>()
    let root: Root | null = null
    let unmounting = false
    const prepared = ref<PlateInitialValue>({ status: 'ok', value: undefined })

    const render = () => {
      prepared.value = prepareInitialValue(props.initialValue)
      const initial = prepared.value
      if (initial.status === 'invalid') {
        root?.render(
          createElement('pre', { className: 'plate-editor-raw' }, initial.text),
        )
        return
      }
      root?.render(
        createElement(SuzuriEditor, {
          initialValue: initial.value,
          documentKey: props.documentKey,
          placeholder: props.placeholder,
          font: props.variant === 'note' ? 'serif' : 'sans',
          variant: 'fullWidth',
          readOnly: props.readOnly,
          onUploadImage: props.onUploadImage,
          onUploadLivePhoto: props.onUploadLivePhoto,
          onChange: ({ envelope }) => {
            if (unmounting) return
            emit('change', envelope)
            const markdown = toMarkdown(envelope)
            if (markdown.ok) emit('textChange', markdown.markdown.trim())
          },
        }),
      )
    }

    onMounted(() => {
      root = createRoot(container.value!)
      render()
      watch(
        () => [
          props.documentKey,
          props.placeholder,
          props.variant,
          props.readOnly,
          props.onUploadImage,
          props.onUploadLivePhoto,
        ],
        render,
      )
    })

    onBeforeUnmount(() => {
      unmounting = true
      root?.unmount()
      root = null
    })

    expose({
      focus: () =>
        container.value
          ?.querySelector<HTMLElement>('[contenteditable="true"]')
          ?.focus(),
    })

    const notice = () => {
      const initial = prepared.value
      if (initial.status === 'repaired') {
        return `有 ${initial.links.length} 个链接地址还没填好（${initial.links.map((url) => url || '空地址').join('、')}），已改成普通文字打开。原稿没有改动，编辑后按新内容保存；需要链接请重新添加。`
      }
      if (initial.status === 'invalid') {
        return `这份正文不符合编辑器格式，只能只读查看，不会自动保存覆盖：${initial.error}`
      }
      return null
    }

    return () => (
      <div class="h-full w-full">
        {notice() && (
          <div
            class={[
              'plate-editor-notice',
              prepared.value.status === 'invalid' && 'is-error',
            ]}
            role={prepared.value.status === 'invalid' ? 'alert' : 'status'}
          >
            {notice()}
          </div>
        )}
        <div
          class={[
            'plate-editor h-full w-full',
            props.variant === 'note' && 'plate-editor-note',
          ]}
          ref={container}
        />
      </div>
    )
  },
})
