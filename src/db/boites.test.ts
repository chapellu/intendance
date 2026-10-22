// T144 — le midi mis de côté rend ses boîtes une fois mangé, et le « reste
// réchauffé » prend le bon lot.

import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { lireCatalogue } from "../model/catalogue";
import { platDuSoir, RESTE_DE_LA_VEILLE } from "../model/repas";
import type { Catalogue, Plat } from "../model/types";
import { journaliserCuisson } from "./journal";
import { consommerLesRoutines } from "./routines";
import { Base, type LotStock } from "./schema";

const catalogue: Catalogue = lireCatalogue(JSON.parse(readFileSync("public/cuisine-data.json", "utf8")) as unknown);
const plat = (id: string): Plat => catalogue.plats.find((p) => p.id === id)!;

let base: Base;
let n = 0;
beforeEach(async () => {
  base = new Base(`boites-${++n}`);
  await base.open();
});
afterEach(async () => {
  await base.delete();
});

describe("T144 — le lot du midi porte la date de son déjeuner", () => {
  test("le dîner agrandi marque son reste ; le midi passé, l'ouverture le retire", async () => {
    // Un dîner qui ne déclare aucun reste : le midi est le reste `midi: true`.
    const sec = catalogue.plats.find((p) => p.role === "plat" && p.creneaux.includes("diner") && p.emits.length === 0 && p.accepts.length === 0)!;
    await journaliserCuisson(base, {
      jour: "2026-10-25", repas: "diner", plat: platDuSoir(sec, 3), parts: catalogue.foyer.parts + 3, midi: 3, foyer: catalogue.foyer,
    });
    const midi = (await base.stock.toArray()).filter((l) => l.midiLe);
    expect(midi).toHaveLength(1);
    expect(midi[0]).toMatchObject({ midiLe: "2026-10-26", midi: 3, location: "frigo" });

    // Lundi 11 h : le déjeuner n'est pas passé, rien ne bouge.
    await consommerLesRoutines(base, catalogue, new Date(2026, 9, 26, 11, 0));
    expect((await base.stock.toArray()).some((l) => l.midiLe)).toBe(true);
    // Lundi 15 h : il est mangé.
    await consommerLesRoutines(base, catalogue, new Date(2026, 9, 26, 15, 0));
    expect((await base.stock.toArray()).some((l) => l.midiLe === "2026-10-26")).toBe(false);
  });

  test("T145 — le dahl agrandi de trois parts : son lot porte le midi entier", async () => {
    // Le dahl déclare un reste « 1-repas » que la table entame ; agrandi, il
    // restait « 1 repas » et un midi compté à une part.
    const dahl = plat("dahl-lentilles-corail");
    await journaliserCuisson(base, {
      jour: "2026-10-25", repas: "diner", plat: platDuSoir(dahl, 3), parts: catalogue.foyer.parts + 3, midi: 3, foyer: catalogue.foyer,
    });
    const midi = (await base.stock.toArray()).filter((l) => l.midiLe);
    expect(midi).toHaveLength(1);
    expect(midi[0]).toMatchObject({ band: "3-repas", midi: 3 });
  });

  test("le « reste réchauffé » prend le lot du midi, pas un sachet de banana bread", async () => {
    const lot = (o: Partial<LotStock>): LotStock =>
      ({ kind: "reste-plat", qty: null, unite: null, band: "3-repas", espace: "congelo", born: "2026-10-24", origine: null, maj: 1, ...o }) as LotStock;
    await base.stock.add(lot({ type: "banana-bread", location: "congelo" }));
    await base.stock.add(lot({ type: "dahl-lentilles-corail", espace: "frigo", location: "frigo", born: "2026-10-25", midiLe: "2026-10-26", midi: 3 }));
    await journaliserCuisson(base, { jour: "2026-10-26", repas: "dejeuner", plat: plat(RESTE_DE_LA_VEILLE), parts: 3 });
    expect((await base.stock.toArray()).map((l) => l.type)).toEqual(["banana-bread"]);
  });
});
