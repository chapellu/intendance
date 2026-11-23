import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { lireCatalogue } from "./catalogue";
import { horlogesDu } from "./depot";

describe("horlogesDu — le pain de mie ne périme pas le jour même", () => {
  test("un producteur « 0 jour, congelable » ne fixe pas la fenêtre du frigo", () => {
    const cat = lireCatalogue(JSON.parse(readFileSync("public/cuisine-data.json", "utf8")) as unknown);
    // T197 — pain-de-mie-son-avoine, le pain du matin, déclare 0 j (le foyer
    // le congèle tranché) ; le pain de mie à la machine dit 5 j : un « 0 jour,
    // congelable » ne raccourcit pas l'avis des autres sur le frigo.
    expect(horlogesDu(cat).parType.get("pain-de-mie-maison")).toBe(5);
  });
});
