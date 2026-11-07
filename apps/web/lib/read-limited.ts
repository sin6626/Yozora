// 读远程响应体时边读边数字节：超过上限立即取消，不把整份读进内存（分享图取头像用）。
// Content-Length 已经超了就直接拒绝；没有 Content-Length 或它不老实时靠边读边数兜住。
export async function readLimited(response: Response, limit: number) {
  const declared = Number(response.headers.get("content-length"));
  if (declared > limit) throw new Error("图片太大");
  if (!response.body) return new Uint8Array(0);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > limit) {
      await reader.cancel();
      throw new Error("图片太大");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}
