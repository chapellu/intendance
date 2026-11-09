import { describe, expect, test } from "vitest";
import { projetEffectif, type Projet } from "./epargne";
import { chiffrer, lireListe, montantDe, type Calcul, type Detail, type Poste } from "./postes";

const poste = (id: string, calcul: Calcul, p: Partial<Poste> = {}): Poste => ({
  id,
  nom: id,
  groupe: "",
  calcul,
  quand: null,
  certitude: "estime",
  ...p,
});

describe("le montant d'un poste", () => {
  const a = poste("a", { sorte: "quantite", quantite: 40, prix: 6_000 });
  const b = poste("b", { sorte: "part", taux: 1_000, de: "a" });
  const c = poste("c", { sorte: "part", taux: 5_000, de: "b" });

  test("un montant, une quantité par un prix, une part — et une part de part", () => {
    expect(montantDe(poste("x", { sorte: "montant", montant: 300_000 }), [])).toBe(300_000);
    expect(montantDe(a, [a, b, c])).toBe(240_000);
    expect(montantDe(b, [a, b, c])).toBe(24_000);
    expect(montantDe(c, [a, b, c])).toBe(12_000);
  });

  test("une quantité décimale s'arrondit au centime", () => {
    expect(montantDe(poste("x", { sorte: "quantite", quantite: 2.5, prix: 333 }), [])).toBe(833);
  });

  test("une boucle, ou la part d'un poste retiré, vaut zéro", () => {
    const x = poste("x", { sorte: "part", taux: 1_000, de: "y" });
    const y = poste("y", { sorte: "part", taux: 1_000, de: "x" });
    expect(montantDe(x, [x, y])).toBe(0);
    expect(montantDe(b, [b])).toBe(0);
  });
});

describe("le chiffrage d'un projet", () => {
  const detail: Detail = {
    postes: [
      poste("t", { sorte: "montant", montant: 100_000 }, { groupe: "Achat", quand: "2027-03", certitude: "devis" }),
      poste("f", { sorte: "part", taux: 800, de: "t" }, { groupe: "Achat", quand: "2027-03" }),
      poste("s", { sorte: "quantite", quantite: 40, prix: 6_000 }, { groupe: "Travaux", quand: "2027-01", certitude: "paye" }),
      poste("d", { sorte: "montant", montant: 52_000 }),
    ],
    financements: [{ id: "p", nom: "Prêt", sorte: "pret", montant: 300_000 }],
  };

  test("les groupes dans l'ordre d'apparition, le total, ce qu'il reste à épargner", () => {
    const ch = chiffrer(detail);
    expect(ch.groupes.map((g) => [g.nom, g.total])).toEqual([
      ["Achat", 108_000],
      ["Travaux", 240_000],
      ["Autres", 52_000],
    ]);
    expect([ch.total, ch.finance, ch.aEpargner, ch.excedent]).toEqual([400_000, 300_000, 100_000, 0]);
  });

  test("la certitude du total et le calendrier — sans date en dernier", () => {
    const ch = chiffrer(detail);
    expect(ch.parCertitude).toEqual({ paye: 240_000, devis: 100_000, estime: 60_000 });
    expect(ch.parMois).toEqual([
      { mois: "2027-01", total: 240_000 },
      { mois: "2027-03", total: 108_000 },
      { mois: null, total: 52_000 },
    ]);
  });

  test("un financement plus grand que le total : rien à épargner, l'excédent est dit", () => {
    const ch = chiffrer({ ...detail, financements: [{ id: "p", nom: "Prêt", sorte: "pret", montant: 450_000 }] });
    expect([ch.aEpargner, ch.excedent]).toEqual([0, 50_000]);
  });
});

describe("un projet détaillé dans l'épargne", () => {
  const base: Projet = { id: "a", nom: "A", rythme: { sorte: "date", cible: 999_00, pour: "2028-06" }, deja: 0 };

  test("sa cible est ce qu'il reste à épargner une fois les postes chiffrés", () => {
    const p = projetEffectif({
      ...base,
      detail: { postes: [poste("x", { sorte: "montant", montant: 500_000 })], financements: [{ id: "f", nom: "Don", sorte: "don", montant: 200_000 }] },
    });
    expect(p.rythme).toEqual({ sorte: "date", cible: 300_000, pour: "2028-06" });
  });

  test("sans poste, la cible saisie revient", () => {
    expect(projetEffectif({ ...base, detail: { postes: [], financements: [] } }).rythme).toEqual(base.rythme);
  });
});

describe("une liste collée", () => {
  test("groupe, nom, et les trois façons d'écrire une valeur", () => {
    const lu = lireListe(
      [
        "# un commentaire",
        "Travaux / Sol : 40 m² × 60",
        "",
        "Équipement / Électroménager : 3 000 €",
        "Imprévus : 10 % de sol",
        "Frais : 7,5 % d'Électroménager",
      ].join("\n"),
    );
    expect(lu.erreurs).toEqual([]);
    expect(lu.postes.map((p) => [p.groupe, p.nom, p.calcul])).toEqual([
      ["Travaux", "Sol", { sorte: "quantite", quantite: 40, prix: 6_000 }],
      ["Équipement", "Électroménager", { sorte: "montant", montant: 300_000 }],
      ["", "Imprévus", { sorte: "part", taux: 1_000, de: "p0" }],
      ["", "Frais", { sorte: "part", taux: 750, de: "p1" }],
    ]);
    expect(lu.postes.every((p) => p.certitude === "estime" && p.quand === null)).toBe(true);
  });

  test("une ligne incomprise est rendue avec sa raison, sans bloquer les autres", () => {
    const lu = lireListe("Sol : 40 × 60\nRien du tout\nPeinture : beaucoup\nMarge : 5 % de Toit");
    expect(lu.postes.map((p) => p.nom)).toEqual(["Sol"]);
    expect(lu.erreurs.map((e) => e.ligne)).toEqual([2, 3, 4]);
    expect(lu.erreurs[2]!.raison).toContain("« Toit »");
  });
});
