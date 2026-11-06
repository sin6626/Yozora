// JSON 配置片段（如 theme/yozora 的丛雨图层、头像后的影子）里填的图床图片：
// 要登记为已引用（FileReferenceType.Snippet），否则 Core 每小时会把上传超过 60 分钟、没人引用的图片删掉。
// 收集 JSON 里所有 http(s) 开头的字符串；不是图床图片的地址登记时会被忽略。
export function snippetImageUrls(raw: string): string[] {
  let root: unknown
  try {
    root = JSON.parse(raw)
  } catch {
    return []
  }
  const urls = new Set<string>()
  const walk = (value: unknown) => {
    if (typeof value === 'string') {
      if (/^https?:\/\//i.test(value)) urls.add(value)
    } else if (value && typeof value === 'object') {
      Object.values(value).forEach(walk)
    }
  }
  walk(root)
  return [...urls]
}
