import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { Film, Volume2, VolumeX } from 'lucide-react'
import { createElement as h, useEffect, useRef, useState } from 'react'
import {
  $createNodeSelection,
  $createParagraphNode,
  $getNearestNodeFromDOMNode,
  $getNodeByKey,
  $getRoot,
  $getSelection,
  $insertNodes,
  $isNodeSelection,
  $isRangeSelection,
  $setSelection,
  CLICK_COMMAND,
  COMMAND_PRIORITY_EDITOR,
  COMMAND_PRIORITY_LOW,
  HISTORY_PUSH_TAG,
} from 'lexical'
import type { Photo } from '@yozora/live-photo/haklex'
import type { BaseSelection, LexicalEditor } from 'lexical'

import {
  ActionBar,
  ActionButton,
  Dialog,
  DialogDescription,
  DialogPopup,
  DialogTitle,
} from '@haklex/rich-editor-ui'
import {
  ImageEditExtensionsProvider,
  ImageEditRenderer,
} from '@haklex/rich-renderer-image'
import { createMotionPhoto } from '@yozora/live-photo'
import { readImage, readVideo } from '@yozora/live-photo/browser'
import {
  LiveOverlay,
  LivePhotoNode,
  mediaUrl,
  OPEN_LIVE_PHOTO,
} from '@yozora/live-photo/haklex'

import { filesApi } from '~/api/files'

const clipLimit = 6 * 1024 * 1024
async function prepareClip(file: File, signal: AbortSignal) {
  if (file.size > clipLimit) throw Error('Choose a video up to 6 MB.')
  const clip = await readVideo(file, signal)
  return new File([clip.blob], file.name.replace(/\.[^.]+$/, '') + '.mp4', {
    type: 'video/mp4',
  })
}
async function uploadClip(file: File, signal: AbortSignal) {
  const { url } = await filesApi.upload(file, 'file', signal)
  if (!mediaUrl(url)) throw Error('The video upload returned an invalid URL.')
  return url
}
export function EditPhoto({
  photo,
  nodeKey,
}: {
  photo: Photo
  nodeKey: string
}) {
  const [editor] = useLexicalComposerContext()
  const [muted, setMuted] = useState(true)
  const input = useRef<HTMLInputElement>(null)
  async function replace(file?: File) {
    if (!file || job.current) return
    const op = new AbortController()
    job.current = op
    setError('')
    try {
      const src = await uploadClip(
        await prepareClip(file, op.signal),
        op.signal,
      )
      op.signal.throwIfAborted()
      editor.update(
        () => {
          const node = $getNodeByKey(nodeKey)
          if (node instanceof LivePhotoNode) node.setVideoSrc(src)
        },
        { tag: HISTORY_PUSH_TAG },
      )
    } catch (e) {
      if (!op.signal.aborted)
        setError(e instanceof Error ? e.message : 'Replace failed.')
    } finally {
      job.current = null
    }
  }
  const [error, setError] = useState('')
  const job = useRef<AbortController | null>(null)
  useEffect(
    () => () => {
      job.current?.abort()
    },
    [],
  )
  async function download() {
    if (job.current) return
    const controller = new AbortController()
    job.current = controller
    setError('')
    try {
      const signal = AbortSignal.any([
        controller.signal,
        AbortSignal.timeout(30_000),
      ])
      const load = async (url: string, limit: number) => {
        if (!mediaUrl(url)) throw Error()
        const response = await fetch(url, { signal })
        if (!response.ok) throw Error()
        if (
          Number(response.headers.get('content-length')) > limit ||
          !response.body
        )
          throw Error()
        const reader = response.body.getReader(),
          chunks: BlobPart[] = []
        let size = 0
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          size += value.byteLength
          if (size > limit) {
            await reader.cancel()
            throw Error()
          }
          chunks.push(value)
        }
        return new Blob(chunks)
      }
      const cover = await load(photo.src, 20 * 1024 * 1024),
        clip = await load(photo.videoSrc, clipLimit)
      const jpeg = await readImage(new File([cover], 'cover.jpg'), signal)
      const out = await createMotionPhoto(jpeg.blob, clip)
      signal.throwIfAborted()
      const link = document.createElement('a')
      link.href = URL.createObjectURL(out)
      link.download = 'LivePhoto_MP.jpg'
      link.click()
      setTimeout(() => URL.revokeObjectURL(link.href), 1000)
    } catch {
      if (!controller.signal.aborted)
        setError(
          'Download failed. Check that both media URLs allow cross-origin access.',
        )
    } finally {
      job.current = null
    }
  }
  return h(
    ImageEditExtensionsProvider,
    {
      value: {
        mediaOverlay: h(LiveOverlay, {
          key: photo.videoSrc,
          videoSrc: photo.videoSrc,
          muted,
        }),
        onDownload: download,
        renderToolbarActions: (className) => [
          h(
            'button',
            {
              key: 'clip',
              type: 'button',
              className,
              title: 'Replace video',
              'aria-label': 'Replace video',
              onMouseDown: (e) => e.preventDefault(),
              onClick: () => input.current?.click(),
            },
            h(Film, { size: 14 }),
          ),
          h(
            'button',
            {
              key: 'audio',
              type: 'button',
              className,
              title: muted ? 'Unmute live photo' : 'Mute live photo',
              'aria-pressed': !muted,
              onMouseDown: (e) => e.preventDefault(),
              onClick: () => setMuted(!muted),
            },
            h(muted ? VolumeX : Volume2, { size: 14 }),
          ),
        ],
      },
    },
    h(ImageEditRenderer, photo),
    h('input', {
      ref: input,
      hidden: true,
      type: 'file',
      accept: '.mp4,video/mp4',
      'aria-label': 'Replacement clip',
      onChange: (e) => {
        void replace(e.currentTarget.files?.[0])
        e.currentTarget.value = ''
      },
    }),
    error && h('p', { role: 'alert' }, error),
  )
}

type Target = { editor: LexicalEditor; selection: BaseSelection | null }
export function LivePhotoPlugin() {
  const [editor] = useLexicalComposerContext()
  const [target, setTarget] = useState<Target | null>(null)
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('')
  const cover = useRef<HTMLInputElement>(null),
    clip = useRef<HTMLInputElement>(null)
  const pending = useRef<AbortController | null>(null)
  const cachedCover = useRef<{
    file: File
    url: string
    width: number
    height: number
  } | null>(null)
  const close = () => {
    pending.current?.abort()
    pending.current = null
    cachedCover.current = null
    setBusy(false)
    setError('')
    setTarget(null)
  }
  useEffect(() => {
    const unregister = editor.registerCommand(
      OPEN_LIVE_PHOTO,
      (source) => {
        setTarget({
          editor: source,
          selection: source.read(() => $getSelection()?.clone() ?? null),
        })
        return true
      },
      COMMAND_PRIORITY_EDITOR,
    )
    return () => {
      unregister()
      pending.current?.abort()
    }
  }, [editor])
  useEffect(() => {
    const unregisterClick = editor.registerCommand(
      CLICK_COMMAND,
      (event) => {
        if (!(event.target instanceof Element)) return false
        const el = event.target.closest('[data-live-photo]')
        if (!el) return false
        const node = $getNearestNodeFromDOMNode(el)
        if (!(node instanceof LivePhotoNode)) return false
        if (event.target.closest('button,input,textarea,[role=dialog]'))
          return true
        event.preventDefault()
        editor.getRootElement()?.focus({ preventScroll: true })
        let selection = $getSelection()
        if (event.shiftKey && $isRangeSelection(selection)) {
          const parent = node.getParent()
          if (parent)
            selection.focus.set(
              parent.getKey(),
              node.getIndexWithinParent() +
                (node.isBefore(selection.anchor.getNode()) ? 0 : 1),
              'element',
            )
        } else {
          if (!event.shiftKey || !$isNodeSelection(selection)) {
            selection = $createNodeSelection()
            $setSelection(selection)
          }
          if ($isNodeSelection(selection)) {
            if (selection.has(node.getKey()) && event.shiftKey)
              selection.delete(node.getKey())
            else selection.add(node.getKey())
          }
        }
        return true
      },
      COMMAND_PRIORITY_LOW,
    )
    const unregisterPaint = editor.registerUpdateListener(() =>
      editor.read(() => {
        editor
          .getRootElement()
          ?.querySelectorAll<HTMLElement>('[data-live-photo]')
          .forEach((el) => {
            el.dataset.liveSelected = String(
              $getNearestNodeFromDOMNode(el)?.isSelected() ?? false,
            )
          })
      }),
    )
    return () => {
      unregisterClick()
      unregisterPaint()
    }
  }, [editor])
  async function insert() {
    const imageFile = cover.current?.files?.[0],
      videoFile = clip.current?.files?.[0]
    if (pending.current || !target) return
    if (!imageFile || !videoFile) {
      setError('Choose a cover and a video.')
      return
    }
    const op = new AbortController(),
      signal = op.signal
    pending.current = op
    setBusy(true)
    setError('')
    try {
      // Decode both files before uploading either. The existing Core attachment route stores MP4 as a file.
      const readyClip = await prepareClip(videoFile, signal)
      let uploaded = cachedCover.current
      if (uploaded?.file !== imageFile) {
        const image = await readImage(imageFile, signal)
        if (image.blob.size > 20 * 1024 * 1024)
          throw Error('The prepared cover exceeds 20 MB.')
        const name = imageFile.name.replace(/\.[^.]+$/, '') + '.jpg'
        const { url } = await filesApi.upload(
          new File([image.blob], name, { type: 'image/jpeg' }),
          'image',
          signal,
        )
        signal.throwIfAborted()
        if (!mediaUrl(url))
          throw Error('The cover upload returned an invalid URL.')
        uploaded = cachedCover.current = {
          file: imageFile,
          url,
          width: image.width,
          height: image.height,
        }
      }
      const videoSrc = await uploadClip(readyClip, signal)
      signal.throwIfAborted()
      const photo = {
        src: uploaded.url,
        width: uploaded.width,
        height: uploaded.height,
        altText: imageFile.name,
        videoSrc,
      }
      target.editor.update(
        () => {
          if (target.selection) $setSelection(target.selection.clone())
          else $getRoot().selectEnd()
          const node = new LivePhotoNode(photo)
          $insertNodes([node])
          if (!node.getNextSibling()) node.insertAfter($createParagraphNode())
          node.selectNext()
        },
        { tag: HISTORY_PUSH_TAG, discrete: true },
      )
      close()
      target.editor.focus()
    } catch (e) {
      if (!signal.aborted)
        setError(
          e instanceof Error ? e.message : 'Could not insert live photo.',
        )
    } finally {
      if (pending.current === op) {
        pending.current = null
        setBusy(false)
      }
    }
  }
  return h(
    Dialog,
    {
      open: !!target,
      disablePointerDismissal: true,
      onOpenChange: (value) => {
        if (!value) close()
      },
    },
    h(
      DialogPopup,
      null,
      h(DialogTitle, null, 'Insert live photo'),
      h(
        DialogDescription,
        null,
        'Choose a cover and a short, browser-playable MP4. Press and hold the photo to play.',
      ),
      h(
        'label',
        { className: 'yz-photo-field' },
        'Cover image · JPEG / PNG · 20 MB',
        h('input', {
          ref: cover,
          type: 'file',
          accept: 'image/jpeg,image/png',
          disabled: busy,
        }),
      ),
      h(
        'label',
        { className: 'yz-photo-field' },
        'Video clip · MP4 · 6 MB / 30s',
        h('input', {
          ref: clip,
          type: 'file',
          accept: 'video/mp4,.mp4',
          disabled: busy,
        }),
      ),
      error && h('p', { role: 'alert' }, error),
      h(
        ActionBar,
        null,
        h(ActionButton, { variant: 'outline', onClick: close }, 'Cancel'),
        h(
          ActionButton,
          { variant: 'accent', disabled: busy, onClick: insert },
          busy ? 'Uploading…' : 'Insert',
        ),
      ),
    ),
  )
}
