"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { createSiteAction, type ActionState } from "@/actions/inventory";
import { Card } from "@/components/ui/Card";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
    >
      {pending ? "Kaydediliyor…" : "Mağaza ekle"}
    </button>
  );
}

export function CreateSiteForm() {
  const [state, formAction] = useActionState(createSiteAction, {} as ActionState);

  return (
    <Card title="Yeni mağaza">
      <form action={formAction} className="flex flex-wrap items-end gap-3">
        <label className="min-w-[180px] flex-1">
          <span className="mb-1 block text-xs font-medium text-muted">Mağaza adı</span>
          <input
            name="name"
            required
            maxLength={120}
            placeholder="Kadıköy Mağaza"
            className="w-full rounded-lg border border-line px-3 py-2 text-sm"
          />
        </label>

        <label className="min-w-[160px] flex-1">
          <span className="mb-1 block text-xs font-medium text-muted">Kod</span>
          <input
            name="code"
            required
            maxLength={40}
            pattern="[A-Za-z0-9._\-]+"
            placeholder="IST-KADIKOY"
            className="w-full rounded-lg border border-line px-3 py-2 font-mono text-sm"
          />
        </label>

        <label className="min-w-[140px] flex-1">
          <span className="mb-1 block text-xs font-medium text-muted">Şehir</span>
          <input
            name="city"
            maxLength={80}
            placeholder="İstanbul"
            className="w-full rounded-lg border border-line px-3 py-2 text-sm"
          />
        </label>

        <Submit />
      </form>

      {state.error && (
        <p role="alert" className="mt-3 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
          {state.error}
        </p>
      )}
      {state.success && (
        <p className="mt-3 rounded-lg bg-accent-soft px-3 py-2 text-sm text-[#0a7a3d]">
          {state.success}
        </p>
      )}
    </Card>
  );
}
