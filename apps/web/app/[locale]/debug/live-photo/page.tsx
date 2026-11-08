import { Suspense } from "react";
import { notFound } from "next/navigation";
import ArticleBody from "@/components/article-body";

export default function LivePhotoPreview() {
  if (process.env.NODE_ENV === "production") notFound();
  const content = JSON.stringify({
    root: {
      type: "root",
      version: 1,
      direction: null,
      format: "",
      indent: 0,
      children: [
        {
          type: "live-photo",
          version: 1,
          src: "/sample-media/live-cover.jpg",
          videoSrc: "/sample-media/live-clip.mp4",
          altText: "Synthetic cover",
          caption: "Live photo preview",
          width: 480,
          height: 320,
        },
      ],
    },
  });
  return (
    <main>
      <h1>实况图</h1>
      <Suspense fallback={<p>实况图加载中…</p>}>
        <ArticleBody
          contentFormat="lexical"
          content={content}
          text="Live photo preview"
          emptyText=""
        />
      </Suspense>
    </main>
  );
}
