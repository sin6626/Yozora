import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/blog-data";
import { hiddenFromSearch, robotsFor } from "@/lib/indexing";

export default async function robots(): Promise<MetadataRoute.Robots> {
  return robotsFor(hiddenFromSearch() ? "" : await getSiteUrl());
}
