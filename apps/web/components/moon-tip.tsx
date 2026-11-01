"use client";

import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { useT } from "./locale-provider";
import { useState } from "react";
import { moonInfo } from "../lib/moon";
import "./moon-tip.css";

// 首屏月亮的悬停区域：鼠标移上月亮（键盘聚焦、触屏点按也算）时，月亮外圈亮起一道光环，
// 左侧用 Motion 弹簧依次弹出今晚的月相、亮面、月龄和下一次满月/新月；移开后依次收回。没有浮层框。
// 由首屏渲染，位置和大小写在 moon-tip.css，全站夜空画布（starfield.tsx）按它的位置画月亮；数据在显示时才按当前时间计算，不进服务端渲染。
const spring = { type: "spring", stiffness: 420, damping: 22, mass: 0.8 } as const;

export default function MoonTip() {
  const t = useT().moon;
  const [info, setInfo] = useState<ReturnType<typeof moonInfo> | null>(null);
  const show = () => setInfo(moonInfo(Date.now()));
  const hide = () => setInfo(null);
  const items = info
    ? [
        // 月相名（lib/moon.ts 给的是中文名）按当前语言换
        { key: "name", label: t.tonight, value: t.phases[info.name] ?? info.name },
        { key: "lit", label: t.lit, value: `${info.illumination}%` },
        { key: "age", label: t.age, value: t.days(info.age) },
        { key: "next", label: t.phases[info.next] ?? info.next, value: t.inDays(info.daysToNext) },
      ]
    : [];

  return (
    <MotionConfig reducedMotion="user">
      <div
        className="moon-tip"
        tabIndex={0}
        aria-label={t.label}
        onPointerEnter={(event) => { if (event.pointerType === "mouse") show(); }}
        onPointerLeave={(event) => { if (event.pointerType === "mouse") hide(); }}
        onFocus={show}
        onBlur={hide}
      >
        <AnimatePresence>
          {info && (
            <motion.span
              key="ring"
              className="moon-tip-ring"
              aria-hidden="true"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1, transition: spring }}
              exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.15 } }}
            />
          )}
        </AnimatePresence>
        <ul className="moon-tip-list" aria-live="polite">
          <AnimatePresence>
            {items.map((item, index) => (
              <motion.li
                key={item.key}
                className={item.key === "name" ? "is-name" : undefined}
                initial={{ opacity: 0, x: 24, scale: 0.6 }}
                animate={{ opacity: 1, x: 0, scale: 1, transition: { ...spring, delay: index * 0.06 } }}
                exit={{ opacity: 0, x: 12, scale: 0.8, transition: { duration: 0.14, delay: (items.length - 1 - index) * 0.03 } }}
              >
                <span className="moon-tip-label">{item.label}</span>
                <span className="moon-tip-value">{item.value}</span>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      </div>
    </MotionConfig>
  );
}
