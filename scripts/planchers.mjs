// LES PLANCHERS SUR LE CORPUS RÉEL — `npm run planchers`
//
// POURQUOI CE N'EST PAS UN TEST, et c'est le même argument que `banc.mjs` :
// ceci n'épingle rien, ça IMPRIME. Les tests de `plancher.test.ts` tiennent des
// PROMESSES — « un plat qui recharge un type sous son plancher remonte » — et
// elles doivent survivre à une recette de plus au catalogue. Les chiffres
// ci-dessous, eux, changeront au premier fichier ajouté ; les figer en
// assertions ferait rougir la suite pour une bonne nouvelle.
//
// CE QUE CE SCRIPT A SERVI À ÉTABLIR, ET QUI A CORRIGÉ LE TICKET. Workspace#43
// posait trois faits de corpus qui ne tiennent plus : `pain-rassis` n'est émis
// par personne (le ticket disait cinq recettes), les types `base` ne sont pas
// « exactement » les types acceptés, et les tailles ont bougé. Rien de tout ça
// ne change le contrat, tout le change de preuve — et on ne l'aurait pas vu en
// relisant le ticket.

import { readFileSync } from "node:fs";

const brut = JSON.parse(readFileSync(new URL("../public/cuisine-data.json", import.meta.url), "utf8"));
const LUNDI = new Date("2026-08-17T12:00:00Z");

const { lireCatalogue } = await import("../src/model/catalogue.ts");
const { creerJeu } = await import("../src/model/jeu.ts");
const { calculer } = await import("../src/model/calcul.ts");
const { offre } = await import("../src/model/scoring.ts");
const { bandRepas } = await import("../src/model/depot.ts");
const { etatDuCongelo, planchables, producteurs, populationDe, reglagesDuCongelo } =
  await import("../src/model/plancher.ts");

const catalogue = lireCatalogue(brut);
const titre = (s) => console.log(`\n── ${s} ${"─".repeat(Math.max(0, 68 - s.length))}`);

/* ── 1. Ce que le corpus émet ──────────────────────────────────────────────── */

titre("ce qu'un plat produit");

const emits = catalogue.plats.flatMap((p) => p.emits.map((e) => ({ ...e, plat: p.id })));
const parKind = {};
for (const e of emits) parKind[e.kind] = (parKind[e.kind] ?? 0) + 1;
const types = new Set(emits.map((e) => e.type));

console.log(`${catalogue.plats.length} plats · ${emits.length} emits · ${types.size} types distincts`);
console.log(
  "par kind : " + Object.entries(parKind).map(([k, n]) => `${k} ${n}`).join(" · "),
);
console.log(
  `${emits.filter((e) => e.congelo).length} emits congelables, ` +
    `sur ${catalogue.plats.filter((p) => p.emits.some((e) => e.congelo)).length} plats`,
);

const qui = producteurs(catalogue);
const multi = [...qui].filter(([, l]) => l.length > 1);
console.log(
  `${multi.length} types sortent de plusieurs recettes : ` +
    multi.map(([t, l]) => `${t} (${l.length})`).join(", "),
);
console.log("   → c'est la raison d'être de T34 : le plancher se pose sur le type, pas sur la recette.");

const acceptes = new Set(catalogue.plats.flatMap((p) => p.accepts.map((a) => a.type).filter(Boolean)));
const orphelins = [...acceptes].filter((t) => !qui.has(t));
console.log(
  `${acceptes.size} types acceptés, dont ${orphelins.length} que RIEN ne produit : ${orphelins.join(", ")}`,
);
console.log("   → et aucun d'eux n'est proposable comme plancher, sans qu'une ligne ait eu à le prévoir.");

/* ── 2. Les deux populations contre les dix-huit places ────────────────────── */

titre("deux populations, deux plafonds (T35)");

const r = reglagesDuCongelo(catalogue);
const pop = { apport: [], diner: [] };
for (const e of emits) if (e.congelo) pop[populationDe(e.kind)].push(bandRepas(e.band));
for (const [nom, portions] of Object.entries(pop))
  console.log(
    `${nom.padEnd(7)} ${String(portions.length).padStart(3)} emits congelables · ` +
      `${portions.reduce((a, b) => a + b, 0)} portions si tout était cuisiné une fois · ` +
      `plafond ${r.plafonds[nom]}`,
  );
console.log(
  `capacité ${r.limite} places (trois tiroirs de ${catalogue.equilibre.congelateur.portions_par_tiroir}) · ` +
    `plafonds ${r.plafonds.apport} + ${r.plafonds.diner} = ${r.plafonds.apport + r.plafonds.diner}`,
);
const possibles = planchables(catalogue).size;
console.log(
  `${possibles} des ${types.size} types peuvent porter un plancher (les congelables) ; ` +
    `${possibles} planchers à 1 portion réclameraient ${possibles} places pour ${r.limite}.`,
);
console.log("   → le pur par-type ne tient pas l'arithmétique : d'où le secours mutualisé (T36).");

/* ── 3. Ce que le plancher de secours change à la proposition ──────────────── */

titre("le plancher de secours, sur une semaine vide (T36)");

const jeu = creerJeu(catalogue, 7, LUNDI);
const slot = jeu.creneaux.findIndex((c) => c.repas === "diner");
const etat = etatDuCongelo(catalogue, calculer(jeu, jeu.choix).depot.lignes);
console.log(
  `congélateur à l'amorce : ${etat.total} portions sur ${r.limite}, ` +
    `${etat.secours.types} type(s) · sous le plancher de secours : ${etat.secours.sous}`,
);

const cartes = offre(jeu, jeu.choix, slot);
const payees = cartes.filter((c) => c.pourquoi.some((x) => x.startsWith("remonte le stock")));
console.log(`${payees.length} cartes sur ${cartes.length} touchent le bonus de secours.`);
console.log(`en tête : ${cartes.slice(0, 3).map((c) => `${c.plat.id} (${c.score})`).join(" · ")}`);

/* ── 4. Ce qu'un plancher par type déplace ─────────────────────────────────── */

titre("un plancher par type, et ce qu'il déplace (T34)");

const avant = offre(jeu, jeu.choix, slot);
const rang = (l, id) => {
  const n = l.findIndex((c) => c.plat.id === id);
  return n < 0 ? "hors créneau" : `${n + 1}/${l.length}`;
};
const avecPlancher = (type, niveau) =>
  offre(jeu, jeu.choix, slot, {
    rejeu: { parIngredient: new Map(), vus: new Map(), retraits: [] },
    passe: { repondu: new Map(), depense: new Map() },
    cuisinesRecemment: new Set(),
    planchers: [{ type, niveau }],
  });

// Deux cas, et ils ne disent pas la même chose. `sauce-bolognaise` est celui de
// l'utilisateur — « si je déstocke la dernière bolognaise il faut encourager
// d'en refaire » — et l'amorce en porte deux portions : le plancher ne mord
// qu'au-dessus de deux. `reste-roti` sort de DEUX recettes, et c'est lui qui
// montre que le producteur est dérivé.
for (const [type, niveaux] of [["sauce-bolognaise", [2, 3]], ["reste-roti", [1]]]) {
  for (const niveau of niveaux) {
    const apres = avecPlancher(type, niveau);
    console.log(
      `plancher ${type} à ${niveau} (il y en a ${etat.portions.get(type) ?? 0}) : ` +
        (qui.get(type) ?? []).map((id) => `${id} ${rang(avant, id)} → ${rang(apres, id)}`).join(" · "),
    );
  }
}
console.log("   → les producteurs sont dérivés, et ils montent ENSEMBLE : ils ne se partagent pas le bonus.");

/* ── 5. Le plafond éteint le bonus (T38) ───────────────────────────────────── */

titre("le plafond éteint tout, et nomme ce qui prend la place (T38)");

const plein = etatDuCongelo(catalogue, [
  // Dix-huit portions d'un seul type : le congélateur est plein ET sans
  // diversité, donc le plancher de secours est SOUS son seuil pendant que la
  // place manque. C'est le seul cas où les deux mécaniques se contredisent.
  {
    type: "ratatouille", kind: "reste-plat", qty: null, band: "18-repas", espace: "congelo",
    location: "congelo", born: null, gardeFrigo: null, congelo: true, from: null, ref: null,
    reste: null, unite: null, epuise: false,
  },
]);
console.log(
  `${plein.total} portions sur ${plein.reglages.limite} · plein : ${plein.plein} · ` +
    `secours sous son seuil : ${plein.secours.sous} · dominant : ${plein.dominant.type}`,
);
const bloquees = offre(jeu, jeu.choix, slot).length;
console.log(`(${bloquees} candidats sur ce créneau, inchangé — un plafond n'interdit rien, il cesse de payer)`);
console.log("");
