import { api } from "@/lib/api";
import { Card } from "@/components/ui/Card";
import { formatDateTime, roleLabel } from "@/lib/format";
import type { User } from "@/types/api";

export const metadata = { title: "Profilim — Video Analytics" };

export default async function ProfilePage() {
  const { user } = await api<{ user: User }>("/auth/me");

  return (
    <div className="max-w-lg space-y-5">
      <h1 className="text-xl font-bold tracking-tight">Profilim</h1>

      <Card title="Hesap bilgileri">
        <dl className="grid grid-cols-2 gap-y-3 text-sm">
          <dt className="text-muted">Ad soyad</dt>
          <dd>{user.fullName}</dd>

          <dt className="text-muted">E-posta</dt>
          <dd>{user.email}</dd>

          <dt className="text-muted">Rol</dt>
          <dd>{roleLabel(user.role)}</dd>

          <dt className="text-muted">Son giriş</dt>
          <dd>{formatDateTime(user.lastLoginAt)}</dd>
        </dl>
      </Card>

      <Card title="Şifre" subtitle="Şifre değişimi tüm cihazlardaki oturumları kapatır">
        <p className="text-sm text-muted">
          Şifre değiştirme formu bir sonraki iterasyonda eklenecek; API ucu
          (<code className="font-mono text-xs">POST /auth/change-password</code>) hazır.
        </p>
      </Card>
    </div>
  );
}
