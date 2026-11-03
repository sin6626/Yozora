import type { Metadata } from "next";
import { Suspense } from "react";
import PageLoading from "@/components/page-loading";
import PostList from "@/components/post-list";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.posts.title };
}

export default async function PostsPage({ searchParams }: PageProps<"/[locale]/posts">) {
  return (
    <Suspense fallback={<PageLoading />}>
      <PostList searchParams={searchParams} />
    </Suspense>
  );
}
