import Link from "next/link";
import { api, toQuery } from "@/lib/api";
import { parseFilters, toApiQuery } from "@/lib/filters";
import { Card, EmptyState } from "@/components/ui/Card";
import { FilterBar } from "@/components/layout/FilterBar";
import { formatDateTime, formatDecimal, labelFor } from "@/lib/format";
import type { CursorPage, Device, Paginated, SessionRow, Site } from "@/types/api";

export const metadata = { title: "Oturumlar — Video Analytics" };

export default async function SessionsPage(props: PageProps<"/sessions">) {
  const searchParams = await props.searchParams;
  const filters = parseFilters(searchParams);
  const cursor = typeof searchParams.cursor === "string" ? searchParams.cursor : undefined;

  const query = toQuery({ ...toApiQuery(filters), limit: 50, cursor });

  const [page, sites, devices] = await Promise.all([
    api<CursorPage<SessionRow>>(`/sessions${query}`),
    api<Paginated<Site>>("/sites?pageSize=200"),
    api<Paginated<Device>>("/devices?pageSize=200"),
  ]);

  const deviceNames = new Map(devices.items.map((device) => [device.id, device.name]));

  // Dışa aktarım bağlantısı tarayıcıdan gider (dosya indirmesi), bu yüzden
  // rewrite yolu üzerinden.
  const exportHref = `/backend/api/v1/sessions/export${toQuery(toApiQuery(filters))}`;

  // Sayfalama cursor tabanlı: milyonlarca satırda OFFSET taramaya döner ve
  // yeni kayıt geldiğinde offset kayıp kayıt atlatır.
  const nextHref = page.nextCursor
    ? `/sessions?${new URLSearchParams({
        range: filters.range,
        ...(filters.siteId ? { siteId: filters.siteId } : {}),
        ...(filters.deviceId ? { deviceId: filters.deviceId } : {}),
        cursor: page.nextCursor,
      }).toString()}`
    : null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold tracking-tight">Oturumlar</h1>
        <FilterBar sites={sites.items} devices={devices.items} />
      </div>

      <Card
        title="Ham kayıtlar"
        subtitle="Her satır, ekran önündeki tek bir izleyici oturumu"
        action={
          <a
            href={exportHref}
            className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-ink-soft transition hover:bg-chip"
          >
            CSV indir
          </a>
        }
      >
        {page.items.length === 0 ? (
          <EmptyState title="Bu filtrelerle oturum bulunamadı" />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs text-muted">
                    <th className="pb-2 font-medium">Başlangıç</th>
                    <th className="pb-2 font-medium">Cihaz</th>
                    <th className="pb-2 text-right font-medium">Süre</th>
                    <th className="pb-2 text-right font-medium">Geçen</th>
                    <th className="pb-2 text-right font-medium">Bakan</th>
                    <th className="pb-2 text-right font-medium">İzleme</th>
                    <th className="pb-2 font-medium">Cinsiyet</th>
                    <th className="pb-2 font-medium">Yaş</th>
                    <th className="pb-2 font-medium">Duygu</th>
                  </tr>
                </thead>
                <tbody>
                  {page.items.map((session) => (
                    <tr key={session.sessionUuid} className="border-b border-line last:border-0">
                      <td className="py-2 whitespace-nowrap">
                        {formatDateTime(session.startedAt)}
                      </td>
                      <td className="py-2 text-muted">
                        {deviceNames.get(session.deviceId) ?? `#${session.deviceId}`}
                      </td>
                      <td className="py-2 text-right tabular-nums">{session.durationSec} sn</td>
                      <td className="py-2 text-right tabular-nums">{session.personsPassed}</td>
                      <td className="py-2 text-right tabular-nums">{session.personsLooked}</td>
                      <td className="py-2 text-right tabular-nums">
                        {formatDecimal(Number(session.lookingSeconds))} sn
                      </td>
                      <td className="py-2 text-muted">{labelFor("gender", session.gender)}</td>
                      <td className="py-2 text-muted">
                        {labelFor("ageBucket", session.ageBucket)}
                        {session.ageEstimate !== null && (
                          <span className="ml-1 text-xs">({session.ageEstimate})</span>
                        )}
                      </td>
                      <td className="py-2 text-muted">{labelFor("emotion", session.emotion)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {nextHref && (
              <div className="mt-4 flex justify-center">
                <Link
                  href={nextHref}
                  className="rounded-lg border border-line px-4 py-2 text-sm font-semibold text-ink-soft transition hover:bg-chip"
                >
                  Sonraki 50 kayıt
                </Link>
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  );
}
