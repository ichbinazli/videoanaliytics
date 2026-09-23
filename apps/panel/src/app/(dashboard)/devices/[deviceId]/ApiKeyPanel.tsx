"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  issueApiKeyAction,
  revokeApiKeyAction,
  type ActionState,
  type IssueKeyState,
} from "@/actions/inventory";
import { Badge, Card } from "@/components/ui/Card";
import { formatDateTime, formatRelative } from "@/lib/format";
import type { ApiKeyMetadata } from "@/types/api";

function Submit({ children, tone = "primary" }: { children: string; tone?: "primary" | "quiet" }) {
  const { pending } = useFormStatus();
  const styles =
    tone === "primary"
      ? "bg-ink text-white hover:opacity-90"
      : "border border-line text-ink-soft hover:bg-chip";

  return (
    <button
      type="submit"
      disabled={pending}
      className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition disabled:opacity-60 ${styles}`}
    >
      {pending ? "…" : children}
    </button>
  );
}

/**
 * API key yönetimi.
 *
 * Kritik davranış: düz metin key SUNUCUDA saklanmıyor, yalnızca üretildiği
 * yanıtta bir kez dönüyor. Bu yüzden kullanıcıya "bir daha göremezsiniz"
 * uyarısıyla birlikte kopyalanabilir biçimde gösteriliyor.
 */
export function ApiKeyPanel({
  deviceId,
  keys,
}: {
  deviceId: number;
  keys: ApiKeyMetadata[];
}) {
  const [issueState, issueAction] = useActionState<IssueKeyState, FormData>(
    issueApiKeyAction,
    {},
  );
  const [revokeState, revokeAction] = useActionState<ActionState, FormData>(
    revokeApiKeyAction,
    {},
  );
  const [copied, setCopied] = useState(false);

  const activeKeys = keys.filter((key) => key.status === "ACTIVE");

  return (
    <Card
      title="API key'leri"
      subtitle="Kiosk bu key ile kimliğini doğrular ve veri gönderir"
    >
      {issueState.plaintext && (
        <div className="mb-4 rounded-xl border-2 border-accent bg-accent-soft p-4">
          <p className="text-sm font-bold text-[#0a7a3d]">
            Key üretildi — bu key bir daha GÖSTERİLMEYECEK
          </p>
          <p className="mt-1 text-xs text-[#0a7a3d]">
            Şimdi kopyalayın ve kiosk&apos;un ortam değişkenine yazın.
          </p>

          <div className="mt-3 flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-lg bg-surface px-3 py-2 font-mono text-xs">
              {issueState.plaintext}
            </code>
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard.writeText(issueState.plaintext!);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
              className="shrink-0 rounded-lg bg-ink px-3 py-2 text-xs font-semibold text-white"
            >
              {copied ? "Kopyalandı" : "Kopyala"}
            </button>
          </div>

          <pre className="mt-3 overflow-x-auto rounded-lg bg-ink px-3 py-2 text-[11px] text-white">
            export VA_TELEMETRY_API_KEY={issueState.plaintext}
          </pre>
        </div>
      )}

      <form action={issueAction} className="mb-4 flex flex-wrap items-end gap-3">
        <input type="hidden" name="deviceId" value={deviceId} />

        <label className="min-w-[180px] flex-1">
          <span className="mb-1 block text-xs font-medium text-muted">Etiket (opsiyonel)</span>
          <input
            name="label"
            maxLength={80}
            placeholder="2026 kurulum"
            className="w-full rounded-lg border border-line px-3 py-2 text-sm"
          />
        </label>

        {activeKeys.length > 0 && (
          <label className="flex items-center gap-2 pb-2 text-xs text-ink-soft">
            <input type="checkbox" name="rotate" className="h-4 w-4" />
            {/* Rotasyon: eski key hemen ölmez, 7 günlük geçiş süresi tanınır —
                sahadaki cihaz güncellenene kadar veri kaybı olmasın. */}
            Rotasyon (eski key 7 gün daha çalışır)
          </label>
        )}

        <Submit>Yeni key üret</Submit>
      </form>

      {issueState.error && (
        <p role="alert" className="mb-3 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
          {issueState.error}
        </p>
      )}
      {revokeState.error && (
        <p role="alert" className="mb-3 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
          {revokeState.error}
        </p>
      )}

      {keys.length === 0 ? (
        <p className="rounded-xl bg-chip px-4 py-6 text-center text-sm text-muted">
          Bu cihazın henüz API key&apos;i yok.
        </p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs text-muted">
              <th className="pb-2 font-medium">Ön ek</th>
              <th className="pb-2 font-medium">Etiket</th>
              <th className="pb-2 font-medium">Durum</th>
              <th className="pb-2 font-medium">Son kullanım</th>
              <th className="pb-2 font-medium">Üretim</th>
              <th className="pb-2" />
            </tr>
          </thead>
          <tbody>
            {keys.map((key) => (
              <tr key={key.id} className="border-b border-line last:border-0">
                <td className="py-2.5 font-mono text-xs">{key.keyPrefix}…</td>
                <td className="py-2.5 text-muted">{key.label ?? "—"}</td>
                <td className="py-2.5">
                  {key.status === "ACTIVE" ? (
                    key.expiresAt ? (
                      <Badge tone="danger">
                        {formatDateTime(key.expiresAt)} tarihinde sona erecek
                      </Badge>
                    ) : (
                      <Badge tone="success">Aktif</Badge>
                    )
                  ) : (
                    <Badge>İptal</Badge>
                  )}
                </td>
                <td className="py-2.5 text-muted">{formatRelative(key.lastUsedAt)}</td>
                <td className="py-2.5 text-muted">{formatDateTime(key.createdAt)}</td>
                <td className="py-2.5 text-right">
                  {key.status === "ACTIVE" && (
                    <form action={revokeAction}>
                      <input type="hidden" name="deviceId" value={deviceId} />
                      <input type="hidden" name="keyId" value={key.id} />
                      <Submit tone="quiet">İptal et</Submit>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}
