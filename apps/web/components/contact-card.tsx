"use client";

import { Popover } from "@base-ui/react/popover";
import { useState, type CSSProperties, type ReactNode } from "react";
import type { SocialCard } from "../lib/social";
import { useT } from "./locale-provider";
import SocialTooltip from "./social-tooltip";
import "./contact-card.css";

// 微信、QQ、Discord、赞赏码这类“名片”（首屏和导航“首页”面板共用）：没有网页主页，点图标弹出一张小卡片，放二维码和号码（可复制）。
// 图标由服务端渲染好传进来（Iconify 只在服务端用）；点外面或按 Esc 关闭。
// container：卡片挂在哪个元素里，默认 body。在导航面板里要挂进面板的弹层，否则鼠标移到卡片上算离开面板、面板连同卡片一起收起。
// tooltip：鼠标移上去在图标上方显示平台名称（首屏用，social-tooltip.tsx），点开卡片时提示收起；不开时用浏览器自带的 title。
export default function ContactCard({ card, icon, container, side = "top", tooltip = false }: { card: SocialCard; icon: ReactNode; container?: HTMLElement | null; side?: "top" | "bottom"; tooltip?: boolean }) {
  const t = useT().contactCard;
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    if (!card.id) return;
    try {
      await navigator.clipboard.writeText(card.id);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // 剪贴板不可用（如非安全上下文）时号码仍显示在卡片上，可以手动选中
    }
  };

  // 鼠标移上或键盘聚焦时就开始加载二维码，点开时多半已经加载好
  const prefetch = () => {
    if (card.qr) new Image().src = card.qr;
  };

  // 赞赏码：没有号码，卡片说明换成“请我喝杯茶”
  const donate = card.key === "donate";

  const trigger = (
    <Popover.Trigger className="contact-trigger" aria-label={donate ? t.donateOpen(card.label) : t.open(card.label)} title={tooltip ? undefined : card.label} onPointerEnter={prefetch} onFocus={prefetch}>
      {icon}
    </Popover.Trigger>
  );

  return (
    <Popover.Root>
      {tooltip ? <SocialTooltip label={card.label}>{trigger}</SocialTooltip> : trigger}
      <Popover.Portal container={container}>
        <Popover.Positioner className="contact-card-positioner" side={side} sideOffset={14} collisionPadding={16}>
          <Popover.Popup className="contact-card" style={{ "--brand": card.color } as CSSProperties}>
            <Popover.Title className="contact-card-title">
              <span className="contact-card-icon" aria-hidden="true">{icon}</span>
              {card.label}
            </Popover.Title>
            {card.qr && (
              // eslint-disable-next-line @next/next/no-img-element -- 后台上传到图床的二维码
              <img className="contact-card-qr" src={card.qr} alt={t.qrAlt(card.label)} />
            )}
            {card.id && (
              <p className="contact-card-id">
                <span>{card.id}</span>
                <button type="button" className="btn btn-sm" onClick={copy} aria-live="polite">
                  {copied ? t.copied : t.copy}
                </button>
              </p>
            )}
            {donate ? <p className="contact-card-hint">{t.donateHint}</p> : !card.qr && <p className="contact-card-hint">{t.hint}</p>}
            <Popover.Arrow className="contact-card-arrow" />
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
