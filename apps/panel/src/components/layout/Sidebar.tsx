"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Role } from "@/types/api";

/**
 * Rol kontrolü BURADA bir UX tercihidir, güvenlik değil.
 *
 * Kullanamayacağı bir bağlantıyı kullanıcıya göstermemek doğru; ama asıl kontrol
 * Express'te. Adres çubuğuna elle yazan biri sayfayı açsa da API 403 döner.
 */
type NavItem = { href: string; label: string; roles?: Role[] };

const NAV: Array<{ section: string; items: NavItem[] }> = [
  {
    section: "Analiz",
    items: [
      { href: "/", label: "Genel bakış" },
      { href: "/live", label: "Canlı" },
      { href: "/sessions", label: "Oturumlar" },
    ],
  },
  {
    section: "Envanter",
    items: [
      { href: "/sites", label: "Mağazalar" },
      { href: "/devices", label: "Cihazlar" },
    ],
  },
  {
    section: "Ayarlar",
    items: [
      { href: "/settings/users", label: "Kullanıcılar", roles: ["TENANT_ADMIN", "SUPER_ADMIN"] },
      { href: "/settings/profile", label: "Profilim" },
      { href: "/admin/tenants", label: "Müşteriler", roles: ["SUPER_ADMIN"] },
    ],
  },
];

export function Sidebar({ role }: { role: Role }) {
  const pathname = usePathname();

  return (
    <nav className="flex w-56 shrink-0 flex-col gap-6 border-r border-line bg-surface px-3 py-5">
      {NAV.map((group) => {
        const visible = group.items.filter(
          (item) => !item.roles || item.roles.includes(role),
        );
        if (visible.length === 0) return null;

        return (
          <div key={group.section}>
            <p className="mb-2 px-3 text-[11px] font-bold uppercase tracking-wider text-muted">
              {group.section}
            </p>
            <ul className="space-y-0.5">
              {visible.map((item) => {
                const isActive =
                  item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);

                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={isActive ? "page" : undefined}
                      className={`block rounded-lg px-3 py-2 text-sm font-medium transition ${
                        isActive
                          ? "bg-ink text-white"
                          : "text-ink-soft hover:bg-chip"
                      }`}
                    >
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}
