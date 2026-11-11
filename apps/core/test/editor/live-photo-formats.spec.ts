import { execFileSync } from 'node:child_process'
import {
  mkdtempSync,
  readFileSync,
  rmdirSync,
  writeFileSync,
  unlinkSync,
  existsSync,
  symlinkSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Fastify from 'fastify'
import multipart from '@fastify/multipart'
import { HttpException } from '@nestjs/common'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { FileController } from '~/modules/file/file.controller'
import { UploadService } from '~/processors/helper/helper.upload.service'

const workspace = new URL('../../../web/public/sample-media/', import.meta.url)
const sample = (name: string) => readFileSync(new URL(name, workspace))
const app = Fastify()
const temp = mkdtempSync(join(tmpdir(), 'yozora-format-test-'))
const output = join(temp, 'result.mp4'),
  movie = join(temp, 'clip.mov'),
  heic = join(temp, 'cover.heic')
const tools = () => {
  try {
    execFileSync('ffprobe', ['-version'], { stdio: 'ignore' })
    execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}
beforeAll(async () => {
  await app.register(multipart)
  // Only this conversion endpoint is mounted. No credentials, storage or DB access in the fixture.
  const controller = new FileController(
    null!,
    new UploadService(),
    null!,
    null!,
  )
  app.post('/convert/:kind', async (req, res) =>
    controller.prepareLivePhoto(
      (req.params as { kind: string }).kind,
      req,
      res,
    ),
  )
  app.setErrorHandler((e, _, res) =>
    res
      .code(e instanceof HttpException ? e.getStatus() : 500)
      .send({ message: String(e) }),
  )
})
afterAll(async () => {
  await app.close()
  if (existsSync(output)) unlinkSync(output)
  if (existsSync(movie)) unlinkSync(movie)
  if (existsSync(heic)) unlinkSync(heic)
  rmdirSync(temp)
})
async function submit(kind: string, bytes: Buffer) {
  const body = new FormData()
  body.append('file', new Blob([new Uint8Array(bytes)]), 'upload')
  const request = new Request('http://fixture', { method: 'POST', body })
  return app.inject({
    method: 'POST',
    url: '/convert/' + kind,
    headers: { 'content-type': request.headers.get('content-type')! },
    payload: Buffer.from(await request.arrayBuffer()),
  })
}
it('rejects disguised input without uploading an attachment', async () => {
  expect((await submit('video', Buffer.from('not a movie'))).statusCode).toBe(
    400,
  )
})
it.skipIf(!tools())(
  'keeps compatible MP4; converts HEVC MOV, remuxes H.264 MOV and fits sources larger than the upload limit',
  async () => {
    const original = sample('live-clip.mp4')
    expect((await submit('video', original)).statusCode).toBe(204)
    const hevc = process.env.LIVE_PHOTO_HEVC_MOV
    const testClip = new URL('live-clip.mp4', workspace).pathname
    for (const codec of ['copy', 'libx265']) {
      if (codec === 'copy' || !hevc)
        execFileSync('ffmpeg', [
          '-v',
          'error',
          '-y',
          '-i',
          testClip,
          '-c:v',
          codec,
          ...(codec === 'copy'
            ? []
            : ['-x265-params', 'pools=1:frame-threads=1:log-level=error']),
          '-threads',
          '1',
          '-f',
          'mov',
          movie,
        ])
      const result = await submit(
        'video',
        readFileSync(codec !== 'copy' && hevc ? hevc : movie),
      )
      expect(
        result.statusCode,
        result.statusCode === 200 ? undefined : result.payload.slice(0, 200),
      ).toBe(200)
      expect(result.headers['content-type']).toContain('video/mp4')
      writeFileSync(output, result.rawPayload)
      const streams = JSON.parse(
        execFileSync('ffprobe', [
          '-v',
          'error',
          '-show_streams',
          '-of',
          'json',
          output,
        ]).toString(),
      ).streams
      expect(streams[0]).toMatchObject({
        codec_name: 'h264',
        pix_fmt: 'yuv420p',
      })
      if (streams.length > 1) expect(streams[1].codec_name).toBe('aac')
    }
    const free = Buffer.alloc(7 * 1024 * 1024)
    free.writeUInt32BE(free.length)
    free.write('free', 4)
    const compressed = await submit('video', Buffer.concat([original, free]))
    expect(compressed.statusCode).toBe(200)
    expect(compressed.rawPayload.length).toBeLessThanOrEqual(6 * 1024 * 1024)
  },
  30_000,
)
it.skipIf(!tools()).each([
  ['webm', 'libvpx-vp9'],
  ['matroska', 'copy'],
  ['avi', 'mpeg4'],
])('normalizes %s input to MP4', async (format, codec) => {
  execFileSync('ffmpeg', [
    '-nostdin',
    '-v',
    'error',
    '-y',
    '-i',
    new URL('live-clip.mp4', workspace).pathname,
    '-an',
    '-c:v',
    codec,
    '-threads',
    '1',
    '-f',
    format,
    movie,
  ])
  const res = await submit('video', readFileSync(movie))
  expect(res.statusCode, res.statusCode === 200 ? undefined : res.payload).toBe(
    200,
  )
  expect(res.rawPayload.toString('ascii', 4, 8)).toBe('ftyp')
})
// The Core image only ships ffmpeg/ffprobe (scripts/deploy/core-image.Dockerfile): no macOS sips, and sharp's
// prebuilt libvips has no HEVC decoder. HEIC fixtures are made with sips, so these run on macOS with ffmpeg installed.
const sips = () => {
  try {
    execFileSync('sips', ['--help'], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}
async function onlyFFmpeg<T>(task: () => Promise<T>) {
  const bin = mkdtempSync(join(tmpdir(), 'yozora-ffmpeg-only-'))
  for (const name of ['ffmpeg', 'ffprobe'])
    symlinkSync(execFileSync('which', [name]).toString().trim(), join(bin, name))
  const path = process.env.PATH
  process.env.PATH = bin
  try {
    return await task()
  } finally {
    process.env.PATH = path
    for (const name of ['ffmpeg', 'ffprobe']) unlinkSync(join(bin, name))
    rmdirSync(bin)
  }
}
function heicOf(width: number, height: number) {
  const jpg = join(temp, 'source.jpg')
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', `testsrc2=size=${width}x${height}`, '-frames:v', '1', '-q:v', '3', jpg])
  execFileSync('sips', ['-s', 'format', 'heic', jpg, '--out', heic], { stdio: 'ignore' })
  unlinkSync(jpg)
  return readFileSync(heic)
}
it.skipIf(!tools() || !sips())(
  'returns a full-size JPEG from a tiled HEIC with only ffmpeg on the host and leaves the source unchanged',
  async () => {
    const bytes = process.env.LIVE_PHOTO_HEIC
      ? readFileSync(process.env.LIVE_PHOTO_HEIC)
      : heicOf(1600, 1200)
    const res = await onlyFFmpeg(() => submit('image', bytes))
    expect(
      res.statusCode,
      res.statusCode === 200 ? undefined : res.payload.slice(0, 200),
    ).toBe(200)
    expect(res.headers['content-type']).toContain('image/jpeg')
    expect([...res.rawPayload.subarray(0, 3)]).toEqual([255, 216, 255])
    if (!process.env.LIVE_PHOTO_HEIC) {
      writeFileSync(output, res.rawPayload)
      const [jpeg] = JSON.parse(
        execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-of', 'json', output]).toString(),
      ).streams
      expect([jpeg.width, jpeg.height]).toEqual([1600, 1200])
    }
  },
  30_000,
)
it.skipIf(!tools() || !sips())(
  'rejects a HEIC over 24 megapixels before decoding it',
  async () => {
    const bytes = heicOf(6000, 4096)
    const res = await onlyFFmpeg(() => submit('image', bytes))
    expect(res.statusCode).toBe(400)
    expect(res.payload).toContain('24 megapixels')
  },
  30_000,
)
