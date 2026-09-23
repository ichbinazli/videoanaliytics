import type { NextConfig } from "next";

/**
 * Panel ile API AYNI ORIGIN altında görünür.
 *
 * Tarayıcı `/backend/...` adresine istek atar, Next onu Express'e yönlendirir.
 * Kazanç somut: oturum çerezleri first-party `httpOnly` `SameSite=Lax` kalır,
 * CORS ve `SameSite=None` gerekmez, ve yazılacak/bakılacak sıfır proxy kodu olur.
 *
 * Alternatifi (Next içinde catch-all bir route handler) aynı işi ~60 satır
 * header/Set-Cookie taşıma koduyla yapardı.
 *
 * Prod'da bu yönlendirmeyi nginx/ingress üstlenir; buradaki rewrite geliştirme
 * ortamı içindir.
 */
const apiUrl = process.env.API_INTERNAL_URL ?? "http://localhost:4000";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["10.22.247.4"],

  async rewrites() {
    return [
      { source: "/backend/api/:path*", destination: `${apiUrl}/api/:path*` },
      // Cihazlar ingest'e doğrudan gider; bu yalnızca geliştirirken elle test
      // edebilmek için duruyor.
      { source: "/backend/ingest/:path*", destination: `${apiUrl}/ingest/:path*` },
    ];
  },
};

export default nextConfig;
