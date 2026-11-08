import { describe, expect, it } from 'vitest'
import { LexicalService } from '~/processors/helper/helper.lexical.service'
import { extractImagesFromContent } from '~/utils/content.util'

const cover = 'https://cdn.example/cover.jpg',
  clip = 'https://blog.example/objects/file/clip.mp4'
const service = new LexicalService()
function doc(videoSrc = clip) {
  return {
    contentFormat: 'lexical',
    text: '',
    content: JSON.stringify({
      root: {
        type: 'root',
        version: 1,
        format: '',
        indent: 0,
        direction: null,
        children: [
          {
            type: 'live-photo',
            version: 1,
            src: cover,
            videoSrc,
            altText: 'Travel',
            caption: 'At night',
            width: 480,
            height: 320,
          },
        ],
      },
    }),
  }
}
describe('live photo content contract', () => {
  it('keeps both URLs on save, protects the cover from orphan cleanup, and projects readable Markdown', () => {
    const data = doc()
    service.populateText(data)
    const node = JSON.parse(data.content).root.children[0]
    expect(node).toMatchObject({
      type: 'live-photo',
      src: cover,
      videoSrc: clip,
    })
    expect(extractImagesFromContent(data)).toEqual([cover])
    expect(data.text).toContain('![Travel]')
    expect(data.text).toContain(clip)
    expect(data.text).toContain('At night')
    expect(service.populateText(data, { ...data })).toBe(true)
  })
  it.each(['blob:expired', 'javascript:alert(1)', '//untrusted/path'])(
    'rejects non-durable or unsafe video URL %s',
    (url) => {
      expect(() => service.populateText(doc(url))).toThrow()
    },
  )
})
