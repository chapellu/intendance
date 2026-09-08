// LES HORLOGES SUR LE CORPUS RÉEL — `npm run horloges`
//
// POURQUOI CE N'EST PAS UN TEST, et c'est l'argument de `planchers.mjs` et de
// `banc.mjs` avant lui : ceci n'épingle rien, ça IMPRIME. Les tests de
// `calcul.test.ts` tiennent des PROMESSES — « la carcasse tient deux jours et
// pas les quatre du foyer » — et elles doivent survivre à une recette de plus.
// Les tailles ci-dessous, elles, bougeront au premier fichier ajouté ; les
// figer en assertions ferait rougir la suite pour une bonne nouvelle.
//
// CE QUE CE SCRIPT A SERVI À ÉTABLIR, ET QUI A CORRIGÉ LE TICKET. Workspace#50
// lisait `frigo_days: 0` comme un signal « à éliminer ». Mesuré, les trois
// emits à zéro jour du corpus sont trois DESSERTS GLACÉS, tous `congelo: true` :
// zéro jour de frigo ne veut pas dire « à jeter demain », ça veut dire « ça n'a
// aucune vie au frigo ». Leur appliquer une fenêtre nulle les aurait fait
// disparaître le lendemain de leur cuisson. On ne l'aurait pas vu en relisant
// le ticket.

import { readFileSync } from "node:fs";

const brut = JSON.parse(readFileSync(new URL("../public/cuisine-data.json", import.meta.url), "utf8"));

const { lireCatalogue } = await import("../src/model/catalogue.ts");
const { horlogesDu } = await import("../src/model/depot.ts");

const catalogue = lireCatalogue(brut);
const titre = (s) => console.log(`\n── ${s} ${"─".repeat(Math.max(0, 68 - s.length))}`);

const horloges = horlogesDu(catalogue);
const emits = catalogue.plats.flatMap((p) => p.emits.map((e) => ({ ...e, plat: p.id })));

/* ── 1. Ce que le corpus dit de la vie d'un reste ──────────────────────────── */

titre("les fenêtres saisies à la main");

const hist = {};
for (const e of emits) hist[e.gardeFrigo] = (hist[e.gardeFrigo] ?? 0) + 1;

console.log(
  `${emits.length} emits · ${horloges.parType.size} types distincts · ` +
    `défaut du foyer ${horloges.frigo} j · forfait congélateur ${horloges.congelo} j`,
);
console.log(
  "gardeFrigo : " +
    Object.keys(hist)
      .map(Number)
      .sort((a, b) => a - b)
      .map((j) => `${j} j × ${hist[j]}`)
      .join(" · "),
);

/* ── 2. Ce que le ticket resserre, et sur qui ──────────────────────────────── */

titre("ce que l'horloge change, par rapport au forfait de 4 jours");

// SEULS LES NON-CONGELABLES COMPTENT VRAIMENT ICI. Un lot congelable finit au
// congélateur, où c'est le forfait qui commande ; c'est le reste qui ne se
// congèle pas dont la vie se joue entièrement sur ces nombres-là.
const nonCongelables = emits.filter((e) => !e.congelo);
const compte = (l, p) => l.filter(p).length;

for (const [nom, liste] of [["tous", emits], ["non-congelables", nonCongelables]]) {
  console.log(
    `${nom.padEnd(16)} ${String(liste.length).padStart(3)} emits · ` +
      `resserrés ${compte(liste, (e) => e.gardeFrigo < horloges.frigo)} · ` +
      `inchangés ${compte(liste, (e) => e.gardeFrigo === horloges.frigo)} · ` +
      `allongés ${compte(liste, (e) => e.gardeFrigo > horloges.frigo)}`,
  );
}

/* ── 3. Les deux cas qui ont demandé une décision ──────────────────────────── */

titre("zéro jour de frigo — ce que ça veut dire");

for (const e of emits.filter((e) => e.gardeFrigo === 0))
  console.log(`  ${e.type.padEnd(28)} congelo=${e.congelo} · ${e.plat}`);
console.log(
  "→ tous congelables : « aucune vie au frigo », pas « à éliminer ». Leur horloge\n" +
    "  est celle du congélateur, sans quoi ils mourraient le lendemain de leur cuisson.",
);

titre("les types dont les producteurs ne sont pas d'accord");

const parType = new Map();
for (const e of emits) {
  if (!parType.has(e.type)) parType.set(e.type, new Map());
  parType.get(e.type).set(e.plat, e.gardeFrigo);
}
const divergents = [...parType].filter(([, m]) => new Set(m.values()).size > 1);

for (const [type, m] of divergents)
  console.log(
    `  ${type.padEnd(28)} ` +
      [...m].map(([plat, j]) => `${j} j (${plat})`).join(" vs ") +
      ` → on retient ${horloges.parType.get(type)} j`,
  );
console.log(
  `→ ${divergents.length} type sur ${parType.size}. On prend le PLUS COURT : entre deux avis\n` +
    "  sur la vie d'un reste, le prudent est celui qui ne rend malade personne.",
);

/* ── 4. Ce que le catalogue sait des autres méthodes ───────────────────────── */

titre("les fenêtres de conservation, telles qu'elles sortent enfin de l'export");

for (const c of catalogue.conservation)
  console.log(
    `  ${c.id.padEnd(22)} ${c.fenetreJours == null ? "—".padStart(6) : `${c.fenetreJours} j`.padStart(6)}` +
      `   ${c.acquis ? "acquis" : "verrouillé"}`,
  );
console.log(
  "→ « — » est un MULTIPLICATEUR, pas une absence : le sous-vide rallonge le froid\n" +
    "  d'un facteur, il ne donne pas de fenêtre à lui.",
);
console.log("");
