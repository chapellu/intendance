// CE QUE L'ÉCOULEMENT PAIE, SUR LE CORPUS RÉEL — `npm run ecoulement`
//
// POURQUOI CE N'EST PAS UN TEST : même argument que `horloges.mjs`,
// `planchers.mjs` et `banc.mjs` avant lui. Ceci n'épingle rien, ça IMPRIME. Les
// promesses — « le placard vaut exactement ce qu'il valait avant l'axe », « le
// score cumule », « une denrée qu'aucun plat ne consomme ne peut rien bruiter »
// — sont dans `gardeManger.test.ts` et doivent survivre à une recette de plus.
// Les tailles ci-dessous bougeront au premier relevé de garde-manger ; les figer
// en assertions ferait rougir la suite pour une bonne nouvelle.
//
// CE QUE CE SCRIPT A SERVI À ÉTABLIR, ET QUI A CORRIGÉ LE TICKET DEUX FOIS.
// Workspace#50 voulait « retirer du score les denrées que leur zone abîme » et
// affirmait que 4 des 5 `haute` le sont « parce qu'elles sont sous l'évier ».
// Mesuré : ces quatre-là sont `etat: frais`, et l'export tranche sur le frais
// AVANT de regarder la zone. Le geste demandé était donc un NO-OP — il aurait
// laissé le +5 sur l'oignon intact et le ticket clos à tort. La cinquième, les
// pignons, est le seul `haute` purement dû à sa zone, et elle n'est dans aucun
// plat : elle n'avait jamais rien payé. Idem pour le volet (a) du ticket, déjà
// tenu par la forme de la boucle. On ne l'aurait vu ni l'un ni l'autre en
// relisant le code.

import { readFileSync } from "node:fs";

const brut = JSON.parse(readFileSync(new URL("../public/cuisine-data.json", import.meta.url), "utf8"));

const { lireCatalogue } = await import("../src/model/catalogue.ts");
const { aEcouler, bonusPlacard, PLAFOND_ARTICLES } = await import("../src/model/gardeManger.ts");
const { SEUIL_A_MANGER, SEUIL_URGENT } = await import("../src/model/axe.ts");

const catalogue = lireCatalogue(brut);
const poids = catalogue.equilibre.poids;
const gm = catalogue.gardeManger;
const titre = (s) => console.log(`\n── ${s} ${"─".repeat(Math.max(0, 68 - s.length))}`);

/* ── 1. Ce que le relevé porte, et ce que le score en retient ──────────────── */

titre("le garde-manger, par urgence — et qui paie");

const axe = aEcouler(catalogue);
const alias = (id) => catalogue.rayons.aliases[id] ?? id;
const parUrgence = { haute: [], moyenne: [], basse: [] };
for (const d of gm.denrees) parUrgence[d.urgence].push(d);

for (const [u, liste] of Object.entries(parUrgence)) {
  const payees = liste.filter((d) => axe.has(alias(d.ingredient)));
  console.log(
    `  ${u.padEnd(8)} ${String(liste.length).padStart(2)} denrées · ` +
      `${String(payees.length).padStart(2)} sur l'axe`,
  );
}
console.log(
  `→ ${gm.denrees.length} denrées, ${axe.size} ingrédients sur l'axe, tous à ` +
    `${[...new Set(axe.values())].join("/")} — le score ne paie que la barrière rompue.`,
);
console.log(
  "  Le `basse` compté sur l'axe n'est pas une fuite : un paquet neuf partage son\n" +
    "  ingrédient avec un paquet ouvert, et c'est l'ouvert qui commande. Une recette\n" +
    "  nomme `pates`, pas « le deuxième sachet ».",
);

/* ── 2. Le fait qui a démenti le ticket ────────────────────────────────────── */

titre("pourquoi les `haute` sont pressées — la mesure contre le ticket");

for (const d of parUrgence.haute) {
  const z = gm.zones.find((z) => z.id === d.zone);
  const agresse = d.sensible.filter(
    (s) =>
      (s === "lumiere" && z?.exposition === "jour") ||
      (s === "humidite" && z?.hygrometrie === "humide") ||
      (s === "chaleur" && z?.chaleur),
  );
  console.log(
    `  ${d.ingredient.padEnd(16)} etat=${d.etat.padEnd(6)} zone=${(d.zone ?? "").padEnd(16)} ` +
      `agressions=${agresse.join("+") || "—"}`,
  );
}
console.log(
  "→ le frais l'emporte sur la zone dans `urgence()`, donc les quatre légumes du\n" +
    "  sous-évier seraient `haute` dans une cave sèche. « Retirer la cause zone »\n" +
    "  ne les aurait pas touchés — c'est l'état frais qui les sort du score.",
);

/* ── 3. Ce que ça change au classement, plat par plat ──────────────────────── */

titre("combien de plats le score pousse, avant et après T60");

// AVANT : toute urgence non `basse` payait, frais compris. C'est la version que
// #50 décrivait comme « un bonus de +5 pour contient un oignon ».
const RANG = { haute: 3, moyenne: 2, basse: 1 };
const avant = new Map();
for (const d of gm.denrees) {
  const id = alias(d.ingredient);
  if (d.urgence === "basse") continue;
  if (!avant.has(id) || RANG[d.urgence] > RANG[avant.get(id)]) avant.set(id, d.urgence);
}

const compteAvant = catalogue.plats.filter((p) =>
  p.ingredients.some((i) => !i.base && avant.has(alias(i.id))),
).length;

const apres = catalogue.plats
  .map((p) => ({ p, b: bonusPlacard(catalogue, p, axe, poids) }))
  .filter(({ b }) => b.noms.length);

console.log(
  `  avant  ${String(compteAvant).padStart(2)} plats sur ${catalogue.plats.length} touchés` +
    ` (${Math.round((compteAvant / catalogue.plats.length) * 100)} %)`,
);
console.log(
  `  après  ${String(apres.length).padStart(2)} plats sur ${catalogue.plats.length} touchés` +
    ` (${Math.round((apres.length / catalogue.plats.length) * 100)} %)`,
);
for (const { p, b } of apres)
  console.log(`     ${p.id.padEnd(32)} +${b.score}  ${b.noms.join(", ")}`);

/* ── 4. Le plafond de T59, et ce qu'il attend ──────────────────────────────── */

titre("le plafond de trois articles");

const max = Math.max(0, ...apres.map(({ b }) => b.noms.length));
console.log(
  `  plafond ${PLAFOND_ARTICLES} articles · maximum atteint sur le corpus : ${max}\n` +
    `  soit au plus ${max * (poids["ecoule"] ?? 0) * 0.4} points, contre ` +
    `${poids["proteine_manquante"]} pour une protéine qui manque.`,
);
console.log(
  "→ LE PLAFOND NE MORD PAS ENCORE, et c'est un fait sur le placard, pas sur la\n" +
    "  règle : il n'offre plus que des paquets entamés, et aucune recette n'en cite\n" +
    "  deux. Il mordra quand T47 versera les lots du dépôt dans la même somme.",
);

/* ── 5. L'axe, tel que les deux stocks le lisent ───────────────────────────── */

titre("l'axe 0–1, et les deux mots");

console.log(
  `  rien   [0 ; ${SEUIL_A_MANGER}[   ·   à manger   [${SEUIL_A_MANGER} ; ${SEUIL_URGENT}[` +
    `   ·   urgent   [${SEUIL_URGENT} ; 1]`,
);
for (const [nom, fenetre] of [
  ["congélateur", catalogue.conservation.find((c) => c.id === "congeler")?.fenetreJours],
  ["frigo (défaut du foyer)", catalogue.foyer.fenetreFrigo],
  ["carcasse de volaille", catalogue.plats.flatMap((p) => p.emits).find((e) => e.type === "carcasse-volaille")?.gardeFrigo],
]) {
  if (fenetre == null) continue;
  const j = (f) => Math.round(fenetre * f * 10) / 10;
  console.log(`  ${nom.padEnd(24)} ${String(fenetre).padStart(3)} j → J+${j(SEUIL_A_MANGER)} puis J+${j(SEUIL_URGENT)}`);
}
console.log(
  "→ c'est la dernière ligne qui justifie de n'afficher AUCUNE jauge : sur une\n" +
    "  fenêtre de deux jours, un pourcentage serait faux à la décimale près. Seul le\n" +
    "  franchissement se dit.",
);
console.log("");
