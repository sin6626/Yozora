import { Suspense } from "react";
import HomeHero from "@/components/home-hero";
import HomeLatest from "@/components/home-latest";
import { getT } from "@/lib/i18n/server";

export { homeMetadata as generateMetadata } from "@/lib/page-metadata";

export default async function Home() {
  const { common } = await getT();
  return (
    <>
      <HomeHero />
      <div className="home-room" id="home-room">
        {/* 第一屏下面这块每次现取，比首屏晚到一点。等的时候只留一块空白（不放小火箭：首屏正在播入场，再闪一个读取动画不连贯），
            内容到了每条用自己的视口内上浮动画出现（reveal.tsx） */}
        <Suspense fallback={<div className="home-room-pending" role="status"><span className="sr-only">{common.loading}</span></div>}>
          <HomeLatest />
        </Suspense>
      </div>
    </>
  );
}
