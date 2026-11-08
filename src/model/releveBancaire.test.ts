// Le lecteur de relevés, sur des relevés FABRIQUÉS (voir
// `releveBancaire.exemples.ts` : aucun relevé réel n'entre dans ce dépôt).

import { describe, expect, test } from "vitest";
import { releve1, releve2 } from "./releveBancaire.exemples";
import { accentsIso646, gabaritDe, ibanValide, lireReleve, motif } from "./releveBancaire";

describe("gabarit « date de valeur en tête »", () => {
  test("se reconnaît à son en-tête, et se relit juste", () => {
    expect(gabaritDe(releve1())).toBe("valeur-en-tete");
    const l = lireReleve(releve1());
    if (!l.ok) throw new Error(l.raison);
    const r = l.releve;
    expect(r.debut).toBe("2026-08-31");
    expect(r.fin).toBe("2026-09-30");
    expect(r.soldeInitial).toBe(50_000);
    expect(r.soldeFinal).toBe(147_270);
    expect(r.iban).toBe("FR7630006000011234567890189");
    expect(r.operations.map((o) => [o.jour, o.montant])).toEqual([
      ["2026-09-01", 200_000],
      ["2026-09-02", -1_230],
      ["2026-09-03", -3_000],
      ["2026-09-05", -1_250],
      ["2026-09-06", 1_500],
      ["2026-09-10", -98_750],
    ]);
  });

  test("le libellé s'arrête avant le montant, et garde le prix qu'il cite", () => {
    const l = lireReleve(releve1());
    if (!l.ok) throw new Error(l.raison);
    expect(l.releve.operations[1]!.libelle).toBe("CARTE 01/09 BOULANGERIE TEST");
    expect(l.releve.operations[3]!.libelle).toBe("CARTE 04/09 MAGASIN TEST 12,50 EUR");
  });

  test("le détail garde ce qui parle, jamais la référence ni le pied de page", () => {
    const l = lireReleve(releve1());
    if (!l.ok) throw new Error(l.raison);
    expect(l.releve.operations[2]!.detail).toEqual(["Facture trimestre trois"]);
    expect(l.releve.operations.flatMap((o) => o.detail).join(" ")).not.toMatch(/Émis|REF\./);
  });

  test("un total qui ne tombe pas juste fait refuser le relevé", () => {
    const l = lireReleve(releve1("1 042,31"));
    expect(l.ok).toBe(false);
    if (!l.ok) expect(l.raison).toMatch(/débits/);
  });
});

describe("gabarit « date de valeur en colonne »", () => {
  test("se relit juste, avec des totaux qui cumulent l'ancien solde", () => {
    expect(gabaritDe(releve2())).toBe("valeur-en-colonne");
    const l = lireReleve(releve2());
    if (!l.ok) throw new Error(l.raison);
    const r = l.releve;
    expect([r.debut, r.fin, r.soldeInitial, r.soldeFinal]).toEqual(["2026-12-01", "2026-12-31", 100_000, 235_450]);
    expect(r.iban).toBe("GB82WEST12345698765432");
    expect(r.operations.map((o) => [o.jour, o.libelle, o.montant])).toEqual([
      ["2026-12-02", "VIR.PERMANENT LOYER EXEMPLE", -70_000],
      ["2026-12-15", "PRLV SEPA ASSURANCE TEST", -4_550],
      ["2026-12-28", "VIREMENT DE EXEMPLE", 210_000],
    ]);
    expect(r.operations[0]!.detail).toEqual(["pour le mois"]);
    // Les accents du vieux jeu français sont rendus à la lecture.
    expect(r.operations[1]!.detail).toEqual(["Prélèvement trimestriel"]);
  });

  test("un relevé arrêté en janvier range décembre dans l'année d'avant", () => {
    const l = lireReleve(releve2("05.01.2027", "01.12.2026"));
    if (!l.ok) throw new Error(l.raison);
    expect(l.releve.operations[0]!.jour).toBe("2026-12-02");
  });
});

describe("ce qui n'est pas un relevé", () => {
  test("un PDF inconnu est refusé en le disant", () => {
    const l = lireReleve("Facture n° 12\nTotal 30,00 €");
    expect(l).toEqual({ ok: false, raison: expect.stringMatching(/aucun relevé/) });
  });

  test("un IBAN se vérifie par sa clé", () => {
    expect(ibanValide("FR7630006000011234567890189")).toBe(true);
    expect(ibanValide("FR7630006000011234567890188")).toBe(false);
  });
});

describe("le motif d'un libellé", () => {
  test("la même dépense, deux jours différents, a le même motif", () => {
    expect(motif("CARTE 12/09 BOULANGERIE DU COIN 69")).toBe(motif("CARTE 03/10 BOULANGERIE DU COIN 69"));
    expect(motif("CARTE 12/09 BOULANGERIE DU COIN 69")).toBe("BOULANGERIE DU COIN");
    expect(motif("PRLV SEPA Assurance Exemple")).toBe("ASSURANCE EXEMPLE");
    expect(motif("VIR.PERMANENT LOYER EXEMPLE")).toBe("LOYER EXEMPLE");
    // Un montant cité en devise ne fait pas un autre motif que le remboursement.
    expect(motif("CARTE 04/09 MAGASIN TEST 12,50 EUR")).toBe(motif("CARTE 05/09 MAGASIN TEST"));
  });
});

describe("le vieux jeu français (ISO 646-FR)", () => {
  test("accolades, barre et antislash redeviennent des lettres accentuées", () => {
    expect(accentsIso646("Pr{l}vement")).toBe("Prélèvement");
    expect(accentsIso646("fa\\on o| tu veux")).toBe("façon où tu veux");
  });

  test("la casse suit les voisines", () => {
    expect(accentsIso646("PR{L}VEMENT")).toBe("PRÉLÈVEMENT");
  });

  test("l'arobase devient « à », sauf collée à deux lettres — une adresse", () => {
    expect(accentsIso646("remise @ domicile, voil@")).toBe("remise à domicile, voilà");
    expect(accentsIso646("contact@exemple.fr")).toBe("contact@exemple.fr");
  });
});
