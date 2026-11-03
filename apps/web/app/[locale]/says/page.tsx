import type { Metadata } from "next";
import { Suspense } from "react";
import PageLoading from "@/components/page-loading";
import SayList from "@/components/say-list";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.says.title };
}

export default async function SayListPage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <SayList />
    </Suspense>
  );
}
