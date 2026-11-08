import { computed, defineComponent, reactive, ref, watch } from 'vue'
import type { ContentFormat } from '~/shared/types/base'
import type { LexicalEditor, SerializedEditorState } from 'lexical'
import type { PropType, VNode } from 'vue'
import type { WriteEditorVariant } from './types'

import { createThemeStyle } from '@haklex/rich-style-token'

import { filesApi } from '~/api/files'
import { useSaveConfirm } from '~/hooks/use-save-confirm'
import { hasRichContent } from '~/utils/rich-content'

import { RichEditor } from '../rich/RichEditor'
import { WriteEditorBase } from './WriteEditorBase'

type UploadState = { fileKey: string } & (
  | { status: 'pending' | 'failed' }
  | { status: 'uploaded'; src: string }
)

function containsImage(content: unknown, src: string): boolean {
  if (typeof content !== 'object' || content === null) return false
  if ('type' in content && (content.type === 'image' || content.type === 'live-photo') && 'src' in content) {
    return content.src === src
  }
  return Object.values(content).some((value) => containsImage(value, src))
}

const editorStyleOverride = createThemeStyle({
  layout: { maxWidth: '100%' },
  typography: {
    fontMono:
      '"Cascadia Code", "Fira Code", "JetBrains Mono", "SF Mono", SFMono-Regular, ui-monospace, "DejaVu Sans Mono", Menlo, Consolas, monospace',
  },
})

export const RichWriteEditor = defineComponent({
  name: 'RichWriteEditor',
  props: {
    loading: {
      type: Boolean,
      required: true,
    },
    title: {
      type: String,
      required: true,
    },
    onTitleChange: {
      type: Function as PropType<(value: string) => void>,
      required: true,
    },
    titlePlaceholder: {
      type: String,
      default: '输入标题...',
    },
    subtitleSlot: {
      type: [Object, Function] as PropType<VNode | (() => VNode)>,
    },
    autoFocus: {
      type: [String, Boolean] as PropType<'title' | 'content' | false>,
      default: false,
    },
    contentFormat: {
      type: String as PropType<ContentFormat>,
      default: 'lexical',
    },
    onContentFormatChange: {
      type: Function as PropType<(value: ContentFormat) => void>,
    },
    richContent: {
      type: Object as PropType<SerializedEditorState>,
    },
    onRichContentChange: {
      type: Function as PropType<(value: SerializedEditorState) => void>,
    },
    onRichEditorReady: {
      type: Function as PropType<(editor: LexicalEditor | null) => void>,
    },
    onTextChange: {
      type: Function as PropType<(value: string) => void>,
    },
    saveConfirmFn: {
      type: Function as PropType<() => boolean>,
    },
    variant: {
      type: String as PropType<WriteEditorVariant>,
      default: 'post',
    },
  },
  setup(props) {
    const richEditorRef = ref<{ focus: () => void }>()
    const unresolvedUploads = reactive(new Map<symbol, UploadState>())
    const imageUpload = async (file: File) => {
      const key = Symbol()
      const fileKey = JSON.stringify([file.name, file.size, file.lastModified])
      unresolvedUploads.set(key, { fileKey, status: 'pending' })
      try {
        const result = await filesApi.upload(file, 'image')
        unresolvedUploads.set(key, {
          fileKey,
          status: 'uploaded',
          src: result.url,
        })
        return { src: result.url }
      } catch (error) {
        unresolvedUploads.set(key, { fileKey, status: 'failed' })
        throw error
      }
    }
    const hasContent = computed(
      () => unresolvedUploads.size > 0 || hasRichContent(props.richContent),
    )
    useSaveConfirm(
      !!props.saveConfirmFn,
      () => unresolvedUploads.size === 0 && (props.saveConfirmFn?.() ?? true),
    )

    const editorKey = ref(0)
    let lastEmittedJson = ''

    watch(
      () => props.richContent,
      (val) => {
        const json = val ? JSON.stringify(val) : ''
        if (json !== lastEmittedJson) {
          lastEmittedJson = json
          editorKey.value++
        }
      },
    )

    return () => (
      <WriteEditorBase
        loading={props.loading}
        title={props.title}
        onTitleChange={props.onTitleChange}
        titlePlaceholder={props.titlePlaceholder}
        subtitleSlot={props.subtitleSlot}
        autoFocus={props.autoFocus}
        contentFormat={props.contentFormat}
        onContentFormatChange={props.onContentFormatChange}
        hasContent={hasContent.value}
        onAutoFocusContent={() => richEditorRef.value?.focus()}
      >
        <RichEditor
          ref={richEditorRef}
          key={editorKey.value}
          class="mt-8 h-full w-full"
          editorStyle={editorStyleOverride as Record<string, string | number>}
          initialValue={props.richContent}
          variant={props.variant === 'note' ? 'note' : 'article'}
          autoFocus={props.autoFocus === 'content'}
          imageUpload={imageUpload}
          onChange={(value: SerializedEditorState) => {
            const insertedFiles = new Set<string>()
            for (const [key, upload] of unresolvedUploads) {
              if (
                upload.status === 'uploaded' &&
                containsImage(value, upload.src)
              ) {
                unresolvedUploads.delete(key)
                insertedFiles.add(upload.fileKey)
              }
            }
            for (const [key, upload] of unresolvedUploads) {
              if (
                upload.status === 'failed' &&
                insertedFiles.has(upload.fileKey)
              ) {
                unresolvedUploads.delete(key)
              }
            }
            lastEmittedJson = JSON.stringify(value)
            props.onRichContentChange?.(value)
          }}
          onEditorReady={(editor: LexicalEditor | null) => {
            props.onRichEditorReady?.(editor)
          }}
          onTextChange={(text: string) => {
            props.onTextChange?.(text)
          }}
        />
      </WriteEditorBase>
    )
  },
})
