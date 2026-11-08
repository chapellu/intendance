import { describe, expect, test } from "vitest";
import { moisType } from "./budget";
import { apparier, classerTout, composition, historique, moisDisponibles, moisReel, nomLisible, type Classement, type OperationEnBase } from "./reel";

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

const cl = () => classerTout(ops, regles).classes;

const type = moisType([], [], [{ id: "e", nom: "Courses", montant: 60_000, categorie: "alimentation", nature: "essentiel" }]);

describe("le mois réel", () => {
  test("les mois se listent du plus récent au plus ancien", () => {
    expect(moisDisponibles(ops)).toEqual(["2026-09", "2026-08"]);
  });

  test("revenus, dépenses, et les virements entre comptes à part", () => {
    const m = moisReel(ops, cl(), "2026-09", type);
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
    const m = moisReel(ops, cl(), "2026-09", type);
    expect(m.categories.find((c) => c.categorie === "alimentation")).toEqual({ categorie: "alimentation", reel: 1_200, prevu: 60_000 });
    expect(m.categories.find((c) => c.categorie === "loisirs")).toEqual({ categorie: "loisirs", reel: 3_500, prevu: 0 });
    expect(m.natures.find((n) => n.nature === "essentiel")).toEqual({ nature: "essentiel", reel: 1_200, prevu: 60_000 });
  });
});

describe("la composition d'un total", () => {
  test("une catégorie s'ouvre motif par motif, le plus gros d'abord, remboursements déduits", () => {
    const c = composition(ops, cl(), "2026-09", { sorte: "depense", categorie: "loisirs" });
    expect(c.total).toBe(3_500);
    expect(c.groupes.map((g) => [g.motif, g.total, g.operations.length])).toEqual([["MAGASIN TEST", 3_500, 2]]);
  });

  test("les revenus, l'épargne, les virements internes et ce qui reste à classer s'ouvrent aussi", () => {
    expect(composition(ops, cl(), "2026-09", { sorte: "revenu" }).total).toBe(300_000);
    expect(composition(ops, cl(), "2026-09", { sorte: "epargne" }).total).toBe(15_000);
    expect(composition(ops, cl(), "2026-09", { sorte: "interne" }).total).toBe(100_000);
    expect(composition(ops, cl(), "2026-09", { sorte: "a-classer" }).groupes.map((g) => g.motif)).toEqual(["INCONNU"]);
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
    const h = historique(ops, cl(), type);
    expect(h.mois.map((m) => m.mois)).toEqual(["2026-09", "2026-08"]);
    expect(h.mois[0]).toMatchObject({ entrees: 300_000, sorties: 4_700, epargne: 15_000, capacite: 295_300, aClasser: 1 });
    expect(h.mois[1]).toMatchObject({ entrees: 0, sorties: 800, capacite: -800 });
    expect(h.moyenne).toBe(Math.round((295_300 - 800) / 2));
  });
});

describe("les virements entre ses comptes", () => {
  // Le cas qui a fait écrire `apparier` : le salaire arrive sur le compte A,
  // une part passe sur le compte B — et le crédit sur B porte le même nom
  // qu'un vrai virement reçu de l'extérieur sur A, classé « revenu ».
  const cas = [
    op("2026-10-01", "SALAIRE EXEMPLE", 300_000, "a"),
    { ...op("2026-10-02", "VIR M EXEMPLE", -150_000, "a"), libelle: "VIR INST VERS COMPTE B", motif: "VERS COMPTE B" },
    { ...op("2026-10-03", "VIR M EXEMPLE", 150_000, "b"), libelle: "VIR M EXEMPLE", motif: "M EXEMPLE" },
    { ...op("2026-10-10", "VIR M EXEMPLE", 20_000, "a"), libelle: "VIR M EXEMPLE", motif: "M EXEMPLE" },
    // Une carte du même montant que le virement, sur B : jamais appariée.
    { ...op("2026-10-03", "MAGASIN", -150_000, "b"), libelle: "CARTE 02/10 MAGASIN", motif: "MAGASIN" },
  ];
  const r = new Map<string, Classement>([
    ["SALAIRE EXEMPLE", { sorte: "revenu" }],
    ["M EXEMPLE", { sorte: "revenu" }],
  ]);

  test("les deux jambes s'apparient, la carte du même montant non", () => {
    const p = apparier(cas);
    expect(p.get(cas[1]!.cle)).toBe(cas[2]!.cle);
    expect(p.get(cas[2]!.cle)).toBe(cas[1]!.cle);
    expect(p.has(cas[4]!.cle)).toBe(false);
  });

  test("le virement reçu de soi-même n'est pas un revenu, malgré la règle de son nom", () => {
    const { classes, sources } = classerTout(cas, r);
    expect(classes.get(cas[2]!.cle)).toEqual({ sorte: "interne" });
    expect(sources.get(cas[2]!.cle)).toBe("paire");
    // Le vrai virement extérieur du même nom reste un revenu.
    expect(classes.get(cas[3]!.cle)).toEqual({ sorte: "revenu" });
    const m = moisReel(cas, classes, "2026-10", type);
    expect(m.entrees).toBe(300_000 + 20_000);
  });

  test("un versement vers un livret importé se compte une fois, en épargne, au départ", () => {
    const { classes } = classerTout(cas, new Map([...r, ["VERS COMPTE B", { sorte: "epargne" } as Classement]]));
    expect(classes.get(cas[1]!.cle)).toEqual({ sorte: "epargne" });
    expect(classes.get(cas[2]!.cle)).toEqual({ sorte: "interne" });
    expect(moisReel(cas, classes, "2026-10", type).epargne).toBe(150_000);
  });

  test("une exception l'emporte sur tout, et une règle « revenu » ne range jamais un débit", () => {
    const exceptions = new Map<string, Classement>([[cas[2]!.cle, { sorte: "revenu" }]]);
    expect(classerTout(cas, r, exceptions).classes.get(cas[2]!.cle)).toEqual({ sorte: "revenu" });
    const debitMemeNom = { ...cas[3]!, cle: "x", montant: -5_000, jour: "2026-10-20" };
    expect(classerTout([debitMemeNom], r).classes.has("x")).toBe(false);
  });
});
