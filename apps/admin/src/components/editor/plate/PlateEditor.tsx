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

import '@fontsource-variable/noto-serif-sc'
import '@suzuri/editor/style.css'
import 'katex/dist/katex.min.css'
import './plate-editor.css'

// Vue 挂 React 的 Suzuri（Plate 54）编辑器，仿 rich/RichEditor.tsx：props 变了重新 render，
// 内容变化回传带 schema 身份的信封和它的 Markdown 投影（Core 保存时会按同样规则重新生成 text）。
// 换 documentKey 会重建编辑器并清空撤销历史。深浅色跟着 <html class="dark">（Suzuri 的变量认 .dark 祖先）。
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

    const render = () =>
      root?.render(
        createElement(SuzuriEditor, {
          initialValue: props.initialValue,
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

    return () => (
      <div
        class={[
          'plate-editor h-full w-full',
          props.variant === 'note' && 'plate-editor-note',
        ]}
        ref={container}
      />
    )
  },
})
