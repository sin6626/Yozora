import type { Metadata } from "next";
import { Suspense } from "react";
import PageLoading from "@/components/page-loading";
import MurmurList from "@/components/murmur-list";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.murmurs.title };
}

export default async function MurmurListPage({ searchParams }: PageProps<"/[locale]/murmurs">) {
  return (
    <Suspense fallback={<PageLoading />}>
      <MurmurList searchParams={searchParams} />
    </Suspense>
  );
}
