import { GlobalSearch } from "@/components/search/global-search";
import { MobileNav } from "@/components/layout/mobile-nav";
import { RecentlyViewedMenu } from "@/components/layout/recently-viewed";
import { UserMenu } from "@/components/layout/user-menu";

type TopbarProps = {
  name: string;
  role: string;
};

export function Topbar({ name, role }: TopbarProps) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-4 md:gap-4 md:px-6">
      <MobileNav />
      <div className="min-w-0 max-w-xs flex-1 sm:max-w-md">
        <GlobalSearch />
      </div>
      {/* Spacer absorbs the leftover width so the user cluster pins to the far
          right instead of sitting right after the (capped) search box. */}
      <div className="flex-1" aria-hidden="true" />
      <div className="flex shrink-0 items-center gap-3">
        <RecentlyViewedMenu />
        <div className="hidden text-right leading-tight sm:block">
          <div className="text-sm font-medium text-slate-900">{name}</div>
          <div className="text-xs text-slate-500">
            {role === "ADMIN" ? "Administrator" : "Recruiter"}
          </div>
        </div>
        <UserMenu name={name} role={role} />
      </div>
    </header>
  );
}
