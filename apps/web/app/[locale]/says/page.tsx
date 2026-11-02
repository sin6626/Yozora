import type { Metadata } from "next";
import { Suspense } from "react";
import SayList from "@/components/say-list";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.says.title };
}

export default async function SayListPage() {
  return (
    <Suspense fallback={<p className="post-list-content" role="status">{(await getT()).common.loading}</p>}>
      <SayList />
    </Suspense>
  );
}
