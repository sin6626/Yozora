import { CircleAlert, CircleCheck, Info, MessageCircle, TriangleAlert } from "lucide-react";
import { type BannerType, type NoteBanner as Banner } from "../lib/note-extras";
import "./note-extras.css";

// 手记详情的头图（后台“日记设置 → 封面图”，meta.cover）：标题上方，底部渐隐。纯装饰，读屏跳过。
export function NoteCover({ src }: { src: string }) {
  return (
    <div className="note-cover">
      {/* eslint-disable-next-line @next/next/no-img-element -- 后台图床地址，不走 next/image */}
      <img src={src} alt="" decoding="async" />
    </div>
  );
}

const bannerIcons = { info: Info, warning: TriangleAlert, error: CircleAlert, success: CircleCheck, secondary: MessageCircle } satisfies Record<BannerType, unknown>;

// 横幅（后台附加字段“横幅信息”，meta.banner）：正文前一条提示，按类型换图标和颜色。
export function NoteBanner({ banner }: { banner: Banner }) {
  const Icon = bannerIcons[banner.type];
  return (
    <p className="note-banner" data-type={banner.type} role="note">
      <Icon size={16} aria-hidden="true" />
      <span>{banner.message}</span>
    </p>
  );
}

