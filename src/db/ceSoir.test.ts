// T134 — « Je lance ça » pose sur le dîner de ce soir lu à l'horloge du doigt,
// jamais sur la fenêtre que l'écran a gardée en cache.

import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { lireCatalogue } from "../model/catalogue";
import { creerJeu } from "../model/jeu";
import { soirDe } from "../model/pause";
import type { Catalogue } from "../model/types";
import { Base, cleCreneau } from "./schema";
import { cleDuCreneau, poserCeSoir } from "./semaine";

const catalogue: Catalogue = lireCatalogue(JSON.parse(readFileSync("public/cuisine-data.json", "utf8")) as unknown);
const LUNDI = new Date(2026, 9, 19, 15, 0, 0);
const JEUDI = new Date(2026, 9, 22, 15, 0, 0);

let base: Base;
let n = 0;
beforeEach(async () => {
  base = new Base(`ce-soir-${++n}`);
  await base.open();
});
afterEach(async () => {
  await base.delete();
});

describe("T134 — « Je lance ça » après trois jours sans geste, l'onglet resté ouvert", () => {
  test("la fenêtre en cache date de lundi ; le doigt, jeudi : le plat va sur jeudi soir", async () => {
    const enCache = creerJeu(catalogue, 7, LUNDI);
    // Ce que l'écran aurait visé : le dîner de lundi, sorti de la fenêtre de jeudi.
    expect(cleDuCreneau(enCache, soirDe(enCache))).toBe(cleCreneau("2026-10-19", "diner"));

    const c = await poserCeSoir(base, enCache.catalogue, "hachis-parmentier-lentilles", ["oignon"], JEUDI);
    expect(c).toEqual({ jour: "2026-10-22", repas: "diner" });

    const ecrit = await base.creneaux.get(cleCreneau("2026-10-22", "diner"));
    expect(ecrit).toMatchObject({ plat: "hachis-parmentier-lentilles", ici: ["oignon"] });
    expect(await base.creneaux.get(cleCreneau("2026-10-19", "diner"))).toBeUndefined();
  });
});

describe("T142 — « Je lance ça » nourrit aussi demain midi", () => {
  test("le dîner s'agrandit du midi, et demain midi part sur son reste", async () => {
    await poserCeSoir(base, catalogue, "dahl-lentilles-corail", [], LUNDI, 3);
    const diner = await base.creneaux.get(cleCreneau("2026-10-19", "diner"));
    expect(diner).toMatchObject({ plat: "dahl-lentilles-corail", parts: catalogue.foyer.parts + 3, midi: 3 });
    const midi = await base.creneaux.get(cleCreneau("2026-10-20", "dejeuner"));
    expect(midi).toMatchObject({ plat: "reste-de-la-veille", de: "dahl-lentilles-corail" });
  });

  test("relancer ce soir n'empile pas deux midis, et sans boîtes le dîner revient à sa taille", async () => {
    await poserCeSoir(base, catalogue, "dahl-lentilles-corail", [], LUNDI, 3);
    await poserCeSoir(base, catalogue, "soupe-pois-casses-carottes", [], LUNDI, 3);
    expect(await base.creneaux.get(cleCreneau("2026-10-19", "diner"))).toMatchObject({
      parts: catalogue.foyer.parts + 3,
      midi: 3,
    });
    expect(await base.creneaux.get(cleCreneau("2026-10-20", "dejeuner"))).toMatchObject({
      de: "soupe-pois-casses-carottes",
    });
    await poserCeSoir(base, catalogue, "dahl-lentilles-corail", [], LUNDI);
    const diner = await base.creneaux.get(cleCreneau("2026-10-19", "diner"));
    expect(diner?.parts ?? null).toBeNull();
    expect(diner?.midi).toBeUndefined();
  });

  test("un midi déjà posé à la main n'est pas écrasé", async () => {
    await base.creneaux.put({
      cle: cleCreneau("2026-10-20", "dejeuner"), jour: "2026-10-20", repas: "dejeuner",
      plat: "salade-lentilles-amelioree", parts: null, maj: 1,
    });
    await poserCeSoir(base, catalogue, "dahl-lentilles-corail", [], LUNDI, 3);
    expect((await base.creneaux.get(cleCreneau("2026-10-20", "dejeuner")))?.plat).toBe("salade-lentilles-amelioree");
    expect((await base.creneaux.get(cleCreneau("2026-10-19", "diner")))?.midi).toBeUndefined();
  });
});
