"use client";

import { Tooltip } from "@base-ui/react/tooltip";
import type { ReactElement, ReactNode } from "react";
import "./social-tooltip.css";

// 社交图标的悬停提示（首屏与导航“首页”面板，2026-11-01 用户要求）：鼠标移上或键盘聚焦时，在图标上方显示平台名称（Base UI 官方 Tooltip）。
// children 是触发元素本身（链接，或名片的 Popover.Trigger），提示挂在它上面；点一下提示就收起，不挡名片卡片。
// container：提示挂在哪个元素里，默认 body；导航面板里挂进弹层（同名片卡片，见 navigation-menu.tsx 的 cardHost），否则会被面板盖住或让面板收起。
// 外面套一层 SocialTooltipGroup：第一次停 200 毫秒才出现，之后在相邻图标间移动立即切换。触屏没有悬停，不显示。
export default function SocialTooltip({ label, children, container }: { label: string; children: ReactElement; container?: HTMLElement | null }) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger delay={200} render={children} />
      <Tooltip.Portal container={container}>
        <Tooltip.Positioner side="top" sideOffset={10} collisionPadding={8}>
          <Tooltip.Popup className="social-tooltip">
            {label}
            <Tooltip.Arrow className="social-tooltip-arrow" />
          </Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

export function SocialTooltipGroup({ children }: { children: ReactNode }) {
  return <Tooltip.Provider delay={200}>{children}</Tooltip.Provider>;
}
