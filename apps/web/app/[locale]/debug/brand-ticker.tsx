import OwnerPresence from "@/components/owner-presence";
import { getApiUrl } from "@/lib/config";
import "./brand-ticker.css";

// 调试页“页头站名滚动”：用真实组件和写死的示例数据（不读 Core），站名停 6 秒后滚到“App 图标 + 音频条”，4 秒后滚回。
// e2e owner-presence.mjs 用这三个示例检查滚动、宽度不变、首字方块和音频条。
const avatar = `${getApiUrl()}/objects/avatar/Sin.jpg`;
const samples = [
  { id: "both", note: "在用 App（有图标）+ 在听歌", preview: { app: { name: "Microsoft Edge", icon: avatar }, media: { title: "小孩", artist: "罗燕涛" } } },
  { id: "app", note: "只在用 App，没有图标时显示首字", preview: { app: { name: "ghostty" }, media: null } },
  { id: "media", note: "只在听歌", preview: { app: null, media: { title: "下一个天亮", artist: "郭静" } } },
];

export default function BrandTickerPreview() {
  return (
    <ul className="debug-brand-tickers">
      {samples.map((sample) => (
        <li key={sample.id} id={`debug-brand-ticker-${sample.id}`}>
          <span className="site-brand">
            {/* eslint-disable-next-line @next/next/no-img-element -- 示例头像 */}
            <img className="site-brand-avatar" src={avatar} alt="" width={32} height={32} />
            <OwnerPresence apiUrl="" name="Sin’s Yozora" preview={sample.preview} />
          </span>
          <p className="post-meta">{sample.note}</p>
        </li>
      ))}
    </ul>
  );
}
