import Link from "next/link";
import { api } from "@/lib/api";
import { Badge, Card } from "@/components/ui/Card";
import { formatDateTime, formatRelative } from "@/lib/format";
import { ApiKeyPanel } from "./ApiKeyPanel";
import type { ApiKeyMetadata, Device, User } from "@/types/api";

export default async function DeviceDetailPage(props: PageProps<"/devices/[deviceId]">) {
  const { deviceId } = await props.params;

  const [{ device }, me] = await Promise.all([
    api<{ device: Device }>(`/devices/${deviceId}`),
    api<{ user: User }>("/auth/me"),
  ]);

  const canManage = me.user.role === "TENANT_ADMIN" || me.user.role === "SUPER_ADMIN";

  // Key metadata'sı yalnızca yöneticilere açık; izleyici için istek bile atmıyoruz.
  const keys = canManage
    ? (await api<{ keys: ApiKeyMetadata[] }>(`/devices/${deviceId}/api-keys`)).keys
    : [];

  return (
    <div className="space-y-5">
      <div>
        <Link href="/devices" className="text-xs text-muted underline-offset-2 hover:underline">
          ← Cihazlar
        </Link>
        <h1 className="mt-1 flex items-center gap-3 text-xl font-bold tracking-tight">
          {device.name}
          {device.status === "DECOMMISSIONED" ? (
            <Badge>Hizmet dışı</Badge>
          ) : device.isOnline ? (
            <Badge tone="success">Çevrimiçi</Badge>
          ) : (
            <Badge tone="danger">Çevrimdışı</Badge>
          )}
        </h1>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Cihaz bilgileri">
          <dl className="grid grid-cols-2 gap-y-3 text-sm">
            <dt className="text-muted">Kod</dt>
            <dd className="font-mono text-xs">{device.code}</dd>

            <dt className="text-muted">Mağaza</dt>
            <dd>{device.site?.name ?? "—"}</dd>

            <dt className="text-muted">Ekran etiketi</dt>
            <dd>{device.screenLabel ?? "—"}</dd>

            <dt className="text-muted">Uygulama sürümü</dt>
            <dd className="font-mono text-xs">{device.appVersion ?? "—"}</dd>

            <dt className="text-muted">Kayıt tarihi</dt>
            <dd>{formatDateTime(device.createdAt)}</dd>
          </dl>
        </Card>

        <Card title="Sağlık" subtitle="Cihazın son bildirdiği durum">
          <dl className="grid grid-cols-2 gap-y-3 text-sm">
            <dt className="text-muted">Son görülme</dt>
            <dd>{formatRelative(device.lastSeenAt)}</dd>

            <dt className="text-muted">Son veri gönderimi</dt>
            <dd>{formatRelative(device.lastIngestAt)}</dd>

            <dt className="text-muted">Bekleyen kayıt</dt>
            <dd className="tabular-nums">
              {device.lastSpoolDepth ?? "—"}
              {device.lastSpoolDepth !== null && device.lastSpoolDepth > 500 && (
                <span className="ml-2 text-xs text-danger">
                  kuyruk birikiyor — bağlantıyı kontrol edin
                </span>
              )}
            </dd>
          </dl>
        </Card>
      </div>

      {canManage && <ApiKeyPanel deviceId={device.id} keys={keys} />}
    </div>
  );
}
