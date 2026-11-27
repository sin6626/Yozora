import { Suspense } from "react";
import { notFound } from "next/navigation";
import { SUZURI_SAMPLE_DOCUMENT } from "@suzuri/editor/schema";
import { SuzuriContent } from "@suzuri/editor/static";
import "@suzuri/editor/style.css";
import "katex/dist/katex.min.css";
import CodeFrame from "@/components/code-frame";
import SuzuriLivePhoto from "./live-photo";
import "./suzuri.css";

// 阶段 0 试水：服务端用 Suzuri 渲染示例文档，代码块接站内 Shiki，实况图接轻量播放器，提示框按 data-variant 用站点颜色。
// 开发环境才有，生产 notFound（和其他 /debug 页一致）。
const sample = {
  children: SUZURI_SAMPLE_DOCUMENT.children.map((node) =>
    node.type === "livePhoto" ? { ...node, url: "/sample-media/live-cover.jpg", videoUrl: "/sample-media/live-clip.mp4" } : node,
  ).concat([
    { type: "heading", level: 2, children: [{ text: "中文标题" }] },
    { type: "paragraph", children: [{ text: "重名标题测试，下面再来一个同名的。" }] },
    { type: "heading", level: 2, children: [{ text: "中文标题" }] },
    ...["note", "tip", "warning", "caution"].map((variant) => ({
      type: "callout",
      variant,
      children: [{ text: `${variant} 提示框，按站点颜色上色。` }],
    })),
  ]),
};

export default function SuzuriPreview() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <main className="debug-suzuri">
      <h1>Suzuri 静态渲染</h1>
      <Suspense fallback={<p>正文加载中…</p>}>
        <div className="article-body">
          <SuzuriContent
            document={sample}
            renderCodeBlock={({ code, language }) => <CodeFrame code={code} lang={language?.toLowerCase()} />}
            renderLivePhoto={({ url, videoUrl, alt }) => <SuzuriLivePhoto url={url} videoUrl={videoUrl} alt={alt} />}
            renderCallout={({ variant, children }) => <aside className="suzuri-callout" data-variant={variant}>{children}</aside>}
          />
        </div>
      </Suspense>
    </main>
  );
}
