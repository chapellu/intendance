// T140 — la boîte entière : « je préfère utiliser la boîte entière plutôt que
// les trois quarts et gérer un petit reste ». Au rejeu, à la liste, au fond et
// sur la fiche, la même règle ; le sec, lui, se compte toujours à la quantité.

import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { quantiteDeLArticle } from "../ecrans/courses.vue";
import { quantitesDeLEtape } from "../ecrans/cuisiner.vue";
import { boitesAAcheter, calculer, quantiteACuire } from "./calcul";
import { lireCatalogue } from "./catalogue";
import { creerJeu } from "./jeu";
import { contexte, rejouer, type Evenement } from "./journal";
import { boitesDuCatalogue, boitesEntieres, PART_POUR_BOITE_ENTIERE, phraseBoites } from "./paquet";
import { minimumsDuFond, sousLeurPlancher } from "./plancherGardeManger";
import type { Catalogue, Ingredient, Plat } from "./types";

const brut: Catalogue = lireCatalogue(JSON.parse(readFileSync("public/cuisine-data.json", "utf8")));
const PARTS = brut.foyer.parts;

/** Un plat d'essai à une seule ligne, aux parts du foyer — pas un plat du livre. */
function platDEssai(id: string, ingredient: string, qty: number): Plat {
  const modele = brut.plats.find((p) => p.ingredients.length > 0)!;
  const ligne: Ingredient = {
    ...modele.ingredients[0]!,
    id: ingredient, ref: ingredient, nom: ingredient, qty, unit: "g", base: false, assaisonnement: false,
  };
  return {
    ...modele, id, titre: id, portions: PARTS, ingredients: [ligne],
    emits: [], avec: [], lotEntier: false, sansReste: null,
    steps: [{ ...modele.steps[0]!, uses: [ingredient] }],
  };
}

// Le relevé du 26/08 porte déjà quatre boîtes de maïs : on l'en retire, pour
// ne compter que ce que l'essai rentre.
const catalogue: Catalogue = {
  ...brut,
  gardeManger: {
    ...brut.gardeManger,
    denrees: brut.gardeManger.denrees.filter((d) => !["mais", "lentilles-corail"].includes(d.ingredient)),
  },
  plats: [
    ...brut.plats,
    platDEssai("essai-mais-200", "mais", 200),
    platDEssai("essai-mais-50", "mais", 50),
    platDEssai("essai-mais-400", "mais", 400),
    platDEssai("essai-lentilles-400", "lentilles-corail", 400),
  ],
};
const ctx = contexte(catalogue);

describe("boitesEntieres — l'arrondi", () => {
  test("200 g d'une boîte de 285 g : la boîte part entière", () => {
    expect(boitesEntieres(200, 285)).toEqual({ boites: 1, quantite: 285 });
  });
  test("50 g : un vrai usage partiel, rien n'est arrondi", () => {
    expect(boitesEntieres(50, 285)).toBeNull();
  });
  test("400 g : deux boîtes, pas une et 115 g de la seconde", () => {
    expect(boitesEntieres(400, 285)).toEqual({ boites: 2, quantite: 570 });
  });
  test("le seuil est d'un tiers de la dernière boîte, et il est inclus", () => {
    expect(PART_POUR_BOITE_ENTIERE).toBeCloseTo(1 / 3);
    expect(boitesEntieres(95, 285)).toEqual({ boites: 1, quantite: 285 });
    expect(boitesEntieres(94, 285)).toBeNull();
  });
  test("un besoin qui tombe juste n'a rien à arrondir", () => {
    expect(boitesEntieres(800, 400)).toBeNull();
  });
  test("« 1 boîte entière », « 2 bocaux entiers »", () => {
    expect(phraseBoites("boîte", 1)).toBe("1 boîte entière");
    expect(phraseBoites("bocal", 2)).toBe("2 bocaux entiers");
  });
});

describe("quels ingrédients — la famille de garde ET le poids du fond", () => {
  const boite = boitesDuCatalogue(catalogue);
  test("le maïs : conserve, boîte de 285 g", () => {
    expect(boite("mais")).toEqual({ contenu: { amount: 285, unit: "g" }, nom: "boîte" });
  });
  test("le sec se garde ouvert : les lentilles, le riz ne sont pas des boîtes", () => {
    expect(boite("lentilles-corail")).toBeNull();
    expect(boite("riz")).toBeNull();
  });
  test("le fromage râpé entamé se congèle : il reste à la quantité", () => {
    expect(boite("fromage-rape")).toBeNull();
  });
});

describe("le rejeu — ce que le placard garde après le plat", () => {
  const JOUR = "2026-10-19";
  const entree = (ingredient: string, unites: number): Evenement => ({
    sorte: "entree", jour: JOUR, saisi: JOUR, maj: 1,
    lignes: [{ ingredient, unites, parUnite: null, zone: null, etat: "sec" }],
  });
  const cuisine = (plat: string): Evenement => ({
    sorte: "cuisine", jour: JOUR, saisi: JOUR, maj: 2, repas: "diner", plat, parts: PARTS,
  });
  const lots = (evenements: Evenement[], id: string) =>
    rejouer(catalogue, evenements, ctx, JOUR).parIngredient.get(id)?.lots ?? [];
  // `unites` compte les boîtes encore scellées ; l'ouverte porte son `entame`.
  const scellees = (l: ReturnType<typeof lots>) => l.reduce((n, x) => n + x.unites, 0);
  const ouvert = (l: ReturnType<typeof lots>) => l.find((x) => x.entame != null)?.entame ?? null;

  test("200 g : une boîte partie, aucun reste ouvert", () => {
    const l = lots([entree("mais", 3), cuisine("essai-mais-200")], "mais");
    expect(ouvert(l)).toBeNull();
    expect(scellees(l)).toBe(2);
  });
  test("50 g : la boîte reste ouverte, 235 g dedans", () => {
    const l = lots([entree("mais", 3), cuisine("essai-mais-50")], "mais");
    expect(ouvert(l)).toBeCloseTo(235);
    expect(scellees(l)).toBe(2);
  });
  test("400 g : deux boîtes parties, aucun reste", () => {
    const l = lots([entree("mais", 3), cuisine("essai-mais-400")], "mais");
    expect(ouvert(l)).toBeNull();
    expect(scellees(l)).toBe(1);
  });
  test("le sec ne bouge pas : 400 g de lentilles laissent 100 g dans le sachet", () => {
    const l = lots([entree("lentilles-corail", 2), cuisine("essai-lentilles-400")], "lentilles-corail");
    expect(ouvert(l)).toBeCloseTo(100);
    expect(scellees(l)).toBe(1);
  });
  test("le fond se recharge en boîtes : la seule boîte partie, la liste en redemande une", () => {
    const rejeu = rejouer(catalogue, [entree("mais", 1), cuisine("essai-mais-200")], ctx, JOUR);
    const planchers = [...minimumsDuFond(catalogue)].map(([ingredient, niveau]) => ({ ingredient, niveau }));
    const l = sousLeurPlancher(catalogue, rejeu, planchers).find((x) => x.ingredient === "mais");
    expect(l).toMatchObject({ a: 0, manque: 1 });
  });
});

describe("la liste — deux plats, deux boîtes", () => {
  const LUNDI = new Date("2026-10-19T12:00:00");
  const semaine = (...plats: string[]) => {
    const jeu = creerJeu(catalogue, 7, LUNDI);
    jeu.gardeManger = jeu.gardeManger.filter((id) => id !== "mais" && id !== "lentilles-corail");
    const diners = jeu.creneaux.map((c, i) => (c.repas === "diner" ? i : -1)).filter((i) => i >= 0);
    plats.forEach((p, k) => (jeu.choix[diners[k]!] = p));
    jeu.parts = jeu.parts.map(() => PARTS);
    return calculer(jeu).panier;
  };

  test("deux plats à 200 g de maïs achètent deux boîtes de 285 g, pas 400 g", () => {
    const l = semaine("essai-mais-200", "essai-mais-200").get("mais|g")!;
    expect(l.qty).toBe(570);
    expect(boitesAAcheter(l)).toBe(2);
    expect(quantiteDeLArticle(l)).toBe("2 boîtes (570 g)");
  });
  test("un usage partiel ouvre quand même une boîte à acheter", () => {
    const l = semaine("essai-mais-50").get("mais|g")!;
    expect(l.qty).toBe(50);
    expect(quantiteDeLArticle(l)).toBe("1 boîte (50 g)");
  });
  test("le sec reste au poids", () => {
    const l = semaine("essai-lentilles-400").get("lentilles-corail|g")!;
    expect(l.qty).toBe(400);
    expect(boitesAAcheter(l)).toBeNull();
    expect(quantiteDeLArticle(l)).toBe("400 g");
  });
});

describe("la fiche le dit", () => {
  const plat = (id: string) => catalogue.plats.find((p) => p.id === id)!;
  test("« 1 boîte entière (285 g, la recette en demande 200 g) »", () => {
    const p = plat("essai-mais-200");
    expect(quantiteACuire(catalogue, p.ingredients[0]!, 1)).toBe("1 boîte entière (285 g, la recette en demande 200 g)");
    expect(quantitesDeLEtape(p, 0, 1, catalogue)![0]!.quantite).toBe("1 boîte entière (285 g, la recette en demande 200 g)");
  });
  test("un usage partiel garde le chiffre de la recette", () => {
    expect(quantiteACuire(catalogue, plat("essai-mais-50").ingredients[0]!, 1)).toBe("50 g");
    expect(quantiteACuire(catalogue, plat("essai-lentilles-400").ingredients[0]!, 1)).toBe("400 g");
  });
});
