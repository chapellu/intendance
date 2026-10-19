// LA SORTIE SUR LE CORPUS RÉEL — `npm run sortie`
//
// POURQUOI CE N'EST PAS UN TEST, et c'est l'argument de `horloges.mjs` et de
// `planchers.mjs` avant lui : ceci n'épingle rien, ça IMPRIME. Les promesses de
// `sortie.vue.test.ts` doivent survivre à une recette de plus ; les tailles
// ci-dessous bougeront au premier fichier ajouté, et les figer ferait rougir la
// suite pour une bonne nouvelle.
//
// CE QUE CE SCRIPT A SERVI À ÉTABLIR, ET QUI A CHANGÉ L'ÉCRAN. La demande du
// 24/09 parlait de grammes — « mettre une part (style 200 g) dans tel
// Tupperware ». Mesuré, DEUX TIERS DES EMITS NE PÈSENT RIEN : un reste de plat
// se compte en repas dans ce corpus, pas en grammes. Un écran qui aurait mené
// par le poids se serait tu sur 91 recettes sur 126.

import { readFileSync } from "node:fs";

const brut = JSON.parse(readFileSync(new URL("../public/cuisine-data.json", import.meta.url), "utf8"));

const { lireCatalogue } = await import("../src/model/catalogue.ts");
const { vueDeLaSortie, phraseDesBoites, quantiteDuLot } = await import("../src/ecrans/sortie.vue.ts");

const catalogue = lireCatalogue(brut);
const foyer = catalogue.foyer;
const titre = (s) => console.log(`\n── ${s} ${"─".repeat(Math.max(0, 68 - s.length))}`);

/* ── 1. Ce qu'il y a à ranger, et ce qu'on en sait ────────────────────────── */

titre("ce que le corpus laisse sur le plan de travail");

const emits = catalogue.plats.flatMap((p) => p.emits.map((e) => ({ ...e, plat: p.id })));
const sansEmit = catalogue.plats.filter((p) => !p.emits.length).length;
const chiffres = emits.filter((e) => e.qty);

console.log(
  `${emits.length} emits sur ${catalogue.plats.length} plats · ` +
    `${sansEmit} plats ne laissent rien · ` +
    `${chiffres.length} emits pèsent quelque chose, ${emits.length - chiffres.length} non`,
);

const bandes = {};
for (const e of emits) bandes[e.band] = (bandes[e.band] ?? 0) + 1;
console.log("bandes : " + Object.entries(bandes).map(([b, n]) => `${b} ${n}`).join(" · "));

/* ── 2. Combien se coupent vraiment en deux ───────────────────────────────── */

titre("frigo d'abord, congélateur pour le surplus");

let coupes = 0;
let entiers = 0;
for (const p of catalogue.plats) {
  const v = vueDeLaSortie(p, foyer.parts, 1, foyer);
  for (let i = 0; i < p.emits.length; i += 1) {
    const morceaux = v.lots.filter((l) => l.emit === i).length;
    if (morceaux > 1) coupes += 1;
    else entiers += 1;
  }
}
console.log(
  `${coupes} emits partent en DEUX endroits à l'échelle 1, ${entiers} en un seul.\n` +
    "Un emit ne se coupe que s'il se congèle ET porte plus d'un repas : une\n" +
    "lunchbox est le déjeuner de demain, elle n'a rien à faire au congélateur.",
);

/* ── 3. Les contenants du foyer, et ce qu'ils couvrent ────────────────────── */

titre("les contenants déclarés");

for (const c of foyer.contenants)
  console.log(
    `  ${c.label.padEnd(30)} ${String(c.nombre).padStart(2)} × ${c.portions} repas` +
      ` · ${c.espaces.join(", ")}${c.consommable ? " · consommable" : ""}`,
  );

for (const espace of ["frigo", "congelo", "placard"]) {
  const pour = foyer.contenants.filter((c) => c.espaces.includes(espace));
  const places = pour.reduce((n, c) => n + c.nombre * c.portions, 0);
  console.log(
    `  ${espace.padEnd(8)} : ${places} places de contenant` +
      ` (plafond déclaré ${foyer.espaces[espace].contenants})`,
  );
}

/* ── 4. Le cas qui a ouvert le ticket ─────────────────────────────────────── */

titre("la ratatouille du 24/09, telle que l'écran la rendra");

for (const id of ["ratatouille-minute", "sauce-bolognaise", "lentilles-mijotees"]) {
  const p = catalogue.plats.find((x) => x.id === id);
  if (!p) continue;
  const v = vueDeLaSortie(p, foyer.parts, 1, foyer);
  console.log(`\n  ${p.titre} — ${v.table} parts à table`);
  if (!v.lots.length) console.log("    rien à ranger");
  for (const l of v.lots)
    console.log(
      `    ${l.location.padEnd(8)} ${quantiteDuLot(l).padEnd(10)} ` +
        `${phraseDesBoites(l.boites) || "(aucun contenant déclaré)"}` +
        `${l.garde != null ? ` · ${l.garde} j` : ""}`,
    );
}

/* ── 4 bis. Les invités mangent leur part — T108 ──────────────────────────── */

titre("le reste suit les portions qui restent (T108)");

const { facteur } = await import("../src/model/calcul.ts");
const { restesApresTable, mangeALaTable } = await import("../src/model/restes.ts");
console.log(
  `${emits.filter((e) => !mangeALaTable(e)).length} emits que la table ne mange pas (horsTable, parure, portion-bebe) · ` +
    `${catalogue.plats.filter((p) => p.emits.length && p.portions <= foyer.parts).length} plats que le foyer vide à lui seul`,
);
for (const parts of [foyer.parts, 2, 4, 8]) {
  let restent = 0;
  for (const p of catalogue.plats) restent += restesApresTable(p, facteur(p, parts), parts, foyer).length;
  console.log(`  ${String(parts).padEnd(4)} parts à table : ${restent} emits laissent quelque chose, sur ${emits.length}`);
}

/* ── 5. Là où l'écran n'aura rien à dire ──────────────────────────────────── */

titre("les trous que ce ticket ne bouche pas");

let sansBoite = 0;
for (const p of catalogue.plats)
  for (const l of vueDeLaSortie(p, foyer.parts, 1, foyer).lots) if (!l.boites.length) sansBoite += 1;
console.log(`${sansBoite} lots sortiraient sans contenant à proposer.`);

/* ── 6. Le volume des boîtes — T109 ───────────────────────────────────────── */

titre("une boîte a un volume (T109)");

const { rangerDans, contenantsLibres, phraseDuManque } = await import("../src/ecrans/sortie.vue.ts");
const enGrammes = emits.filter((e) => e.qty && e.qty.unit === "g").length;
const enVolume = emits.filter((e) => e.qty && ["ml", "cl", "l"].includes(e.qty.unit)).length;
console.log(`${enGrammes} emits en grammes (comptés 1 g/ml), ${enVolume} en volume, le reste en portions seules`);
// LA DENSITÉ N'EST PAS MESURÉE : on dit combien de choix elle décide. À
// 0,7 g/ml — des morceaux qui laissent du vide —, combien de lots demanderaient
// une boîte de plus ?
const nb = (r) => r.boites.reduce((n, b) => n + b.nombre, 0);
let sensibles = 0, pesés = 0;
for (const p of catalogue.plats)
  for (const l of vueDeLaSortie(p, foyer.parts, 1, foyer).lots) {
    if (l.qty == null || l.unite !== "g") continue;
    pesés += 1;
    const a1 = rangerDans(foyer, l.location, l.repas, { amount: l.qty, unit: "g" });
    const a7 = rangerDans(foyer, l.location, l.repas, { amount: l.qty / 0.7, unit: "g" });
    if (nb(a7) !== nb(a1)) sensibles += 1;
  }
console.log(`${sensibles} lots pesés sur ${pesés} changeraient de nombre de boîtes à 0,7 g/ml`);

const pot = catalogue.plats.find((x) => x.id === "pot-au-feu-traditionnel");
if (pot) {
  for (const [nom, stock] of [["dépôt vide", []], ["amorce du catalogue", catalogue.stock]]) {
    const libres = contenantsLibres(foyer, stock);
    console.log(`\n  pot-au-feu, ${nom} — libres : ` + foyer.contenants.map((c) => `${libres.get(c.id)} ${c.id}`).join(" · "));
    for (const l of vueDeLaSortie(pot, foyer.parts, 1, foyer, stock).lots)
      console.log(
        `    ${l.location.padEnd(8)} ${quantiteDuLot(l).padEnd(9)} ${phraseDesBoites(l.boites) || "—"}` +
          `${l.manque ? ` · ${phraseDuManque(l.manque)}` : ""}`,
      );
  }
}
