"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { loginAction, type FormState } from "@/actions/auth";

const initialState: FormState = {};

function SubmitButton() {
  // useFormStatus, üstündeki <form>'un durumunu okur — bu yüzden ayrı bir
  // bileşen olmak zorunda.
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-xl bg-ink px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "Giriş yapılıyor…" : "Giriş yap"}
    </button>
  );
}

export function LoginForm() {
  const [state, formAction] = useActionState(loginAction, initialState);

  return (
    <form action={formAction} className="space-y-4">
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
          className="w-full rounded-xl border border-line px-3 py-2.5 text-sm outline-none transition focus:border-ink"
          placeholder="ornek@sirket.com"
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
          autoComplete="current-password"
          required
          className="w-full rounded-xl border border-line px-3 py-2.5 text-sm outline-none transition focus:border-ink"
          placeholder="••••••••"
        />
      </div>

      {state.error && (
        <p
          role="alert"
          className="rounded-xl bg-danger-soft px-3 py-2.5 text-sm text-danger"
        >
          {state.error}
        </p>
      )}

      <SubmitButton />

      <p className="text-center text-sm text-muted">
        Hesabınız yok mu?{" "}
        <Link href="/register" className="font-semibold text-ink hover:underline">
          Hesap oluşturun
        </Link>
      </p>
    </form>
  );
}
