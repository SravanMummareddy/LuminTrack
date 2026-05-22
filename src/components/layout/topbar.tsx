import { logoutAction } from "@/server/actions/auth";
import { GlobalSearch } from "@/components/search/global-search";
import { MobileNav } from "@/components/layout/mobile-nav";

type TopbarProps = {
  name: string;
  role: string;
};

export function Topbar({ name, role }: TopbarProps) {
  const initials = name
    .split(" ")
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-4 md:gap-4 md:px-6">
      <MobileNav />
      <div className="min-w-0 flex-1">
        <GlobalSearch />
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-700">
          {initials || "?"}
        </div>
        <div className="hidden leading-tight sm:block">
          <div className="text-sm font-medium text-slate-900">{name}</div>
          <div className="text-xs text-slate-500">
            {role === "ADMIN" ? "Administrator" : "Recruiter"}
          </div>
        </div>
      </div>
      <form action={logoutAction}>
        <button
          type="submit"
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
        >
          Sign out
        </button>
      </form>
    </header>
  );
}
