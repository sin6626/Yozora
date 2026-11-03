import { Suspense } from "react";
import PageLoading from "@/components/page-loading";
import { pageMetadata } from "@/lib/page-metadata";
import PageDetail from "@/components/page-detail";

export function generateMetadata({ params }: PageProps<"/[locale]/[slug]">) {
  return pageMetadata(params);
}

export default async function StandalonePage({ params }: PageProps<"/[locale]/[slug]">) {
  return (
    <Suspense fallback={<PageLoading />}>
      <PageDetail params={params} />
    </Suspense>
  );
}
