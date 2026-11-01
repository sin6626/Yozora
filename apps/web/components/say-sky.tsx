"use client";

import { Dices, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { formatDate } from "../lib/date";
import { drawSay, type Say, type SkyLayout } from "../lib/says";
import { useT } from "./locale-provider";
import { SayCardButton } from "./say-tools";

// 金句星图（一言页顶部，样式在 says.css）：左边一张圆形星盘，每句话是一颗星，同一个人说的用细线连成星座（排布见 lib/says.ts 的 skyLayout，
// 在服务端算好，刷新不跳）；右边是“读星”面板。鼠标移到一颗星上（触屏点一下）就选中它，这颗星和它的星座亮起，面板翻出这句话；
// “抽一句”时一颗流星划过星盘落到抽中的星上。“按人看”选了某个人时，其他星座变暗，抽一句也只在这个人说的里面抽。
// 星盘只给鼠标和触屏用（对读屏隐藏），同样的内容在下面的普通列表里都有。
const flightMs = 700;

export default function SaySky({ layout, says, author, site }: { layout: SkyLayout; says: Say[]; author?: string; site: string }) {
  const t = useT().says;
  const byId = useMemo(() => new Map(says.map((say) => [say.id, say])), [says]);
  const starOf = useMemo(() => new Map(layout.stars.map((star) => [star.id, star])), [layout]);
  const [selected, setSelected] = useState<string | null>(null);
  const [flight, setFlight] = useState<{ id: string; x: number; y: number; key: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const focusGroup = author ? layout.groups.findIndex((group) => group.name === author) : -1;
  const activeGroup = selected ? starOf.get(selected)?.group : undefined;
  const say = selected ? byId.get(selected) : undefined;
  const pool = author ? says.filter((item) => item.author?.trim() === author) : says;

  const draw = () => {
    const next = drawSay(pool, selected ?? undefined);
    const star = next && starOf.get(next.id);
    if (!next || !star) return;
    clearTimeout(timer.current);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return setSelected(next.id);
    // 流星从星盘外沿左上方划进来
    const turn = Math.PI * (1.05 + Math.random() * 0.4);
    const reach = layout.limit + 30;
    setFlight({ id: next.id, x: layout.size / 2 + reach * Math.cos(turn), y: layout.size / 2 + reach * Math.sin(turn), key: Date.now() });
    timer.current = setTimeout(() => {
      setSelected(next.id);
      setFlight(null);
    }, flightMs);
  };

  const groupName = (index: number) => {
    const name = layout.groups[index]?.name;
    return name ? t.constellation(name) : t.lone;
  };
  const named = layout.groups.filter((group) => group.name).length;
  const target = flight && starOf.get(flight.id);

  return (
    <section className="say-sky" aria-label={t.sky}>
      <div className="say-sky-chart" aria-hidden="true">
        <svg viewBox={`0 0 ${layout.size} ${layout.size}`} data-focus={focusGroup >= 0 ? "" : undefined}>
          <defs>
            <radialGradient id="say-sky-glow">
              <stop offset="0" style={{ stopColor: "var(--moonlight)", stopOpacity: 0.85 }} />
              <stop offset="1" style={{ stopColor: "var(--moonlight)", stopOpacity: 0 }} />
            </radialGradient>
            {target && flight && (
              <linearGradient id="say-sky-trail" gradientUnits="userSpaceOnUse" x1={flight.x} y1={flight.y} x2={target.x} y2={target.y}>
                <stop offset="0" style={{ stopColor: "var(--moonlight)", stopOpacity: 0 }} />
                <stop offset="1" style={{ stopColor: "var(--moonlight)", stopOpacity: 1 }} />
              </linearGradient>
            )}
          </defs>
          {/* 星盘：外圈、两道虚线圈、一圈刻度 */}
          <g className="say-sky-grid">
            <circle cx={layout.size / 2} cy={layout.size / 2} r={layout.limit + 18} />
            <circle className="say-sky-ring" cx={layout.size / 2} cy={layout.size / 2} r={(layout.limit + 18) * 0.66} />
            <circle className="say-sky-ring" cx={layout.size / 2} cy={layout.size / 2} r={(layout.limit + 18) * 0.33} />
            {Array.from({ length: 48 }, (_, i) => {
              const turn = (i / 48) * Math.PI * 2;
              const outer = layout.limit + 18;
              const inner = outer - (i % 4 === 0 ? 7 : 3.5);
              const c = layout.size / 2;
              // 取一位小数：服务端和浏览器的三角函数末位可能不同，不取整会水合不一致
              const at = (value: number) => Math.round(value * 10) / 10;
              return <line key={i} x1={at(c + inner * Math.cos(turn))} y1={at(c + inner * Math.sin(turn))} x2={at(c + outer * Math.cos(turn))} y2={at(c + outer * Math.sin(turn))} />;
            })}
          </g>
          {layout.dust.map((dot, i) => (
            <circle key={i} className="say-sky-dust" cx={dot.x} cy={dot.y} r={dot.r} opacity={dot.o} />
          ))}
          {layout.groups.map((group, index) => (
            <g key={index} className="say-sky-group" data-active={index === activeGroup ? "" : undefined} data-dim={focusGroup >= 0 && index !== focusGroup ? "" : undefined}>
              {group.edges.map(([a, b]) => (
                <line key={`${a}-${b}`} className="say-sky-line" x1={layout.stars[a].x} y1={layout.stars[a].y} x2={layout.stars[b].x} y2={layout.stars[b].y} />
              ))}
              {group.label && group.name && (
                <text className="say-sky-label" x={group.label.x} y={group.label.y} lang="zh-CN">
                  {t.constellation(group.name)}
                </text>
              )}
            </g>
          ))}
          {layout.stars.map((star, index) => (
            <g
              key={star.id}
              className="say-sky-star"
              data-id={star.id}
              data-active={star.id === selected ? "" : undefined}
              data-dim={focusGroup >= 0 && star.group !== focusGroup ? "" : undefined}
              transform={`translate(${star.x} ${star.y})`}
              style={{ "--twinkle-delay": `${(index * 0.73) % 4}s` } as CSSProperties}
              onPointerEnter={(event) => event.pointerType === "mouse" && setSelected(star.id)}
              onClick={() => setSelected(star.id)}
            >
              <circle className="say-sky-halo" r={star.r * 5} />
              <path className="say-sky-spikes" d={`M ${-star.r * 4} 0 H ${star.r * 4} M 0 ${-star.r * 4} V ${star.r * 4}`} />
              <circle className="say-sky-core" r={star.r} />
              {/* 看不见的大一圈，好点中 */}
              <circle className="say-sky-hit" r={12} />
            </g>
          ))}
          {flight && target && (
            <line key={flight.key} className="say-sky-flight" x1={flight.x} y1={flight.y} x2={target.x} y2={target.y} pathLength={1} stroke="url(#say-sky-trail)" />
          )}
        </svg>
      </div>

      <div className="say-sky-panel" aria-live="polite">
        {say ? (
          <article key={say.id} className="say-sky-reading">
            <p className="say-sky-eyebrow">{groupName(starOf.get(say.id)?.group ?? -1)}</p>
            <blockquote lang="zh-CN">
              <p>{say.text}</p>
              <footer className="post-meta">
                <span>—— {say.author?.trim() || t.anonymous}</span>
                {say.source && <cite>{say.source}</cite>}
              </footer>
            </blockquote>
            <time className="say-date" dateTime={say.created}>{formatDate(say.created)}</time>
            <div className="say-sky-actions">
              <button type="button" className="btn btn-sm say-draw-button" onClick={draw}>
                <Dices size={14} aria-hidden="true" />
                {t.drawAgain}
              </button>
              <SayCardButton say={say} site={site} withLabel />
              <button type="button" className="btn btn-ghost btn-sm say-sky-back" aria-label={t.back} title={t.back} onClick={() => setSelected(null)}>
                <X size={14} aria-hidden="true" />
              </button>
            </div>
          </article>
        ) : (
          <div className="say-sky-intro">
            <h2>{t.sky}</h2>
            <p>{t.skyHint}</p>
            <p className="post-meta">{t.skyCount(layout.stars.length, named)}</p>
            {pool.length > 0 && (
              <button type="button" className="btn btn-sm say-draw-button" onClick={draw}>
                <Dices size={14} aria-hidden="true" />
                {t.draw}
              </button>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
