import { describe, expect, test } from "vitest";
import type { DonneesBudget } from "../db/budget";
import { dans, dateCourte, MOT_ETAT, nomDuMois, vueDesProvisions, vueDuMois, vueDuReleve } from "./budget.vue";

const JOUR = "2026-11-07";
const vide: DonneesBudget = { echeances: [], enveloppes: [], revenus: [], solde: null, depart: null, lieu: null, projets: [], courant: null };
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
  test("sans relevé, l'écran dit que les provisions n'ont pas commencé", () => {
    const v = vueDesProvisions({ ...vide, echeances: [eau] }, JOUR);
    expect(v.phrase).toMatch(/n’ont pas commencé/);
    expect(v.plusLourd?.mois).toBe("2027-01");
  });

  test("un solde suffisant sur un livret donne un livret dans les temps", () => {
    const v = vueDesProvisions({ ...vide, echeances: [eau], solde: { montant: 18_000, jour: JOUR } }, JOUR);
    expect(v.phrase).toMatch(/^Le livret est dans les temps/);
  });
});

describe("où dorment les provisions", () => {
  const auto = { ...eau, id: "auto", nom: "Assurance auto", montant: 60_000, tousLes: 12 as const, reference: "2027-03-01" };

  test("sans relevé, rien n'est « à rattraper » : les provisions n'ont pas commencé", () => {
    const v = vueDesProvisions({ ...vide, echeances: [eau, auto] }, JOUR);
    expect(v.phrase).toMatch(/n’ont pas commencé/);
    expect(v.prov.lignes.some((l) => l.etat === "a-rattraper")).toBe(false);
  });

  test("sur le compte courant, l'app réserve et dit ce qui est vraiment disponible", () => {
    const d: DonneesBudget = { ...vide, echeances: [eau, auto], lieu: "courant", depart: "2026-10-01", solde: { montant: 300_000, jour: JOUR } };
    const v = vueDesProvisions(d, JOUR);
    expect(v.prov.requis).toBeGreaterThan(0);
    expect(v.disponible).toBe(300_000 - v.prov.requis);
    // Un compte de lendemain de paie ne rend pas les factures de l'année « prêtes ».
    expect(v.prov.lignes.some((l) => l.etat === "prete")).toBe(false);
    expect(v.phrase).toMatch(/vraiment disponibles/);
  });

  test("le même solde sur un livret, c'est de l'avance", () => {
    const d: DonneesBudget = { ...vide, echeances: [eau, auto], lieu: "livret", depart: "2026-10-01", solde: { montant: 300_000, jour: JOUR } };
    const v = vueDesProvisions(d, JOUR);
    expect(v.disponible).toBeNull();
    expect(v.prov.lignes.every((l) => l.etat === "prete")).toBe(true);
  });

  test("les mots parlent du livret, pas de la facture", () => {
    expect(Object.values(MOT_ETAT)).toEqual(["Prête", "Dans les temps", "À rattraper"]);
  });
});
