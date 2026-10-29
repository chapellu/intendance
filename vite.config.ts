import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { ocr } from "./src/pwa/ocr";
import { pwa } from "./src/pwa/plugin";

export default defineConfig({
  plugins: [react(), ocr(), pwa()],
  // L'app se juge sur un téléphone du réseau local, jamais sur localhost : sans
  // `host`, le serveur de dev n'écoute que la boucle locale et le téléphone ne
  // voit rien.
  server: { host: true, port: 5173 },
  build: {
    rollupOptions: {
      output: {
        // T160 — pdf.js (~1,8 Mo, 570 ko compressés) part sous `/ocr/`, avec
        // tesseract : hors du précache, que `sw.js` retélécharge en entier à
        // chaque version, et gardé au premier PDF lu, dans le cache qui survit
        // aux versions. Une facture par semaine ne vaut pas de tripler chaque
        // mise à jour.
        chunkFileNames: (c) => (/^pdf(\.worker)?$/.test(c.name) ? "ocr/pdf/[name]-[hash].js" : "assets/[name]-[hash].js"),
      },
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // IndexedDB n'existe pas dans Node. `fake-indexeddb` en pose une vraie
    // implémentation en mémoire : les tests de la base exercent Dexie pour de
    // bon — transactions, index, contraintes — et pas un bouchon qui dirait oui.
    setupFiles: ["src/db/setup-tests.ts"],
  },
});
