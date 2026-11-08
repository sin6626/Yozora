import { LivePhotoNode, PhotoViewContext } from '@yozora/live-photo/haklex'
import '@yozora/live-photo/style.css'
import { EditPhoto, LivePhotoPlugin } from './live-photo'
import type { RichEditorVariant } from '@haklex/rich-editor'
import { restoreBlockIds } from '@haklex/rich-editor/plugins'
import { DialogStackProvider } from '@haklex/rich-editor-ui'
import type { NestedDocDialogEditorProps } from '@haklex/rich-ext-nested-doc'
import {
  NestedDocDialogEditorProvider,
  NestedDocPlugin,
  nestedDocEditNodes,
} from '@haklex/rich-ext-nested-doc'
import type { ShiroEditorProps } from '@haklex/rich-kit-shiro'
import { ExcalidrawConfigProvider, ShiroEditor } from '@haklex/rich-kit-shiro'
import { ToolbarPlugin } from '@haklex/rich-plugin-toolbar'
import { $convertToMarkdownString, TRANSFORMERS } from '@lexical/markdown'
import type {
  Klass,
  LexicalEditor,
  LexicalNode,
  SerializedEditorState,
} from 'lexical'
import { createElement, useMemo } from 'react'
import type { Root } from 'react-dom/client'
import { createRoot } from 'react-dom/client'
import type { PropType } from 'vue'
import { defineComponent, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import '@excalidraw/excalidraw/index.css'
import '@haklex/rich-kit-shiro/style.css'
import '@haklex/rich-plugin-toolbar/style.css'
import '@haklex/rich-ext-nested-doc/style.css'
import './note-serif-font'

import { filesApi } from '~/api/files'
import { API_URL } from '~/constants/env'
import { useUIStore } from '~/stores/ui'

const saveExcalidrawSnapshot = async (snapshot: object): Promise<string> => {
  const blob = new Blob([JSON.stringify(snapshot)], {
    type: 'application/json',
  })
  const file = new File([blob], 'snapshot.excalidraw', {
    type: 'application/json',
  })

  const result = await filesApi.upload(file, 'file')
  return `ref:file/${result.name}`
}

function NestedDocDialogEditor({
  initialValue,
  onEditorReady,
  imageUpload,
}: NestedDocDialogEditorProps & Pick<ShiroEditorProps, 'imageUpload'>) {
  return createElement(ShiroEditor, {
    initialValue,
    onEditorReady: (editor) => {
      if (editor) restoreBlockIds(editor, initialValue)
      onEditorReady?.(editor)
    },
    imageUpload,
    extraNodes: [...nestedDocEditNodes, LivePhotoNode],
    header: createElement(ToolbarPlugin, {insertItemOrder: ['Image', 'Live photo', 'Video']}),
  }, createElement(LivePhotoPlugin))
}

// React wrapper: syncs Vue-driven props and emits callbacks back
const ShiroEditorReact = (props: {
  editorProps: Omit<ShiroEditorProps, 'onChange' | 'onSubmit' | 'onEditorReady'>
  onChange?: (value: SerializedEditorState) => void
  onSubmit?: () => void
  onEditorReady?: (editor: LexicalEditor | null) => void
}) => {
  const nestedEditor = useMemo(
    () => (nestedProps: NestedDocDialogEditorProps) =>
      createElement(NestedDocDialogEditor, {
        ...nestedProps,
        imageUpload: props.editorProps.imageUpload,
      }),
    [props.editorProps.imageUpload],
  )
  return createElement(
    NestedDocDialogEditorProvider,
    { value: nestedEditor },
    createElement(
      DialogStackProvider,
      null,
      createElement(
        ExcalidrawConfigProvider,
        {
          saveSnapshot: saveExcalidrawSnapshot,
          apiUrl: API_URL,
        },
        createElement(
          ShiroEditor,
          {
            ...props.editorProps,
            extraNodes: [
              ...(props.editorProps.extraNodes || []),
              ...nestedDocEditNodes, LivePhotoNode,
            ],
            header: createElement(ToolbarPlugin, {insertItemOrder: ['Image', 'Live photo', 'Video']}),
            onChange: props.onChange,
            onSubmit: props.onSubmit,
            onEditorReady: (editor) => {
              if (editor)
                restoreBlockIds(editor, props.editorProps.initialValue)
              props.onEditorReady?.(editor)
            },
          },
          createElement(NestedDocPlugin), createElement(LivePhotoPlugin),
        ),
      ),
    ),
  )
}

export const RichEditor = defineComponent({
  props: {
    initialValue: Object as PropType<SerializedEditorState>,
    theme: String as PropType<'dark' | 'light'>,
    placeholder: String,
    variant: String as PropType<RichEditorVariant>,
    autoFocus: { type: Boolean, default: undefined },
    className: String,
    contentClassName: String,
    debounceMs: Number,
    selfHostnames: Array as PropType<string[]>,
    extraNodes: Array as PropType<Array<Klass<LexicalNode>>>,
    editorStyle: Object as PropType<Record<string, string | number>>,
    imageUpload: Function as PropType<ShiroEditorProps['imageUpload']>,
  },
  emits: {
    change: (_value: SerializedEditorState) => true,
    textChange: (_text: string) => true,
    submit: () => true,
    editorReady: (_editor: LexicalEditor | null) => true,
  },
  setup(props, { emit, expose }) {
    const containerRef = ref<HTMLDivElement>()
    let root: Root | null = null
    let editorInstance: LexicalEditor | null = null
    let unmounting = false

    const buildEditorProps = (
      resolvedTheme: 'dark' | 'light',
    ): Omit<ShiroEditorProps, 'onChange' | 'onSubmit' | 'onEditorReady'> => {
      const editorProps: Record<string, unknown> = { theme: resolvedTheme }
      if (props.initialValue !== undefined)
        editorProps.initialValue = props.initialValue
      if (props.placeholder !== undefined)
        editorProps.placeholder = props.placeholder
      if (props.variant !== undefined) editorProps.variant = props.variant
      if (props.autoFocus !== undefined) editorProps.autoFocus = props.autoFocus
      if (props.className !== undefined) editorProps.className = props.className
      if (props.contentClassName !== undefined)
        editorProps.contentClassName = props.contentClassName
      if (props.debounceMs !== undefined)
        editorProps.debounceMs = props.debounceMs
      if (props.selfHostnames !== undefined)
        editorProps.selfHostnames = props.selfHostnames
      if (props.extraNodes !== undefined)
        editorProps.extraNodes = props.extraNodes
      if (props.editorStyle !== undefined) editorProps.style = props.editorStyle
      if (props.imageUpload !== undefined)
        editorProps.imageUpload = props.imageUpload
      return editorProps as any
    }

    const renderReact = (resolvedTheme: 'dark' | 'light') => {
      if (!root) return
      root.render(
        createElement(PhotoViewContext.Provider, { value: EditPhoto }, createElement(ShiroEditorReact, {
          editorProps: buildEditorProps(resolvedTheme),
          onChange: (value: SerializedEditorState) => {
            if (unmounting) return
            emit('change', value)
            if (editorInstance) {
              editorInstance.read(() => {
                emit('textChange', $convertToMarkdownString(TRANSFORMERS))
              })
            }
          },
          onSubmit: () => emit('submit'),
          onEditorReady: (editor: LexicalEditor | null) => {
            editorInstance = editor
            emit('editorReady', editor)
            if (editor) {
              editor.getEditorState().read(() => {
                emit('textChange', $convertToMarkdownString(TRANSFORMERS))
              })
            }
          },
        })),
      )
    }

    onMounted(() => {
      root = createRoot(containerRef.value!)

      const uiStore = useUIStore()
      const resolveTheme = () =>
        props.theme ?? (uiStore.isDark ? 'dark' : 'light')

      renderReact(resolveTheme())

      watch(
        () => [
          props.theme,
          uiStore.isDark,
          props.placeholder,
          props.variant,
          props.autoFocus,
          props.className,
          props.contentClassName,
          props.debounceMs,
          props.selfHostnames,
          props.extraNodes,
          props.editorStyle,
          props.imageUpload,
        ],
        () => renderReact(resolveTheme()),
      )
    })

    onBeforeUnmount(() => {
      unmounting = true
      root?.unmount()
      root = null
      editorInstance = null
    })

    expose({
      focus: () => editorInstance?.focus(),
    })

    return () => <div class="h-full w-full" ref={containerRef} />
  },
})
