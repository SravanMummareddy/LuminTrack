import { NavLinks } from "@/components/layout/nav-links";

export function Sidebar({ isManager }: { isManager: boolean }) {
  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-slate-200 bg-white md:flex">
      <div className="flex h-14 items-center gap-2 border-b border-slate-200 px-5">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-indigo-600 text-sm font-bold text-white">
          L
        </div>
        <span className="font-semibold text-slate-900">LuminTrack</span>
      </div>

      <nav className="flex-1 space-y-1 p-3">
        <NavLinks isManager={isManager} />
      </nav>
    </aside>
  );
}
