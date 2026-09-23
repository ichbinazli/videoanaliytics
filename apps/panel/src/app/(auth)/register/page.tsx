import { RegisterForm } from "./RegisterForm";

export const metadata = { title: "Kayıt — Octopus Video Analytics" };

export default function RegisterPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-8">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-ink text-accent">
            <svg
              viewBox="0 0 24 24"
              className="h-6 w-6"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </div>
          <h1 className="text-xl font-bold tracking-tight">Müşteri hesabı oluşturun</h1>
          <p className="mt-1 text-sm text-muted">Video Analytics panelini kullanmaya başlayın</p>
        </div>

        <div className="rounded-2xl border border-line bg-surface p-6 shadow-sm">
          <RegisterForm />
        </div>
      </div>
    </main>
  );
}
