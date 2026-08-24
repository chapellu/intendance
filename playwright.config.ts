// Les parcours de bout en bout — l'app entière, dans un vrai navigateur.
//
// CONTRE LE BUILD DE PRODUCTION, pas contre le serveur de développement. C'est
// la seule façon de tester ce que T18 a promis : le service worker n'existe
// qu'en production, et « l'app s'ouvre sans réseau » n'a aucun sens contre un
// serveur qui recompile à chaque requête.
//
// EN 390 × 844, la taille sur laquelle l'app se juge depuis T2. Un parcours
// vert sur un écran de bureau ne dirait rien de ce que fait un pouce.
//
// LE NAVIGATEUR : celui que Playwright gère (`npx playwright install
// chromium`). `CHROMIUM=/chemin/vers/chrome` force un binaire déjà présent —
// utile là où le téléchargement est coupé.

import { defineConfig } from "@playwright/test";

const PORT = 4173;
const executablePath = process.env["CHROMIUM"];

export default defineConfig({
  testDir: "e2e",
  // Un seul worker. Les parcours partagent un serveur et un `dist/`, et surtout
  // ils sont quatre : paralléliser gagnerait deux secondes et coûterait la
  // première explication d'un échec qui ne se reproduit pas.
  workers: 1,
  fullyParallel: false,
  // `forbidOnly` en CI : un `test.only` oublié fait passer une suite qui ne
  // teste plus rien, et c'est le genre de vert qu'on ne remet jamais en cause.
  forbidOnly: !!process.env["CI"],
  reporter: process.env["CI"] ? "list" : "line",
  use: {
    baseURL: `http://localhost:${PORT}`,
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 3,
    // La trace du premier échec seulement : de quoi comprendre sans garder une
    // vidéo de chaque passage vert.
    trace: "retain-on-failure",
    ...(executablePath ? { launchOptions: { executablePath } } : {}),
  },
  webServer: {
    command: `npm run build && npm run preview -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: !process.env["CI"],
    timeout: 180_000,
  },
});
