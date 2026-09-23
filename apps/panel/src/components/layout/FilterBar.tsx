"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { RANGE_PRESETS } from "@/lib/filters";
import type { Device, Site } from "@/types/api";

/**
 * Global filtre barı.
 *
 * Durumu URL'e yazar; sayfaların hiçbiri filtre state'i tutmaz. Değişimi
 * useTransition içine alıyoruz: Server Component ağacı yeniden render olurken
 * arayüz donmasın, sadece soluklaşsın.
 */
export function FilterBar({ sites, devices }: { sites: Site[]; devices: Device[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  function update(key: string, value: string): void {
    const next = new URLSearchParams(searchParams.toString());

    if (value) next.set(key, value);
    else next.delete(key);

    // Mağaza değişince cihaz seçimi anlamsızlaşır: birlikte temizleniyor.
    if (key === "siteId") next.delete("deviceId");

    // replace, push değil: filtre denemeleri tarayıcı geçmişini doldurmasın.
    startTransition(() => router.replace(`${pathname}?${next.toString()}`));
  }

  const selectedSite = searchParams.get("siteId") ?? "";
  const visibleDevices = selectedSite
    ? devices.filter((device) => String(device.siteId) === selectedSite)
    : devices;

  return (
    <div
      className={`flex flex-wrap items-center gap-2 transition-opacity ${
        isPending ? "opacity-50" : ""
      }`}
    >
      <select
        aria-label="Zaman aralığı"
        value={searchParams.get("range") ?? "7d"}
        onChange={(event) => update("range", event.target.value)}
        className="rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-medium"
      >
        {RANGE_PRESETS.map((preset) => (
          <option key={preset.value} value={preset.value}>
            {preset.label}
          </option>
        ))}
      </select>

      <select
        aria-label="Mağaza"
        value={selectedSite}
        onChange={(event) => update("siteId", event.target.value)}
        className="rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-medium"
      >
        <option value="">Tüm mağazalar</option>
        {sites.map((site) => (
          <option key={site.id} value={site.id}>
            {site.name}
          </option>
        ))}
      </select>

      <select
        aria-label="Cihaz"
        value={searchParams.get("deviceId") ?? ""}
        onChange={(event) => update("deviceId", event.target.value)}
        className="rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-medium"
      >
        <option value="">Tüm cihazlar</option>
        {visibleDevices.map((device) => (
          <option key={device.id} value={device.id}>
            {device.name}
          </option>
        ))}
      </select>
    </div>
  );
}
