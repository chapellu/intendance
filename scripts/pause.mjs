// `npm run pause` — ce que la proposition de 15 h montre, mesuré sur le corpus.
//
// IMPRIME, NE TESTE PAS : les promesses sont dans `model/pause.test.ts`. Ce
// script dit les tailles — combien de dîners se font sans rien acheter quand le
// fond est en place, combien à un article — pour qu'une affirmation du backlog
// se remesure au lieu de se recopier (le motif de `npm run planchers`).

import { readFileSync } from "node:fs";
import { lireCatalogue } from "../src/model/catalogue.ts";
import { creerJeu } from "../src/model/jeu.ts";
import { contexte, rejouer } from "../src/model/journal.ts";
import { ceQuiEstIci, ceQuiManque } from "../src/model/ici.ts";
import { proposerCeSoir } from "../src/model/pause.ts";
import { comptoir } from "../src/model/scoring.ts";

const catalogue = lireCatalogue(JSON.parse(readFileSync("public/cuisine-data.json", "utf8")));
const LUNDI = new Date("2026-10-19T15:00:00");
const jour = "2026-10-19";

function monde(fond) {
  const evts = fond.length
    ? [
        {
          sorte: "entree",
          jour,
          saisi: jour,
          maj: 1,
          lignes: fond.map((d) => ({
            ingredient: d.ingredient,
            unites: d.minimum,
            parUnite: null,
            zone: null,
            etat: "sec",
          })),
        },
      ]
    : [];
  const rejeu = rejouer(catalogue, evts, contexte(catalogue), jour);
  const jeu = creerJeu(catalogue, 7, LUNDI);
  jeu.stock = [];
  jeu.gardeManger = jeu.gardeManger.filter((id) => rejeu.parIngredient.has(id));
  const savoir = {
    rejeu,
    passe: { repondu: {}, depense: {} },
    cuisinesRecemment: new Set(),
    planchers: [],
  };
  return { jeu, savoir, rejeu };
}

const decrire = (c) =>
  `${c.plat.id} (${c.manque.length}${c.manque.length ? " : " + c.manque.map((a) => a.nom).join(", ") : ""}, ` +
  `${c.horaire.total} min, actif ${c.horaire.actif})`;

for (const [nom, fond] of [
  ["le relevé du 26/08 seul", []],
  ["le fond complet", catalogue.fond.denrees],
]) {
  const { jeu, savoir, rejeu } = monde(fond);
  const soir = jeu.creneaux.findIndex((c) => c.jour === 0 && c.repas === "diner");
  const comp = comptoir(jeu, jeu.choix, soir, savoir);
  const ici = ceQuiEstIci(catalogue, jeu.gardeManger, rejeu, jour);
  const diners = catalogue.plats.filter((p) => !comp.ecarts(p).length && !comp.noter(p).manque);
  const par = new Map();
  for (const p of diners) {
    const n = Math.min(4, ceQuiManque(catalogue, p, ici, comp.noter(p).plein).ingredients.length);
    par.set(n, [...(par.get(n) ?? []), p.id]);
  }
  console.log(`\n— ${nom} : ${diners.length} dîners proposables, ${ici.size} ids ici`);
  for (const k of [0, 1, 2, 3, 4])
    console.log(
      `  ${k === 4 ? "4+" : k} article(s) : ${(par.get(k) ?? []).length}`,
      k <= 1 ? (par.get(k) ?? []).join(", ") : "",
    );
  const prop = proposerCeSoir({ jeu, savoir, recents: new Set(), maintenant: LUNDI });
  console.log("  la proposition :", prop.cartes.map(decrire).join(" · "));
  console.log("  voir plus :", prop.plus.length, "dont faisables ce soir :", prop.plus.filter((c) => c.manque.length <= 1).length);
}
console.log("\nle fond :", catalogue.fond.denrees.length, "denrées");
