import { Suspense } from "react";
import PageLoading from "@/components/page-loading";
import { noteMetadata } from "@/lib/page-metadata";
import NoteDetail from "@/components/note-detail";

export function generateMetadata({ params }: PageProps<"/[locale]/notes/[nid]">) {
  return noteMetadata(params);
}

export default async function NotePage({ params }: PageProps<"/[locale]/notes/[nid]">) {
  return (
    <Suspense fallback={<PageLoading />}>
      <NoteDetail params={params} />
    </Suspense>
  );
}
