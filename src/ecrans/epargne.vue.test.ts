import { describe, expect, test } from "vitest";
import type { DonneesBudget } from "../db/budget";
import { euros } from "../model/budget";
import { repartir } from "../model/epargne";
import type { Classement, OperationEnBase } from "../model/reel";
import { provisionsDe } from "./budget.vue";
import { capaciteDe, ditLigne, moisEtAnnee, phraseDuDormant, phraseDuFlux, vueDeLEpargne } from "./epargne.vue";

const JOUR = "2026-11-09";
const vide: DonneesBudget = { echeances: [], enveloppes: [], revenus: [], solde: null, depart: null, lieu: null, projets: [], courant: null };
const budget: DonneesBudget = {
  ...vide,
  revenus: [{ id: "r", nom: "Revenu A", montant: 300_000 }],
  enveloppes: [{ id: "e", nom: "Enveloppe A", montant: 100_000, categorie: "alimentation", nature: "essentiel" }],
  echeances: [
    { id: "f", nom: "Charge fixe", montant: 50_000, tousLes: 1, reference: "2026-11-05", categorie: "logement", nature: "obligatoire" },
  ],
};

let n = 0;
const op = (jour: string, montant: number, motif: string): OperationEnBase => ({
  cle: `c|${jour}|${montant}|${motif}|${++n}`,
  compte: "c",
  jour,
  libelle: motif,
  detail: [],
  montant,
  motif,
});
const regles = new Map<string, Classement>([
  ["REVENU TEST", { sorte: "revenu" }],
  ["MAGASIN TEST", { sorte: "depense", categorie: "alimentation", nature: "essentiel" }],
  ["LIVRET TEST", { sorte: "epargne" }],
]);
const deuxMois = [
  ...["2026-09", "2026-10"].flatMap((m) => [
    op(`${m}-01`, 300_000, "REVENU TEST"),
    op(`${m}-10`, -220_000, "MAGASIN TEST"),
    op(`${m}-15`, -30_000, "LIVRET TEST"),
  ]),
  // Le mois en cours, à moitié importé : il ne compte pas.
  op("2026-11-01", 300_000, "REVENU TEST"),
];

describe("la capacité d'épargne, écrite et mesurée", () => {
  test("sans relevés, on planifie sur le mois type", () => {
    const c = capaciteDe(budget, null, JOUR);
    expect(c).toEqual({ ecrite: 150_000, mesuree: null, surMois: 0, epargnee: null, retenue: 150_000 });
    expect(phraseDuFlux(c)).toMatch(/mois type/);
  });

  test("avec deux mois complets, on prend la plus prudente — et le mois en cours ne compte pas", () => {
    const c = capaciteDe(budget, { operations: deuxMois, regles, exceptions: new Map() }, JOUR);
    expect(c).toEqual({ ecrite: 150_000, mesuree: 80_000, surMois: 2, epargnee: 30_000, retenue: 80_000 });
    // Ce qui a été laissé sans être mis de côté est resté sur le compte.
    expect(phraseDuFlux(c)).toContain(`${euros(50_000)} sont restés sur le compte courant chaque mois`);
  });

  test("un seul mois ne fait pas une moyenne", () => {
    const c = capaciteDe(budget, { operations: deuxMois.slice(3), regles, exceptions: new Map() }, JOUR);
    expect(c.mesuree).toBeNull();
  });
});

describe("ce qui dort", () => {
  test("provisions ailleurs : le compte garde un mois de charges et d'enveloppes", () => {
    const v = vueDeLEpargne({ ...budget, courant: { montant: 1_000_000, jour: JOUR } }, null, JOUR);
    expect(v.dormant).toEqual({ solde: 1_000_000, reserve: 0, matelas: 150_000, aPlacer: 850_000 });
    expect(phraseDuDormant(v)).toContain(`${euros(850_000)} dorment sans travail`);
  });

  test("provisions sur le compte courant : son relevé est celui des provisions, et le réservé se garde aussi", () => {
    const eau = { id: "eau", nom: "Eau", montant: 18_000, tousLes: 3 as const, reference: "2027-01-15", categorie: "logement" as const, nature: "obligatoire" as const };
    const d: DonneesBudget = {
      ...budget,
      echeances: [...budget.echeances, eau],
      lieu: "courant",
      depart: "2026-10-01",
      solde: { montant: 1_000_000, jour: JOUR },
      // Un relevé à part, ignoré : le compte courant est celui des provisions.
      courant: { montant: 1, jour: JOUR },
    };
    const reserve = provisionsDe(d, JOUR).requis;
    expect(reserve).toBeGreaterThan(0);
    const v = vueDeLEpargne(d, null, JOUR);
    expect(v.dormant).toEqual({ solde: 1_000_000, reserve, matelas: 150_000, aPlacer: 1_000_000 - reserve - 150_000 });
  });

  test("sans relevé du compte, rien n'est inventé", () => {
    const v = vueDeLEpargne(budget, null, JOUR);
    expect(v.dormant).toBeNull();
    expect(phraseDuDormant(v)).toMatch(/^Relève le solde/);
  });

  test("la réserve de précaution conseillée : trois mois d'obligatoire et d'essentiel", () => {
    expect(vueDeLEpargne(budget, null, JOUR).precaution).toBe(3 * 150_000);
  });

  test("ce qui dort va aux projets", () => {
    const d: DonneesBudget = {
      ...budget,
      courant: { montant: 1_000_000, jour: JOUR },
      projets: [{ id: "a", nom: "Projet A", rythme: { sorte: "vite", cible: 450_000 }, deja: 0 }],
    };
    const v = vueDeLEpargne(d, null, JOUR);
    expect(v.rep.lignes[0]).toMatchObject({ uneFois: 450_000, etat: "atteint" });
    expect(v.rep.stockLibre).toBe(400_000);
    expect(v.rep.fluxLibre).toBe(150_000);
  });
});

describe("les mots d'un projet", () => {
  test("dans les temps, trop court, atteint", () => {
    const [tenu] = repartir([{ id: "b", nom: "B", rythme: { sorte: "date", cible: 1_200_000, pour: "2027-11" }, deja: 0 }], 0, 100_000, "2026-11").lignes;
    expect(ditLigne(tenu!)).toEqual({ etat: "Dans les temps", detail: `${euros(100_000)}/mois · réuni pour novembre 2027` });

    const [court] = repartir([{ id: "b", nom: "B", rythme: { sorte: "date", cible: 1_200_000, pour: "2027-11" }, deja: 0 }], 0, 50_000, "2026-11").lignes;
    expect(ditLigne(court!).etat).toBe("Trop court");
    expect(ditLigne(court!).detail).toContain(`il en faudrait ${euros(100_000)}`);
    expect(ditLigne(court!).detail).toContain(`${euros(600_000)} en novembre 2027`);

    const [plein] = repartir([{ id: "a", nom: "A", rythme: { sorte: "vite", cible: 100_000 }, deja: 0 }], 100_000, 0, "2026-11").lignes;
    expect(ditLigne(plein!)).toEqual({ etat: "Avec ce qui dort", detail: `+${euros(100_000)} maintenant, et la réserve est pleine` });
    const [deja] = repartir([{ id: "a", nom: "A", rythme: { sorte: "vite", cible: 100_000 }, deja: 100_000 }], 0, 0, "2026-11").lignes;
    expect(ditLigne(deja!)).toEqual({ etat: "Atteint", detail: "la réserve est pleine" });
  });

  test("les mois s'écrivent avec leur année", () => {
    expect(moisEtAnnee("2030-06")).toBe("juin 2030");
  });
});
