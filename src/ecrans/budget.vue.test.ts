import { describe, expect, test } from "vitest";
import type { DonneesBudget } from "../db/budget";
import { dans, dateCourte, nomDuMois, vueDesProvisions, vueDuMois, vueDuReleve } from "./budget.vue";

const JOUR = "2026-11-07";
const vide: DonneesBudget = { echeances: [], enveloppes: [], revenus: [], solde: null };
const eau = {
  id: "eau", nom: "Eau", montant: 18_000, tousLes: 3 as const, reference: "2027-01-15",
  categorie: "logement" as const, nature: "obligatoire" as const,
};

describe("les mots du budget", () => {
  test("les dates se disent courtes, l'année seulement quand elle change", () => {
    expect(dateCourte("2026-12-15", JOUR)).toBe("15 déc.");
    expect(dateCourte("2027-01-15", JOUR)).toBe("15 janv. 2027");
    expect(nomDuMois("2027-03", JOUR)).toBe("mars 2027");
  });

  test("au-delà de deux mois, on compte en mois", () => {
    expect(dans(0)).toBe("aujourd’hui");
    expect(dans(1)).toBe("demain");
    expect(dans(23)).toBe("dans 23 jours");
    expect(dans(150)).toBe("dans 5 mois");
  });

  test("un relevé de plus d'un mois est signalé", () => {
    expect(vueDuReleve(null, JOUR)).toEqual({ montant: 0, quand: null, perime: false });
    expect(vueDuReleve({ montant: 1, jour: JOUR }, JOUR).quand).toBe("relevé aujourd’hui");
    expect(vueDuReleve({ montant: 1, jour: "2026-09-01" }, JOUR).perime).toBe(true);
  });
});

describe("le mois", () => {
  test("rien de saisi : l'écran dit par où commencer, sans pourcentage inventé", () => {
    const v = vueDuMois(vide, JOUR);
    expect(v.vide).toBe(true);
    expect(v.pctCapacite).toBeNull();
    expect(v.parts.every((p) => p.pct === null)).toBe(true);
  });

  test("des provisions en retard mangent l'épargne du mois, et la phrase le dit", () => {
    const d: DonneesBudget = { ...vide, revenus: [{ id: "s", nom: "Salaire", montant: 300_000 }], echeances: [eau] };
    const v = vueDuMois(d, JOUR);
    expect(v.mois.capacite).toBe(300_000 - 6_000);
    expect(v.rattrapage).toBeGreaterThan(0);
    expect(v.ceMois).toBeLessThan(v.mois.capacite);
    expect(v.phrase).toContain("ce mois-ci");
    // Une seule nature écrite : elle fait toutes les dépenses.
    expect(v.parts.map((p) => p.pctDepenses)).toEqual([100, 0, 0]);
  });
});

describe("les provisions", () => {
  test("sans relevé, l'écran demande le solde et dit ce qu'il devrait être", () => {
    const v = vueDesProvisions({ ...vide, echeances: [eau] }, JOUR);
    expect(v.phrase).toMatch(/^Relève le solde/);
    expect(v.plusLourd?.mois).toBe("2027-01");
  });

  test("un solde suffisant donne un compte à jour", () => {
    const v = vueDesProvisions({ ...vide, echeances: [eau], solde: { montant: 18_000, jour: JOUR } }, JOUR);
    expect(v.phrase).toMatch(/^Le compte est à jour/);
  });
});
