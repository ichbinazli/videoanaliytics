import Link from "next/link";
import { api } from "@/lib/api";
import { Badge, Card, EmptyState } from "@/components/ui/Card";
import { formatRelative } from "@/lib/format";
import { CreateDeviceForm } from "./CreateDeviceForm";
import type { Device, Paginated, Site, User } from "@/types/api";

export const metadata = { title: "Cihazlar — Video Analytics" };

export default async function DevicesPage() {
  const [devices, sites, me] = await Promise.all([
    api<Paginated<Device>>("/devices?pageSize=200"),
    api<Paginated<Site>>("/sites?pageSize=200"),
    api<{ user: User }>("/auth/me"),
  ]);

  const canManage = me.user.role === "TENANT_ADMIN" || me.user.role === "SUPER_ADMIN";

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold tracking-tight">Cihazlar</h1>

      {canManage && <CreateDeviceForm sites={sites.items} />}

      <Card title={`${devices.total} cihaz`}>
        {devices.items.length === 0 ? (
          <EmptyState
            title="Henüz cihaz yok"
            hint="Bir kiosk'u sisteme bağlamak için önce cihaz kaydı oluşturun, sonra ona bir API key üretin."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-muted">
                  <th className="pb-2 font-medium">Cihaz</th>
                  <th className="pb-2 font-medium">Kod</th>
                  <th className="pb-2 font-medium">Mağaza</th>
                  <th className="pb-2 font-medium">Durum</th>
                  <th className="pb-2 font-medium">Son görülme</th>
                  <th className="pb-2 font-medium">Sürüm</th>
                  <th className="pb-2 text-right font-medium">Kuyruk</th>
                </tr>
              </thead>
              <tbody>
                {devices.items.map((device) => (
                  <tr key={device.id} className="border-b border-line last:border-0">
                    <td className="py-2.5">
                      <Link
                        href={`/devices/${device.id}`}
                        className="font-medium underline-offset-2 hover:underline"
                      >
                        {device.name}
                      </Link>
                    </td>
                    <td className="py-2.5 font-mono text-xs text-muted">{device.code}</td>
                    <td className="py-2.5 text-muted">{device.site?.name ?? "—"}</td>
                    <td className="py-2.5">
                      {device.status === "DECOMMISSIONED" ? (
                        <Badge>Hizmet dışı</Badge>
                      ) : device.isOnline ? (
                        <Badge tone="success">Çevrimiçi</Badge>
                      ) : (
                        <Badge tone="danger">Çevrimdışı</Badge>
                      )}
                    </td>
                    <td className="py-2.5 text-muted">{formatRelative(device.lastSeenAt)}</td>
                    <td className="py-2.5 font-mono text-xs text-muted">
                      {device.appVersion ?? "—"}
                    </td>
                    <td className="py-2.5 text-right tabular-nums text-muted">
                      {device.lastSpoolDepth ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
