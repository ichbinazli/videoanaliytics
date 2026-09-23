-- MySQL konteyneri İLK kez başlatıldığında çalışır.
--
-- `prisma migrate dev` her çalıştığında geçici bir "shadow database" oluşturur:
-- migration'ları sıfırdan uygulayıp şemayı karşılaştırarak elle düzenlenmiş veya
-- kaymış migration'ları yakalar. Bunun için CREATE DATABASE yetkisi gerekir.
--
-- Yetkiyi `*.*` yerine yalnızca shadow veritabanı isim kalıbına veriyoruz:
-- geliştirme kullanıcısı hâlâ rastgele veritabanı oluşturamaz.
GRANT ALL PRIVILEGES ON `prisma_migrate_shadow_db%`.* TO 'va'@'%';

-- Integration testleri ayrı bir veritabanına yazar; geliştirme verisi
-- TRUNCATE edilmesin diye. Şeması `prisma migrate deploy` ile kurulur:
--   DATABASE_URL="mysql://va:va@localhost:3307/video_analytics_test" \
--     npx prisma migrate deploy
CREATE DATABASE IF NOT EXISTS `video_analytics_test`
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
GRANT ALL PRIVILEGES ON `video_analytics_test`.* TO 'va'@'%';

FLUSH PRIVILEGES;
