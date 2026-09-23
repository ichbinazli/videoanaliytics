/**
 * Testler ayrı bir veritabanına yazar.
 *
 * NODE_ENV=test aynı zamanda logger'ı susturur ve rate limit'leri devre dışı
 * bırakır (bkz. rateLimit.middleware.ts) — aksi hâlde test sırası limitlere
 * takılır ve testler birbirine bağımlı hâle gelirdi.
 */
process.env["NODE_ENV"] = "test";
process.env["DATABASE_URL"] ??=
  "mysql://va:va@localhost:3307/video_analytics_test?connectionLimit=5";
process.env["JWT_ACCESS_SECRET"] ??= "test-secret-test-secret-test-secret-test!";
process.env["API_KEY_PEPPER"] ??= "test-pepper-test-pepper-test-pepper-test!";
process.env["CORS_ORIGINS"] ??= "http://localhost:3000";
process.env["COOKIE_SECURE"] = "false";
