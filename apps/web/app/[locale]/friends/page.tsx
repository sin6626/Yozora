import type { Metadata } from "next";
import { Suspense } from "react";
import PageLoading from "@/components/page-loading";
import FriendList from "@/components/friend-list";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.friends.title };
}

export default async function FriendListPage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <FriendList />
    </Suspense>
  );
}
