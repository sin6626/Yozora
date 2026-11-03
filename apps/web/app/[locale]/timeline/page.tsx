import type { Metadata } from "next";
import { Suspense } from "react";
import PageLoading from "@/components/page-loading";
import TimelineList from "@/components/timeline-list";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.timeline.title };
}

export default async function TimelinePage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <TimelineList />
    </Suspense>
  );
}
