import { describe, expect, test } from "vitest";
import { moisType } from "./budget";
import { composition, historique, moisDisponibles, moisReel, nomLisible, type Classement, type OperationEnBase } from "./reel";

const op = (jour: string, motif: string, montant: number, compte = "a"): OperationEnBase => ({
  cle: `${compte}|${jour}|${montant}|${motif}|0`, compte, jour, libelle: motif, detail: [], montant, motif,
});

const ops = [
  op("2026-09-01", "SALAIRE EXEMPLE", 300_000),
  op("2026-09-02", "BOULANGERIE TEST", -1_200),
  op("2026-09-06", "MAGASIN TEST", -5_000),
  op("2026-09-08", "MAGASIN TEST", 1_500), // un remboursement
  op("2026-09-10", "VERS EPARGNE", -50_000),
  op("2026-09-10", "VERS EPARGNE", 50_000, "b"),
  op("2026-09-12", "INCONNU", -999),
  op("2026-09-15", "VERSEMENT PLACEMENT", -20_000),
  op("2026-09-20", "VERSEMENT PLACEMENT", 5_000), // un retrait partiel
  op("2026-08-30", "BOULANGERIE TEST", -800),
];

const regles = new Map<string, Classement>([
  ["SALAIRE EXEMPLE", { sorte: "revenu" }],
  ["BOULANGERIE TEST", { sorte: "depense", categorie: "alimentation", nature: "essentiel" }],
  ["MAGASIN TEST", { sorte: "depense", categorie: "loisirs", nature: "plaisir" }],
  ["VERS EPARGNE", { sorte: "interne" }],
  ["VERSEMENT PLACEMENT", { sorte: "epargne" }],
]);

const type = moisType([], [], [{ id: "e", nom: "Courses", montant: 60_000, categorie: "alimentation", nature: "essentiel" }]);

describe("le mois réel", () => {
  test("les mois se listent du plus récent au plus ancien", () => {
    expect(moisDisponibles(ops)).toEqual(["2026-09", "2026-08"]);
  });

  test("revenus, dépenses, et les virements entre comptes à part", () => {
    const m = moisReel(ops, regles, "2026-09", type);
    expect(m.entrees).toBe(300_000);
    // Le remboursement vient en déduction de sa catégorie, pas en revenu.
    expect(m.sorties).toBe(1_200 + 5_000 - 1_500);
    expect(m.internes).toBe(100_000);
    // L'épargne n'est ni une dépense ni un virement interne : elle se compte à
    // part, retraits déduits.
    expect(m.epargne).toBe(15_000);
    expect(m.aClasser.map((o) => o.motif)).toEqual(["INCONNU"]);
    expect(m.montantAClasser).toBe(999);
  });

  test("le réel se lit en face du prévu, catégorie par catégorie", () => {
    const m = moisReel(ops, regles, "2026-09", type);
    expect(m.categories.find((c) => c.categorie === "alimentation")).toEqual({ categorie: "alimentation", reel: 1_200, prevu: 60_000 });
    expect(m.categories.find((c) => c.categorie === "loisirs")).toEqual({ categorie: "loisirs", reel: 3_500, prevu: 0 });
    expect(m.natures.find((n) => n.nature === "essentiel")).toEqual({ nature: "essentiel", reel: 1_200, prevu: 60_000 });
  });
});

describe("la composition d'un total", () => {
  test("une catégorie s'ouvre motif par motif, le plus gros d'abord, remboursements déduits", () => {
    const c = composition(ops, regles, "2026-09", { sorte: "depense", categorie: "loisirs" });
    expect(c.total).toBe(3_500);
    expect(c.groupes.map((g) => [g.motif, g.total, g.operations.length])).toEqual([["MAGASIN TEST", 3_500, 2]]);
  });

  test("les revenus, l'épargne, les virements internes et ce qui reste à classer s'ouvrent aussi", () => {
    expect(composition(ops, regles, "2026-09", { sorte: "revenu" }).total).toBe(300_000);
    expect(composition(ops, regles, "2026-09", { sorte: "epargne" }).total).toBe(15_000);
    expect(composition(ops, regles, "2026-09", { sorte: "interne" }).total).toBe(100_000);
    expect(composition(ops, regles, "2026-09", { sorte: "a-classer" }).groupes.map((g) => g.motif)).toEqual(["INCONNU"]);
  });

  test("le nom d'un motif garde sa casse et perd sa mécanique bancaire", () => {
    expect(nomLisible("CARTE 12/09 Boulangerie du Coin")).toBe("Boulangerie du Coin");
    expect(nomLisible("PRLV SEPA Fournisseur Énergie ABC1234567")).toBe("Fournisseur Énergie");
    expect(nomLisible("VIR INST")).toBe("VIR INST");
    expect(nomLisible("CARTE 04/09 MAGASIN TEST 12,50 EUR")).toBe("MAGASIN TEST");
  });
});

describe("mois par mois", () => {
  test("les derniers mois, du plus récent, et la capacité moyenne", () => {
    const h = historique(ops, regles, type);
    expect(h.mois.map((m) => m.mois)).toEqual(["2026-09", "2026-08"]);
    expect(h.mois[0]).toMatchObject({ entrees: 300_000, sorties: 4_700, epargne: 15_000, capacite: 295_300, aClasser: 1 });
    expect(h.mois[1]).toMatchObject({ entrees: 0, sorties: 800, capacite: -800 });
    expect(h.moyenne).toBe(Math.round((295_300 - 800) / 2));
  });
});
