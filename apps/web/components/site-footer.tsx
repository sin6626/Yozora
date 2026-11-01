import { Heart, Moon } from "lucide-react";
import Link from "./locale-provider";
import { Suspense } from "react";
import { siteOwnerName } from "../lib/blog-data";
import { getT } from "../lib/i18n/server";
import FooterSky from "./footer-sky";
import OwnerName from "./owner-name";
import { OnlineCount } from "./notifications";
import "./site-footer.css";

const sourceRepo = "https://github.com/sin6626/Yozora";

// 页脚：最上面一条星带（每天刷题和写代码的记录，读取失败时不显示），下面左边是一弯小月亮加“头顶的星空，是心里的星空”
// （化用康德，站长 2026-10-31 定；后台那句站点描述只留在首屏底部，不在页脚重复）、细字的英文落款，
// 右边是几个小链接和在线人数。
export default async function SiteFooter() {
  const t = (await getT()).footer;
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <Suspense fallback={null}><FooterSky /></Suspense>
        <div className="site-footer-about">
          <p className="site-footer-motto">
            <Moon size={16} strokeWidth={1.5} aria-hidden="true" />
            {t.motto}
          </p>
          <p className="site-footer-sign">
            © 2026 <Suspense fallback={siteOwnerName}><OwnerName /></Suspense> · Made with <Heart size={12} aria-label="love" /> under the stars
          </p>
        </div>
        <div className="site-footer-side">
          <nav className="site-footer-links" aria-label={t.links}>
            <Link href="/timeline">{t.timeline}</Link>
            <Link href="/friends">{t.friends}</Link>
            <a href="/feed.xml">RSS</a>
            {/* 本站的后端是改过的 Mix Space Core（AGPLv3），AGPL 要求通过网络使用的人也能拿到对应的源码 */}
            <a href={sourceRepo} target="_blank" rel="noopener noreferrer">{t.source}</a>
          </nav>
          <OnlineCount />
        </div>
      </div>
    </footer>
  );
}
