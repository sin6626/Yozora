"use client";

import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { useT } from "./locale-provider";

type Attitude = "up" | "down";
const noSubscribe = () => () => {};

// 思考（Core 的“动态”）的赞/踩。直接从浏览器请求 Core（按访客 IP 记录）：
// 再点同一个是取消，点另一个是改投；Core 返回 1 表示已投、-1 表示已取消。上次的选择记在本地，只用于按钮高亮。
// 投票后先就地更新，再让列表缓存失效并刷新，拿到服务端的真实票数后丢掉本地推算（列表缓存里的旧票数不能在本地再加减，否则会出现负数）。
export default function RecentlyAttitude({ apiUrl, id, up, down }: { apiUrl: string; id: string; up: number; down: number }) {
  const router = useRouter();
  const t = useT().thinking;
  const key = `attitude:${id}`;
  const stored = useSyncExternalStore(noSubscribe, () => localStorage.getItem(key) as Attitude | null, () => null);
  const [local, setLocal] = useState<{ base: { up: number; down: number }; mine: Attitude | null; up: number; down: number } | null>(null);
  // 服务端票数变了（刷新后），说明本地推算已过时。
  if (local && (local.base.up !== up || local.base.down !== down)) setLocal(null);
  const current = local ?? { mine: stored, up, down };
  const [pending, setPending] = useState(false);

  async function vote(attitude: Attitude) {
    setPending(true);
    try {
      const response = await fetch(`${apiUrl}/recently/attitude/${id}?attitude=${attitude === "up" ? 0 : 1}`);
      const body = response.ok ? await response.json().catch(() => null) as { code?: number } | null : null;
      if (!body) return;
      const next = { base: { up, down }, mine: current.mine, up: current.up, down: current.down };
      if (current.mine) next[current.mine] = Math.max(0, next[current.mine] - 1);
      next.mine = body.code === -1 ? null : attitude;
      if (next.mine) next[next.mine] += 1;
      if (next.mine) localStorage.setItem(key, next.mine);
      else localStorage.removeItem(key);
      setLocal(next);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <button className="toggle-chip" type="button" aria-pressed={current.mine === "up"} disabled={pending} onClick={() => vote("up")}>{t.up} {current.up}</button>
      <button className="toggle-chip" type="button" aria-pressed={current.mine === "down"} disabled={pending} onClick={() => vote("down")}>{t.down} {current.down}</button>
    </>
  );
}
