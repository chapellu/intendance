// PERF DU MODÈLE — `npm run perf`
//
// LE CHIFFRE, PAS L'INTUITION. `offre()` rejoue `calculer` pour chaque plat
// candidat, parce que le coût marginal d'une carte ne se lit nulle part
// ailleurs : il faut poser le plat et regarder ce que le panier devient. C'est
// le calcul le plus cher de l'app, et le seul qu'un utilisateur puisse
// attendre. Ce script le mesure, pour qu'on n'optimise pas au jugé.
//
// Il mesure le MODÈLE SEUL, sans DOM : c'est la moitié incompressible. La
// moitié rendu se mesure au navigateur (voir la section T17 du backlog).
//
// CE QUE CE SCRIPT A SERVI À ÉTABLIR : le modèle ne coûte rien. Une semaine
// pleine se calcule en 0,06 ms, une main se tire en 1 ms, et poser les
// quatorze créneaux d'affilée prend 12 ms — et le modèle du proto fait le même
// travail dans le même temps. Le squelette a donc porté pendant onze tickets
// une croyance fausse : que `offre()` était le calcul cher à mémoïser. Ce
// script existe pour qu'aucune décision de perf ne se prenne plus au jugé.
//
// Contrairement à `parite.mjs`, ce script ne dépend pas du proto : il survivra
// à sa suppression.
import { readFileSync } from "node:fs";

const brut = JSON.parse(readFileSync(new URL("../public/cuisine-data.json", import.meta.url), "utf8"));
const LUNDI = new Date("2026-08-17T12:00:00Z");

const { lireCatalogue } = await import("../src/model/catalogue.ts");
const { creerJeu } = await import("../src/model/jeu.ts");
const { calculer } = await import("../src/model/calcul.ts");
const { offre, main } = await import("../src/model/scoring.ts");

const catalogue = lireCatalogue(brut);

/** Une semaine pleine : c'est le pire cas, et le seul qui compte. Un dépôt
 *  vide se calcule vite ; c'est quand quatorze plats se passent des lots que
 *  `calculer` travaille. */
function semainePleine() {
  const jeu = creerJeu(catalogue, 7, LUNDI);
  const plats = [
    "lasagnes", "sauce-bolognaise", "poulet-roti", "quiche-poireaux", "chili-sin-carne",
    "curry-pois-chiches", "gnocchis-poelees", "fajitas-poulet", "soupe-de-poule",
    "saumon-riz-brocoli", "gratin-courgettes-riz", "croque-monsieur-salade",
    "tarte-tomates-moutarde", "burgers-de-lentilles",
  ];
  let n = 0;
  jeu.creneaux.forEach((c, i) => {
    if (c.nature === "choisi") jeu.choix[i] = plats[n++ % plats.length];
  });
  return jeu;
}

/** Médiane plutôt que moyenne : une mesure isolée peut tomber pendant un
 *  ramasse-miettes, et la moyenne s'en souvient longtemps. */
function mesurer(nom, fois, f) {
  f(); // une passe pour chauffer le JIT — sinon on mesure le compilateur
  const t = [];
  for (let n = 0; n < fois; n++) {
    const t0 = performance.now();
    f();
    t.push(performance.now() - t0);
  }
  t.sort((a, b) => a - b);
  const med = t[Math.floor(t.length / 2)];
  const pire = t[t.length - 1];
  console.log(`${nom.padEnd(46)} ${med.toFixed(2).padStart(8)} ms   (pire ${pire.toFixed(2)} ms)`);
  return med;
}

console.log(`\n${catalogue.plats.length} plats au catalogue · semaine de 14 créneaux posés\n`);

const jeu = semainePleine();
const vide = creerJeu(catalogue, 7, LUNDI);
const slot = jeu.creneaux.findIndex((c) => c.jour === 3 && c.repas === "diner");
jeu.slot = slot;

mesurer("calculer() sur une semaine vide", 500, () => calculer(vide));
const unCalcul = mesurer("calculer() sur une semaine pleine", 500, () => calculer(jeu));
const uneOffre = mesurer("offre() — un créneau, tous les candidats", 200, () =>
  offre(jeu, jeu.choix, slot));
mesurer("main() — l'offre plus le tirage", 200, () => main(jeu));

// Le nombre qui explique tout le reste.
const candidats = offre(jeu, jeu.choix, slot).length;
console.log(
  `\n${candidats} cartes jouables sur ce créneau · ` +
    `offre() coûte ${(uneOffre / unCalcul).toFixed(0)} fois un calculer() · ` +
    `${((uneOffre / candidats) * 1000).toFixed(0)} µs par carte`,
);

// LE SCÉNARIO DE RÉFÉRENCE : poser les quatorze créneaux d'affilée, en tirant
// une main à chaque fois. C'est le parcours qu'on croyait coûter treize
// secondes ; il en coûte douze millièmes.
const quatorze = mesurer("poser 14 créneaux, une main par créneau", 20, () => {
  const j = creerJeu(catalogue, 7, LUNDI);
  j.creneaux.forEach((c, i) => {
    if (c.nature !== "choisi") return;
    j.slot = i;
    const m = main(j);
    if (m.length) j.choix[i] = m[0].plat.id;
  });
});

console.log(
  `\n→ ${(quatorze / 14).toFixed(1)} ms par créneau sur ce parcours.\n` +
    `  Le modèle du proto fait le même travail dans le même temps (11 ms), et\n` +
    `  sa page entière se préremplit en 111 ms. Le calcul n'a jamais été cher.\n` +
    `  Voir T17 au backlog.\n`,
);
