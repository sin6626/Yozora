import type { Metadata } from "next";
import { Suspense } from "react";
import PageLoading from "@/components/page-loading";
import ThinkingList from "@/components/thinking-list";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.thinking.title };
}

export default async function ThinkingListPage({ searchParams }: PageProps<"/[locale]/thinking">) {
  return (
    <Suspense fallback={<PageLoading />}>
      <ThinkingList searchParams={searchParams} />
    </Suspense>
  );
}
