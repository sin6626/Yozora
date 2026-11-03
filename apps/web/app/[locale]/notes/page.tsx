import type { Metadata } from "next";
import { Suspense } from "react";
import PageLoading from "@/components/page-loading";
import NoteList from "@/components/note-list";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.notes.title };
}

export default async function NotesPage({ searchParams }: PageProps<"/[locale]/notes">) {
  return (
    <Suspense fallback={<PageLoading />}>
      <NoteList searchParams={searchParams} />
    </Suspense>
  );
}
