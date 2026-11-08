// Only used by the existing headless Markdown projection; the saved JSON remains authoritative.
import {
  DecoratorNode,
  type NodeKey,
  type SerializedLexicalNode,
} from 'lexical'

type SerializedPhoto = SerializedLexicalNode & {
  src: string
  videoSrc: string
  altText?: string
  caption?: string
}
export class HeadlessLivePhotoNode extends DecoratorNode<null> {
  __photo: SerializedPhoto
  constructor(
    photo: SerializedPhoto = {
      type: 'live-photo',
      version: 1,
      src: '',
      videoSrc: '',
    },
    key?: NodeKey,
  ) {
    super(key)
    this.__photo = photo
  }
  static getType() {
    return 'live-photo'
  }
  static clone(node: HeadlessLivePhotoNode) {
    return new HeadlessLivePhotoNode(node.__photo, node.__key)
  }
  static importJSON(photo: SerializedPhoto) {
    return new HeadlessLivePhotoNode(photo)
  }
  exportJSON() {
    return this.__photo
  }
  isInline() {
    return false
  }
  decorate() {
    return null
  }
}
