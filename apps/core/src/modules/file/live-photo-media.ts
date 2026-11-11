// Normalize private upload bytes before the existing image/file storage routes see them.
import { execFile } from 'node:child_process'
import { createWriteStream } from 'node:fs'
import { mkdtemp, open, readFile, rmdir, stat, unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { promisify } from 'node:util'
import {
  BadRequestException,
  HttpException,
  PayloadTooLargeException,
  ServiceUnavailableException,
} from '@nestjs/common'
import type { MultipartFile } from '@fastify/multipart'

const run = promisify(execFile)
const MB = 1024 * 1024
export const sourceLimit = { image: 20 * MB, video: 100 * MB } as const
const clipLimit = 6 * MB
let busy = false

async function tool(name: string, args: string[], signal: AbortSignal) {
  try {
    return (
      await run(name, args, {
        signal,
        killSignal: 'SIGKILL',
        timeout: 90000,
        maxBuffer: 1 << 20,
      })
    ).stdout
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT')
      throw new ServiceUnavailableException(
        `Install ${name} on the Core host to convert live photos.`,
      )
    if (signal.aborted) throw signal.reason
    throw new BadRequestException(
      `Could not decode or convert this file with ${name}.`,
    )
  }
}
type Track = {
  codec_type: string
  codec_name: string
  profile?: string
  level?: number
  pix_fmt?: string
  width?: number
  height?: number
  avg_frame_rate?: string
  channels?: number
  codec_tag_string?: string
  color_transfer?: string
  side_data_list?: { side_data_type: string }[]
  disposition?: { attached_pic?: number }
}
type Probe = {
  streams: Track[]
  format: { duration?: string; tags?: { major_brand?: string } }
}
async function probe(
  input: string,
  demux: string[],
  signal: AbortSignal,
): Promise<Probe> {
  return JSON.parse(
    await tool(
      'ffprobe',
      [
        '-v',
        'error',
        '-threads',
        '1',
        ...demux,
        '-show_streams',
        '-show_format',
        '-of',
        'json',
        input,
      ],
      signal,
    ),
  )
}
function inspect(info: Probe) {
  const v = info.streams.find(
    (s) => s.codec_type === 'video' && !s.disposition?.attached_pic,
  )
  const duration = Number(info.format.duration)
  if (!v || !(duration > 0 && duration <= 30.05))
    throw new BadRequestException(
      'Choose a video up to 30 seconds with a video track.',
    )
  const w = v.width ?? 0,
    h = v.height ?? 0
  if (!w || !h || Math.max(w, h) > 4096 || w * h > 4096 * 2160)
    throw new BadRequestException('Video resolution exceeds 4K.')
  if (
    ['smpte2084', 'arib-std-b67'].includes(v.color_transfer ?? '') ||
    ['dvh1', 'dvhe'].includes(v.codec_tag_string ?? '') ||
    v.side_data_list?.some((s) =>
      /dovi|dolby vision/i.test(s.side_data_type),
    ) ||
    (/(10|12|14|16)(le|be)$/.test(v.pix_fmt ?? '') &&
      (!v.color_transfer || v.color_transfer === 'unknown'))
  )
    throw new BadRequestException(
      'HDR or unspecified high-bit-depth color is not supported. Export an SDR copy.',
    )
  const [n, d] = (v.avg_frame_rate ?? '').split('/').map(Number)
  const a = info.streams.find((s) => s.codec_type === 'audio')
  const videoOK =
    v.codec_name === 'h264' &&
    ['Baseline', 'Constrained Baseline', 'Main', 'High'].includes(
      v.profile ?? '',
    ) &&
    (v.level ?? 0) > 0 &&
    (v.level ?? 100) <= 41 &&
    v.pix_fmt === 'yuv420p' &&
    Math.max(w, h) <= 1920 &&
    Math.min(w, h) <= 1080 &&
    !(w % 2 || h % 2) &&
    n / d > 0 &&
    n / d <= 30.001
  const audioOK =
    !a ||
    (a.codec_name === 'aac' &&
      a.profile === 'LC' &&
      (a.channels ?? 0) > 0 &&
      (a.channels ?? 3) <= 2)
  const mp4 =
    /^(isom|iso[2-9]|mp4[12]|avc1|M4V |MSNV|dash)$/.test(
      info.format.tags?.major_brand ?? '',
    ) && info.streams.length === (a ? 2 : 1)
  return { duration, videoOK, audioOK, mp4 }
}
const heifDemux = [
  '-max_pixels',
  String(24_000_000),
  '-protocol_whitelist',
  'file',
  '-enable_drefs',
  '0',
  '-use_absolute_path',
  '0',
  '-f',
  'mov',
]
const mp4Demux = [
  '-max_pixels',
  String(4096 * 2160),
  '-protocol_whitelist',
  'file',
  '-enable_drefs',
  '0',
  '-use_absolute_path',
  '0',
  '-f',
  'mov',
]
async function convert(
  input: string,
  output: string,
  kind: keyof typeof sourceLimit,
  signal: AbortSignal,
) {
  const fd = await open(input, 'r'),
    head = Buffer.alloc(64)
  try {
    await fd.read(head, 0, 64, 0)
  } finally {
    await fd.close()
  }
  const atom = head.toString('ascii', 4, 8)
  if (kind === 'image') {
    if (
      atom !== 'ftyp' ||
      !/hei[cfsx]|he[vx][cxs]|mif1|msf1/.test(head.toString('ascii', 8))
    )
      throw new BadRequestException('Choose a HEIC or HEIF image.')
    // 只靠 ffmpeg/ffprobe（Core 镜像自带，scripts/deploy/core-image.Dockerfile）：macOS 的 sips 服务器上没有，
    // sharp 预编译的 libvips 不带 HEVC 解码。iPhone 的 HEIC 是 512×512 分块拼成的，ffprobe 的 Tile Grid 给出整张尺寸，
    // 解码前先按整张算像素，超过 2400 万直接拒（4800 万像素原图解码要 600MB 左右，2GB 的服务器扛不住）。单线程省内存。
    const info = JSON.parse(
      await tool(
        'ffprobe',
        ['-v', 'error', '-threads', '1', ...heifDemux, '-show_streams', '-show_stream_groups', '-of', 'json', input],
        signal,
      ),
    ) as {
      streams?: { codec_type?: string; width?: number; height?: number }[]
      stream_groups?: { components?: { width?: number; height?: number }[] }[]
    }
    const pixels = Math.max(
      0,
      ...[
        ...(info.stream_groups ?? []).flatMap((g) => g.components ?? []),
        ...(info.streams ?? []).filter((s) => s.codec_type === 'video'),
      ].map((c) => (c.width ?? 0) * (c.height ?? 0)),
    )
    if (!(pixels > 0 && pixels <= 24_000_000))
      throw new BadRequestException(
        'Choose a valid HEIC/HEIF up to 24 megapixels.',
      )
    await tool(
      'ffmpeg',
      ['-nostdin', '-v', 'error', '-threads', '1', ...heifDemux, '-i', input, '-frames:v', '1', '-q:v', '2', '-f', 'image2', '-c:v', 'mjpeg', output],
      signal,
    )
    return true
  }
  const demux = ['ftyp', 'wide', 'free', 'moov', 'mdat'].includes(atom)
    ? mp4Demux
    : head.readUInt32BE(0) === 0x1a45dfa3
      ? [
          '-protocol_whitelist',
          'file',
          '-max_pixels',
          String(4096 * 2160),
          '-f',
          'matroska',
        ]
      : head.toString('ascii', 0, 4) === 'RIFF' &&
          head.toString('ascii', 8, 12) === 'AVI '
        ? [
            '-protocol_whitelist',
            'file',
            '-max_pixels',
            String(4096 * 2160),
            '-f',
            'avi',
          ]
        : null
  if (!demux)
    throw new BadRequestException('Choose MP4, MOV, M4V, WebM, MKV or AVI.')
  const { duration, videoOK, audioOK, mp4 } = inspect(
    await probe(input, demux, signal),
  )
  const fits = (await stat(input)).size <= clipLimit
  if (fits && mp4 && atom === 'ftyp' && videoOK && audioOK) return false
  // Reserve mux/audio overhead: only the stored MP4 has to fit the 6 MiB attachment limit.
  const rate = Math.min(
    8000,
    Math.floor((clipLimit * 8 * 0.88) / duration / 1000) - 128,
  )
  const scale =
    "scale=w='min(iw,if(gte(iw,ih),1920,1080))':h='min(ih,if(gte(iw,ih),1080,1920))':force_original_aspect_ratio=decrease:force_divisible_by=2:out_range=tv"
  await tool(
    'ffmpeg',
    [
      '-nostdin',
      '-v',
      'error',
      '-threads',
      '1',
      ...demux,
      '-i',
      input,
      '-map',
      '0:V:0',
      '-map',
      '0:a:0?',
      ...(videoOK && fits
        ? ['-c:v', 'copy']
        : [
            '-filter_threads',
            '1',
            '-vf',
            scale,
            '-c:v',
            'libx264',
            '-threads:v',
            '1',
            '-preset',
            'veryfast',
            '-pix_fmt',
            'yuv420p',
            '-color_range',
            'tv',
            '-profile:v',
            'high',
            '-level:v',
            '4.1',
            '-fpsmax',
            '30',
            '-crf',
            '22',
            '-maxrate',
            rate + 'k',
            '-bufsize',
            rate + 'k',
          ]),
      ...(audioOK && fits
        ? ['-c:a', 'copy']
        : ['-c:a', 'aac', '-ac', '2', '-b:a', '128k']),
      '-map_metadata',
      '-1',
      '-map_chapters',
      '-1',
      '-fs',
      String(clipLimit + 65536),
      '-movflags',
      '+faststart',
      '-f',
      'mp4',
      '-n',
      output,
    ],
    signal,
  )
  const check = inspect(await probe(output, mp4Demux, signal))
  if (
    !(check.videoOK && check.audioOK && check.mp4) ||
    Math.abs(check.duration - duration) > 0.15
  )
    throw new BadRequestException(
      'Could not fit the complete clip in 6 MB. Try a shorter video.',
    )
  return true
}

// The multipart layer enforces the input cap while streaming. Never put originals in public storage.
export async function normalizeLiveMedia(
  kind: keyof typeof sourceLimit,
  receive: () => Promise<MultipartFile>,
  signal: AbortSignal,
) {
  if (busy)
    throw new HttpException(
      'Another file is being converted. Try again shortly.',
      429,
    )
  busy = true
  let dir: string | undefined
  try {
    const part = await receive()
    signal.throwIfAborted()
    dir = await mkdtemp(join(tmpdir(), 'yozora-live-'))
    const input = join(dir, 'input'),
      output = join(dir, 'output')
    await pipeline(
      part.file,
      createWriteStream(input, { flags: 'wx', mode: 0o600 }),
      { signal },
    )
    if (part.file.truncated || (await stat(input)).size > sourceLimit[kind])
      throw new PayloadTooLargeException()
    if (!(await convert(input, output, kind, signal))) return null
    const size = (await stat(output)).size
    if (!size || size > (kind === 'video' ? clipLimit : sourceLimit.image))
      throw new PayloadTooLargeException(
        'Converted media exceeds the upload limit.',
      )
    return await readFile(output, { signal })
  } finally {
    try {
      if (dir) {
        for (const name of ['input', 'output'])
          await unlink(join(dir, name)).catch((e) => {
            if (e.code !== 'ENOENT') throw e
          })
        await rmdir(dir)
      }
    } finally {
      busy = false
    }
  }
}
