"use client";

import { useIsland } from "../lib/island-store";
import { useT } from "./locale-provider";

// 版权说明里文章链接旁的“复制”：复制后由夜航岛播报（和文章侧栏的分享一样）
export default function CopyLinkButton({ url, title }: { url: string; title: string }) {
  const t = useT();
  const push = useIsland((state) => state.push);
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      push({ icon: "link", title: t.articleActions.copied, detail: title, duration: 2600 });
    } catch {
      push({ icon: "info", title: t.articleActions.copyFailed, detail: t.articleActions.copyFailedDetail, duration: 3200 });
    }
  }
  return <button type="button" className="post-copyright-copy" onClick={copy}>[{t.copyright.copy}]</button>;
}
