"use client";

import { useEffect } from "react";

/**
 * Sayfa sınırındaki hata yakalayıcı.
 *
 * Yetkisiz erişimde (403) kullanıcıya boş ekran değil, ne olduğunu anlatan bir
 * mesaj gösterilmesini sağlar.
 */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto max-w-md rounded-2xl border border-line bg-surface p-8 text-center">
      <h2 className="text-base font-bold">Bu sayfa yüklenemedi</h2>
      <p className="mt-2 text-sm text-muted">
        {error.message.includes("yetki")
          ? "Bu sayfayı görüntüleme yetkiniz yok."
          : "Beklenmeyen bir hata oluştu. Tekrar denemek sorunu çözebilir."}
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-4 rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-white"
      >
        Tekrar dene
      </button>
    </div>
  );
}
