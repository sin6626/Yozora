import { notFound } from "next/navigation";
import { FileText, Link2, MessageCircle, Star, ThumbsDown, ThumbsUp } from "lucide-react";
import type { CSSProperties } from "react";
import IconifyIcon from "@/components/iconify-icon";
import { formatDate } from "@/lib/date";
import "lxgw-wenkai-webfont/lxgwwenkai-regular.css";
import "./directions.css";

// 仅开发环境：“思考”页的三种排法候选（示例数据，不读库），站长选定后删掉这个页面，把选中的做成真实组件。生产环境 404。
// 数据形状照 Core 的 recently（apps/core/src/modules/recently/recently.schema.ts）：type + metadata，或纯文字 + 站内引用。

type Quote =
  | { type: "book"; metadata: { url: string; title: string; author: string; rating?: number } }
  | { type: "code"; metadata: { url: string; title: string; difficulty: "简单" | "中等" | "困难"; tags: string[]; platform: string } }
  | { type: "github"; metadata: { url: string; owner: string; repo: string; description: string; stars: number; language: string; languageColor: string } }
  | { type: "link"; metadata: { url: string; title: string; description: string } }
  | { type: "text"; ref: { kind: string; title: string } };
type Sample = Quote & { id: string; content: string; created: string; up: number; down: number; comments: number };

const samples: Sample[] = [
  { id: "a1", type: "book", metadata: { url: "https://book.douban.com/", title: "被讨厌的勇气", author: "岸见一郎 / 古贺史健", rating: 8.4 }, content: "「课题分离」那一章看了两遍。别人怎么评价我，是别人的课题；我能管的，只有自己写的代码和自己走的路。", created: "2026-11-08T14:20:00Z", up: 3, down: 0, comments: 2 },
  { id: "a2", type: "code", metadata: { url: "https://leetcode.cn/problems/trapping-rain-water/", title: "42. 接雨水", difficulty: "困难", tags: ["双指针", "单调栈"], platform: "力扣" }, content: "大一第一次做是两层循环，今天回头用双指针写，十几行。原来进步是能看出来的。", created: "2026-11-05T15:02:00Z", up: 5, down: 0, comments: 0 },
  { id: "a3", type: "github", metadata: { url: "https://github.com/mx-space/core", owner: "mx-space", repo: "core", description: "Mix Space 的服务端，博客的内容、评论和后台接口都在这里。", stars: 512, language: "TypeScript", languageColor: "#3178c6" }, content: "读了它的接口缓存拦截器。清缓存时把“代际”加一，慢请求就不会把旧值填回去，这个思路很漂亮。", created: "2026-11-02T12:40:00Z", up: 1, down: 0, comments: 1 },
  { id: "a4", type: "link", metadata: { url: "https://developer.mozilla.org/zh-CN/docs/Web/API/Web_Share_API", title: "Web Share API", description: "通过设备的系统分享面板，把文字、链接和文件分享到别的应用。" }, content: "电脑上的 Chrome 也能弹出系统分享面板，以前一直以为只有手机才有。", created: "2026-10-29T09:10:00Z", up: 0, down: 0, comments: 0 },
  { id: "a5", type: "text", ref: { kind: "站内文章", title: "从 Shiro 到 Yozora" }, content: "回头看这篇，最大的收获不是写了多少功能，是学会了先写一个会失败的测试。", created: "2026-10-26T13:30:00Z", up: 2, down: 1, comments: 0 },
];

const typeLabel = { book: "书", code: "题", github: "GitHub", link: "网页", text: "站内" } as const;
const levels = { 简单: 1, 中等: 2, 困难: 3 } as const;

// 没有封面时用书名画一本书：颜色在强调色和月光色之间按书名取一个比例
function bookMix(title: string) {
  let h = 0;
  for (const c of title) h = (h * 31 + c.codePointAt(0)!) % 997;
  return `${20 + (h % 60)}%`;
}

function Specimen({ item }: { item: Sample }) {
  switch (item.type) {
    case "book":
      return (
        <span className="th-spec th-book">
          <span className="th-book-cover" style={{ "--mix": bookMix(item.metadata.title) } as CSSProperties} aria-hidden="true">
            <span className="th-book-title">{item.metadata.title}</span>
          </span>
          <span className="th-spec-text">
            <span className="th-spec-kind">{typeLabel.book}</span>
            <span className="th-spec-title">《{item.metadata.title}》</span>
            <span className="th-spec-sub">{item.metadata.author}</span>
            {item.metadata.rating !== undefined && <span className="th-spec-sub"><Star size={12} aria-hidden="true" /> {item.metadata.rating}</span>}
          </span>
        </span>
      );
    case "code":
      return (
        <span className="th-spec th-code">
          <span className="th-spec-text">
            <span className="th-spec-kind">{item.metadata.platform}</span>
            <span className="th-spec-title">{item.metadata.title}</span>
            <span className="th-spec-sub">
              <span className="th-level" data-level={levels[item.metadata.difficulty]} aria-label={`难度 ${item.metadata.difficulty}`}><i /><i /><i /></span>
              {item.metadata.difficulty} · {item.metadata.tags.join(" / ")}
            </span>
          </span>
        </span>
      );
    case "github":
      return (
        <span className="th-spec th-github">
          <span className="th-spec-text">
            <span className="th-spec-kind"><IconifyIcon icon="simple-icons:github" size={12} /> GitHub</span>
            <span className="th-spec-title">{item.metadata.owner} / <b>{item.metadata.repo}</b></span>
            <span className="th-spec-desc">{item.metadata.description}</span>
            <span className="th-spec-sub">
              <span className="th-lang" style={{ "--lang": item.metadata.languageColor } as CSSProperties}>{item.metadata.language}</span>
              <span><Star size={12} aria-hidden="true" /> {item.metadata.stars}</span>
            </span>
          </span>
        </span>
      );
    case "link":
      return (
        <span className="th-spec th-link">
          <span className="th-spec-text">
            <span className="th-spec-kind"><Link2 size={12} aria-hidden="true" /> {new URL(item.metadata.url).hostname}</span>
            <span className="th-spec-title">{item.metadata.title}</span>
            <span className="th-spec-desc">{item.metadata.description}</span>
          </span>
        </span>
      );
    case "text":
      return (
        <span className="th-spec th-ref">
          <span className="th-spec-text">
            <span className="th-spec-kind"><FileText size={12} aria-hidden="true" /> {item.ref.kind}</span>
            <span className="th-spec-title">{item.ref.title}</span>
          </span>
        </span>
      );
  }
}

function Actions({ item }: { item: Sample }) {
  return (
    <span className="th-actions">
      <button type="button" aria-label={`赞 ${item.up}`}><ThumbsUp size={14} aria-hidden="true" />{item.up > 0 && item.up}</button>
      <button type="button" aria-label={`踩 ${item.down}`}><ThumbsDown size={14} aria-hidden="true" />{item.down > 0 && item.down}</button>
      <button type="button" aria-label={`评论 ${item.comments}`}><MessageCircle size={14} aria-hidden="true" />{item.comments > 0 && item.comments}</button>
    </span>
  );
}

const href = (item: Sample) => (item.type === "text" ? "/debug/thinking" : item.metadata.url);

// A 页边批注：左边是被引用的东西，右边用文楷写看法，一条细引线把两边连起来
function MarginNotes() {
  return (
    <ol className="thd-a">
      {samples.map((item) => (
        <li key={item.id}>
          <a className="thd-a-quote" href={href(item)}><Specimen item={item} /></a>
          <div className="thd-a-note">
            <time dateTime={item.created}>{formatDate(item.created)}</time>
            <p lang="zh-CN">{item.content}</p>
            <Actions item={item} />
          </div>
        </li>
      ))}
    </ol>
  );
}

// B 星图注记：和时间线同一条星座线，看法是正文，引用像一张票根挂在下面
function StarLog() {
  return (
    <ol className="thd-b">
      {samples.map((item) => (
        <li key={item.id} data-type={item.type}>
          <span className="thd-b-star" aria-hidden="true" />
          <time dateTime={item.created}>{formatDate(item.created)}</time>
          <p lang="zh-CN">{item.content}</p>
          <a className="thd-b-ticket" href={href(item)}><Specimen item={item} /></a>
          <Actions item={item} />
        </li>
      ))}
    </ol>
  );
}

// C 书签卡：两列，卡片上半是被引用的东西（大），下半是看法
function Bookmarks() {
  return (
    <ol className="thd-c">
      {samples.map((item) => (
        <li key={item.id} data-type={item.type}>
          <a className="thd-c-quote" href={href(item)}><Specimen item={item} /></a>
          <p lang="zh-CN">{item.content}</p>
          <div className="thd-c-foot">
            <time dateTime={item.created}>{formatDate(item.created)}</time>
            <Actions item={item} />
          </div>
        </li>
      ))}
    </ol>
  );
}

export default function DebugThinkingPage() {
  if (process.env.NODE_ENV === "production") notFound();
  const directions = [
    ["a", "A 页边批注", <MarginNotes key="a" />],
    ["b", "B 星图注记", <StarLog key="b" />],
    ["c", "C 书签卡", <Bookmarks key="c" />],
  ] as const;
  return (
    <>
      {directions.map(([id, name, body]) => (
        <section key={id} id={`direction-${id}`} className="thd-section">
          <header className="page-heading">
            <p className="thd-tag">{name}</p>
            <h1>思考</h1>
            <p className="post-meta">读到的、看到的，和我的看法。</p>
          </header>
          <div className="post-list-content">{body}</div>
        </section>
      ))}
    </>
  );
}
