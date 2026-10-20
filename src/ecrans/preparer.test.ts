// T138 — la photo réduite et contrastée avant l'OCR (la partie pure).

import { describe, expect, test } from "vitest";
import { COTE_LONG, dimensionsCible, griserEtContraster } from "./preparer";

describe("dimensionsCible", () => {
  test("12 MP debout tombent à 1 800 px de haut, proportions gardées", () => {
    expect(dimensionsCible(3000, 4000)).toEqual({ l: 1350, h: COTE_LONG });
    expect(dimensionsCible(4032, 3024)).toEqual({ l: 1800, h: 1350 });
  });
  test("une petite image n'est jamais agrandie", () => {
    expect(dimensionsCible(760, 400)).toEqual({ l: 760, h: 400 });
  });
});

describe("griserEtContraster", () => {
  test("un ticket gris sur crème devient noir sur blanc", () => {
    // 98 pixels de papier crème, 2 pixels d'encre grise de papier thermique.
    const px = new Uint8ClampedArray(100 * 4);
    for (let i = 0; i < 100; i += 1) px.set(i < 2 ? [110, 110, 110, 255] : [236, 230, 214, 255], i * 4);
    griserEtContraster(px);
    expect(px[0]).toBe(0);
    expect(px[4 * 50]).toBe(255);
    // Gris : les trois canaux égaux.
    expect(px[4 * 50 + 1]).toBe(px[4 * 50]);
  });
});
