import { requireUser } from "@/lib/session";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { KeyboardShortcuts } from "@/components/layout/keyboard-shortcuts";
import { ToastProvider } from "@/components/ui/toast";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();

  // ToastProvider is a client component wrapping the authenticated tree so any
  // client component can confirm a saved action. Kept out of the root layout so
  // the login tree stays provider-free.
  return (
    <ToastProvider>
      <KeyboardShortcuts />
      <div className="flex min-h-screen">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar name={user.fullName} role={user.role} />
          <main className="flex-1 p-4 md:p-6">{children}</main>
        </div>
      </div>
    </ToastProvider>
  );
}
