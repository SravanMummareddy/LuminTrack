import Link from "next/link";
import { FileQuestion } from "lucide-react";

// Root-level not-found — catches any unknown route outside the (dashboard)
// segment (e.g. typos like `/_doesnotexist` while signed-out). It renders inside
// the root layout's <html>/<body> (App Router wraps not-found in the root
// layout), so it must NOT render its own — a second <html>/<body> nests them and
// its differing classNames trip a hydration mismatch. The (dashboard) segment
// has its own not-found.tsx that renders inside the app chrome.
export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-3 px-4 text-center">
      <div className="rounded-full bg-slate-100 p-3 text-slate-500">
        <FileQuestion className="h-7 w-7" />
      </div>
      <h1 className="text-xl font-semibold">We couldn&rsquo;t find that</h1>
      <p className="text-sm text-slate-500">
        The page or record you&rsquo;re looking for may have been removed,
        renamed, or never existed.
      </p>
      <Link
        href="/"
        className="mt-2 inline-flex h-9 items-center rounded-md bg-indigo-600 px-4 text-sm font-medium text-white transition hover:bg-indigo-500"
      >
        Back to dashboard
      </Link>
    </div>
  );
}
