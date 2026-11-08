import { describe, expect, test } from "vitest";
import {
  CATEGORIES,
  NATURE_PROPOSEE,
  NOM_CATEGORIE,
  ajouterMois,
  calendrier,
  enSaisie,
  euros,
  lireMontant,
  moisType,
  precedente,
  prochaine,
  provisions,
  requis,
  versementsRestants,
  type Echeance,
  type Enveloppe,
} from "./budget";

const ech = (p: Partial<Echeance> & Pick<Echeance, "montant" | "tousLes" | "reference">): Echeance => ({
  id: p.nom ?? "e",
  nom: "e",
  categorie: "logement",
  nature: "obligatoire",
  ...p,
});

describe("les dates", () => {
  test("le 31 se borne au dernier du mois, et en revient", () => {
    expect(ajouterMois("2026-01-31", 1)).toBe("2026-02-28");
    expect(ajouterMois("2026-01-31", 2)).toBe("2026-03-31");
    expect(ajouterMois("2028-01-31", 1)).toBe("2028-02-29");
    expect(ajouterMois("2026-03-15", -3)).toBe("2025-12-15");
  });

  test("la prochaine occurrence se retrouve depuis n'importe quelle référence", () => {
    const eau = { reference: "2025-01-15", tousLes: 3 as const };
    expect(prochaine(eau, "2026-11-07")).toBe("2027-01-15");
    expect(precedente(eau, "2026-11-07")).toBe("2026-10-15");
    // Une référence dans le futur marche aussi.
    expect(prochaine({ reference: "2030-04-15", tousLes: 3 }, "2026-11-07")).toBe("2027-01-15");
  });

  test("due aujourd'hui, elle est encore due — pas déjà passée", () => {
    expect(prochaine({ reference: "2026-03-10", tousLes: 12 }, "2026-03-10")).toBe("2026-03-10");
    expect(prochaine({ reference: "2026-03-10", tousLes: 12 }, "2026-03-11")).toBe("2027-03-10");
  });

  test("une échéance au 31 ne s'érode pas en 28 au fil des occurrences", () => {
    const e = { reference: "2026-01-31", tousLes: 1 as const };
    expect(prochaine(e, "2026-03-01")).toBe("2026-03-31");
  });
});

describe("les provisions", () => {
  // L'eau : 180 € par trimestre, prélevée le 15 janvier, avril, juillet, octobre.
  const eau = ech({ nom: "Eau", montant: 18_000, tousLes: 3, reference: "2026-01-15" });

  test("ce qui devrait être de côté suit les jours écoulés depuis la précédente", () => {
    // Le lendemain du prélèvement, le compteur repart de presque rien. Le jour
    // même, il est plein : la facture est due, pas encore payée.
    expect(requis(eau, "2026-10-16")).toBe(196);
    expect(requis(eau, "2026-10-15")).toBe(18_000);
    expect(requis(eau, "2027-01-15")).toBe(18_000);
    // Mi-parcours : la moitié, à quelques centimes près (92 jours, 46 écoulés).
    expect(requis(eau, "2026-11-30")).toBe(9_000);
  });

  test("les virements restants s'arrêtent avant le mois de l'échéance", () => {
    expect(versementsRestants(eau, "2026-11-07")).toBe(2);
    expect(versementsRestants(eau, "2027-01-03")).toBe(1);
  });

  test("un compte pile à jour conseille le régime, à quelques euros près", () => {
    const impots = ech({ nom: "Taxe foncière", montant: 120_000, tousLes: 12, reference: "2026-10-15" });
    const jour = "2026-10-16";
    const p = provisions([eau, impots], requis(eau, jour) + requis(impots, jour), jour);
    expect(p.regime).toBe(6_000 + 10_000);
    expect(Math.abs(p.conseille - p.regime)).toBeLessThan(500);
    expect(p.ecart).toBe(0);
  });

  test("un compte vide fait rattraper, et c'est la plus lointaine qui constate le manque", () => {
    const assurance = ech({ nom: "Assurance auto", montant: 60_000, tousLes: 12, reference: "2027-03-01" });
    const p = provisions([assurance, eau], 10_000, "2026-11-07");
    // L'eau tombe en premier : c'est elle que le solde couvre d'abord.
    expect(p.lignes.map((l) => l.echeance.nom)).toEqual(["Eau", "Assurance auto"]);
    expect(p.lignes[0]!.couvert).toBe(requis(eau, "2026-11-07"));
    expect(p.lignes[1]!.etat).toBe("en-retard");
    expect(p.ecart).toBeLessThan(0);
    expect(p.conseille).toBeGreaterThan(p.regime);
  });

  test("l'avance sert d'abord ce qui tombe en premier, jusqu'au montant plein", () => {
    const p = provisions([eau], 50_000, "2026-11-07");
    expect(p.lignes[0]!.couvert).toBe(18_000);
    expect(p.lignes[0]!.etat).toBe("couverte");
    expect(p.conseille).toBe(0);
  });

  test("une charge mensuelle n'est pas une provision", () => {
    const pret = ech({ nom: "Prêt", montant: 95_000, tousLes: 1, reference: "2026-01-05" });
    expect(provisions([pret, eau], 0, "2026-11-07").lignes).toHaveLength(1);
  });
});

describe("le calendrier", () => {
  test("douze mois, et les gros mois se voient", () => {
    const eau = ech({ nom: "Eau", montant: 18_000, tousLes: 3, reference: "2026-01-15" });
    const auto = ech({ nom: "Auto", montant: 60_000, tousLes: 12, reference: "2026-01-20" });
    const c = calendrier([eau, auto], "2026-11-07");
    expect(c).toHaveLength(12);
    expect(c[0]!.mois).toBe("2026-11");
    const janvier = c.find((m) => m.mois === "2027-01")!;
    expect(janvier.total).toBe(78_000);
    expect(janvier.echeances.map((x) => x.echeance.nom)).toEqual(["Eau", "Auto"]);
    // L'eau tombe quatre fois sur douze mois : janvier, avril, juillet, octobre.
    expect(c.filter((m) => m.echeances.some((x) => x.echeance.nom === "Eau"))).toHaveLength(4);
  });
});

describe("le mois type", () => {
  test("revenus moins fixes, douzièmes et enveloppes : la capacité d'épargne", () => {
    const echeances = [
      ech({ nom: "Prêt", montant: 95_000, tousLes: 1, reference: "2026-01-05" }),
      ech({ nom: "Taxe foncière", montant: 120_000, tousLes: 12, reference: "2026-10-15", categorie: "impots" }),
    ];
    const enveloppes: Enveloppe[] = [
      { id: "c", nom: "Courses", montant: 60_000, categorie: "alimentation", nature: "essentiel" },
      { id: "s", nom: "Sorties", montant: 15_000, categorie: "loisirs", nature: "plaisir" },
    ];
    const m = moisType([{ id: "r", nom: "Salaires", montant: 400_000 }], echeances, enveloppes);
    expect(m.postes.obligatoire).toMatchObject({ fixes: 95_000, provisions: 10_000, total: 105_000 });
    expect(m.postes.essentiel.total).toBe(60_000);
    expect(m.postes.plaisir.total).toBe(15_000);
    expect(m.depenses).toBe(180_000);
    expect(m.capacite).toBe(220_000);
    expect(m.categories[0]).toEqual({ categorie: "logement", total: 95_000 });
  });
});

describe("les montants", () => {
  test("une saisie se lit en centimes, ou pas du tout", () => {
    expect(lireMontant("1 234,56")).toBe(123_456);
    expect(lireMontant("80 €")).toBe(8_000);
    expect(lireMontant("12.5")).toBe(1_250);
    expect(lireMontant("")).toBeNull();
    expect(lireMontant("douze")).toBeNull();
    expect(lireMontant("-5")).toBeNull();
  });

  test("un montant s'affiche en euros ronds quand il l'est", () => {
    expect(euros(123_400).replace(/\s/g, " ")).toBe("1 234 €");
    expect(euros(8_333.33)).toBe("83,33 €");
    expect(enSaisie(123_456)).toBe("1234,56");
    expect(enSaisie(8_000)).toBe("80");
  });
});

describe("les catégories", () => {
  test("une liste complète, sans doublon, avec Divers en dernier recours", () => {
    expect(new Set(CATEGORIES).size).toBe(CATEGORIES.length);
    expect([...CATEGORIES].sort()).toEqual(Object.keys(NOM_CATEGORIE).sort());
    expect(CATEGORIES.at(-1)).toBe("divers");
  });

  test("chaque catégorie propose une nature", () => {
    for (const c of CATEGORIES) expect(NATURE_PROPOSEE[c]).toBeDefined();
    expect(NATURE_PROPOSEE.garde).toBe("obligatoire");
    expect(NATURE_PROPOSEE.cadeaux).toBe("plaisir");
  });
});
