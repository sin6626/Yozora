"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { formatDate } from "../lib/date";
import { placeCard, type Say, type SkyLayout } from "../lib/says";
import { useT } from "./locale-provider";
import { SayCardButton } from "./say-tools";

// 金句星图（一言页，样式在 says.css）：一整屏星空，每句话是一颗暖色的星，同一个人说的用很淡的线连成星座（排布见 lib/says.ts 的
// skyLayout，在服务端算好，刷新不跳，句子再多也装得下）。横屏、竖屏各排一份，按屏幕方向显示一份（shapes）。
// 鼠标移到一颗星上就在它旁边浮出那句话（不写“某某座”），这颗星和它的星座亮起；鼠标离开星和卡片 160 毫秒后卡片收起（2026-11-02 用户：
// 原来离开后卡片还留着，手感卡、还挡住别的星），所以从星移到卡片上点“做成卡片”来得及，离开后被挡住的星也马上能点到。
// 卡片从星那一边浮出、收起时往回淡出，中间一条细引线连着星。触屏点一下星打开，点别处或按 Esc 收起。一开始没有选中的星。新的句子亮，旧的暗一些。
// 星只给鼠标和触屏用（对读屏隐藏），全部句子在 children（say-list.tsx 给读屏的 sr-only 列表）里。
type Shape = "wide" | "tall";
// 正在显示的卡片和正在淡出的卡片（换星时旧的淡出、新的浮出，同时在画面上）
type Card = { id: string; leaving?: boolean };
const hideDelay = 160;

export default function SaySky({ layouts, says, site, children }: { layouts: Record<Shape, SkyLayout>; says: Say[]; site: string; children?: ReactNode }) {
  const t = useT().says;
  const byId = useMemo(() => new Map(says.map((say) => [say.id, say])), [says]);
  // 进场：从最早收录的那句开始依次点亮（每颗最多晚 250ms，约 2 秒亮完）；星都亮了以后，连线按连上的那颗星多新一段段画出来（says.css）
  const entrance = useMemo(() => {
    const rank = new Map([...says].sort((a, b) => a.created.localeCompare(b.created)).map((item, index) => [item.id, index]));
    const step = Math.min(250, 2000 / Math.max(says.length - 1, 1));
    return { rank, step, linesAt: Math.max(says.length - 1, 0) * step + 500 };
  }, [says]);
  const [cards, setCards] = useState<Card[]>([]);
  const selected = cards.find((card) => !card.leaving)?.id;
  const say = selected ? byId.get(selected) : undefined;
  const hideTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  // “做成卡片”的弹窗开着时卡片不收（否则卡片连同弹窗一起没了）
  const dialogOpen = useRef(false);
  const show = useCallback((id?: string) => {
    clearTimeout(hideTimer.current);
    setCards((list) => (list.find((card) => !card.leaving)?.id === id ? list : [...list.filter((card) => card.id !== id).map((card) => ({ ...card, leaving: true })), ...(id ? [{ id }] : [])]));
  }, []);
  const hideSoon = () => {
    clearTimeout(hideTimer.current);
    if (!dialogOpen.current) hideTimer.current = setTimeout(() => show(undefined), hideDelay);
  };
  const keep = () => clearTimeout(hideTimer.current);
  const dropLeaving = (id: string) => setCards((list) => list.filter((card) => !(card.id === id && card.leaving)));
  useEffect(() => () => clearTimeout(hideTimer.current), []);
  // 触屏：点星和卡片以外的地方收起；按 Esc 收起
  useEffect(() => {
    if (!selected) return;
    const close = (event: PointerEvent) => {
      if (!(event.target as Element | null)?.closest(".say-star, .say-sky-card, .say-card-dialog, .say-card-backdrop")) show(undefined);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !document.querySelector(".say-card-dialog")) show(undefined);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [selected, show]);
  // 弹窗关上后，鼠标下一次移动时如果不在星和卡片上，就收起卡片
  const dialogChange = (open: boolean) => {
    dialogOpen.current = open;
    if (open) return;
    document.addEventListener("pointermove", (event) => {
      if (!(event.target as Element | null)?.closest(".say-sky-card, .say-star")) show(undefined);
    }, { once: true });
  };
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
      {/* 浅色主题的“星图图版”（says.css）：双线图框、四边刻度尺和刻度数、圆锥投影的赤纬圈与赤经线、左下“新—旧”星等图例、右下题签。熄灯时不显示 */}
      <div className="say-plate" aria-hidden="true">
        <svg className="say-plate-grid" viewBox="0 0 1600 760" preserveAspectRatio="xMidYMid slice">
          {[1180, 1330, 1480, 1630].map((radius) => <circle key={radius} cx={800} cy={-950} r={radius} />)}
          {[-36, -24, -12, 0, 12, 24, 36].map((angle) => {
            const turn = (angle * Math.PI) / 180;
            return <line key={angle} x1={800} y1={-950} x2={Math.round(800 + 2900 * Math.sin(turn))} y2={Math.round(-950 + 2900 * Math.cos(turn))} />;
          })}
        </svg>
        <div className="say-plate-frame">
          <span className="say-plate-ruler is-top">{["0ʰ", "2ʰ", "4ʰ", "6ʰ", "8ʰ", "10ʰ", "12ʰ"].map((mark) => <i key={mark}>{mark}</i>)}</span>
          <span className="say-plate-ruler is-left">{["+60°", "+45°", "+30°", "+15°", "0°"].map((mark) => <i key={mark}>{mark}</i>)}</span>
          <span className="say-plate-legend">
            <i>{t.newer}</i>
            {[9, 7, 5, 3.5].map((size) => <b key={size} style={{ width: size, height: size }} />)}
            <i>{t.older}</i>
          </span>
          <span className="say-plate-title">
            <em>Yozora</em>
            {t.plate}
          </span>
        </div>
      </div>
      {(["wide", "tall"] as const).map((shape) => {
        const layout = layouts[shape];
        const index = say ? layout.stars.findIndex((star) => star.id === say.id) : -1;
        const activeGroup = layout.stars[index]?.group;
        const group = activeGroup === undefined ? undefined : layout.groups[activeGroup];
        const newer = ([a, b]: [number, number]) => Math.max(entrance.rank.get(layout.stars[a].id) ?? 0, entrance.rank.get(layout.stars[b].id) ?? 0);
        const edgeOrder = new Map(layout.groups.flatMap((item) => item.edges).sort((x, y) => newer(x) - newer(y)).map(([a, b], order) => [`${a}-${b}`, order]));
        const edgeStep = Math.min(140, 1400 / Math.max(edgeOrder.size, 1));
        return (
          // 可悬停半径按设计尺寸算；画面比设计尺寸小时按比例缩（cqw/cqh 相对星空本身），免得互相盖住
          <div key={shape} className="say-sky" data-shape={shape} style={{ "--say-sky-glow": layout.glow, "--say-hit": `min(${layout.hit}px, ${((layout.hit / layout.width) * 100).toFixed(3)}cqw, ${((layout.hit / layout.height) * 100).toFixed(3)}cqh)` } as CSSProperties}>
            <svg className="say-sky-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
              {layout.groups.map((item, groupIndex) => (
                <g key={groupIndex} data-active={groupIndex === activeGroup ? "" : undefined}>
                  {item.edges.map(([a, b]) => (
                    <line
                      key={`${a}-${b}`}
                      x1={layout.stars[a].x}
                      y1={layout.stars[a].y}
                      x2={layout.stars[b].x}
                      y2={layout.stars[b].y}
                      vectorEffect="non-scaling-stroke"
                      style={{ "--dx": layout.stars[b].x - layout.stars[a].x, "--dy": layout.stars[b].y - layout.stars[a].y, "--draw-at": `${Math.round(entrance.linesAt + (edgeOrder.get(`${a}-${b}`) ?? 0) * edgeStep)}ms` } as CSSProperties}
                    />
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
                  style={{ left: `${item.x}%`, top: `${item.y}%`, "--r": `${item.r}px`, "--b": item.b, "--twinkle-delay": `${(starIndex * 0.73) % 4}s`, "--light-at": `${Math.round((entrance.rank.get(item.id) ?? 0) * entrance.step)}ms` } as CSSProperties}
                  onPointerEnter={(event) => event.pointerType === "mouse" && show(item.id)}
                  onPointerLeave={(event) => event.pointerType === "mouse" && hideSoon()}
                  onClick={() => show(item.id)}
                >
                  <span className="say-star-halo" />
                  <span className="say-star-spikes" />
                  <span className="say-star-core" />
                </span>
              ))}
            </div>
            {cards.map((card) => {
              const quote = byId.get(card.id);
              const starIndex = layout.stars.findIndex((star) => star.id === card.id);
              const star = layout.stars[starIndex];
              if (!quote || !star) return null;
              const place = placeCard({ ...layout, ...size }, starIndex);
              return (
                <article
                  key={card.id}
                  className="say-sky-card"
                  data-side={place.side}
                  data-leaving={card.leaving ? "" : undefined}
                  inert={card.leaving}
                  style={{ left: `${star.x}%`, top: `${star.y}%`, "--card-f": place.f } as CSSProperties}
                  onPointerEnter={(event) => event.pointerType === "mouse" && keep()}
                  onPointerLeave={(event) => event.pointerType === "mouse" && hideSoon()}
                  onAnimationEnd={(event) => card.leaving && event.animationName.startsWith("say-sky-out") && dropLeaving(card.id)}
                >
                  <blockquote lang="zh-CN">
                    <p>{quote.text}</p>
                    <footer className="post-meta">
                      <span>—— {quote.author?.trim() || t.anonymous}</span>
                      {quote.source && <cite>{quote.source}</cite>}
                    </footer>
                  </blockquote>
                  <div className="say-sky-card-foot">
                    <time className="say-date" dateTime={quote.created}>{formatDate(quote.created)}</time>
                    <SayCardButton say={quote} site={site} onOpenChange={dialogChange} />
                  </div>
                </article>
              );
            })}
          </div>
        );
      })}
      {children}
    </section>
  );
}
