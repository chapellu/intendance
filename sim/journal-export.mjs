// Le journal d'un profil arrêté, pour le rejouer à la main (`croyance.ts`).
// usage : node sim/journal-export.mjs <profil> <jour ISO> <fichier.json>
import { chromium } from "@playwright/test";
import { writeFileSync } from "node:fs";
const [,, profil, jour, out] = process.argv;
const ctx = await chromium.launchPersistentContext(profil, { executablePath: process.env.CHROMIUM, serviceWorkers: "block" });
const page = ctx.pages()[0];
await page.clock.setFixedTime(new Date(jour));
await page.goto(`${process.env.URL || "http://localhost:4193"}/#/cockpit`); await page.waitForTimeout(2500);
const evts = await page.evaluate(() => new Promise((ok, ko) => { const r = indexedDB.open("intendance"); r.onsuccess = () => { const t = r.result.transaction("evenements"); const q = t.objectStore("evenements").getAll(); q.onsuccess = () => ok(q.result); q.onerror = () => ko(q.error); }; r.onerror = () => ko(r.error); }));
writeFileSync(out, JSON.stringify(evts)); console.log(evts.length, "événements");
await ctx.close();
