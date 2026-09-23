import { api } from "@/lib/api";
import { Badge, Card, EmptyState } from "@/components/ui/Card";
import { formatDate, formatNumber } from "@/lib/format";
import { CreateSiteForm } from "./CreateSiteForm";
import type { Device, Paginated, Site, User } from "@/types/api";

export const metadata = { title: "Mağazalar — Video Analytics" };

export default async function SitesPage() {
  const [sites, devices, me] = await Promise.all([
    api<Paginated<Site>>("/sites?pageSize=200"),
    api<Paginated<Device>>("/devices?pageSize=200"),
    api<{ user: User }>("/auth/me"),
  ]);

  const canManage = me.user.role === "TENANT_ADMIN" || me.user.role === "SUPER_ADMIN";

  // Cihaz sayısı ayrı bir uç yerine mevcut listeden hesaplanıyor: iki yüz
  // kayıtlık bir liste için ek bir API çağrısı ve endpoint'i haklı çıkmıyor.
  const deviceCountBySite = new Map<number, { total: number; online: number }>();
  for (const device of devices.items) {
    const entry = deviceCountBySite.get(device.siteId) ?? { total: 0, online: 0 };
    entry.total += 1;
    if (device.isOnline) entry.online += 1;
    deviceCountBySite.set(device.siteId, entry);
  }

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold tracking-tight">Mağazalar</h1>

      {canManage && <CreateSiteForm />}

      <Card title={`${sites.total} mağaza`}>
        {sites.items.length === 0 ? (
          <EmptyState
            title="Henüz mağaza yok"
            hint="Mağazalar, cihazların hangi lokasyonda olduğunu belirler ve raporlarda kırılım sağlar."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-muted">
                  <th className="pb-2 font-medium">Mağaza</th>
                  <th className="pb-2 font-medium">Kod</th>
                  <th className="pb-2 font-medium">Şehir</th>
                  <th className="pb-2 font-medium">Durum</th>
                  <th className="pb-2 text-right font-medium">Cihaz</th>
                  <th className="pb-2 font-medium">Eklenme</th>
                </tr>
              </thead>
              <tbody>
                {sites.items.map((site) => {
                  const counts = deviceCountBySite.get(site.id) ?? { total: 0, online: 0 };

                  return (
                    <tr key={site.id} className="border-b border-line last:border-0">
                      <td className="py-2.5 font-medium">{site.name}</td>
                      <td className="py-2.5 font-mono text-xs text-muted">{site.code}</td>
                      <td className="py-2.5 text-muted">{site.city ?? "—"}</td>
                      <td className="py-2.5">
                        {site.isActive ? (
                          <Badge tone="success">Aktif</Badge>
                        ) : (
                          <Badge>Pasif</Badge>
                        )}
                      </td>
                      <td className="py-2.5 text-right tabular-nums">
                        {formatNumber(counts.total)}
                        {counts.total > 0 && (
                          <span className="ml-1 text-xs text-muted">
                            ({counts.online} çevrimiçi)
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 text-muted">{formatDate(site.createdAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
