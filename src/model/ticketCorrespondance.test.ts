// T138 — proposer un ingrédient pour un libellé de caisse, puis s'en souvenir.

import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { lireCatalogue } from "./catalogue";
import { lireTicket, type LigneLue } from "./ticket";
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

describe("suggerer — des noms canoniques, rien qui ne s'achète pas", () => {
  test("le nom d'une puce nomme l'ingrédient, pas la consigne de la recette", () => {
    expect(candidats.find((c) => c.id === "poires")?.nom).toBe("poires");
    expect(candidats.every((c) => c.nom.length <= 24 && !/[,(]/.test(c.nom))).toBe(true);
  });
  test("ni épluchures, ni fanes, ni parures, ni restes, ni « cuit »", () => {
    const bannis = candidats.filter((c) => /(^|[\s-])(epluch\w*|fanes?|parures?|restes?|cuite?s?)([\s-]|$)/.test(`${c.id} ${c.nom.normalize("NFD").replace(/[\u0300-\u036f]/g, "")}`));
    expect(bannis).toEqual([]);
  });
  test("POIREAU n'appelle pas les poires ; CAROTTES n'appelle que les carottes", () => {
    expect(ids("POIREAU VRAC")).toEqual(["poireau"]);
    expect(ids("CAROTTES VRAC")[0]).toBe("carottes");
    expect(ids("CAROTTES VRAC")).not.toContain("petits-pois-carottes");
    expect(ids("CAROTTE DES SABLES")[0]).toBe("carottes"); // singulier → pluriel
  });
  test("un premier net est présélectionné, un doute ne l'est pas", () => {
    const l = (libelle: string) => proposer("grand-frais", ligne(libelle), new Map(), candidats).evidente?.id ?? null;
    expect(l("POIREAU VRAC")).toBe("poireau");
    expect(l("POTIMARRON")).toBe("potimarron");
    expect(l("YAOURT A BOIRE PANACHE")).toBeNull(); // trois yaourts se valent
  });
});

describe("quantiteDe — la pesée imprimée sous la ligne", () => {
  test("le poireau pesé rentre en grammes, pas en « 1 pièce »", () => {
    const lu = lireTicket("CARREFOUR\n4 POIREAU VRAC 4,66\n  0,932 kg x 5,00 EUR/kg\nTOTAL 4,66");
    expect(quantiteDe(lu.lignes[0]!, "poireau", catalogue)).toEqual({ unites: 1, parUnite: { amount: 932, unit: "g" } });
  });
});

test("une ligne vrac sans pesée ne prend pas le format du fond", () => {
  const sac = catalogue.fond.denrees.find((d) => d.ingredient === "pomme-de-terre");
  expect(sac?.unite).toMatch(/kg/);
  expect(quantiteDe(ligne("POMME DE TERRE VRAC"), "pomme-de-terre", catalogue)).toEqual({ unites: 1, parUnite: null });
  expect(quantiteDe(ligne("RAISIN SEC BIO KG"), "raisins-secs", catalogue).parUnite).toBeNull();
});
