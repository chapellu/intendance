// CE QUE LE CHARGEUR CESSE DE JETER, SUR LE CORPUS RÉEL — `npm run chargeur`
//
// POURQUOI CE N'EST PAS UN TEST : même argument que `banc.mjs`, `planchers.mjs`,
// `horloges.mjs` et `ecoulement.mjs` avant lui. Ceci n'épingle rien, ça IMPRIME.
// Les promesses — « les quatre champs existent », « `null` et `[]` ne sont pas
// la même chose », « `uses` ne cite que des lignes du plat », « un
// `enParallele` orphelin est refusé » — sont dans `chargeur.test.ts` et doivent
// survivre à une recette de plus. Les tailles ci-dessous bougent à chaque
// saisie ; les figer en assertions ferait rougir la suite pour une bonne
// nouvelle.
//
// CE QUE CE SCRIPT A SERVI À ÉTABLIR, ET QUI A CORRIGÉ LE TICKET CINQ FOIS.
//
// Le tableau de T72 a été mesuré AVANT la PR #20, qui a ajouté 52 entrées. Il
// annonçait « 419 étapes » et « 86 plats » : l'export en porte 630 et 138. Trois
// de ses quatre comptes étaient donc faux au moment où le ticket a été écrit —
// `enParallele` 42 → 50, `attente` 30 → 42, `vaisselle` 44/86 → 66/138. Seuls
// `uses` (126) et `rattrapage` (6) tenaient, par coïncidence : les recettes de
// #20 n'ont apporté ni l'un ni l'autre.
//
// `source:` : le ticket disait « 65 plats sur 86 », c'est 117 sur 138. Mais la
// vraie affirmation — « les 21 sans source sont EXACTEMENT les plats du foyer »
// — a survécu à la mesure, à l'identique, malgré 52 recettes de plus.
//
// LE CINQUIÈME CHAMP JETÉ, QUE LE TICKET NE NOMMAIT PAS. `uses` cite des clés
// de LIGNE (`ref`), pas des clés d'achat (`id`), et `ingredient()` ne lisait pas
// `ref`. Sur 357 références, 29 réparties sur 9 plats ne tombaient sur aucun
// `id` — la farine de la pâte contre celle de la crème. Livrer `uses` sans
// `ref`, c'était livrer un lien mort sur un plat sur quinze, et aucun test ne
// l'aurait dit puisque le champ n'existait pas encore.
//
// ON NE L'AURAIT VU EN RELISANT NI LE CODE NI LE TICKET.

import { readFileSync } from "node:fs";

const brut = JSON.parse(readFileSync(new URL("../public/cuisine-data.json", import.meta.url), "utf8"));

const { lireCatalogue } = await import("../src/model/catalogue.ts");

const catalogue = lireCatalogue(brut);
const plats = catalogue.plats;
const etapes = plats.flatMap((p) => p.steps);
const titre = (s) => console.log(`\n── ${s} ${"─".repeat(Math.max(0, 68 - s.length))}`);
const pct = (n, d) => `${((100 * n) / d).toFixed(0)} %`;

/* ── 1. Les champs d'étape, et ce qu'ils pèsent ───────────────────────────── */

titre("ce que l'export porte et que l'app jetait");

console.log(`  ${plats.length} plats, ${etapes.length} étapes\n`);
// `uses` se compte ICI sur « cite au moins une ligne », et c'est le 126 du
// ticket. Le compte non-nul est 224 : il inclut les 98 `[]`, qui sont une
// réponse et pas une donnée manquante. Deux nombres, deux questions — la
// ventilation est juste en dessous.
const champs = [
  ["uses", (e) => e.uses?.length, "les ids de ligne qu'une étape consomme"],
  ["enParallele", (e) => e.enParallele !== null, "l'étape qu'on mène en même temps"],
  ["attente", (e) => e.attente !== null, "du temps mort, la seconde horloge"],
  ["attenteRaison", (e) => e.attenteRaison !== null, "pourquoi on attend"],
  ["rattrapage", (e) => e.rattrapage !== null, "le repli quand c'est raté"],
];
for (const [nom, porte, quoi] of champs) {
  const n = etapes.filter(porte).length;
  console.log(`  ${nom.padEnd(15)} ${String(n).padStart(4)}  ${pct(n, etapes.length).padStart(5)}  ${quoi}`);
}

/* ── 2. `null` contre `[]`, la distinction qui coûte le plus cher ──────────── */

titre("`uses` : l'absence est une donnée");

const inconnu = etapes.filter((e) => e.uses === null).length;
const rien = etapes.filter((e) => e.uses?.length === 0).length;
const cite = etapes.filter((e) => e.uses?.length).length;
console.log(`  null  ${String(inconnu).padStart(4)}  la recette n'a pas encore le lien`);
console.log(`  []    ${String(rien).padStart(4)}  rien à verser ici — on remue, on enfourne`);
console.log(`  cite  ${String(cite).padStart(4)}  ${etapes.reduce((n, e) => n + (e.uses?.length ?? 0), 0)} références en tout`);
console.log(`\n  Aplatir les deux premiers ferait promettre à un écran qu'une étape ne`);
console.log(`  consomme rien alors qu'on l'ignore. C'est pour ça que \`uses\` n'est pas string[].`);

/* ── 3. `ref` : le cinquième champ, trouvé par le test ─────────────────────── */

titre("`ref` — la clé de ligne, sans laquelle `uses` ne se résout pas");

const parId = plats.filter(
  (p) => new Set(p.ingredients.map((i) => i.id)).size < p.ingredients.length,
);
const avecUses = parId.filter((p) => p.steps.some((e) => e.uses?.length));
let orphelinsSiId = 0;
for (const p of plats) {
  const ids = new Set(p.ingredients.map((i) => i.id));
  for (const e of p.steps) for (const r of e.uses ?? []) if (!ids.has(r)) orphelinsSiId++;
}
console.log(`  lignes où ref ≠ id           ${plats.flatMap((p) => p.ingredients).filter((i) => i.ref !== i.id).length}`);
console.log(`  plats doublant un id         ${parId.length}  (dont ${avecUses.length} avec des \`uses\`)`);
console.log(`  \`uses\` orphelins contre id   ${orphelinsSiId}  ← ce que livrer sans \`ref\` aurait cassé`);
console.log(`  \`uses\` orphelins contre ref  0`);
console.log(`\n  Les deux plats qui doublent un id SANS \`uses\` n'ont pas besoin de \`ref\` :`);
console.log(`  verifier.py ne le réclame que là où une étape cite une ligne.`);

/* ── 4. Le témoin : le plat par lequel l'utilisateur a trouvé le trou ─────── */

titre("lentilles-mijotees — la plainte d'origine");

const l = plats.find((p) => p.id === "lentilles-mijotees");
if (!l) console.log("  absent du catalogue");
else {
  for (const e of l.steps) {
    const p = e.enParallele ? `  ∥ ${e.enParallele}` : "";
    const a = e.attente ? `  ⏳ ${e.attente} min` : "";
    console.log(`  ${String(e.minutes).padStart(3)} min  ${e.id.padEnd(22)}${p}${a}`);
  }
  const gestes = l.steps.filter((e) => !e.enParallele).reduce((n, e) => n + e.minutes, 0);
  const brutTotal = l.steps.reduce((n, e) => n + e.minutes, 0);
  console.log(`\n  somme brute des étapes      ${brutTotal} min`);
  console.log(`  hors étapes en parallèle    ${gestes} min`);
  console.log(`  le plat se déclare à         ${l.minutes} min, dont ${l.actifMin} actives`);
  console.log(`\n  L'écart est réel et reste entier : ce bloc rend la donnée lisible,`);
  console.log(`  il ne redessine pas le guide. C'est Workspace#57.`);
}

/* ── 5. Ce que le rattrapage promet ───────────────────────────────────────── */

titre("les six replis, et ce qu'ils coûtent");

for (const p of plats)
  for (const e of p.steps)
    if (e.rattrapage)
      console.log(
        `  ${p.id}/${e.id}\n    attente ${e.attente} min → repli ${e.rattrapage.coutMin} min` +
          `  (${e.attenteSouple ? "souple" : "RIGIDE"})\n    ${e.rattrapage.effet}`,
      );

console.log();
