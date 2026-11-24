// T198 — une courgette de recette se pèse au sachet surgelé ; un poireau acheté
// à la pièce se recompte en pièces.
import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { lireCatalogue } from "./catalogue";
import { contexte, rejouer, type Evenement } from "./journal";
import { unitesReelles } from "./plancherGardeManger";
import type { Catalogue } from "./types";

const catalogue: Catalogue = lireCatalogue(JSON.parse(readFileSync("public/cuisine-data.json", "utf8")));
const ctx = contexte(catalogue);
const entree = (ingredient: string, unites: number, parUnite: { amount: number; unit: string }): Evenement => ({
  sorte: "entree", jour: "2026-11-02", saisi: "2026-11-02", maj: 1,
  lignes: [{ ingredient, unites, parUnite, zone: null, etat: "sec" }],
});
// L'omelette aux courgettes : 2 courgettes à la pièce, pour 4 parts.
const omelette: Evenement = { sorte: "cuisine", jour: "2026-11-03", saisi: "2026-11-03", maj: 2, repas: "diner", plat: "omelette-courgettes", parts: 4 };

describe("les pièces qui ont un poids", () => {
  test("deux courgettes prises au sachet surgelé de 1 kg en laissent 600 g", () => {
    const r = rejouer(catalogue, [entree("courgettes-surgelees", 1, { amount: 1000, unit: "g" }), omelette], ctx, "2026-11-04");
    const e = r.parIngredient.get("courgettes-surgelees")!;
    const g = e.lots.reduce((n, l) => n + l.unites * (l.parUnite?.amount ?? 0) + (l.entame ?? 0), 0);
    expect(g).toBe(600);
  });

  test("quatre poireaux à la pièce, une recette en prend deux (300 g) : il en reste deux", () => {
    const quiche: Evenement = { ...omelette, plat: "quiche-poireaux", parts: 6 };
    const p = catalogue.plats.find((x) => x.id === "quiche-poireaux")!;
    const ligne = p.ingredients.find((i) => i.id === "poireau")!;
    const r = rejouer(catalogue, [entree("poireau", 4, { amount: 1, unit: "pièce" }), quiche], ctx, "2026-11-04");
    const e = r.parIngredient.get("poireau")!;
    const pris = ligne.unit === "pièce" ? ligne.qty : ligne.qty / 150;
    expect(unitesReelles(e)).toBeCloseTo(4 - pris, 5);
  });
});
