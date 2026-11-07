import { create } from "zustand";

// 页头“夜航岛”（components/site-header.tsx）的共享状态，用 Zustand：
// 页头、文章页的阅读进度、通知、导航面板分散在互不相邻的组件里，都要读写这份状态。
// - reading：当前在读的文章/手记/页面（详情页挂 IslandReading 时登记，离开时清空），progress 是 0–1 的阅读进度；
// - activities：要在岛上播报的实时活动（新文章、文章修改删除……），排队一条条播，每条显示 duration 毫秒；
// - navOpen：导航面板是否展开着（展开时岛不能收起，否则面板会失去依附）。

export type IslandActivityIcon = "link" | "comment" | "post" | "note" | "thinking" | "say" | "update" | "remove" | "info";

export type IslandActivity = {
  id: number;
  icon: IslandActivityIcon;
  title: string;
  detail?: string;
  // 第二行和页面不是同一种语言时标出来（外文页面播报中文原题时是 zh-CN）
  detailLang?: string;
  href?: string;
  duration: number;
};

// kind 是键（post/note/page），显示时按当前语言翻译（messages 的 header.kinds）
export type IslandReadingKind = "post" | "note" | "page";
export type IslandReading = { title: string; kind: IslandReadingKind; date?: string; progress: number };

type IslandState = {
  reading: IslandReading | null;
  activities: IslandActivity[];
  navOpen: boolean;
  push: (activity: Omit<IslandActivity, "id" | "duration"> & { duration?: number }) => void;
  shift: () => void;
  setReading: (reading: IslandReading | null) => void;
  setProgress: (progress: number) => void;
  setNavOpen: (open: boolean) => void;
};

let nextId = 0;
// 同时最多排 3 条，再多就丢掉最旧的待播条目（正在播的那条保留）
const maxQueue = 3;

export const useIsland = create<IslandState>()((set) => ({
  reading: null,
  activities: [],
  navOpen: false,
  push: ({ duration = 3200, ...activity }) =>
    set((state) => {
      const queue = [...state.activities, { ...activity, duration, id: ++nextId }];
      return { activities: queue.length > maxQueue ? [queue[0], ...queue.slice(-(maxQueue - 1))] : queue };
    }),
  shift: () => set((state) => ({ activities: state.activities.slice(1) })),
  setReading: (reading) => set({ reading }),
  setProgress: (progress) =>
    set((state) => (state.reading && Math.abs(state.reading.progress - progress) > 0.002 ? { reading: { ...state.reading, progress } } : state)),
  setNavOpen: (navOpen) => set({ navOpen }),
}));
