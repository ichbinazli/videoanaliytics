import { api } from "@/lib/api";
import { Sidebar } from "@/components/layout/Sidebar";
import { logoutAction } from "@/actions/auth";
import { roleLabel } from "@/lib/format";
import type { User } from "@/types/api";

/**
 * Dashboard kabuğu.
 *
 * Kullanıcı bilgisi BURADA bir kez çekiliyor; alt sayfalar tekrar sormuyor.
 * api() 401 alırsa kendisi /login'e yönlendiriyor, yani bu layout'un altındaki
 * her sayfa oturumun geçerli olduğunu varsayabilir.
 */
export default async function DashboardLayout({ children }: LayoutProps<"/">) {
  const { user } = await api<{ user: User }>("/auth/me");

  return (
    <div className="flex min-h-screen">
      <Sidebar role={user.role} />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-4 border-b border-line bg-surface px-6 py-3">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-ink text-accent">
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            </div>
            <span className="text-sm font-bold tracking-tight">Video Analytics</span>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-xs font-semibold leading-tight">{user.fullName}</p>
              <p className="text-[11px] leading-tight text-muted">{roleLabel(user.role)}</p>
            </div>
            <form action={logoutAction}>
              <button
                type="submit"
                className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-ink-soft transition hover:bg-chip"
              >
                Çıkış
              </button>
            </form>
          </div>
        </header>

        <main className="min-w-0 flex-1 px-6 py-6">{children}</main>
      </div>
    </div>
  );
}
