import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { lireCatalogue } from "./catalogue";
import { horlogesDu } from "./depot";

describe("horlogesDu — le pain de mie ne périme pas le jour même", () => {
  test("un producteur « 0 jour, congelable » ne fixe pas la fenêtre du frigo", () => {
    const cat = lireCatalogue(JSON.parse(readFileSync("public/cuisine-data.json", "utf8")) as unknown);
    // pain-maison-semi-complet déclare 0 j (droit au congélateur), les deux
    // pains de mie 4 et 5 j : c'est le plus court des deux AVIS SUR LE FRIGO.
    expect(horlogesDu(cat).parType.get("pain-de-mie-maison")).toBe(4);
  });
});
