import HomeHero from "@/components/home-hero";
import HomeLatest from "@/components/home-latest";

export { homeMetadata as generateMetadata } from "@/lib/page-metadata";

// 首屏和下面那块一起渲染：下面那块平时读 Next 缓存（getHomeFeed），不包 Suspense，首屏到了它也就到了，往下滑不会还在读
export default function Home() {
  return (
    <>
      <HomeHero />
      <div className="home-room" id="home-room">
        <HomeLatest />
      </div>
    </>
  );
}
