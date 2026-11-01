import { ChevronDown } from "lucide-react";
import { unstable_rethrow } from "next/navigation";
import { Suspense, type CSSProperties } from "react";
import { getOwner, getSiteDescription, getSiteLikes, getSiteSettings, getSubscribeOptions, siteDescription, siteName, siteOwnerName } from "../lib/blog-data";
import { getApiUrl } from "../lib/config";
import type { SocialCard, SocialLink } from "../lib/social";
import ContactCard from "./contact-card";
import OwnerName from "./owner-name";
import { getLocale, getT } from "../lib/i18n/server";
import IconifyIcon, { SocialIcon } from "./iconify-icon";
import ScrollHint from "./scroll-hint";
import SiteActions from "./site-actions";
import MoonTip from "./moon-tip";
// 首屏标题与说明用霞鹜文楷（简体版，npm 包已按字符切成小块，浏览器只下载页面上用到的字）；细体、常规，强调词“大三学生”用粗体
import "lxgw-wenkai-webfont/lxgwwenkai-light.css";
import "lxgw-wenkai-webfont/lxgwwenkai-regular.css";
import "lxgw-wenkai-webfont/lxgwwenkai-bold.css";
import "./home-hero.css";

// 首页第一屏：WebGL 夜空做背景，结构照搬 Shiro 的 Hero（apps/shiro/src/app/(app)/(home)/page.tsx）：
// 最宽 1800px，左右各占一半、内容在各自一半里居中；左边两行细字标题、一句说明和社交图标，右边 300px 圆形头像；
// 底部居中一行小字和跳动的箭头。标题文字先写死，头像、社交账号、底部那句话读后台。

async function loadOwner() {
  try {
    return await getOwner();
  } catch (error) {
    unstable_rethrow(error);
    return null;
  }
}

// 首屏的社交图标一排（多了会换行），平时单色、悬停换成品牌色；/debug 用同一个组件预览图标很多时的样子。
// 能直接跳转的平台在前；微信、QQ 这类没有网页主页的“名片”在竖线后面，点图标弹出二维码和号码。
export function HeroSocialList({ socials, contacts = [] }: { socials: SocialLink[]; contacts?: SocialCard[] }) {
  const brand = (item: SocialLink | SocialCard) => ({ "data-dark": item.dark ? "" : undefined, style: { "--brand": item.color } as CSSProperties });
  return (
    <ul className="home-hero-socials">
      {socials.map((social) => (
        <li key={social.href} {...brand(social)}>
          <a href={social.href} target="_blank" rel="noopener noreferrer" aria-label={social.label} title={social.label}>
            <SocialIcon icon={social.icon} label={social.label} />
          </a>
        </li>
      ))}
      {socials.length > 0 && contacts.length > 0 && <li className="home-hero-socials-divider" aria-hidden="true" />}
      {contacts.map((card) => (
        <li key={card.key} {...brand(card)}>
          <ContactCard card={card} icon={<SocialIcon icon={card.icon} label={card.label} />} />
        </li>
      ))}
    </ul>
  );
}

async function Socials() {
  const owner = await loadOwner();
  return owner && (owner.socials.length || owner.contacts.length) ? <HeroSocialList socials={owner.socials} contacts={owner.contacts} /> : null;
}

async function Portrait() {
  const [avatar, t] = await Promise.all([loadOwner().then((owner) => owner?.avatar), getT()]);
  return avatar ? (
    // eslint-disable-next-line @next/next/no-img-element -- 头像来自后台任意地址，不走 Next 图片优化
    <img className="home-hero-avatar" src={avatar} alt={t.hero.avatarAlt} width={300} height={300} fetchPriority="high" />
  ) : <span className="home-hero-avatar is-empty" aria-hidden="true" />;
}

// 喜欢本站的计数和订阅开关都是缓存数据，读不到时按钮照常显示（计数隐藏、订阅按钮不出现）。
async function Actions() {
  const [likes, subscribe, settings] = await Promise.all([getSiteLikes().catch(() => null), getSubscribeOptions().catch(() => null), getSiteSettings().catch(() => null)]);
  return (
    <SiteActions
      apiUrl={getApiUrl()}
      siteName={settings?.name ?? siteName}
      likes={likes}
      subscribeTypes={subscribe?.enabled ? subscribe.types : null}
      mailIcon={<IconifyIcon icon="mingcute:mail-send-fill" size={20} />}
    />
  );
}

// 丛雨抱着名字：身体（后层、闭眼帧）在字后面，手臂（前层）在字前面，三张图画布一致、叠在同一位置。
// 素材在 public/mascot，由 scripts/prepare-mascot.mjs 从生图结果抠图生成；纯装饰，读屏只读到“Sin”。
function MascotLayer({ layer }: { layer: "back" | "blink" | "front" }) {
  // eslint-disable-next-line @next/next/no-img-element -- 三层要像素级叠在一起，直接用原图，不走响应式裁切
  return <img className={`home-hero-mascot is-${layer}`} src={`/mascot/${layer}.webp`} alt="" aria-hidden="true" width={600} height={390} draggable={false} />;
}

// 站点那句话：外文页面用配置片段里的译文，没写译文时是中文原文并标明语言
async function Motto() {
  const { text, original } = await getSiteDescription(await getLocale());
  return original ? <span lang="zh-CN">{text}</span> : text;
}

export default async function HomeHero() {
  const t = (await getT()).hero;
  return (
    <section className="home-hero" aria-labelledby="home-hero-title">
      {/* 夜空本身是全站的画布（starfield.tsx，挂在根布局），这里只放月亮的悬停区域 */}
      <MoonTip />
      <div className="home-hero-layout">
        <div className="home-hero-half is-text">
          <div className="home-hero-content">
            <h1 id="home-hero-title" className="home-hero-title">
              <span>{t.greeting}</span>
              {/* “Sin。”包成一块：窄屏放不下一行时一起换行，句号不会单独掉到下一行 */}
              <span>
                <strong className="home-hero-name">
                  <MascotLayer layer="back" />
                  <MascotLayer layer="blink" />
                  {/* 站长名字读后台；丛雨的对位是按“Sin”三个字母调的（home-hero.css），改成别的名字手的位置要重调 */}
                  <Suspense fallback={siteOwnerName}><OwnerName /></Suspense>
                  <MascotLayer layer="front" />
                  <span className="home-hero-star" aria-hidden="true" />
                </strong>
                <span>{t.nameSuffix}</span>
              </span>
              <br />
              {t.titleBefore && <span>{t.titleBefore}</span>}<strong>{t.titleStrong}</strong>{t.titleAfter && <span>{t.titleAfter}</span>}
            </h1>
            <p className="home-hero-description">
              {t.line1}
              <br />
              {t.line2}
            </p>
            <Suspense fallback={null}>
              <Socials />
            </Suspense>
          </div>
        </div>
        <div className="home-hero-half">
          <Suspense fallback={<span className="home-hero-avatar is-empty" aria-hidden="true" />}>
            <Portrait />
          </Suspense>
        </div>
      </div>
      <div className="home-hero-bottom">
        <Suspense fallback={null}>
          <Actions />
        </Suspense>
        <ScrollHint className="home-hero-scroll" target="home-room">
          <small><Suspense fallback={siteDescription}><Motto /></Suspense></small>
          <ChevronDown className="home-hero-arrow" size={24} strokeWidth={1.5} aria-hidden="true" />
        </ScrollHint>
      </div>
    </section>
  );
}
