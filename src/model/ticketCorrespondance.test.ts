// T138 — proposer un ingrédient pour un libellé de caisse, puis s'en souvenir.

import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { lireCatalogue } from "./catalogue";
import type { LigneLue } from "./ticket";
import { candidatsDu, cleDuLibelle, proposer, quantiteDe, suggerer, type Appris } from "./ticketCorrespondance";
import type { Catalogue } from "./types";

const catalogue: Catalogue = lireCatalogue(
  JSON.parse(readFileSync("public/cuisine-data.json", "utf8")) as unknown,
);
const candidats = candidatsDu(catalogue);
const ids = (libelle: string) => suggerer(libelle, candidats).map((c) => c.id);

const ligne = (libelle: string, autre: Partial<LigneLue> = {}): LigneLue => ({
  rang: 0, vendeur: "LES JARDINS DE ST FOY", libelle, quantite: 1, poidsKg: null, puKg: null,
  prix: 1, tare: 0, remise: 0, net: 1, plu: null, douteux: false, opaque: false, ...autre,
});

describe("suggerer — trois ingrédients pour un libellé du corpus", () => {
  test.each([
    ["POIREAU VRAC", "poireau"],
    ["CAROTTE DES SABLES", "carottes"],
    ["POTIMARRON", "potimarron"],
    ["CREME FRAICHE EPAISSE", "creme"],
    ["OIGNON FILET 1,5KG", "oignon"],
    ["PERSIL FRISE BOTTE", "persil"],
  ])("%s propose %s parmi les trois", (libelle, id) => {
    expect(ids(libelle)).toContain(id);
    expect(ids(libelle).length).toBeLessThanOrEqual(3);
  });

  test("un libellé qui ne ressemble à rien ne propose rien plutôt que n'importe quoi", () => {
    expect(ids("PAPIER TOILETTE X12")).toEqual([]);
  });
});

describe("la table apprise", () => {
  test("la clé est composite : même libellé, deux vendeurs, deux clés", () => {
    expect(cleDuLibelle("grand-frais", "CALSEC", "MELANGE VITALITE + 500")).not.toBe(
      cleDuLibelle("grand-frais", "LDGF", "MELANGE VITALITE + 500"),
    );
    expect(cleDuLibelle("carrefour", "Carrefour", " poireau vrac ")).toBe("carrefour|CARREFOUR|POIREAU VRAC");
  });

  test("la première fois on propose, la suivante on reconnaît — « pas pour la cuisine » compris", () => {
    const l = ligne("POIREAU VRAC", { vendeur: "Carrefour" });
    const p = proposer("carrefour", l, new Map(), candidats);
    expect(p).toMatchObject({ ingredient: undefined, reconnu: false });
    expect(p.suggestions.length).toBeGreaterThan(0);

    const appris = new Map<string, Appris>([
      [p.cle, { cle: p.cle, ingredient: "poireau", maj: 1 }],
    ]);
    expect(proposer("carrefour", l, appris, candidats)).toMatchObject({ ingredient: "poireau", reconnu: true });

    const pq = ligne("PAPIER TOILETTE X12", { vendeur: "Carrefour" });
    const cle = cleDuLibelle("carrefour", "Carrefour", pq.libelle);
    const appris2 = new Map<string, Appris>([[cle, { cle, ingredient: null, maj: 1 }]]);
    expect(proposer("carrefour", pq, appris2, candidats)).toMatchObject({ ingredient: null, reconnu: true });
  });
});

describe("quantiteDe", () => {
  test("une pesée rentre en grammes", () => {
    expect(quantiteDe(ligne("POTIMARRON", { poidsKg: 1.06 }), "potimarron", catalogue)).toEqual({
      unites: 1, parUnite: { amount: 1060, unit: "g" },
    });
  });
  test("un format écrit dans le libellé fait le poids de l'unité", () => {
    expect(quantiteDe(ligne("OIGNON FILET 1,5KG"), "oignon", catalogue)).toEqual({
      unites: 1, parUnite: { amount: 1500, unit: "g" },
    });
  });
  test("sinon le format du fond : 2 sachets de lentilles font 2 × 500 g", () => {
    expect(quantiteDe(ligne("LENTILLE CORAIL", { quantite: 2 }), "lentilles-corail", catalogue)).toEqual({
      unites: 2, parUnite: { amount: 500, unit: "g" },
    });
  });
  test("sans poids ni format, le nombre seul — non chiffré, pas inventé", () => {
    expect(quantiteDe(ligne("POIREAU VRAC"), "poireau", catalogue)).toEqual({ unites: 1, parUnite: null });
  });
});
