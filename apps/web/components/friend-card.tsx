import { safeUrl } from "../lib/safe-url";

type FriendCardProps = {
  name: string;
  url?: string;
  avatar?: string;
  description?: string;
  // 朋友们自己填的介绍原样显示，默认标中文；本站的介绍在外文页面是译文
  descriptionLang?: string;
  // 没有头像时圆里写的字，默认是站名第一个字
  mark?: string;
  onAvatarError?: () => void;
};

// 友链卡片：圆形头像、站名、一句话，有网址时整张可点（新窗口打开）。友链列表、申请区的两张名片共用
export default function FriendCard({ name, url, avatar, description, descriptionLang = "zh-CN", mark, onAvatarError }: FriendCardProps) {
  const href = safeUrl(url);
  const src = safeUrl(avatar);
  return (
    <article className="friend-card">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- 友链头像来自任意域名，不走 next/image 白名单
        <img className="friend-avatar" src={src} alt="" width={48} height={48} loading="lazy" onError={onAvatarError} />
      ) : <span className="friend-avatar is-letter" aria-hidden="true">{mark ?? Array.from(name.trim())[0] ?? "✦"}</span>}
      <div>
        <h3 lang={/\p{Script=Han}/u.test(name) ? "zh-CN" : undefined}>{href ? <a className="card-link" href={href} target="_blank" rel="noopener noreferrer">{name}</a> : name}</h3>
        {description && <p lang={descriptionLang}>{description}</p>}
      </div>
    </article>
  );
}
