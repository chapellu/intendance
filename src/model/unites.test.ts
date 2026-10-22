// T145 — une seule unité par denrée là où l'on additionne.

import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { lireCatalogue } from "./catalogue";
import { demandes } from "./journal";
import { enUniteDeCompte } from "./unites";
import type { Catalogue } from "./types";

const catalogue: Catalogue = lireCatalogue(JSON.parse(readFileSync("public/cuisine-data.json", "utf8")));

test("la pomme de terre à la pièce pèse 150 g ; le kilo se compte en grammes", () => {
  expect(enUniteDeCompte("pomme-de-terre", 4, "pièce")).toEqual({ qty: 600, unit: "g" });
  expect(enUniteDeCompte("pomme-de-terre", 1.2, "kg")).toEqual({ qty: 1200, unit: "g" });
  expect(enUniteDeCompte("oeufs", 3, "pièce")).toEqual({ qty: 3, unit: "pièce" });
});

test("une recette à la pièce et une au kilo retirent toutes deux des grammes du sac", () => {
  const pdt = (id: string) => {
    const p = catalogue.plats.find((x) => x.id === id)!;
    return demandes(p, 1).find((d) => (catalogue.rayons.aliases[d.ingredient] ?? d.ingredient) === "pomme-de-terre")!;
  };
  for (const id of ["omelette-du-potager", "hachis-parmentier-lentilles"]) {
    const d = pdt(id);
    expect(d).toMatchObject({ unite: "g", pieces: null });
    expect(d.grammes).toBeGreaterThan(100);
    expect(d.grammes).toBeLessThan(3000);
  }
});
