"use client";

import { useMemo, useState, type CSSProperties } from "react";
import { formatDate } from "../lib/date";
import type { Say, SkyLayout } from "../lib/says";
import { useT } from "./locale-provider";
import { SayCardButton } from "./say-tools";

// 金句星图（一言页顶部，样式在 says.css）：左边一张圆形星盘，每句话是一颗星，同一个人说的用细线连成星座（排布见 lib/says.ts 的 skyLayout，
// 在服务端算好，刷新不跳，句子再多也装得下）；右边是这颗星的那句话。鼠标移到一颗星上（触屏点一下）就换成它，这颗星和它的星座亮起；
// 一开始显示最新的一句。只有一颗星的星座平时不标名字（人多时名字会挤成一片），选中时才标；天上已经有成形的星座时，
// 这些单颗的星画得暗一点，好让星座跳出来。星多时光晕跟着变淡（layout.glow）。
// 星盘只给鼠标和触屏用（对读屏隐藏），同样的内容在下面的普通列表里都有。
export default function SaySky({ layout, says, site }: { layout: SkyLayout; says: Say[]; site: string }) {
  const t = useT().says;
  const byId = useMemo(() => new Map(says.map((say) => [say.id, say])), [says]);
  const starOf = useMemo(() => new Map(layout.stars.map((star) => [star.id, star])), [layout]);
  const newest = useMemo(() => says.reduce<Say | undefined>((latest, say) => (!latest || Date.parse(say.created) > Date.parse(latest.created) ? say : latest), undefined), [says]);
  const [selected, setSelected] = useState(newest?.id);
  const say = (selected && byId.get(selected)) || newest;
  const activeGroup = say ? starOf.get(say.id)?.group : undefined;
  const center = layout.size / 2;
  const rim = layout.limit + 18;
  // 取一位小数：服务端和浏览器的三角函数末位可能不同，不取整会水合不一致
  const at = (value: number) => Math.round(value * 10) / 10;

  if (!say) return null;
  const group = activeGroup === undefined ? undefined : layout.groups[activeGroup];
  const formed = layout.groups.some((item) => item.stars.length > 1);
  return (
    <section className="say-sky" aria-label={t.sky}>
      <div className="say-sky-chart" aria-hidden="true">
        <svg viewBox={`0 0 ${layout.size} ${layout.size}`} style={{ "--say-sky-glow": layout.glow } as CSSProperties}>
          <defs>
            <radialGradient id="say-sky-glow">
              <stop offset="0" style={{ stopColor: "var(--moonlight)", stopOpacity: 0.85 }} />
              <stop offset="1" style={{ stopColor: "var(--moonlight)", stopOpacity: 0 }} />
            </radialGradient>
          </defs>
          {/* 星盘：外圈、两道虚线圈、一圈刻度 */}
          <g className="say-sky-grid">
            <circle cx={center} cy={center} r={rim} />
            <circle className="say-sky-ring" cx={center} cy={center} r={rim * 0.66} />
            <circle className="say-sky-ring" cx={center} cy={center} r={rim * 0.33} />
            {Array.from({ length: 48 }, (_, i) => {
              const turn = (i / 48) * Math.PI * 2;
              const inner = rim - (i % 4 === 0 ? 7 : 3.5);
              return <line key={i} x1={at(center + inner * Math.cos(turn))} y1={at(center + inner * Math.sin(turn))} x2={at(center + rim * Math.cos(turn))} y2={at(center + rim * Math.sin(turn))} />;
            })}
          </g>
          {layout.dust.map((dot, i) => (
            <circle key={i} className="say-sky-dust" cx={dot.x} cy={dot.y} r={dot.r} opacity={dot.o} />
          ))}
          {layout.groups.map((item, index) => (
            <g key={index} className="say-sky-group" data-active={index === activeGroup ? "" : undefined}>
              {item.edges.map(([a, b]) => (
                <line key={`${a}-${b}`} className="say-sky-line" x1={layout.stars[a].x} y1={layout.stars[a].y} x2={layout.stars[b].x} y2={layout.stars[b].y} />
              ))}
              {item.label && item.name && (item.stars.length > 1 || index === activeGroup) && (
                <text className="say-sky-label" x={item.label.x} y={item.label.y} lang="zh-CN">
                  {t.constellation(item.name)}
                </text>
              )}
            </g>
          ))}
          {layout.stars.map((star, index) => (
            <g
              key={star.id}
              className="say-sky-star"
              data-id={star.id}
              data-active={star.id === say.id ? "" : undefined}
              data-faint={formed && layout.groups[star.group].stars.length === 1 ? "" : undefined}
              transform={`translate(${star.x} ${star.y})`}
              style={{ "--twinkle-delay": `${(index * 0.73) % 4}s` } as CSSProperties}
              onPointerEnter={(event) => event.pointerType === "mouse" && setSelected(star.id)}
              onClick={() => setSelected(star.id)}
            >
              <circle className="say-sky-halo" r={star.r * 5} />
              <path className="say-sky-spikes" d={`M ${-star.r * 4} 0 H ${star.r * 4} M 0 ${-star.r * 4} V ${star.r * 4}`} />
              <circle className="say-sky-core" r={star.r} />
              {/* 看不见的大一圈，好点中（星多时跟着缩小，免得互相盖住） */}
              <circle className="say-sky-hit" r={layout.hit} />
            </g>
          ))}
        </svg>
      </div>

      <div className="say-sky-panel" aria-live="polite">
        <article key={say.id} className="say-sky-reading">
          <p className="say-sky-eyebrow" lang={group?.name ? "zh-CN" : undefined}>{group?.name ? t.constellation(group.name) : t.lone}</p>
          <blockquote lang="zh-CN">
            <p>{say.text}</p>
            <footer className="post-meta">
              <span>—— {say.author?.trim() || t.anonymous}</span>
              {say.source && <cite>{say.source}</cite>}
            </footer>
          </blockquote>
          <time className="say-date" dateTime={say.created}>{formatDate(say.created)}</time>
          <div className="say-sky-actions">
            <SayCardButton say={say} site={site} withLabel />
          </div>
        </article>
      </div>
    </section>
  );
}
