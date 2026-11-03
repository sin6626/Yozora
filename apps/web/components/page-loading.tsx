import { getT } from "../lib/i18n/server";
import "./page-loading.css";

// 全站读取中：一枚往上飞的简笔小火箭 + Innei 首页底部那句话。
// 读屏只念“正在读取…”；十秒还没读完时露出“重试”（空 href = 整页重新打开当前地址）。
// compact 用在首页第一屏下面，不撑满一屏。
export default async function PageLoading({ compact }: { compact?: boolean }) {
  const { common, list } = await getT();
  return (
    <div className="page-loading" data-compact={compact || undefined} role="status">
      <svg className="page-loading-rocket" viewBox="0 0 24 34" aria-hidden="true">
        <g className="craft">
          <path className="body" d="M12 2.6c2.5 1.9 3.9 4.9 3.9 8.4v5.4H8.1V11c0-3.5 1.4-6.5 3.9-8.4Z" />
          <circle className="body" cx="12" cy="9.4" r="1.6" />
          <path className="body" d="M8.1 12.6 5.6 14.8v2.9l2.5-1.1" />
          <path className="body" d="M15.9 12.6l2.5 2.2v2.9l-2.5-1.1" />
          <path className="body" d="M10.4 16.4v1.3h3.2v-1.3" />
          <path className="flame" d="M12 18.4c-1 1.2-1.4 2.3-1.1 3.3.2.7.6 1.2 1.1 1.6.5-.4.9-.9 1.1-1.6.3-1-.1-2.1-1.1-3.3Z" />
        </g>
        <g className="trail">
          <line x1="10.2" y1="24.5" x2="10.2" y2="26.6" />
          <line x1="12" y1="25.2" x2="12" y2="28.4" />
          <line x1="13.8" y1="24.5" x2="13.8" y2="26.6" />
        </g>
      </svg>
      <span className="sr-only">{common.loading}</span>
      <p className="page-loading-quote" lang="zh-CN" aria-hidden="true">「当第一颗卫星飞向大气层外，我们便以为自己终有一日会征服宇宙。」</p>
      <a className="page-loading-retry" href="">{list.retry}</a>
    </div>
  );
}
