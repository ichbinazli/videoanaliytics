"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { registerAction, type FormState } from "@/actions/auth";

const initialState: FormState = {};

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-xl bg-ink px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "Hesap oluşturuluyor…" : "Hesap oluştur"}
    </button>
  );
}

export function RegisterForm() {
  const [state, formAction] = useActionState(registerAction, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label htmlFor="companyName" className="mb-1.5 block text-sm font-medium">
          Şirket adı
        </label>
        <input
          id="companyName"
          name="companyName"
          autoComplete="organization"
          required
          minLength={2}
          maxLength={120}
          className="w-full rounded-xl border border-line px-3 py-2.5 text-sm outline-none transition focus:border-ink"
        />
      </div>

      <div>
        <label htmlFor="fullName" className="mb-1.5 block text-sm font-medium">
          Ad soyad
        </label>
        <input
          id="fullName"
          name="fullName"
          autoComplete="name"
          required
          minLength={2}
          maxLength={120}
          className="w-full rounded-xl border border-line px-3 py-2.5 text-sm outline-none transition focus:border-ink"
        />
      </div>

      <div>
        <label htmlFor="email" className="mb-1.5 block text-sm font-medium">
          E-posta
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          maxLength={190}
          className="w-full rounded-xl border border-line px-3 py-2.5 text-sm outline-none transition focus:border-ink"
        />
      </div>

      <div>
        <label htmlFor="password" className="mb-1.5 block text-sm font-medium">
          Şifre
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={10}
          maxLength={200}
          className="w-full rounded-xl border border-line px-3 py-2.5 text-sm outline-none transition focus:border-ink"
        />
        <p className="mt-1 text-xs text-muted">En az 10 karakter, bir harf ve bir rakam.</p>
      </div>

      {state.error && (
        <p role="alert" className="rounded-xl bg-danger-soft px-3 py-2.5 text-sm text-danger">
          {state.error}
        </p>
      )}

      <SubmitButton />

      <p className="text-center text-sm text-muted">
        Zaten hesabınız var mı?{" "}
        <Link href="/login" className="font-semibold text-ink hover:underline">
          Giriş yapın
        </Link>
      </p>
    </form>
  );
}
