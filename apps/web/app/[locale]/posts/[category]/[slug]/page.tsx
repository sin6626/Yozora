import { Suspense } from "react";
import PageLoading from "@/components/page-loading";
import { postMetadata } from "@/lib/page-metadata";
import PostDetail from "@/components/post-detail";

export function generateMetadata({ params }: PageProps<"/[locale]/posts/[category]/[slug]">) {
  return postMetadata(params);
}

export default async function PostPage({ params }: PageProps<"/[locale]/posts/[category]/[slug]">) {
  return (
    <Suspense fallback={<PageLoading />}>
      <PostDetail params={params} />
    </Suspense>
  );
}
