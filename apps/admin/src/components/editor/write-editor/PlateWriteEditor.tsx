import type { SuzuriEnvelope } from '@suzuri/editor/schema'
import type { ContentFormat } from '~/shared/types/base'
import type { PropType, VNode } from 'vue'
import type { WriteEditorVariant } from './types'

import { computed, defineComponent, ref, watch } from 'vue'

import { useSaveConfirm } from '~/hooks/use-save-confirm'
import { hasRichContent } from '~/utils/rich-content'

import { PlateEditor } from '../plate/PlateEditor'
import { usePlateUploads } from '../plate/uploads'
import { WriteEditorBase } from './WriteEditorBase'

// Plate（Suzuri）写作区：图片与实况图都先传到 Core（图床 / 附件），正文里只存持久地址。
// 上传进行中离开页面会提示、发布会被拦下（pendingUploadsError），换文档或离开时取消进行中的上传；正文内容由 onRichContentChange 回传信封，onTextChange 回传 Markdown 投影。
export const PlateWriteEditor = defineComponent({
  name: 'PlateWriteEditor',
  props: {
    loading: { type: Boolean, required: true },
    title: { type: String, required: true },
    onTitleChange: {
      type: Function as PropType<(value: string) => void>,
      required: true,
    },
    titlePlaceholder: { type: String, default: '输入标题...' },
    subtitleSlot: {
      type: [Object, Function] as PropType<VNode | (() => VNode)>,
    },
    autoFocus: {
      type: [String, Boolean] as PropType<'title' | 'content' | false>,
      default: false,
    },
    contentFormat: {
      type: String as PropType<ContentFormat>,
      default: 'plate',
    },
    onContentFormatChange: {
      type: Function as PropType<(value: ContentFormat) => void>,
    },
    richContent: { type: Object as PropType<SuzuriEnvelope> },
    onRichContentChange: {
      type: Function as PropType<(value: SuzuriEnvelope) => void>,
    },
    onTextChange: { type: Function as PropType<(value: string) => void> },
    saveConfirmFn: { type: Function as PropType<() => boolean> },
    variant: {
      type: String as PropType<WriteEditorVariant>,
      default: 'post',
    },
  },
  setup(props) {
    const editorRef = ref<{ focus: () => void }>()
    const {
      pending: pendingUploads,
      uploadImage,
      uploadLivePhoto,
      cancel: cancelUploads,
    } = usePlateUploads()

    const hasContent = computed(
      () => pendingUploads.value > 0 || hasRichContent(props.richContent),
    )
    useSaveConfirm(
      !!props.saveConfirmFn,
      () => pendingUploads.value === 0 && (props.saveConfirmFn?.() ?? true),
    )

    // 外部换了内容（恢复草稿、读出已发布的文章）才重建编辑器；自己发出去的变化不重建
    const documentKey = ref(0)
    let lastEmittedJson = ''
    watch(
      () => props.richContent,
      (value) => {
        const json = value ? JSON.stringify(value) : ''
        if (json !== lastEmittedJson) {
          lastEmittedJson = json
          // 换了一份文档：上一份里还没传完的图不能插进这一份
          cancelUploads()
          documentKey.value++
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
        onAutoFocusContent={() => editorRef.value?.focus()}
      >
        <PlateEditor
          ref={editorRef}
          class="mt-8 h-full w-full"
          documentKey={String(documentKey.value)}
          initialValue={props.richContent}
          placeholder="输入 / 打开命令菜单…"
          variant={props.variant === 'note' ? 'note' : 'article'}
          onUploadImage={uploadImage}
          onUploadLivePhoto={uploadLivePhoto}
          onChange={(envelope: SuzuriEnvelope) => {
            lastEmittedJson = JSON.stringify(envelope)
            props.onRichContentChange?.(envelope)
          }}
          onTextChange={(text: string) => props.onTextChange?.(text)}
        />
      </WriteEditorBase>
    )
  },
})
