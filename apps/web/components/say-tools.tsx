"use client";

import { Dialog } from "@base-ui/react/dialog";
import { Dices, ImageDown, Share2, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { formatDate } from "../lib/date";
import { drawSayCard } from "../lib/say-card";
import { drawSay, type Say } from "../lib/says";
import { useT } from "./locale-provider";
import "lxgw-wenkai-webfont/lxgwwenkai-light.css";

// 一言页的两样小互动（样式在 says.css）：
// - SayDraw：工具栏（左边是服务端渲染好的“按人看”胶囊，右边“抽一句”），点一下像抽签一样翻出一句，可以再抽、做成卡片、收起；
// - SayCardButton：把一句话画成金句卡片图（lib/say-card.ts），在弹窗里预览，可以保存或用系统分享发出去。

export function SayDraw({ says, site, children }: { says: Say[]; site: string; children?: ReactNode }) {
  const t = useT().says;
  const [drawn, setDrawn] = useState<Say>();
  const draw = () => setDrawn(drawSay(says, drawn?.id));
  return (
    <>
      <div className="say-toolbar">
        {children}
        {says.length > 0 && (
          <button type="button" className="btn btn-sm say-draw-button" onClick={draw}>
            <Dices size={15} aria-hidden="true" />
            {drawn ? t.drawAgain : t.draw}
          </button>
        )}
      </div>
      {drawn && (
        <section key={drawn.id} className="say-drawn" aria-live="polite" aria-label={t.drawn}>
          <p className="say-drawn-label">{t.drawn}</p>
          <blockquote lang="zh-CN">
            <p>{drawn.text}</p>
            <footer className="post-meta">
              <span>—— {drawn.author?.trim() || t.anonymous}</span>
              {drawn.source && <cite>{drawn.source}</cite>}
            </footer>
          </blockquote>
          <div className="say-drawn-actions">
            <button type="button" className="btn btn-sm" onClick={draw}>
              <Dices size={14} aria-hidden="true" />
              {t.drawAgain}
            </button>
            <SayCardButton say={drawn} site={site} withLabel />
            <button type="button" className="btn btn-ghost btn-sm say-drawn-close" aria-label={t.close} title={t.close} onClick={() => setDrawn(undefined)}>
              <X size={14} aria-hidden="true" />
            </button>
          </div>
        </section>
      )}
    </>
  );
}

type Card = { url: string; file: File; canShare: boolean };

export function SayCardButton({ say, site, withLabel }: { say: Say; site: string; withLabel?: boolean }) {
  const t = useT().says;
  const [open, setOpen] = useState(false);
  const [card, setCard] = useState<Card | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    let url = "";
    drawSayCard(say, { site, date: formatDate(say.created), anonymous: t.anonymous })
      .then((blob) => {
        if (cancelled) return;
        url = URL.createObjectURL(blob);
        const file = new File([blob], `${t.card}-${say.author?.trim() || t.anonymous}.png`, { type: "image/png" });
        setCard({ url, file, canShare: Boolean(navigator.canShare?.({ files: [file] })) });
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
      setCard(null);
      setFailed(false);
    };
  }, [open, say, site, t]);

  const share = async () => {
    if (!card) return;
    try {
      await navigator.share({ files: [card.file], text: say.text });
    } catch {}
  };

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger className={withLabel ? "btn btn-sm" : "say-card-button"} aria-label={withLabel ? undefined : t.makeCard} title={withLabel ? undefined : t.makeCard}>
        <ImageDown size={withLabel ? 14 : 16} aria-hidden="true" />
        {withLabel && t.makeCard}
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Backdrop className="say-card-backdrop" />
        <Dialog.Popup className="say-card-dialog">
          <Dialog.Title className="sr-only">{t.card}</Dialog.Title>
          <div className="say-card-preview">
            {card ? (
              // eslint-disable-next-line @next/next/no-img-element -- 浏览器里刚画好的图片（blob 地址）
              <img src={card.url} alt={say.text} width={1080} height={1350} />
            ) : (
              <p role="status">{failed ? t.cardFailed : t.making}</p>
            )}
          </div>
          <div className="say-card-actions">
            {card && (
              <a className="btn btn-primary btn-sm" href={card.url} download={card.file.name}>
                <ImageDown size={14} aria-hidden="true" />
                {t.save}
              </a>
            )}
            {card?.canShare && (
              <button type="button" className="btn btn-sm" onClick={share}>
                <Share2 size={14} aria-hidden="true" />
                {t.share}
              </button>
            )}
            <Dialog.Close className="btn btn-ghost btn-sm">{t.close}</Dialog.Close>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
