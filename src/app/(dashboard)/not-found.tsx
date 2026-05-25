import Link from "next/link";
import { FileQuestion } from "lucide-react";

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-16 text-center">
      <div className="rounded-full bg-slate-100 p-3 text-slate-500">
        <FileQuestion className="h-7 w-7" />
      </div>
      <h1 className="text-xl font-semibold text-slate-900">
        We couldn&rsquo;t find that
      </h1>
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
