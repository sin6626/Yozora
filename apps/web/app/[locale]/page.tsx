import { Suspense } from "react";
import PageLoading from "@/components/page-loading";
import HomeHero from "@/components/home-hero";
import HomeLatest from "@/components/home-latest";

export default async function Home() {
  return (
    <>
      <HomeHero />
      <div className="home-room" id="home-room">
        <Suspense fallback={<PageLoading compact />}>
          <HomeLatest />
        </Suspense>
      </div>
    </>
  );
}
