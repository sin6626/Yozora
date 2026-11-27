import type {
  SuzuriLivePhotoUploadHandler,
  SuzuriUploadHandler,
} from '@suzuri/editor/react'
import type { SuzuriEnvelope } from '@suzuri/editor/schema'
import type { ContentFormat } from '~/shared/types/base'
import type { PropType, VNode } from 'vue'
import type { WriteEditorVariant } from './types'

import { isSafeLivePhotoUrl } from '@suzuri/editor/schema'
import { computed, defineComponent, ref, watch } from 'vue'

import { filesApi } from '~/api/files'
import { useSaveConfirm } from '~/hooks/use-save-confirm'
import { hasRichContent } from '~/utils/rich-content'

import { prepareClip, prepareCover } from '../live-photo-media'
import { PlateEditor } from '../plate/PlateEditor'
import { WriteEditorBase } from './WriteEditorBase'

async function naturalSize(file: Blob) {
  try {
    const bitmap = await createImageBitmap(file)
    const size = { naturalWidth: bitmap.width, naturalHeight: bitmap.height }
    bitmap.close()
    return size
  } catch {
    return {}
  }
}

// 只把 Core 返回的持久地址写进正文；本地 blob:/data: 预览地址一律拒绝（关掉页面就失效）。
function persistentUrl(url: string, kind: 'image' | 'video') {
  if (!/^https?:\/\//i.test(url) || !isSafeLivePhotoUrl(url, kind)) {
    throw new Error('上传返回的地址无效')
  }
  return url
}

// Plate（Suzuri）写作区：图片与实况图都先传到 Core（图床 / 附件），正文里只存持久地址。
// 上传进行中离开页面会提示；正文内容由 onRichContentChange 回传信封，onTextChange 回传 Markdown 投影。
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
    const pendingUploads = ref(0)
    const track = async <T,>(job: Promise<T>) => {
      pendingUploads.value++
      try {
        return await job
      } finally {
        pendingUploads.value--
      }
    }

    const uploadImage: SuzuriUploadHandler = (file) =>
      track(
        (async () => {
          const [{ url }, size] = await Promise.all([
            filesApi.upload(file, 'image'),
            naturalSize(file),
          ])
          return { url: persistentUrl(url, 'image'), ...size }
        })(),
      )

    const uploadLivePhoto: SuzuriLivePhotoUploadHandler = ({
      file,
      kind,
      signal,
    }) =>
      track(
        (async () => {
          const abort = signal ?? new AbortController().signal
          if (kind === 'cover') {
            const cover = await prepareCover(file, abort)
            const { url } = await filesApi.upload(cover.file, 'image', abort)
            return {
              url: persistentUrl(url, 'image'),
              naturalWidth: cover.width,
              naturalHeight: cover.height,
            }
          }
          const clip = await prepareClip(file, abort)
          const { url } = await filesApi.upload(clip, 'file', abort)
          return { url: persistentUrl(url, 'video') }
        })(),
      )

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
