import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { lireCatalogue } from "./catalogue";
import { horlogesDu } from "./depot";

describe("horlogesDu — le pain de mie ne périme pas le jour même", () => {
  const cat = lireCatalogue(JSON.parse(readFileSync("public/cuisine-data.json", "utf8")) as unknown);

  test("un producteur « 0 jour, congelable » ne fixe pas la fenêtre du frigo", () => {
    // T197 — pain-de-mie-son-avoine, le pain du matin, déclare 0 j (le foyer
    // le congèle tranché). T198 a écarté le pain de mie à la machine, qui
    // disait 5 j pour le même type : un second producteur est donc posé ici,
    // et le « 0 jour, congelable » ne doit pas raccourcir son avis.
    const pain = cat.plats.find((p) => p.emits.some((e) => e.type === "pain-de-mie-maison"))!;
    const autre = { ...pain, id: "pain-de-mie-garde-5-jours",
      emits: pain.emits.map((e) => ({ ...e, gardeFrigo: 5, congelo: true })) };
    const avecAutre = { ...cat, plats: [...cat.plats, autre] };
    expect(horlogesDu(avecAutre).parType.get("pain-de-mie-maison")).toBe(5);
  });

  test("seul, il dit « droit au congélateur »", () => {
    expect(horlogesDu(cat).parType.get("pain-de-mie-maison")).toBe(0);
  });
});
