const encoder = new TextEncoder();
const decoder = new TextDecoder();
const xmpHeader = 'http://ns.adobe.com/xap/1.0/\0';

export function isMp4Brand(brand: string) {
  return /^(isom|iso[2-9]|mp4[12]|avc1|M4V |MSNV|dash)$/.test(brand);
}

// Walk box headers only. A valid brand alone does not imply a video track.
export async function validateMp4(video: Blob) {
  let remaining = 4096, hasTrack = false, hasData = false, hasBrand = false;
  const invalid = () => new Error('The video is not a supported MP4.');
  async function scan(start: number, end: number, path: string) {
    for (let at = start; at < end;) {
      if (--remaining < 0 || end - at < 8) throw invalid();
      const bytes = await video.slice(at, Math.min(at + 32, end)).arrayBuffer();
      const view = new DataView(bytes), type = decoder.decode(bytes.slice(4, 8));
      let size = view.getUint32(0), header = 8;
      if (size === 1) {
        if (bytes.byteLength < 16) throw invalid();
        size = Number(view.getBigUint64(8)); header = 16;
      } else if (!size) size = end - at;
      if (!Number.isSafeInteger(size) || size < header || size > end - at) throw invalid();
      const box = path + '/' + type;
      if (at === 0 && box === '/ftyp' && size >= header + 8)
        hasBrand = isMp4Brand(decoder.decode(bytes.slice(header, header + 4)));
      if (box === '/mdat' && size > header) hasData = true;
      if (box === '/moov/trak/mdia/hdlr' && size >= header + 12 &&
          decoder.decode(bytes.slice(header + 8, header + 12)) === 'vide') hasTrack = true;
      if (['/moov', '/moov/trak', '/moov/trak/mdia'].includes(box)) await scan(at + header, at + size, box);
      at += size;
    }
  }
  await scan(0, video.size, '');
  if (!hasBrand || !hasTrack || !hasData) throw invalid();
}

// Inspect the marker stream before the first scan; never read compressed image/video payloads.
async function jpegHeader(file: Blob) {
  const invalid = () => new Error('Invalid JPEG or unsupported Motion Photo layout.');
  const start = new Uint8Array(await file.slice(0, 2).arrayBuffer());
  if (start[0] !== 255 || start[1] !== 216) throw invalid();
  let metadata = '', hasFrame = false, metadataEnd = 0;
  for (let at = 2, count = 0; at < file.size && count < 1024; count++) {
    const h = new Uint8Array(await file.slice(at, at + 4).arrayBuffer());
    if (h.length !== 4 || h[0] !== 255 || h[1] === 217) throw invalid();
    if (h[1] === 255) { at++; continue; }
    const length = h[2] * 256 + h[3], end = at + 2 + length;
    if (length < 2 || end > file.size) throw invalid();
    if ([192, 193, 194].includes(h[1]) && length >= 11) hasFrame = true;
    if (h[1] === 218 && hasFrame && length >= 8 && end < file.size - 2) return {metadata, metadataEnd};
    if (h[1] === 225) {
      const packet = decoder.decode(await file.slice(at + 4, end).arrayBuffer());
      if (packet.startsWith(xmpHeader)) { if (metadata) throw invalid(); metadata = packet; metadataEnd = end; }
    }
    at = end;
  }
  throw invalid();
}

/** image 必须是浏览器重新编码的干净 JPEG，避免旧 EXIF/XMP 和追加内容冲突。 */
export async function createMotionPhoto(image: Blob, video: Blob, presentationTimestampUs = -1): Promise<Blob> {
  if (!Number.isSafeInteger(presentationTimestampUs) || presentationTimestampUs < -1) throw new Error('Invalid presentation timestamp.');
  const { metadata } = await jpegHeader(image);
  if (metadata) throw new Error('Use a clean JPEG cover without existing XMP.');
  const end = new Uint8Array(await image.slice(-2).arrayBuffer());
  if (end[0] !== 255 || end[1] !== 217) {
    throw new Error('The cover must be a complete JPEG image.');
  }
  await validateMp4(video);
  const xmp = `<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description rdf:about="" xmlns:GCamera="http://ns.google.com/photos/1.0/camera/" xmlns:Container="http://ns.google.com/photos/1.0/container/" xmlns:Item="http://ns.google.com/photos/1.0/container/item/" GCamera:MotionPhoto="1" GCamera:MotionPhotoVersion="1" GCamera:MotionPhotoPresentationTimestampUs="${presentationTimestampUs}"><Container:Directory><rdf:Seq><rdf:li rdf:parseType="Resource"><Container:Item Item:Mime="image/jpeg" Item:Semantic="Primary" Item:Length="0" Item:Padding="0"/></rdf:li><rdf:li rdf:parseType="Resource"><Container:Item Item:Mime="video/mp4" Item:Semantic="MotionPhoto" Item:Length="${video.size}"/></rdf:li></rdf:Seq></Container:Directory></rdf:Description></rdf:RDF></x:xmpmeta>`;
  const payload = encoder.encode(xmpHeader + xmp);
  const length = payload.length + 2;
  const marker = new Uint8Array([255, 225, length >> 8, length & 255]);
  return new Blob([image.slice(0, 2), marker, payload, image.slice(2), video], { type: 'image/jpeg' });
}

/** 只检查本 Demo 生成的单 JPEG + 单 MP4 布局，不是通用实况图解析器。 */
export async function extractMotionPhoto(file: Blob): Promise<{image: Blob; video: Blob}> {
  const {metadata, metadataEnd: xmpEnd} = await jpegHeader(file);
  const item = metadata.match(/<Container:Item\b[^>]*\bItem:Semantic="MotionPhoto"[^>]*>/)?.[0];
  const length = Number(item?.match(/\bItem:Length="(\d+)"/)?.[1]);
  if (!metadata.startsWith(xmpHeader) || !metadata.includes('GCamera:MotionPhoto="1"') ||
      !Number.isSafeInteger(length) || length < 24 || length > file.size - xmpEnd - 2) {
    throw new Error('Invalid Motion Photo metadata or video length.');
  }
  const image = file.slice(0, file.size - length, 'image/jpeg');
  const end = new Uint8Array(await image.slice(-2).arrayBuffer());
  if (end[0] !== 255 || end[1] !== 217) throw new Error('Invalid Motion Photo image boundary.');
  const video = file.slice(-length, file.size, 'video/mp4');
  await validateMp4(video);
  return { image, video };
}

/** Serializable host-owned references: use durable asset IDs or URLs when saving. */
export interface LivePhotoAsset {
  version: 1;
  src: string;
  videoSrc: string;
  width?: number;
  height?: number;
  presentationTimestampUs?: number;
}
