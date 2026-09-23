import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.spec.ts"],
    // Integration testleri aynı veritabanını paylaşıyor: paralel dosyalar
    // birbirinin verisini silerdi.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
    setupFiles: ["tests/helpers/setupEnv.ts"],
  },
});
