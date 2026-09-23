import { api } from "@/lib/api";
import { Badge, Card } from "@/components/ui/Card";
import { formatDateTime, formatRelative, roleLabel } from "@/lib/format";
import type { Paginated, User } from "@/types/api";

export const metadata = { title: "Kullanıcılar — Video Analytics" };

/**
 * Kullanıcı listesi.
 *
 * Bu sayfaya erişim sidebar'da rolle gizleniyor, ama asıl kontrol API'de:
 * TENANT_VIEWER buraya adres çubuğundan gelirse api() 403 alır ve hata sınırı
 * devreye girer.
 */
export default async function UsersPage() {
  const users = await api<Paginated<User>>("/users?pageSize=200");

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold tracking-tight">Kullanıcılar</h1>

      <Card title={`${users.total} kullanıcı`}>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs text-muted">
              <th className="pb-2 font-medium">Ad soyad</th>
              <th className="pb-2 font-medium">E-posta</th>
              <th className="pb-2 font-medium">Rol</th>
              <th className="pb-2 font-medium">Durum</th>
              <th className="pb-2 font-medium">Son giriş</th>
              <th className="pb-2 font-medium">Eklenme</th>
            </tr>
          </thead>
          <tbody>
            {users.items.map((user) => (
              <tr key={user.id} className="border-b border-line last:border-0">
                <td className="py-2.5 font-medium">{user.fullName}</td>
                <td className="py-2.5 text-muted">{user.email}</td>
                <td className="py-2.5">{roleLabel(user.role)}</td>
                <td className="py-2.5">
                  {user.isActive ? <Badge tone="success">Aktif</Badge> : <Badge>Pasif</Badge>}
                </td>
                <td className="py-2.5 text-muted">{formatRelative(user.lastLoginAt)}</td>
                <td className="py-2.5 text-muted">{formatDateTime(user.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
