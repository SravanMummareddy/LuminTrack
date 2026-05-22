import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { LoginForm } from "@/components/auth/login-form";

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect("/");

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-lg bg-indigo-600 text-lg font-bold text-white">
            L
          </div>
          <h1 className="text-xl font-semibold text-slate-900">LuminTrack</h1>
          <p className="mt-1 text-sm text-slate-500">
            Recruitment tracking dashboard
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-5 text-sm font-medium text-slate-700">
            Sign in to your account
          </h2>
          <LoginForm />
        </div>
      </div>
    </main>
  );
}
