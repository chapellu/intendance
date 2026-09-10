// CE QUE L'ÉCOULEMENT PAIE, SUR LE CORPUS RÉEL — `npm run ecoulement`
//
// POURQUOI CE N'EST PAS UN TEST : même argument que `horloges.mjs`,
// `planchers.mjs` et `banc.mjs` avant lui. Ceci n'épingle rien, ça IMPRIME. Les
// promesses — « le placard vaut exactement ce qu'il valait avant l'axe », « le
// score cumule », « un seul plafond pour les deux stocks », « une denrée
// qu'aucun plat ne consomme ne peut rien bruiter » — sont dans
// `ecoulement.test.ts`, `gardeManger.test.ts` et `scoring.test.ts`, et doivent
// survivre à une recette de plus. Les tailles ci-dessous bougeront au premier
// relevé de garde-manger et à la première soirée de cuisine ; les figer en
// assertions ferait rougir la suite pour une bonne nouvelle.
//
// CE QUE CE SCRIPT A SERVI À ÉTABLIR, ET QUI A CORRIGÉ LE TICKET TROIS FOIS.
//
// T60 — Workspace#50 voulait « retirer du score les denrées que leur zone
// abîme » et affirmait que 4 des 5 `haute` le sont « parce qu'elles sont sous
// l'évier ». Mesuré : ces quatre-là sont `etat: frais`, et l'export tranche sur
// le frais AVANT de regarder la zone. Le geste demandé était donc un NO-OP — il
// aurait laissé le +5 sur l'oignon intact et le ticket clos à tort. La cinquième,
// les pignons, est le seul `haute` purement dû à sa zone, et elle n'est dans
// aucun plat : elle n'avait jamais rien payé. Idem pour le volet (a) du ticket,
// déjà tenu par la forme de la boucle.
//
// T47 — le ticket reproche à `ecoule_frigo: 5` / `ecoule_congelo: 3` de classer
// par endroit, et l'illustre par « une bolognaise un peu vieille au congélateur
// est plus urgente qu'un truc frais au frigo ». Lue dans le code de référence, la
// paire donnait DÉJÀ l'avantage au congélateur — les deux tests sont
// indépendants, donc 5 + 3 = 8 contre 5 — l'inverse de ce que `equilibre.yaml`
// annonçait en commentaire depuis le prototype. Ce que la paire ne savait pas
// faire est dans l'adjectif, « un peu VIEILLE » : elle n'a jamais lu un âge.
//
// On ne l'aurait vu ni l'un ni l'autre en relisant le code.

import { readFileSync } from "node:fs";

const brut = JSON.parse(readFileSync(new URL("../public/cuisine-data.json", import.meta.url), "utf8"));

const { lireCatalogue } = await import("../src/model/catalogue.ts");
const { creerJeu } = await import("../src/model/jeu.ts");
const { calculer } = await import("../src/model/calcul.ts");
const { horlogesDu, Depot } = await import("../src/model/depot.ts");
const { aEcouler, placardDuPlat } = await import("../src/model/gardeManger.ts");
const { ecoulement, PLAFOND_ARTICLES } = await import("../src/model/ecoulement.ts");
const { offre } = await import("../src/model/scoring.ts");
const { SEUIL_A_MANGER, SEUIL_URGENT } = await import("../src/model/axe.ts");

const catalogue = lireCatalogue(brut);
const poids = catalogue.equilibre.poids;
const gm = catalogue.gardeManger;
const e = poids["ecoule"] ?? 0;
const LUNDI = new Date("2026-08-17T12:00:00Z");
const jeu = creerJeu(catalogue, 7, LUNDI);
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

/* ── 2. Le fait qui a démenti T60 ──────────────────────────────────────────── */

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

/* ── 3. L'AUTRE MOITIÉ DE LA SOMME : le dépôt (T47) ────────────────────────── */

titre("le dépôt, lot par lot, sur le même axe");

const horloges = horlogesDu(catalogue);
const depot = new Depot(horloges, jeu.stock);
for (const l of depot.lignes) {
  const v = depot.vie(l, LUNDI);
  const sorti = v?.dur && v.depasse;
  console.log(
    `  ${l.type.padEnd(24)} ${l.location.padEnd(8)} J-${String(v?.age).padStart(3)} sur ` +
      `${String(v?.fenetre).padStart(3)} j (${v?.source}) → f=${v?.fraction.toFixed(2)}` +
      `${sorti ? "  ⛔ HORS JEU : frigo dur, dépassé" : `  = ${(v.fraction * e).toFixed(1)} pts`}`,
  );
}
console.log(
  `→ horloges : frigo ${horloges.frigo} j par défaut, congélateur ${horloges.congelo} j,\n` +
    `  et ${horloges.parType.size} types qui portent leur propre fenêtre. C'est ce dénominateur\n` +
    "  que le score attendait pour cesser de classer l'urgence par ENDROIT.",
);

/* ── 4. Ce que ça change au classement, plat par plat ──────────────────────── */

titre("combien de plats le score pousse, et avec quoi");

// AVANT T60 : toute urgence non `basse` payait, frais compris. C'est la version
// que #50 décrivait comme « un bonus de +5 pour contient un oignon ».
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

const auPlacard = catalogue.plats
  .map((p) => ({ p, a: placardDuPlat(catalogue, p, axe) }))
  .filter(({ a }) => a.length);

console.log(
  `  placard, avant T60 : ${String(compteAvant).padStart(2)} plats sur ${catalogue.plats.length}` +
    ` (${Math.round((compteAvant / catalogue.plats.length) * 100)} %)`,
);
console.log(
  `  placard, après     : ${String(auPlacard.length).padStart(2)} plats sur ${catalogue.plats.length}` +
    ` (${Math.round((auPlacard.length / catalogue.plats.length) * 100)} %)`,
);

const slot = jeu.creneaux.findIndex((c) => c.repas === "diner");
const cartes = offre(jeu, jeu.choix, slot);
const touchees = cartes.filter((c) => c.ecoule.length);
console.log(`\n  au premier dîner, ${touchees.length} cartes sur ${cartes.length} écoulent :`);
for (const c of touchees)
  console.log(
    `     ${c.plat.id.padEnd(32)} +${ecoulement(c.ecoule, poids).score
      .toString()
      .padEnd(4)} ${c.ecoule.map((a) => `${a.id}·${a.fraction.toFixed(2)}·${a.ou}`).join("  ")}`,
  );

/* ── 5. La rampe : le même plat, jour après jour ───────────────────────────── */

titre("une rampe, pas un forfait — ce que T47 rend visible");

{
  const choix = [...jeu.choix];
  const iLundi = jeu.creneaux.findIndex((c) => c.jour === 0 && c.repas === "diner");
  choix[iLundi] = "lentilles-mijotees";
  console.log("  lentilles mijotées lundi soir → 400 g de lentilles cuites, 4 j au frigo.");
  for (const jour of [1, 2, 3, 4, 5]) {
    const i = jeu.creneaux.findIndex((c) => c.jour === jour && c.repas === "diner");
    const c = offre(jeu, choix, i).find((x) => x.plat.id === "burgers-de-lentilles");
    const a = c?.ecoule[0];
    console.log(
      `  jour ${jour} : ` +
        (c?.chaine
          ? `f=${a.fraction.toFixed(2)} → +${(a.fraction * e).toFixed(1)} pts` +
            `${c.sauve ? "   « sauve ce qui se perd »" : ""}`
          : "le lot a passé sa fenêtre — frigo DUR, il sort du jeu (T58)"),
    );
  }
  console.log(
    "→ c'est le cas que la paire abandonnée ne savait pas noter DU TOUT : elle ne\n" +
      "  payait que les lots présents avant la semaine. Un reste produit mardi et\n" +
      "  oublié jusqu'à samedi ne valait rien de plus que le mercredi.",
  );
}

/* ── 6. Le plafond partagé, et ce qu'il attend ─────────────────────────────── */

titre("le plafond de trois articles, partagé par les deux stocks");

{
  let max = 0;
  let ou = null;
  for (const [c, i] of jeu.creneaux.map((c, i) => [c, i])) {
    if (c.repas !== "diner") continue;
    for (const carte of offre(jeu, jeu.choix, i))
      if (carte.ecoule.length > max) {
        max = carte.ecoule.length;
        ou = `${carte.plat.id} (${carte.ecoule.map((a) => a.ou).join("+")})`;
      }
  }
  console.log(`  plafond ${PLAFOND_ARTICLES} articles · maximum atteint sur le corpus : ${max} — ${ou}`);
  console.log(
    "→ LE PLAFOND NE MORD TOUJOURS PAS, mais il s'en rapproche : le maximum est passé\n" +
      "  de 1 à 2 en versant le dépôt dans la somme. Il mordra quand une semaine posée\n" +
      "  laissera deux restes derrière elle en plus d'un paquet ouvert.",
  );
}

/* ── 7. Reconstituer contre écouler ────────────────────────────────────────── */

titre("où écouler passe devant reconstituer");

for (const cle of ["plancher_type", "plancher_congelo", "chaine_couverte", "proteine_manquante"]) {
  const f = (poids[cle] ?? 0) / e;
  console.log(
    `  ${cle.padEnd(20)} ${String(poids[cle]).padStart(2)} pts → dépassé à f = ${f.toFixed(2)}` +
      (f > 1 ? "   (jamais : la fraction plafonne à 1)" : ""),
  );
}
console.log(
  `→ 0,80 est SEUIL_URGENT (${SEUIL_URGENT}). Les quatre nombres ont été posés à vue, à des\n` +
    "  mois d'écart, sans que personne ne vise cet alignement : c'est un CONSTAT sur les\n" +
    "  valeurs d'aujourd'hui, pas un invariant à défendre. Le plat qui recharge le tiroir\n" +
    "  d'urgence gagne, jusqu'au jour où le bocal qu'on remplacerait franchit la ligne.",
);

/* ── 8. L'axe, tel que les deux stocks le lisent ───────────────────────────── */

titre("l'axe 0–1, et les deux mots");

console.log(
  `  rien   [0 ; ${SEUIL_A_MANGER}[   ·   à manger   [${SEUIL_A_MANGER} ; ${SEUIL_URGENT}[` +
    `   ·   urgent   [${SEUIL_URGENT} ; 1]`,
);
for (const [nom, fenetre] of [
  ["congélateur", horloges.congelo],
  ["frigo (défaut du foyer)", horloges.frigo],
  ["carcasse de volaille", horloges.parType.get("carcasse-volaille")],
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
