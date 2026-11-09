import { describe, expect, test } from "vitest";
import { euros } from "../model/budget";
import type { Poste } from "../model/postes";
import { ditCalcul, sousLigne, vueDuProjet } from "./projet.vue";

const sol: Poste = { id: "s", nom: "Sol", groupe: "", calcul: { sorte: "quantite", quantite: 40, prix: 6_000 }, quand: "2027-01", certitude: "paye" };
const marge: Poste = { id: "m", nom: "Marge", groupe: "", calcul: { sorte: "part", taux: 750, de: "s" }, quand: null, certitude: "estime" };
const fixe: Poste = { id: "f", nom: "Fixe", groupe: "", calcul: { sorte: "montant", montant: 102_000 }, quand: null, certitude: "devis" };

describe("ce que dit un poste", () => {
  test("son calcul, à la française", () => {
    expect(ditCalcul(sol, [sol])).toBe(`40 × ${euros(6_000)}`);
    expect(ditCalcul(marge, [sol, marge])).toBe("7,5 % de « Sol »");
    expect(ditCalcul(marge, [marge])).toBe("7,5 % d’un poste retiré");
  });

  test("sa ligne : calcul, mois, certitude — sans morceau vide", () => {
    expect(sousLigne(sol, [sol])).toBe(`40 × ${euros(6_000)} · janvier 2027 · payé`);
    expect(sousLigne(fixe, [fixe])).toBe("sur devis");
  });
});

describe("ce que dit un projet détaillé", () => {
  test("la certitude du total fait 100", () => {
    // 240 000 payés, 102 000 sur devis, 18 000 estimés : 360 000.
    const v = vueDuProjet({ postes: [sol, marge, fixe], financements: [] });
    expect(v.certitude).toEqual({ paye: 67, devis: 28, estime: 5 });
    expect(v.phrase).toMatch(/tout par l’épargne/);
  });

  test("ce que d'autres financent se déduit, et la phrase le dit", () => {
    const v = vueDuProjet({ postes: [fixe], financements: [{ id: "p", nom: "Prêt", sorte: "pret", montant: 2_000 }] });
    expect(v.ch.aEpargner).toBe(100_000);
    expect(v.phrase).toContain(`${euros(100_000)} à réunir par l’épargne`);
  });

  test("sans poste, ni total ni certitude", () => {
    const v = vueDuProjet({ postes: [], financements: [] });
    expect(v.certitude).toBeNull();
    expect(v.phrase).toMatch(/^Un poste par dépense/);
  });
});
