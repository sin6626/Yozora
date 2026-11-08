// Shared wire format and read-only view. Admin supplies its image toolbar via context.
import {
  Fragment,
  createContext,
  createElement as h,
  useContext,
  useEffect,
  useRef,
  useState,
  type ComponentType,
} from 'react'
import {
  createCommand,
  type EditorConfig,
  type NodeKey,
  type LexicalEditor,
} from 'lexical'
import {
  ImageNode,
  type ImageNodePayload,
  type SerializedImageNode,
} from '@haklex/rich-editor/nodes'
import type { CommandItemConfig } from '@haklex/rich-editor/commands'
import { bindLivePhoto } from './player'

export type Photo = ImageNodePayload & { videoSrc: string }
export const OPEN_LIVE_PHOTO = createCommand<LexicalEditor>('insert-live-photo')
export const mediaUrl = (src: unknown): src is string => {
  if (typeof src !== 'string' || /[\s\\<>"'\u0000-\u001f]/u.test(src))
    return false
  if (/^\/(?!\/)/.test(src)) return true
  try {
    const u = new URL(src)
    return /^https?:$/.test(u.protocol) && !u.username && !u.password
  } catch {
    return false
  }
}

export function LiveOverlay({
  videoSrc,
  muted = true,
}: {
  videoSrc: string
  muted?: boolean
}) {
  const video = useRef<HTMLVideoElement>(null),
    badge = useRef<HTMLButtonElement>(null)
  const [ready, setReady] = useState(false)
  const [playing, setPlaying] = useState(false),
    [failed, setFailed] = useState(false)
  useEffect(() => {
    const v = video.current,
      b = badge.current
    if (!v?.parentElement || !b) return
    setFailed(false)
    const dispose = bindLivePhoto(v.parentElement, v, b, {
      playing: setPlaying,
      error: () => setFailed(true),
    })
    setReady(true)
    return dispose
  }, [videoSrc])
  if (!mediaUrl(videoSrc)) return null
  return h(
    Fragment,
    null,
    h('video', {
      className: 'yz-live-clip',
      ref: video,
      src: videoSrc,
      muted,
      playsInline: true,
      preload: 'none',
      style: { opacity: Number(playing) },
    }),
    h(
      'button',
      {
        className: 'yz-live-badge',
        ref: badge,
        type: 'button',
        disabled: !ready,
        'data-image-action': '',
        'aria-label': 'Press and hold to play',
        title: 'Press and hold to play',
      },
      failed ? 'Video unavailable' : playing ? 'PLAYING' : '◉ LIVE',
    ),
  )
}
export function ReadPhoto({ photo }: { photo: Photo }) {
  if (!mediaUrl(photo.src)) return null
  return h(
    'figure',
    { className: 'yz-live-figure' },
    h(
      'span',
      { className: 'yz-live-frame' },
      h('img', {
        src: photo.src,
        alt: photo.altText,
        width: photo.width,
        height: photo.height,
        draggable: false,
      }),
      h(LiveOverlay, { videoSrc: photo.videoSrc }),
    ),
    photo.caption && h('figcaption', null, photo.caption),
  )
}

export const PhotoViewContext =
  createContext<ComponentType<{ photo: Photo; nodeKey: NodeKey }>>(ReadPhoto)
function PhotoView(props: { photo: Photo; nodeKey: NodeKey }) {
  return h(useContext(PhotoViewContext), props)
}
export class LivePhotoNode extends ImageNode {
  __videoSrc: string
  static commandItems: CommandItemConfig[] = [
    {
      title: 'Live photo',
      description: 'Insert a cover and a short clip',
      group: 'insert',
      section: 'MEDIA',
      keywords: ['live', 'motion', '实况图'],
      placement: ['toolbar', 'slash', 'blockHandle'],
      icon: h('span', { 'aria-hidden': true }, '◉'),
      onSelect: (editor) => {
        editor.dispatchCommand(OPEN_LIVE_PHOTO, editor)
      },
    },
  ]
  static getType() {
    return 'live-photo'
  }
  static clone(n: LivePhotoNode) {
    return new LivePhotoNode(
      {
        src: n.__src,
        altText: n.__altText,
        caption: n.__caption,
        width: n.__width,
        height: n.__height,
        thumbhash: n.__thumbhash,
        accent: n.__accent,
        videoSrc: n.__videoSrc,
      },
      n.__key,
    )
  }
  constructor(
    data: Photo = { src: '', altText: '', videoSrc: '' },
    key?: NodeKey,
  ) {
    super(data, key)
    this.__videoSrc = data.videoSrc
  }
  static importJSON(data: SerializedImageNode & { videoSrc: string }) {
    return new LivePhotoNode(data).updateFromJSON(data)
  }
  exportJSON() {
    return {
      ...super.exportJSON(),
      type: 'live-photo',
      videoSrc: this.getLatest().__videoSrc,
    }
  }
  createDOM(config: EditorConfig) {
    const el = super.createDOM(config)
    el.dataset.livePhoto = ''
    return el
  }
  setVideoSrc(src: string) {
    this.getWritable().__videoSrc = src
  }
  decorate() {
    return h(PhotoView, { photo: this.exportJSON(), nodeKey: this.getKey() })
  }
}
