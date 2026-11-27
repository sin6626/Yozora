import type { SuzuriDocumentInput, SuzuriEnvelope } from '@suzuri/editor/schema'
import type { PropType } from 'vue'
import type { Root } from 'react-dom/client'

import { SuzuriEditor } from '@suzuri/editor/react'
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { defineComponent, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import '@suzuri/editor/style.css'
import 'katex/dist/katex.min.css'

// Vue 挂 React 的 Suzuri 编辑器（阶段 0 试水，仿 RichEditor.tsx）：props 变了重新 render，
// 编辑内容由 onChange 回传带 schema 身份的信封。换 documentKey 会重建编辑器并清空撤销历史。
export const SuzuriEditorBridge = defineComponent({
  props: {
    initialValue: [String, Object, Array] as PropType<SuzuriDocumentInput>,
    documentKey: { type: String, default: 'default' },
    placeholder: String,
    font: String as PropType<'sans' | 'serif'>,
  },
  emits: {
    change: (_envelope: SuzuriEnvelope) => true,
  },
  setup(props, { emit }) {
    const container = ref<HTMLDivElement>()
    let root: Root | null = null
    let unmounting = false

    const render = () =>
      root?.render(
        createElement(SuzuriEditor, {
          initialValue: props.initialValue,
          documentKey: props.documentKey,
          placeholder: props.placeholder,
          font: props.font,
          variant: 'fullWidth',
          onChange: ({ envelope }) => {
            if (!unmounting) emit('change', envelope)
          },
        }),
      )

    onMounted(() => {
      root = createRoot(container.value!)
      render()
      watch(
        () => [props.documentKey, props.placeholder, props.font],
        render,
      )
    })

    onBeforeUnmount(() => {
      unmounting = true
      root?.unmount()
      root = null
    })

    return () => <div class="h-full w-full" ref={container} />
  },
})
