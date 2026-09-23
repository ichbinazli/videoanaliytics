"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { createDeviceAction, type ActionState } from "@/actions/inventory";
import { Card } from "@/components/ui/Card";
import type { Site } from "@/types/api";

const initialState: ActionState = {};

function Submit({ children }: { children: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
    >
      {pending ? "Kaydediliyor…" : children}
    </button>
  );
}

export function CreateDeviceForm({ sites }: { sites: Site[] }) {
  const [state, formAction] = useActionState(createDeviceAction, initialState);

  if (sites.length === 0) {
    return (
      <Card>
        <p className="text-sm text-muted">
          Cihaz eklemeden önce en az bir mağaza oluşturmanız gerekiyor.
        </p>
      </Card>
    );
  }

  return (
    <Card title="Yeni cihaz" subtitle="Ekranı sisteme tanıtın, ardından API key üretin">
      <form action={formAction} className="flex flex-wrap items-end gap-3">
        <label className="flex-1 min-w-[180px]">
          <span className="mb-1 block text-xs font-medium text-muted">Mağaza</span>
          <select
            name="siteId"
            required
            className="w-full rounded-lg border border-line px-3 py-2 text-sm"
          >
            {sites.map((site) => (
              <option key={site.id} value={site.id}>
                {site.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex-1 min-w-[180px]">
          <span className="mb-1 block text-xs font-medium text-muted">Cihaz adı</span>
          <input
            name="name"
            required
            maxLength={120}
            placeholder="Vitrin ekranı"
            className="w-full rounded-lg border border-line px-3 py-2 text-sm"
          />
        </label>

        <label className="flex-1 min-w-[160px]">
          <span className="mb-1 block text-xs font-medium text-muted">
            Kod <span className="font-normal">(kiosk üstünde yazan)</span>
          </span>
          <input
            name="code"
            required
            maxLength={40}
            pattern="[A-Za-z0-9._\-]+"
            placeholder="KDK-VITRIN-01"
            className="w-full rounded-lg border border-line px-3 py-2 font-mono text-sm"
          />
        </label>

        <Submit>Cihaz ekle</Submit>
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
