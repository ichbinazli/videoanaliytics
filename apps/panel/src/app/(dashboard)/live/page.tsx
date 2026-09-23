import { LiveBoard } from "./LiveBoard";

export const metadata = { title: "Canlı — Video Analytics" };

/**
 * Canlı görünüm, panelin TEK istisnası: veriyi Server Component değil, tarayıcı
 * çekiyor. Sebebi basit — 10 saniyede bir tüm RSC ağacını yeniden render etmek
 * gereksiz iş; burada istenen şey küçük bir JSON'un tazelenmesi.
 */
export default function LivePage() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold tracking-tight">Canlı</h1>
        <p className="mt-0.5 text-sm text-muted">Son 15 dakika, 10 saniyede bir yenilenir</p>
      </div>

      <LiveBoard />
    </div>
  );
}
