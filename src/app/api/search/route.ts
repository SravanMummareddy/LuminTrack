import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { globalSearch } from "@/server/queries/search";

/** Global typeahead search endpoint backing the topbar search box. */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ results: [] }, { status: 401 });
  }

  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) {
    return NextResponse.json({ results: [] });
  }

  const results = await globalSearch(q);
  return NextResponse.json({ results });
}
