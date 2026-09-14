// Ce que le vocabulaire sait NOMMER — indépendamment de ce qu'il sait cuisiner.
//
// Les autres tests du modèle partent d'un plat. Celui-ci part d'un TICKET DE
// CAISSE, parce que c'est par là que les choses entrent réellement dans la
// maison, et qu'un vocabulaire bâti uniquement en saisissant des recettes ne
// nomme que ce qui passe par une casserole.
//
// LE CORPUS EST UN TICKET RÉEL, PAS UNE LISTE INVENTÉE. Grand Frais
// Sainte-Foy-lès-Lyon, samedi 2026-09-12, 12 articles, 71,74 € — transcrit dans
// `chapellu/Workspace`, `docs/supply/tickets/2026-09-12-grand-frais-ste-foy.json`.
// Les libellés ci-dessous sont VERBATIM, troncature de 22 caractères comprise :
// c'est la seule chose que ce canal imprime, il n'y a aucun EAN dessus.

import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { lireCatalogue } from "./catalogue";
import { contexte } from "./journal";
import type { Catalogue } from "./types";

const catalogue: Catalogue = lireCatalogue(
  JSON.parse(readFileSync("public/cuisine-data.json", "utf8")) as unknown,
);
const ctx = contexte(catalogue);

/** Nommable = le mot existe dans le vocabulaire des courses. `rayonDe` ne
 *  regarde que `rayons.rayons` ; le placard est une liste à part, et un sel sans
 *  rayon est tout aussi nommé qu'une tomate. */
const nommable = (id: string): boolean => ctx.rayonDe(id) !== null || ctx.placard.has(id);

/** Résolution faite À LA MAIN, une fois, en lisant le papier. Ce n'est pas la
 *  table apprise de T64 — c'est le corpus CONTRE lequel elle sera écrite. */
const TICKET: ReadonlyArray<readonly [string, string]> = [
  ["MELON CHARENTAIS JAUNE", "melon"],
  ["TOMATE COTELEE JAUNE", "tomates"],
  ["OIGNON FILET 1,5KG", "oignon"],
  ["RAISIN ITALIA MINI COL", "raisins"],
  ["PRUNE MIRABELLE", "mirabelles"],
  ["FRAMBOISE FRANCE BQTE", "framboises"],
  ["PAVE DE CABILLAUD SANS", "cabillaud"],
  ["NECTAR DE MANGUE BTL V", "nectar-mangue"],
  ["PISTACHE GRILLEE SALEE", "pistaches"],
  ["VEAU:ROTI MILANAIS", "roti-veau"],
  ["SAUCISSON SEC PUR PORC", "saucisson-sec"],
];

/** La douzième ligne, laissée non résolue EXPRÈS — voir son test. */
const TRONQUE = "MELANGE VITALITE + 500";

describe("ce qu'un ticket de caisse trouve dans le vocabulaire", () => {
  test("UN TICKET RÉEL SE NOMME EN ENTIER, SINON CE N'EST PAS UN VOCABULAIRE DE COURSES", () => {
    // Mesuré avant d'ajouter quoi que ce soit : 7 de ces 11 lignes ne tombaient
    // sur AUCUN id — melon, raisin de table, mirabelle, framboise, nectar, veau,
    // saucisson. Toutes des choses qu'on ne cuisine pas. C'est ce trou-là que le
    // bloc du 2026-09-12 de `rayons.yaml` ferme.
    for (const [libelle, id] of TICKET)
      expect(nommable(id), `${libelle} → ${id}`).toBe(true);
  });

  test("le vocabulaire est celui des COURSES, donc il dépasse les recettes", () => {
    // Ces ids-là n'apparaissent dans aucun plat, et ce n'est pas un oubli à
    // réparer : c'est la raison d'être du bloc. Si l'un d'eux entrait un jour
    // dans une recette, ce test tomberait — et il faudrait le relire, pas le
    // supprimer.
    const cuisines = new Set(
      catalogue.plats.flatMap((p) => p.ingredients.map((i) => ctx.alias(i.id))),
    );
    const horsRecette = ["melon", "framboises", "raisins", "mirabelles", "nectar-mangue", "roti-veau", "saucisson-sec"];
    for (const id of horsRecette) {
      expect(nommable(id), id).toBe(true);
      expect(cuisines.has(id), `${id} est cuisiné`).toBe(false);
    }
  });

  test("UN LIBELLÉ TRONQUÉ NE SE RÉSOUT PAS ICI, ET LE PRÉTENDRE SERAIT UNE DÉCISION DÉGUISÉE EN SAISIE", () => {
    // « MELANGE VITALITE + 500 » est coupé à 22 caractères. Trois ids existants
    // sont plausibles, et ils ne désignent pas la même chose : deux portent
    // `usage: apero`, le troisième est une conserve. Le ticket ne tranche pas,
    // donc le corpus ne tranche pas non plus. C'est exactement le cas que T64
    // devra traiter — avec une question à l'utilisateur, pas avec une heuristique.
    const candidats = ["fruits-secs-melange", "fruits-secs-panaches", "cocktail-fruits"];
    for (const id of candidats) expect(nommable(id), id).toBe(true);
    expect(TRONQUE.length).toBe(22);
    expect(new Set(candidats).size).toBe(3);
  });

  test("un mot qui n'existe pas n'est pas nommable — sans quoi les tests ci-dessus sont vides", () => {
    expect(nommable("tarte-aux-licornes")).toBe(false);
    expect(ctx.rayonDe("tarte-aux-licornes")).toBe(null);
  });
});
