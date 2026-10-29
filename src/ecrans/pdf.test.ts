// T160 — des morceaux posés par pdf.js au texte à colonnes que lit la facture.
//
// Les positions sont celles relevées sur la facture du 28/10/2026 (corps 8,
// articles tous les 29 pt, libellé replié à ±4,7 pt de la ligne de l'EAN).

import { describe, expect, test } from "vitest";
import { lireFactureDrive } from "../model/factureDrive";
import { texteDeLaPage, type MorceauPdf } from "./pdf";

const m = (str: string, x: number, y: number, taille = 8): MorceauPdf => ({ str, x, y, taille });

/** Une rangée d'article aux abscisses de la facture. */
const article = (ean: string, y: number, nums: string[]): MorceauPdf[] => {
  const xs = [320.8, 350.8, 378.4, 412.2, 452.2, 498.7, 545.2];
  const cols = nums.length === 6 ? [...xs.slice(0, 5), xs[6]!] : xs;
  return [m(ean, 22, y), m(" ", 79.8, y), ...nums.map((n, i) => m(n, cols[i]!, y))];
};

// Dans le désordre, comme pdf.js les rend.
const PAGE: MorceauPdf[] = [
  m("Date de livraison :", 24, 627.6),
  m("28/10/2026", 96, 627.6),
  m("Code EAN13", 34, 486.2),
  m("Libellé", 189.3, 486.2),
  m("Qté", 316.3, 490.9),
  m("Cdée", 313.2, 481.6),
  m("Livrée", 341.2, 486.2),
  m("EPICERIE", 24, 451.7),
  ...article("3560071463311", 421.7, ["1", "1", "5.5", "2.57", "2.71", "2.71"]),
  m("partenaires CARREFOUR BIO", 98, 417.1),
  m("Haricots lingots Blancs Engagé auprès des producteurs", 98, 426.4),
  ...article("3252971585858", 392.7, ["2", "2", "5.5", "3.19", "3.37", "1.69", "5.05"]),
  m("Pâtes Crozets ALPINA", 98, 392.7),
  m("RCS : CAEN 519514574 - Code TVA : FR17519514574", 23, 42.5, 6),
  m("La présente facture simplifiée sera payable à l'échéance figurant sur la facture.", 22.7, 105.4, 6),
  m("Montant Net payé (en euros)", 344, 300),
  m("7.76 €", 520, 300),
];

describe("texteDeLaPage", () => {
  const texte = texteDeLaPage(PAGE);
  const lignes = texte.split("\n");

  test("range de haut en bas, et garde le libellé replié autour de l'EAN dans un seul bloc", () => {
    const i = lignes.findIndex((l) => l.includes("Haricots lingots"));
    expect(lignes[i + 1]).toMatch(/^\s*3560071463311\s{2,}1\s+1\s+5\.5/);
    expect(lignes[i + 2]).toMatch(/partenaires CARREFOUR BIO/);
    // Une ligne vide sépare deux articles, pas deux rangées d'un même libellé.
    expect(lignes[i - 1]).toBe("");
    expect(lignes[i + 3]).toBe("");
  });

  test("le libellé sur la ligne de l'EAN reste entre l'EAN et les quantités", () => {
    expect(texte).toMatch(/3252971585858\s{2,}Pâtes Crozets ALPINA\s{2,}2\s+2\s+5\.5\s+3\.19\s+3\.37\s+1\.69\s+5\.05/);
  });

  test("le texte refait se lit comme la facture", () => {
    const lu = lireFactureDrive(texte);
    expect(lu.date).toBe("2026-10-28");
    expect(lu.lignes.map((l) => [l.ean, l.libelle, l.quantite, l.net])).toEqual([
      ["3560071463311", "Haricots lingots Blancs Engagé auprès des producteurs partenaires CARREFOUR BIO", 1, 2.71],
      ["3252971585858", "Pâtes Crozets ALPINA", 2, 5.05],
    ]);
    expect(lu.concorde).toBe(true);
  });

  test("une page sans texte rend une chaîne vide", () => {
    expect(texteDeLaPage([m(" ", 10, 10)])).toBe("");
  });
});
