// T134 — le fond se recharge : ce que l'année simulée n° 3 a mesuré, rejoué.
//
// Jour 0 : les 30 planchers du fond posés, le fond rentré par la liste (lignes
// `unité`, sans poids). Ensuite, 75 hachis de lentilles — et l'app disait
// « Rien à acheter » toute l'année, la liste du mercredi restant vide. Deux
// causes : le mode non chiffré de `retirer` ne faisait jamais partir une unité,
// et un ingrédient épuisé gardait sa clé dans `parIngredient`, donc restait
// « ici » par `Jeu.gardeManger`.

import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { ligneAchats } from "../ecrans/ceSoir.vue";
import { phraseDuPlancher } from "../ecrans/courses.vue";
import { lireCatalogue } from "./catalogue";
import { creerJeu } from "./jeu";
import { contexte, rejouer, retirer, type Evenement } from "./journal";
import { proposerCeSoir } from "./pause";
import { minimumsDuFond, sousLeurPlancher } from "./plancherGardeManger";
import { PASSE_VIDE } from "./questions";
import type { Savoir } from "./scoring";
import type { Catalogue } from "./types";

const catalogue: Catalogue = lireCatalogue(JSON.parse(readFileSync("public/cuisine-data.json", "utf8")));
const ctx = contexte(catalogue);
const planchers = [...minimumsDuFond(catalogue)].map(([ingredient, niveau]) => ({ ingredient, niveau }));
const LUNDI = new Date("2026-10-19T15:00:00");

const jourAvant = (n: number): string => {
  const d = new Date(LUNDI.getTime() - n * 86_400_000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** Le fond rentré par la liste : des lignes de plancher, comptées en unités, sans poids. */
const fondRentre: Evenement = {
  sorte: "entree",
  jour: jourAvant(30),
  saisi: jourAvant(30),
  maj: 1,
  lignes: catalogue.fond.denrees.map((d) => ({
    ingredient: d.ingredient, unites: d.minimum, parUnite: null, zone: null, etat: "sec" as const,
  })),
};

const cuisson = (plat: string, n: number): Evenement[] =>
  Array.from({ length: n }, (_, i) => ({
    sorte: "cuisine" as const, jour: jourAvant(29 - i), saisi: jourAvant(29 - i), maj: 2 + i,
    repas: "diner" as const, plat, parts: 4,
  }));

function apres(n: number) {
  const rejeu = rejouer(catalogue, [fondRentre, ...cuisson("hachis-parmentier-lentilles", n)], ctx, jourAvant(0));
  const jeu = creerJeu(catalogue, 7, LUNDI);
  jeu.stock = [];
  // L'intersection de #32, telle que `hydraterGardeManger` la fait.
  jeu.gardeManger = jeu.gardeManger.filter((id) => rejeu.parIngredient.has(id));
  const savoir: Savoir = { rejeu, passe: PASSE_VIDE, cuisinesRecemment: new Set(), planchers: [] };
  const p = proposerCeSoir({ jeu, savoir, recents: new Set(), maintenant: LUNDI, sortis: new Set() });
  const carte = [...p.cartes, ...p.plus].find((c) => c.plat.id === "hachis-parmentier-lentilles");
  return { rejeu, jeu, carte, liste: sousLeurPlancher(catalogue, rejeu, planchers) };
}

describe("T134 — cuisiner un plat du fond le consomme, et la liste le recharge", () => {
  test("le fond juste rentré : aucune ligne de plancher, et le hachis ne demande pas de lentilles", () => {
    const { liste, carte } = apres(0);
    expect(liste.map((l) => l.ingredient)).not.toContain("lentilles-seches");
    expect(carte?.manque.map((a) => a.id) ?? []).not.toContain("lentilles-seches");
  });

  test("quatre hachis (le sachet du relevé, puis un des deux du fond) : il en reste un, la liste dit « pour le fond »", () => {
    const { liste } = apres(4);
    const l = liste.find((x) => x.ingredient === "lentilles-seches");
    expect(l).toMatchObject({ a: 1, niveau: 2, manque: 1, fond: true });
    expect(phraseDuPlancher(l!, 0)).toContain("pour le fond");
  });

  test("huit hachis : les lentilles sont épuisées au rejeu, et « Ce soir » le dit", () => {
    const { rejeu, jeu, carte, liste } = apres(8);
    expect(rejeu.parIngredient.has("lentilles-seches")).toBe(false);
    expect(jeu.gardeManger).not.toContain("lentilles-seches");
    expect(liste.find((x) => x.ingredient === "lentilles-seches")).toMatchObject({ a: 0, manque: 2 });
    expect(carte).toBeDefined();
    expect(carte!.manque.map((a) => a.id)).toContain("lentilles-seches");
    expect(ligneAchats(carte!)).not.toBe("Rien à acheter");
  });

  test("une conserve sans poids se vide d'un coup ; un paquet sans poids sert deux fois", () => {
    const boite = [{ ingredient: "mais", zone: "z", unites: 2, parUnite: null, etat: "conserve" as const, entame: null, court: false }];
    expect(retirer(boite, "mais", 140).effet).toBe("unite");
    expect(boite[0]!.unites).toBe(1);
    const paquet = [{ ingredient: "pates", zone: "z", unites: 1, parUnite: null, etat: "sec" as const, entame: null, court: false }];
    expect(retirer(paquet, "pates", 250).effet).toBe("etat");
    expect(retirer(paquet, "pates", 250).effet).toBe("unite");
    expect(paquet).toEqual([]);
  });
});
