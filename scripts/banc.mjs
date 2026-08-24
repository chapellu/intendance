// Le banc du navigateur — ce que T17 et T18 ont mesuré à la main, commité.
//
// POURQUOI CE N'EST PAS UN TEST. Un seuil de performance dans une suite qui
// tourne en CI, sur une machine partagée dont la charge varie, ne mesure pas
// l'app : il mesure le voisin. Il rougit un jour sur trois, on l'élargit, et il
// finit par ne plus rien dire. Un banc, lui, s'exécute quand on se pose la
// question, et il IMPRIME — c'est au lecteur de conclure.
//
// `npm run perf` mesure le modèle (rien à voir avec un navigateur) ; celui-ci
// mesure l'app, ce qui veut dire le chargement, React, Dexie et le rendu.
//
//   npm run build && npm run preview &
//   node scripts/banc.mjs
//
// `CHROMIUM=/chemin/vers/chrome` force un binaire déjà présent ; `URL` vise un
// autre serveur (par défaut la prévisualisation locale).

import { chromium } from "playwright";

const URL_BASE = process.env["URL"] ?? "http://localhost:4173";
const options = process.env["CHROMIUM"] ? { executablePath: process.env["CHROMIUM"] } : {};

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const JOURS = [0, 1, 2, 3, 4, 5, 6].map((n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return iso(d);
});
const PLATS = ["lasagnes", "sauce-bolognaise", "poulet-roti", "quiche-poireaux", "chili-sin-carne",
  "curry-pois-chiches", "gnocchis-poelees", "fajitas-poulet", "soupe-de-poule", "saumon-riz-brocoli",
  "gratin-courgettes-riz", "croque-monsieur-salade", "tarte-tomates-moutarde", "burgers-de-lentilles"];

/** La médiane, et pas la moyenne : un ramasse-miettes au mauvais moment tire
 *  une moyenne de vingt pour cent et ne dit rien de ce qu'on attend. */
const med = (a) => [...a].sort((x, y) => x - y)[a.length >> 1];

/** Une semaine pleine, posée directement en base. C'est de la MISE EN PLACE,
 *  pas de la mesure : les parcours de `e2e/` la posent au doigt, ici on veut
 *  juste un état de départ réaliste et identique d'un tour à l'autre. */
async function semer(page) {
  await page.evaluate(async ([jours, plats]) => {
    const db = await new Promise((r) => {
      const q = indexedDB.open("intendance");
      q.onsuccess = () => r(q.result);
    });
    const tx = db.transaction(["creneaux"], "readwrite");
    const s = tx.objectStore("creneaux");
    s.clear();
    let n = 0;
    for (const jour of jours)
      for (const repas of ["dejeuner", "diner"])
        s.put({ cle: `${jour}|${repas}`, jour, repas, plat: plats[n++ % plats.length], parts: null, maj: Date.now() });
    await new Promise((r) => { tx.oncomplete = r; });
  }, [JOURS, PLATS]);
}

async function prete(page) {
  await page.waitForSelector(".co-barre", { timeout: 60_000 });
}

const navigateur = await chromium.launch(options);

// ── 1. Le coût du processeur, écran par écran ───────────────────────────────
// Le ralentissement CPU tient lieu de téléphone d'entrée de gamme : ×4 pour un
// milieu de gamme, ×6 pour ce qu'on trouve encore dans une poche en 2026.
console.log("\nCPU ralenti — médiane de 3, service worker posé\n");
console.log("        ouverture « Poser »   repioche   changement d'écran");
for (const rate of [1, 4, 6]) {
  const ctx = await navigateur.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await page.goto(`${URL_BASE}/#/cuisine`, { waitUntil: "load" });
  await prete(page);
  await semer(page);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    while (!navigator.serviceWorker.controller) await new Promise((r) => setTimeout(r, 50));
  });

  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate });

  const froid = [];
  for (let n = 0; n < 3; n++) {
    const t = Date.now();
    await page.goto(`${URL_BASE}/#/cuisine/poser/${JOURS[3]}/diner`, { waitUntil: "commit" });
    await page.reload({ waitUntil: "commit" });
    await page.waitForSelector(".co-jouable", { timeout: 120_000 });
    froid.push(Date.now() - t);
  }

  // Repiocher : écriture Dexie, requête vive, jeu reconstruit, main retirée,
  // React redessine. C'est le tour complet, et c'est ce que le doigt attend.
  const repioche = [];
  for (let n = 0; n < 3; n++) {
    // On attend que la MAIN ait changé, pas qu'un bouton ait réagi : c'est le
    // tour complet — écriture, requête vive, jeu reconstruit, rendu.
    const avant = (await page.locator(".co-jouable .tete .nom").allInnerTexts()).join("|");
    const t = Date.now();
    await page.getByRole("button", { name: /Repiocher/ }).click();
    await page.waitForFunction(
      (a) => [...document.querySelectorAll(".co-jouable .tete .nom")].map((x) => x.textContent).join("|") !== a,
      avant,
      { timeout: 60_000 },
    );
    repioche.push(Date.now() - t);
  }

  // Changer d'écran DANS la coquille : on pousse le hash, sans recharger le
  // document. C'est ce que fait un doigt sur la sous-navigation.
  const ecran = [];
  for (const [vue, sel] of [["semaine", ".co-slots"], ["prevoir", ".co-corps"], ["courses", ".co-corps"]]) {
    const t = Date.now();
    await page.evaluate((v) => { location.hash = `#/cuisine/${v}`; }, vue);
    await page.waitForSelector(sel, { timeout: 60_000 });
    ecran.push(Date.now() - t);
  }

  console.log(`CPU ×${rate}   ${String(med(froid)).padStart(11)} ms ${String(med(repioche)).padStart(9)} ms ${String(med(ecran)).padStart(15)} ms`);
  await ctx.close();
}

// ── 2. Ce que le service worker fait gagner ─────────────────────────────────
// Sur une boucle locale, RIEN : l'ouverture n'y est pas du réseau (c'est la
// conclusion de T17). C'est sur un vrai réseau que la question se pose, d'où
// les deux lignes.
const RESEAUX = {
  "local (aucun bridage)": null,
  "4G lente": { offline: false, latency: 150, downloadThroughput: 1.6e6 / 8, uploadThroughput: 750e3 / 8 },
};

console.log("\nOuverture à froid de « Poser », CPU ×4 — médiane de 5\n");
for (const [nom, reseau] of Object.entries(RESEAUX)) {
  for (const worker of [false, true]) {
    const ctx = await navigateur.newContext({ viewport: { width: 390, height: 844 } });
    // « Sans worker » : on empêche son inscription, rien d'autre ne change.
    if (!worker) await ctx.route("**/sw.js", (r) => r.abort());
    const page = await ctx.newPage();
    await page.goto(`${URL_BASE}/#/cuisine`, { waitUntil: "load" });
    await prete(page);
    await semer(page);
    if (worker) await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
      while (!navigator.serviceWorker.controller) await new Promise((r) => setTimeout(r, 50));
    });

    const cdp = await ctx.newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    if (reseau) await cdp.send("Network.emulateNetworkConditions", reseau);

    const t = [];
    for (let n = 0; n < 5; n++) {
      const d = Date.now();
      await page.goto(`${URL_BASE}/#/cuisine/poser/${JOURS[3]}/diner`, { waitUntil: "commit" });
      await page.reload({ waitUntil: "commit" });
      await page.waitForSelector(".co-jouable", { timeout: 120_000 });
      t.push(Date.now() - d);
    }
    console.log(`réseau ${nom.padEnd(24)} ${worker ? "avec" : "sans"} worker : ${String(med(t)).padStart(5)} ms`);
    await ctx.close();
  }
}

console.log("");
await navigateur.close();
