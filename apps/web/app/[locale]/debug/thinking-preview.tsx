import { ThinkingLog, type ThinkingItem } from "@/components/thinking-list";

// 调试页“思考”：用示例数据把八种引用卡片、站内引用、纯文字和空列表都摆出来（不读库）。
// id 全是 0 开头的假 id：赞踩会被 Core 拒绝、什么都不变；评论只开了一条，条数为 0 时不向 Core 取。
const id = (n: number) => n.toString(16).padStart(24, "0");
const base = { up: 0, down: 0, comments: 0, allowComment: false, ref: null, quote: null };
const samples: ThinkingItem[] = [
  { ...base, id: id(1), created: "2026-11-08T14:20:00Z", up: 3, allowComment: true, content: "「课题分离」那一章看了两遍。别人怎么评价我，是别人的课题；我能管的，只有自己写的代码和自己走的路。", quote: { type: "book", url: "https://book.douban.com/", title: "被讨厌的勇气", author: "岸见一郎 / 古贺史健", rating: 8.4 } },
  { ...base, id: id(2), created: "2026-11-05T15:02:00Z", up: 5, content: "大一第一次做是两层循环，今天回头用双指针写，十几行。原来进步是能看出来的。", quote: { type: "code", url: "https://leetcode.cn/problems/trapping-rain-water/", title: "42. 接雨水", difficulty: "困难", level: 3, tags: ["双指针", "单调栈"], platform: "力扣" } },
  { ...base, id: id(3), created: "2026-11-02T12:40:00Z", up: 1, content: "读了它的接口缓存拦截器。清缓存时把“代际”加一，慢请求就不会把旧值填回去，这个思路很漂亮。", quote: { type: "github", url: "https://github.com/mx-space/core", owner: "mx-space", repo: "core", description: "Mix Space 的服务端，博客的内容、评论和后台接口都在这里。", stars: 1234, language: "TypeScript", languageColor: "#3178c6" } },
  { ...base, id: id(4), created: "2026-10-29T09:10:00Z", content: "电脑上的 Chrome 也能弹出系统分享面板，以前一直以为只有手机才有。", quote: { type: "link", url: "https://developer.mozilla.org/zh-CN/docs/Web/API/Web_Share_API", title: "Web Share API", description: "通过设备的系统分享面板，把文字、链接和文件分享到别的应用。", image: "/api/og" } },
  { ...base, id: id(5), created: "2026-10-27T13:00:00Z", content: "写到凌晨两点，耳机里循环的还是这首。", quote: { type: "music", url: "https://music.163.com/", title: "晴天", artist: "周杰伦", album: "叶惠美", source: "网易云音乐" } },
  { ...base, id: id(6), created: "2026-10-24T11:00:00Z", content: "小时候只记得汤婆婆，现在看懂了白龙为什么一定要想起自己的名字。", quote: { type: "media", url: "https://movie.douban.com/", title: "千与千寻", originalTitle: "千と千尋の神隠し", genre: "动画", rating: 9.4 } },
  { ...base, id: id(7), created: "2026-10-20T11:00:00Z", content: "终于把这篇从头读完了，注意力机制其实就是“按相关程度加权求和”。", quote: { type: "academic", url: "https://arxiv.org/abs/1706.03762", title: "Attention Is All You Need", authors: ["Ashish Vaswani", "Noam Shazeer", "Niki Parmar"], arxivId: "1706.03762" } },
  { ...base, id: id(8), created: "2026-10-18T13:30:00Z", up: 2, down: 1, content: "回头看这篇，最大的收获不是写了多少功能，是学会了先写一个会失败的测试。", ref: { type: "Post", title: "从 Shiro 到 Yozora", slug: "shiro-to-yozora", nid: undefined, categoryId: "debug" } },
  { ...base, id: id(9), created: "2026-10-12T22:00:00Z", content: "只有文字的一条思考：**加粗**、`行内代码`和[链接](https://example.com)都按 Markdown 显示。" },
];

export default function ThinkingPreview() {
  return (
    <>
      <ThinkingLog items={samples} categories={[{ id: "debug", slug: "debug" }]} />
      <p className="post-meta">没有任何思考时：</p>
      <ThinkingLog items={[]} categories={[]} />
    </>
  );
}
