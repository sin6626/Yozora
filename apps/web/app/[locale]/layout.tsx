import type { Metadata } from "next";
import { ViewTransition } from "react";
import { Cormorant_Garamond, Geist_Mono, Noto_Sans_SC, Noto_Serif_SC, Nunito } from "next/font/google";
import Notifications from "@/components/notifications";
import { getApiUrl } from "@/lib/config";
import { getSiteDescription, getSiteSettings, siteName, siteOwnerName } from "@/lib/blog-data";
import { hiddenFromSearch } from "@/lib/indexing";
import { Suspense } from "react";
import HeaderAccount from "@/components/header-account";
import { islandIcons } from "@/components/island-icons";
import Navigation from "@/components/navigation";
import SiteFooter from "@/components/site-footer";
import SiteHeader from "@/components/site-header";
import Starfield from "@/components/starfield";
import PageView from "@/components/page-view";
import OwnerPresence from "@/components/owner-presence";
import HeaderSearch from "@/components/header-search";
import { getOwner } from "@/lib/blog-data";
import { LocaleProvider } from "@/components/locale-provider";
import { htmlLang, ogLocale, type Locale } from "@/lib/i18n/config";
import { getI18nBundle, getSiteLocales } from "@/lib/i18n/data";
import { zh } from "@/lib/i18n/messages";
import { usable } from "@/lib/i18n/msg";
import { getLocale, getT } from "@/lib/i18n/server";
import "../globals.css";

// 英文和数字用 Nunito：圆润的无衬线体，细的用 200（ExtraLight），强调用 600（SemiBold）。
// 中文在 Mac 上用系统的苹方；Windows 没有苹方，默认会退到较粗的微软雅黑，
// 所以再给一份思源黑体（Noto Sans SC），按字切片、不预加载，只在缺字时才下载。
const nunito = Nunito({
  variable: "--font-latin",
  subsets: ["latin"],
  display: "swap",
});

// 旧式数字（高低错落的书刊数字）：只用在导航“首页”面板的“第几夜”大数字上。Nunito 没有旧式数字，
// 带 onum 的几款在 Google Fonts 版本里多被去掉了这个特性；Cormorant Garamond 的数字本身就是旧式的，细体 300 和站内的细字一致。
const oldstyle = Cormorant_Garamond({
  variable: "--font-oldstyle",
  subsets: ["latin"],
  weight: "300",
  // 斜体只给一言页浅色主题的星图图版（刻度数、题签）用，用到时才下载
  style: ["normal", "italic"],
  preload: false,
  display: "swap",
});

const notoSans = Noto_Sans_SC({
  variable: "--font-cjk-sans",
  subsets: ["latin"],
  preload: false,
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// 手记的衬线体：思源宋体（Noto Serif SC），由 Next 自托管、按字切片。只声明字体，不预加载；
// 浏览器只在页面真的用到衬线字（手记、首页手记预览）时才下载对应的切片。
const notoSerif = Noto_Serif_SC({
  variable: "--font-note-serif",
  subsets: ["latin"],
  preload: false,
  display: "swap",
});

// 服务端默认输出 data-theme="dark"（熄灯）；保存过“开灯”时在绘制前改掉。
// 配色：默认夜紫，访客在页头“今晚的天空”（sky-menu.tsx）选的银河 / 墨黑存在 localStorage 的 palette，这里在绘制前套到 <html data-palette>；
// 地址带 ?palette=night / galaxy / ink 时等于替访客选了一次（测试和对比截图用）。
const themeScript = `try{var t=localStorage.getItem("theme"),d=document.documentElement;if(t==="light")d.dataset.theme="light";var q=new URLSearchParams(location.search).get("palette");if(q==="night")localStorage.removeItem("palette");else if(q==="ink"||q==="galaxy")localStorage.setItem("palette",q);var p=localStorage.getItem("palette");if(p==="ink"||p==="galaxy")d.dataset.palette=p}catch(e){}`;

// 首页标题像 Shiro 一样是“站名 - 描述”，子页面套用模板“文章 - 站名”；站名、描述都取后台 SEO 设置（外文页面描述用译文）；
// metadataBase 取后台“网站地址”，让分享链接、RSS 自动发现等相对地址变成完整网址；读取失败时省略。
// 后台开着的语言都在构建时生成（cacheComponents 要求根路由参数至少列出一个值）；之后新开的语言按需渲染
export async function generateStaticParams() {
  return (await getSiteLocales()).map((locale) => ({ locale }));
}

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const [settings, motto] = await Promise.all([getSiteSettings().catch(() => null), getSiteDescription(locale)]);
  const name = settings?.name ?? siteName;
  const description = motto.text;
  return {
    metadataBase: settings ? new URL(settings.siteUrl) : undefined,
    title: { default: `${name} - ${description}`, template: `%s - ${name}` },
    description,
    keywords: settings?.keywords.length ? settings.keywords : undefined,
    openGraph: { siteName: name, title: name, description, type: "website", locale: ogLocale(locale) },
    alternates: { types: { "application/rss+xml": [{ url: "/feed.xml", title: name }] } },
    // 灰度时（SITE_NOINDEX=1）整站不让搜索引擎收录
    robots: hiddenFromSearch() ? { index: false, follow: false } : undefined,
  };
}

// 页头左边的后台头像（首页链接），读不到时留一个空的月光圆
async function SiteAvatar() {
  const owner = await getOwner().catch(() => null);
  // eslint-disable-next-line @next/next/no-img-element -- 头像来自后台任意地址，不走 Next 图片优化
  return owner?.avatar ? <img className="site-brand-avatar" src={owner.avatar} alt="" width={32} height={32} /> : <span className="site-brand-avatar" />;
}

// 头像右边的站名区：站长在电脑前时滚动显示在用的 App 和音频条，悬停看卡片（owner-presence.tsx）
async function SiteName() {
  const settings = await getSiteSettings().catch(() => null);
  return <OwnerPresence apiUrl={getApiUrl()} name={settings?.name ?? siteName} owner={settings?.ownerName ?? siteOwnerName} />;
}

// 客户端要的语言信息：开着的语言、当前语言的界面译文，以及每种语言自己的“已切换到…”（切换时用新语言播报）
async function localeState(locale: Locale) {
  const locales = await getSiteLocales();
  const bundles = await Promise.all(locales.map(getI18nBundle));
  const template = zh.locale.switched.template;
  const switched = Object.fromEntries(locales.map((lang, index) => {
    const text = bundles[index].messages["locale.switched"];
    return [lang, usable(template, text) ? text : template];
  }));
  return { locales, translations: bundles[locales.indexOf(locale)]?.messages ?? {}, switched };
}

export default async function RootLayout({ children }: LayoutProps<"/[locale]">) {
  const locale = await getLocale();
  const [t, state] = await Promise.all([getT(), localeState(locale)]);
  return (
    <html
      lang={htmlLang(locale)}
      data-theme="dark"
      className={`${nunito.variable} ${notoSans.variable} ${geistMono.variable} ${notoSerif.variable} ${oldstyle.variable} h-full antialiased`}
      // 下面的脚本会在水合前设置 data-theme，属性与服务端不同是预期的。
      suppressHydrationWarning
    >
      <head>
        {/* 本站自带浅色/深色主题，请 Dark Reader 扩展不要接管：它会在水合前改写 SVG 图标的颜色属性，导致水合报错（e2e dark-reader.mjs）。
            要写在 <head> 里直接输出，不能走 metadata（可能被流式放到 <body> 后面，扩展已经动手了）。 */}
        <meta name="darkreader-lock" />
        {/* 绘制前读取已保存的主题，避免刷新时先闪一下系统主题。 */}
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <LocaleProvider locale={locale} {...state}>
        <Notifications url={`${new URL(getApiUrl()).origin}/web`} apiUrl={getApiUrl()}>
          <a className="skip-link" href="#main-content">
            {t.common.skipToContent}
          </a>
          {/* 全站一张夜空画布，在换页过渡之外：首页第一屏是完整夜空，其他地方是安静的夜空 */}
          <Starfield />
          {/* 每打开一页向 Core 报一次访问，后台“数据”的访问记录才知道读者看了哪页；读地址要包在 Suspense 里 */}
          <Suspense fallback={null}><PageView apiUrl={getApiUrl()} /></Suspense>
          <div className="site-shell">
            <SiteHeader
              brand={<Suspense fallback={<span className="site-brand-avatar" />}><SiteAvatar /></Suspense>}
              presence={<Suspense fallback={<span className="site-brand-name">{siteName}</span>}><SiteName /></Suspense>}
              nav={<Navigation account={<Suspense fallback={null}><HeaderAccount side="top" /></Suspense>} />}
              search={<Suspense fallback={<span className="icon-button" aria-hidden="true" />}><HeaderSearch /></Suspense>}
              account={<Suspense fallback={<span className="account-trigger" aria-hidden="true" />}><HeaderAccount host /></Suspense>}
              activityIcons={islandIcons}
            />
            {/* 视图过渡套在铺满整行的 .site-page 上，而不是宽度随页面变化的 main：
                否则首页（全宽）和内页（48rem）之间切换时，过渡层会在两种宽度间变形，整页画面被压缩 */}
            <ViewTransition default="page-switch">
              <div className="site-page">
                <main className="site-content" id="main-content" tabIndex={-1}>
                  {children}
                </main>
              </div>
            </ViewTransition>
            <SiteFooter />
          </div>
        </Notifications>
        </LocaleProvider>
      </body>
    </html>
  );
}
