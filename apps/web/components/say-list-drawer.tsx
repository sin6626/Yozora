"use client";

import { Drawer } from "@base-ui/react/drawer";
import { List, X } from "lucide-react";
import type { ReactNode } from "react";
import { useT } from "./locale-provider";

// 一言页右下角（手机在右上角）的“全部 N 条”：从右边滑出一列全部句子（say-list.tsx 在服务端渲染好传进来）。
// 抽屉一直挂在页面里（keepMounted），没打开时句子也在 HTML 里，读屏和搜索引擎都能读到。
export default function SayListDrawer({ count, children }: { count: number; children: ReactNode }) {
  const t = useT().says;
  return (
    <Drawer.Root swipeDirection="right">
      <Drawer.Trigger className="btn btn-sm say-list-trigger">
        <List size={14} aria-hidden="true" />
        {t.list(count)}
      </Drawer.Trigger>
      <Drawer.Portal keepMounted>
        <Drawer.Backdrop className="say-drawer-backdrop" />
        <Drawer.Viewport className="say-drawer-viewport">
          <Drawer.Popup className="say-drawer">
            <div className="say-drawer-head">
              <Drawer.Title className="say-drawer-title">{t.listTitle}</Drawer.Title>
              <Drawer.Close className="btn btn-ghost btn-sm say-drawer-close" aria-label={t.close} title={t.close}>
                <X size={16} aria-hidden="true" />
              </Drawer.Close>
            </div>
            <Drawer.Content className="say-drawer-content">{children}</Drawer.Content>
          </Drawer.Popup>
        </Drawer.Viewport>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
