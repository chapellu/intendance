// Ce que le plancher du garde-manger PROMET — T39, T40, T41, T46.
//
// Les tests portent des promesses, jamais des fonctions : « poser un plancher
// sur une denrée ne bouge aucune carte » doit rester vraie le jour où le canal
// d'achat sera réécrit. Les chiffres de corpus qui bougeront au premier fichier
// ajouté restent hors d'ici ; ceux qu'on épingle sont ceux dont une régression
// serait silencieuse — qu'AUCUNE recette ne cite les six denrées d'apéro, par
// exemple, qui est toute la valeur probante de T40.

import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { lireCatalogue } from "./catalogue";
import { contexte, rejouer, type Evenement, type Rejeu } from "./journal";
import {
  comptable,
  nomDeLaDenree,
  posables,
  pourquoiPasDePlancher,
  sousLeurPlancher,
  UNITE_PLANCHER,
  usages,
  type PlancherDenree,
} from "./plancherGardeManger";
import type { Catalogue } from "./types";

const catalogue: Catalogue = lireCatalogue(
  JSON.parse(readFileSync("public/cuisine-data.json", "utf8")) as unknown,
);
const ctx = contexte(catalogue);
const AUJOURDHUI = "2026-09-07";

const placard = (evenements: Evenement[] = []): Rejeu =>
  rejouer(catalogue, evenements, ctx, AUJOURDHUI);

/** Un relevé de zone. C'est le seul geste qui puisse dire « il n'y en a plus »
 *  sans énumérer les absents — donc le seul qui mette une denrée à zéro. */
const releve = (zone: string, constats: { ingredient: string; unites: number }[]): Evenement => ({
  sorte: "observation",
  jour: "2026-09-01",
  saisi: "2026-09-01",
  maj: Date.parse("2026-09-01"),
  portee: "zone",
  zone,
  constats,
});

/* ═════════════ T39 — le plancher porte sur l'ingrédient, pas sur le lot ════ */

describe("T39 — le plancher du garde-manger porte sur l'ingrédient", () => {
  test("un ingrédient à plusieurs lots n'a qu'un seul compte", () => {
    // `pates` porte quatre lots au relevé — torsades, coquillettes, spaghettis,
    // étoiles — et c'est UN ingrédient. Un plancher par lot voudrait dire
    // « toujours un paquet de chaque forme », ce que personne ne pense en
    // ouvrant un placard.
    const e = placard().parIngredient.get("pates");
    expect(e).toBeDefined();
    expect(e!.lots.length).toBeGreaterThan(1);

    const [ligne] = sousLeurPlancher(catalogue, placard(), [{ ingredient: "pates", niveau: 99 }]);
    expect(ligne).toBeDefined();
    // Un seul manque, calculé sur le total de l'ingrédient — pas quatre lignes.
    expect(ligne!.a).toBe(e!.unites);
    expect(ligne!.manque).toBe(99 - e!.unites);
  });

  test("le compte est en unités d'achat, jamais en grammes", () => {
    // 4 boîtes de maïs de 285 g : le plancher voit 4, pas 1140. « Trois boîtes
    // de maïs » est une phrase qu'un œil vérifie devant l'étagère.
    const e = placard().parIngredient.get("mais")!;
    expect(e.unites).toBe(4);
    expect(e.grammes).toBeGreaterThan(1000);
    expect(sousLeurPlancher(catalogue, placard(), [{ ingredient: "mais", niveau: 5 }])[0]!.manque)
      .toBe(1);
  });

  test("au-dessus de son plancher, une denrée ne dit rien", () => {
    // Un plancher est un SEUIL, pas une bande — la même règle que T38 côté
    // congélateur. Quatre boîtes pour un plancher de deux ne produisent aucune
    // ligne, et surtout aucun « tu en as trop ».
    expect(sousLeurPlancher(catalogue, placard(), [{ ingredient: "mais", niveau: 2 }])).toEqual([]);
    expect(sousLeurPlancher(catalogue, placard(), [{ ingredient: "mais", niveau: 4 }])).toEqual([]);
  });

  test("zéro n'est pas une absence de réponse, c'est la réponse", () => {
    // Un relevé de zone qui ne mentionne plus le maïs le retire du placard.
    // C'est le cas ordinaire d'une étagère qui se vide, et c'est exactement là
    // qu'un plancher sert : il manque tout son plancher.
    const vide = placard([releve("etagere-ouverte", [])]);
    expect(vide.parIngredient.has("mais")).toBe(false);

    const [ligne] = sousLeurPlancher(catalogue, vide, [{ ingredient: "mais", niveau: 2 }]);
    expect(ligne).toBeDefined();
    expect(ligne!.a).toBe(0);
    expect(ligne!.manque).toBe(2);
  });

  test("un plancher sur une denrée dont l'app n'a aucune nouvelle ne se dit pas sûr", () => {
    // Un plancher peut survivre à la denrée sur laquelle il a été posé. Se dire
    // « sûr » d'un placard qu'on n'a jamais regardé est la faute que les trois
    // états de confiance existent pour éviter.
    const [ligne] = sousLeurPlancher(catalogue, placard(), [
      { ingredient: "denree-imaginaire", niveau: 1 },
    ]);
    expect(ligne!.confiance).toBe("inconnu");
    expect(ligne!.vuLe).toBeNull();
  });
});

/* ═══════════ T46 — un plancher n'existe que sur ce qui se compte ══════════ */

describe("T46 — un plancher n'existe que sur ce que l'app sait compter", () => {
  test("l'oignon ne peut pas porter de plancher, et l'app dit pourquoi", () => {
    // Le cas que la prose du ticket nomme : « toujours 3 oignons » serait une
    // cible que l'app est structurellement incapable d'évaluer, parce que T30
    // dit que les fruits & légumes ne s'estiment pas DU TOUT.
    const oignon = posables(catalogue, placard()).find((p) => p.ingredient === "oignon");
    expect(oignon).toBeDefined();
    expect(oignon!.comptable).toBe(false);
    expect(oignon!.raison).not.toBe("");
  });

  test("l'épicerie et le fond de placard, oui ; le primeur, le frais et le non-suivi, non", () => {
    // La barrière est la CLASSE, pas une liste d'ids : elle suit le corpus au
    // lieu de vieillir à côté de lui.
    expect(comptable("epicerie")).toBe(true);
    expect(comptable("fond-de-placard")).toBe(true);
    expect(comptable("congelateur")).toBe(true);
    for (const c of ["fruits-legumes", "frais-court", "non-suivi"] as const) {
      expect(comptable(c)).toBe(false);
      expect(pourquoiPasDePlancher(c)).not.toBe("");
    }
  });

  test("sur ce relevé, la barrière n'attrape QUE le primeur", () => {
    // MESURE, ET ELLE CORRIGE LE TICKET. T46 annonçait la barrière comme mordant
    // aussi sur le frais court et sur « les 23 ids sans rayon » : au garde-manger
    // il n'y a ni l'un ni l'autre — ces 23 ids sont des ids de RECETTES, et
    // aucun n'est dans un placard. Elle n'écarte que les quatre alliacées et
    // tubercules du sous-évier, c'est-à-dire précisément ce que sa prose nommait.
    const refuses = posables(catalogue, placard()).filter((p) => !p.comptable);
    expect(refuses.map((p) => p.ingredient).sort()).toEqual([
      "ail",
      "echalote",
      "oignon",
      "pomme-de-terre",
    ]);
    expect(refuses.every((p) => p.classe === "fruits-legumes")).toBe(true);
  });

  test("ce qu'on a vu partir reste posable — c'est même là que ça sert", () => {
    // Une denrée qu'un relevé a mise à zéro quitte `parIngredient` pour `vus`.
    // N'offrir le geste que sur ce qui reste en stock rendrait le plancher
    // indisponible au moment exact où il devient utile.
    const vide = placard([releve("etagere-ouverte", [])]);
    const mais = posables(catalogue, vide).find((p) => p.ingredient === "mais");
    expect(mais).toBeDefined();
    expect(mais!.a).toBe(0);
    expect(mais!.comptable).toBe(true);
  });
});

/* ═════════════════ T40 — l'apéro, et c'est la preuve du mécanisme ═════════ */

describe("T40 — `usage: apero` est la preuve que le plancher est indépendant du scoring", () => {
  // ELLES ÉTAIENT SIX, ELLES SONT CINQ DEPUIS LE 2026-09-11. `pignons-pin` a
  // perdu son `usage: apero` en saisissant « Je mange sain et bio, même au
  // boulot ! » : la tourte p. 78 en met une cuillerée à soupe, et il n'y avait
  // pas de découpage honnête à faire — ce sont les mêmes pignons. Les tomates
  // séchées et le mélange de fruits secs, eux, ont gardé l'usage parce que
  // leurs homonymes de pâtisserie sont d'autres produits, qui ont reçu leurs
  // propres ids (`tomates-cerises-confites`, `fruits-secs-panaches`).
  //
  // Ce que le ticket demande est qu'il EXISTE des denrées qu'aucune recette
  // n'atteint, pas qu'elles soient six : le test suivant reste la vraie preuve.
  test("cinq denrées portent l'usage, et le reste n'en porte aucun", () => {
    const par = usages(catalogue);
    expect([...par.keys()].sort()).toEqual([
      "fruits-secs-melange",
      "graines-courge",
      "guacamole",
      "terrine-campagne",
      "tomates-sechees",
    ]);
    expect([...par.values()].every((u) => u === "apero")).toBe(true);
  });

  test("aucune recette du corpus ne cite une denrée d'apéro", () => {
    // C'EST LA PROMESSE ENTIÈRE DU TICKET. Ces six-là ne peuvent gagner aucun
    // point : rien ne les distribue comme carte, rien ne les score. Si elles
    // apparaissent un jour dans l'app, c'est que le plancher a marché tout seul,
    // sans passer par le plan de la semaine.
    const alias = (id: string): string => catalogue.rayons.aliases[id] ?? id;
    // Garde-fou : une liste vide ferait passer la boucle sans rien prouver, et
    // la liste vient de RÉTRÉCIR une fois. Si elle tombe à zéro, ce test doit
    // rougir plutôt que mentir.
    expect(usages(catalogue).size).toBeGreaterThan(0);
    for (const id of usages(catalogue).keys())
      expect(
        catalogue.plats.some((p) => p.ingredients.some((i) => alias(i.id) === id)),
      ).toBe(false);
  });

  test("une denrée d'apéro sous son plancher produit une ligne, et le dit", () => {
    const [ligne] = sousLeurPlancher(catalogue, placard(), [
      { ingredient: "graines-courge", niveau: 3 },
    ]);
    expect(ligne).toBeDefined();
    expect(ligne!.usage).toBe("apero");
    expect(ligne!.manque).toBe(2);
  });
});

/* ══════════ T41 — l'objet dicte le canal : aucun arbitrage à rendre ═══════ */

describe("T41 — aucun arbitrage cuisiner/acheter, l'objet dicte le canal", () => {
  test("une ligne de plancher ne porte aucun score, et n'a nulle part où en mettre", () => {
    // T41 SE VÉRIFIE PAR LA SIGNATURE, PAS PAR UNE MESURE. `sousLeurPlancher` ne
    // reçoit ni les plats ni les poids : il ne PEUT rien rendre au score, même
    // par accident, et c'est plus fort que de constater qu'il ne le fait pas
    // aujourd'hui. Épingler les clés de la ligne est ce qui fera échouer ce test
    // le jour où quelqu'un y ajoutera un `score` « juste pour essayer » —
    // c'est-à-dire le jour où l'arbitrage cuisiner/acheter reviendrait par la
    // fenêtre.
    const [ligne] = sousLeurPlancher(catalogue, placard(), [{ ingredient: "mais", niveau: 9 }]);
    expect(Object.keys(ligne!).sort()).toEqual([
      "a",
      "confiance",
      "ingredient",
      "manque",
      "niveau",
      "nom",
      "usage",
      "vuLe",
    ]);
  });

  test("les deux bolognaises sont deux objets, et deux canaux", () => {
    // La bolognaise n'a l'air ambiguë que parce que les deux existent, et le
    // catalogue les distingue DÉJÀ : `sauce-bolognaise` est une base cuisinée
    // qui vit au congélateur (donc au dépôt, donc `plancher.ts`), et
    // `sauce-bolognaise-bocal` est un bocal de 300 g acheté, qui vit au
    // garde-manger. Aucun arbitrage à rendre : ce sont deux ids.
    const bocal = placard().parIngredient.get("sauce-bolognaise-bocal");
    expect(bocal).toBeDefined();
    expect(comptable(bocal!.classe)).toBe(true);
    // Et la base cuisinée n'est pas au garde-manger du tout.
    expect(placard().parIngredient.has("sauce-bolognaise")).toBe(false);
  });

  test("les lignes sortent triées par ce qui manque le plus", () => {
    const lignes = sousLeurPlancher(catalogue, placard(), [
      { ingredient: "mais", niveau: 5 },
      { ingredient: "graines-courge", niveau: 4 },
    ] satisfies PlancherDenree[]);
    expect(lignes.map((l) => l.manque)).toEqual([3, 1]);
  });

  test("l'unité des lignes n'existe nulle part dans le corpus", () => {
    // La clé de course est `id|unité` : si le corpus employait ce mot, une
    // ligne de plancher et une demande de la semaine partageraient leur état
    // coché/rentré, et cocher l'une cocherait l'autre.
    const unites = new Set<string>();
    for (const p of catalogue.plats) {
      for (const i of p.ingredients) unites.add(i.unit);
      for (const i of p.sansReste?.ingredients ?? []) unites.add(i.unit);
    }
    expect(unites.has(UNITE_PLANCHER)).toBe(false);
  });
});

describe("dire les choses en français", () => {
  test("un id tireté se lit", () => {
    expect(nomDeLaDenree("sauce-bolognaise-bocal")).toBe("sauce bolognaise bocal");
  });
});
