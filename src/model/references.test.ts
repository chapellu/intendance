// Les références du magasin : la forme, et le refus d'un fichier qui ne l'a
// pas. Les produits ci-dessous sont inventés — les vrais ne sont pas dans git.

import { describe, expect, test } from "vitest";
import { ageDuReleve, lireReferences, phraseDeReference, referenceDe } from "./references";

const bon = {
  releve: "2026-11-09",
  magasin: "drive",
  articles: {
    "lentilles-corail": { statut: "ok", produit: "Lentilles corail", ean: "1234567890128", conditionnement: "500 g", prix: 2 },
    courgettes: { statut: "approx", produit: "Courgettes en rondelles surgelées", conditionnement: "1 kg", prix: 1.5, note: "pas de frais" },
    navets: { statut: "absent", note: "au marché" },
  },
};

describe("lireReferences", () => {
  test("un fichier bien formé se lit tel quel", () => {
    const r = lireReferences(bon);
    expect(r.magasin).toBe("drive");
    expect(referenceDe(r, "lentilles-corail")?.prix).toBe(2);
    expect(referenceDe(r, "navets")?.statut).toBe("absent");
    expect(referenceDe(r, "sel")).toBeNull();
  });

  test.each([
    ["pas d'objet", null],
    ["un jour illisible", { ...bon, releve: "09/11/2026" }],
    ["sans magasin", { ...bon, magasin: " " }],
    ["un statut inconnu", { ...bon, articles: { a: { statut: "peut-etre", produit: "x" } } }],
    ["un EAN illisible", { ...bon, articles: { a: { statut: "ok", produit: "x", ean: "12-34" } } }],
    ["un prix négatif", { ...bon, articles: { a: { statut: "ok", produit: "x", prix: -1 } } }],
    ["un « ok » sans produit", { ...bon, articles: { a: { statut: "ok" } } }],
  ])("refuse %s — le fichier entier", (_, brut) => {
    expect(() => lireReferences(brut)).toThrow(/références/);
  });
});

describe("ce que la ligne de courses en dit", () => {
  const r = lireReferences(bon);
  test("le produit, son format, son prix", () => {
    expect(phraseDeReference(referenceDe(r, "lentilles-corail"), r.magasin)).toBe("Lentilles corail · 500 g · 2,00 €");
  });
  test("un cousin se signale", () => {
    expect(phraseDeReference(referenceDe(r, "courgettes"), r.magasin)).toMatch(/^≈ Courgettes en rondelles/);
  });
  test("ce que le magasin n'a pas, et où le trouver", () => {
    expect(phraseDeReference(referenceDe(r, "navets"), r.magasin)).toBe("pas au drive — au marché");
  });
  test("rien quand l'ingrédient n'a pas de référence", () => {
    expect(phraseDeReference(null, r.magasin)).toBeNull();
  });
  test("l'âge du relevé se compte en jours", () => {
    expect(ageDuReleve(r, "2026-11-30")).toBe(21);
  });
});
