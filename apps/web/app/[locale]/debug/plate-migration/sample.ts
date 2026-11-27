// 同一份 Lexical 原稿交给 Haklex 和离线转换器。图片与短片来自仓库，可离线查看。
const text = (value: string) => ({ type: "text", text: value, version: 1, format: 0, detail: 0, mode: "normal", style: "" });
const block = (type: string, ...children: unknown[]) => ({ type, version: 1, format: "", indent: 0, direction: null, children });
const paragraph = (...children: unknown[]) => block("paragraph", ...children);
const callout = (alertType: string, body: string) => ({
  type: "alert-quote", version: 1, alertType, content: { root: block("root", paragraph(text(body))) },
});
const cell = (value: string, headerState: number) => ({
  ...block("tablecell", paragraph(text(value))), headerState, colSpan: 1, rowSpan: 1,
});
const cover = "/sample-media/live-cover.jpg";

export const sample = {
  title: "给实况照片保留一张封面",
  content_format: "lexical",
  content: JSON.stringify({ root: block("root",
    paragraph(text("一张实况照片包含"), { ...block("link", text("静态封面")), url: cover }, text("和一段短片。按原比例展示时，宽高比为 "),
      { type: "katex-inline", version: 1, equation: "r = w / h" }, text("。")),
    callout("note", "封面可以独立显示，读者打开文章时先看到这张照片。"),
    callout("tip", "长按下方的实况照片，就能观看对应的短片。"),
    callout("warning", "只保存封面会丢失动态画面。归档时要保留两份文件。"),
    { ...block("table",
      block("tablerow", cell("文件", 1), cell("用途", 1)),
      block("tablerow", cell("JPEG", 0), cell("静态封面", 0)),
      block("tablerow", cell("MP4", 0), cell("动态画面", 0))), colWidths: [120, 240] },
    { type: "code-block", version: 1, language: "js", code: 'const cover = "/sample-media/live-cover.jpg";' },
    { type: "image", version: 1, src: cover, width: 320, altText: "实况照片封面" },
    { type: "live-photo", version: 1, src: cover, videoSrc: "/sample-media/live-clip.mp4", altText: "实况照片" },
  ) }),
};
