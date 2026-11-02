"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { formatDate } from "../lib/date";
import { placeCard, type Say, type SkyLayout } from "../lib/says";
import { useT } from "./locale-provider";
import { SayCardButton } from "./say-tools";

// 金句星图（一言页，样式在 says.css）：一整屏星空，每句话是一颗暖色的星，同一个人说的用很淡的线连成星座（排布见 lib/says.ts 的
// skyLayout，在服务端算好，刷新不跳，句子再多也装得下）。横屏、竖屏各排一份，按屏幕方向显示一份（shapes）。
// 鼠标移到一颗星上（触屏点一下）就在它旁边浮出那句话（卡片顶上写着是谁的星座），这颗星和它的星座亮起；鼠标离开后卡片还留着，
// 点星和卡片以外的地方或按 Esc 才收起。一开始没有选中的星（2026-11-02 用户要求）。新的句子亮，旧的暗一些。
// 星只给鼠标和触屏用（对读屏隐藏），全部句子在 children（右下角“全部 N 条”抽屉）里。
type Shape = "wide" | "tall";

export default function SaySky({ layouts, says, site, children }: { layouts: Record<Shape, SkyLayout>; says: Say[]; site: string; children?: ReactNode }) {
  const t = useT().says;
  const byId = useMemo(() => new Map(says.map((say) => [say.id, say])), [says]);
  const [selected, setSelected] = useState<string>();
  const say = selected ? byId.get(selected) : undefined;
  // 点星和卡片以外的地方、按 Esc 收起卡片；“做成卡片”的弹窗开着时不算（否则卡片连同弹窗一起没了）
  useEffect(() => {
    if (!selected) return;
    const close = (event: PointerEvent) => {
      if (!(event.target as Element | null)?.closest(".say-star, .say-sky-card, .say-card-dialog, .say-card-backdrop")) setSelected(undefined);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !document.querySelector(".say-card-dialog")) setSelected(undefined);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [selected]);
  // 星空实际的像素大小，用来算那句话的卡片放哪边不盖住别的星（服务端和刚水合时按设计尺寸算）
  const fieldRef = useRef<HTMLElement>(null);
  const [size, setSize] = useState<{ width: number; height: number }>();
  useEffect(() => {
    const field = fieldRef.current;
    if (!field) return;
    const observer = new ResizeObserver(([entry]) => setSize({ width: entry.contentRect.width, height: entry.contentRect.height }));
    observer.observe(field);
    return () => observer.disconnect();
  }, []);

  return (
    <section ref={fieldRef} className="say-field" aria-label={t.sky}>
      {(["wide", "tall"] as const).map((shape) => {
        const layout = layouts[shape];
        const index = say ? layout.stars.findIndex((star) => star.id === say.id) : -1;
        const star = layout.stars[index];
        const activeGroup = star?.group;
        const group = activeGroup === undefined ? undefined : layout.groups[activeGroup];
        const place = star && placeCard({ ...layout, ...size }, index);
        return (
          // 可悬停半径按设计尺寸算；画面比设计尺寸小时按比例缩（cqw/cqh 相对星空本身），免得互相盖住
          <div key={shape} className="say-sky" data-shape={shape} style={{ "--say-sky-glow": layout.glow, "--say-hit": `min(${layout.hit}px, ${((layout.hit / layout.width) * 100).toFixed(3)}cqw, ${((layout.hit / layout.height) * 100).toFixed(3)}cqh)` } as CSSProperties}>
            <svg className="say-sky-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
              {layout.groups.map((item, groupIndex) => (
                <g key={groupIndex} data-active={groupIndex === activeGroup ? "" : undefined}>
                  {item.edges.map(([a, b]) => (
                    <line key={`${a}-${b}`} x1={layout.stars[a].x} y1={layout.stars[a].y} x2={layout.stars[b].x} y2={layout.stars[b].y} vectorEffect="non-scaling-stroke" />
                  ))}
                </g>
              ))}
            </svg>
            <div className="say-sky-stars" aria-hidden="true">
              {layout.stars.map((item, starIndex) => (
                <span
                  key={item.id}
                  className="say-star"
                  data-id={item.id}
                  data-active={item.id === say?.id ? "" : undefined}
                  data-kin={item.group === activeGroup && item.id !== say?.id && (group?.stars.length ?? 0) > 1 ? "" : undefined}
                  style={{ left: `${item.x}%`, top: `${item.y}%`, "--r": `${item.r}px`, "--b": item.b, "--twinkle-delay": `${(starIndex * 0.73) % 4}s` } as CSSProperties}
                  onPointerEnter={(event) => event.pointerType === "mouse" && setSelected(item.id)}
                  onClick={() => setSelected(item.id)}
                >
                  <span className="say-star-halo" />
                  <span className="say-star-spikes" />
                  <span className="say-star-core" />
                </span>
              ))}
            </div>
            {say && star && place && (
              <article
                key={say.id}
                className="say-sky-card"
                data-side={place.side}
                style={{ left: `${star.x}%`, top: `${star.y}%`, "--card-f": place.f } as CSSProperties}
              >
                <p className="say-sky-eyebrow" lang={group?.name ? "zh-CN" : undefined}>{group?.name ? t.constellation(group.name) : t.lone}</p>
                <blockquote lang="zh-CN">
                  <p>{say.text}</p>
                  <footer className="post-meta">
                    <span>—— {say.author?.trim() || t.anonymous}</span>
                    {say.source && <cite>{say.source}</cite>}
                  </footer>
                </blockquote>
                <div className="say-sky-card-foot">
                  <time className="say-date" dateTime={say.created}>{formatDate(say.created)}</time>
                  <SayCardButton say={say} site={site} withLabel />
                </div>
              </article>
            )}
          </div>
        );
      })}
      {children}
    </section>
  );
}
