import { Clock3, Eye, Heart, Sparkle } from "lucide-react";
import "@/components/corners.css";
import "./featured-variants.css";

// 调试页“置顶 / 回忆样式候选”（2026-11-01，上一版“北极星卡片”用户嫌塑料）：三种方向并排看，真实页面先不动。
// 拼的是和 entry.tsx 一样的条目结构与类名（只多一个 fv-pinned），每组：置顶文章、普通文章、标记过的手记（回忆）。
type Sample = { day: string; month: string; title: string; tag: string; excerpt: string; label?: string; serif?: boolean; mood?: string };

const samples: Sample[] = [
  { day: "31", month: "2026.05", title: "有关驱动式学习的感悟", tag: "学习与感悟", label: "置顶", excerpt: "驱动式学习是一种以解决实际问题为导向的学习方式，而非为学习而学习。作者在大学讲座中首次接触这一概念……" },
  { day: "26", month: "2026.10", title: "Test 2", tag: "瞎扯淡", excerpt: "内容仅为笑声“哈哈哈”。" },
  { day: "05", month: "2026.09", title: "出租屋的最后一晚", tag: "近况", label: "回忆", serif: true, mood: "心情 · 坚定　天气 · 雨", excerpt: "两个月的暑假转瞬而过，今天是我在出租屋的最后一晚，记录总结下这两个月做的事情……" },
];

function Row({ sample }: { sample: Sample }) {
  return (
    <article className={["entry", sample.serif && "is-serif", sample.label && "fv-pinned"].filter(Boolean).join(" ")}>
      <time className="entry-date">
        <span className="entry-day">{sample.day}</span>
        <span className="entry-month">{sample.month}</span>
      </time>
      <div className="entry-body">
        <div className="entry-heading">
          {sample.label && <span className="fv-label"><Sparkle size={10} strokeWidth={2.25} aria-hidden="true" />{sample.label}</span>}
          <h3 className="entry-title"><a className="card-link" href="#featured-variants">{sample.title}</a></h3>
          <span className="entry-tag">{sample.tag}</span>
        </div>
        <p className="entry-excerpt">{sample.excerpt}</p>
        <div className="entry-stats">
          {sample.mood && <span>{sample.mood}</span>}
          <span><Clock3 size={12} strokeWidth={1.75} aria-hidden="true" />约 4 分钟</span>
          <span><Eye size={12} strokeWidth={1.75} aria-hidden="true" />21</span>
          <span><Heart size={12} strokeWidth={1.75} aria-hidden="true" />2</span>
        </div>
      </div>
    </article>
  );
}

const variants = [
  { key: "a", name: "A · 星轨", note: "受 React Bits 的 Star Border 启发：置顶那条只有一圈几乎看不见的细线，一颗带尾迹的小星沿着轮廓慢慢绕一圈（9 秒）。不铺底色、不加阴影，日期照旧。" },
  { key: "b", name: "B · 微光", note: "受 Shiny Text 启发：完全没有框，标题上隔一会儿扫过一道星光；标题上方一行字距拉开的小字“置顶 / 回忆”。最克制。" },
  { key: "c", name: "C · 星轨 + 微光", note: "A 和 B 叠在一起，但都调得更轻：细线上的小星绕得更慢（14 秒），标题的光扫得更少（10 秒一次）。" },
];

export default function FeaturedVariants() {
  return (
    <div className="fv-grid" id="featured-variants">
      {variants.map((variant) => (
        <section key={variant.key} className={`fv fv-${variant.key}`}>
          <h3 className="guide-heading">{variant.name}</h3>
          <p className="post-meta">{variant.note}</p>
          <ul className="post-list">
            {samples.map((sample) => <li key={sample.title}><Row sample={sample} /></li>)}
          </ul>
        </section>
      ))}
    </div>
  );
}
