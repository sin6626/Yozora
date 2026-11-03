import { Suspense } from "react";
import PageLoading from "@/components/page-loading";
import { categoryMetadata } from "@/lib/page-metadata";
import PostList from "@/components/post-list";

export function generateMetadata({ params }: PageProps<"/[locale]/categories/[slug]">) {
  return categoryMetadata(params);
}

export default async function CategoryPage({ params, searchParams }: PageProps<"/[locale]/categories/[slug]">) {
  return (
    <Suspense fallback={<PageLoading />}>
      <PostList params={params} searchParams={searchParams} />
    </Suspense>
  );
}
