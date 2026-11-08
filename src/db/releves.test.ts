// Les relevés en base : l'IBAN n'est jamais écrit, et réimporter ne double rien.

import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { lireReleve } from "../model/releveBancaire";
import { releve1 } from "../model/releveBancaire.exemples";
import { classer, importerReleve, lireReleves, oublierLesReleves } from "./releves";
import { Base } from "./schema";

let base: Base;
let n = 0;
beforeEach(async () => {
  base = new Base(`releves-${++n}`);
  await base.open();
});
afterEach(async () => {
  await base.delete();
});

const lu = () => {
  const l = lireReleve(releve1());
  if (!l.ok) throw new Error(l.raison);
  return l.releve;
};

describe("les relevés en base", () => {
  test("un relevé importé deux fois ne double aucune opération", async () => {
    const a = await importerReleve(lu(), base);
    expect(a).toMatchObject({ nouvelles: 6, deja: 0 });
    const b = await importerReleve(lu(), base);
    expect(b).toMatchObject({ nouvelles: 0, deja: 6 });
    expect(await base.operations.count()).toBe(6);
  });

  test("l'IBAN ne s'écrit nulle part — seulement une empreinte et quatre chiffres", async () => {
    const { compte } = await importerReleve(lu(), base);
    expect(compte.fin).toBe("8901");
    const tout = JSON.stringify(await Promise.all([base.comptes.toArray(), base.operations.toArray()]));
    expect(tout).not.toContain("FR76");
    expect(tout).not.toContain("30006000011234567890");
  });

  test("une règle se pose sur un motif, et tout s'oublie d'un geste", async () => {
    await importerReleve(lu(), base);
    await classer("BOULANGERIE TEST", { sorte: "depense", categorie: "alimentation", nature: "essentiel" }, base);
    expect((await lireReleves(base)).regles.get("BOULANGERIE TEST")).toMatchObject({ categorie: "alimentation" });
    await oublierLesReleves(base);
    const vide = await lireReleves(base);
    expect([vide.comptes.length, vide.operations.length, vide.regles.size]).toEqual([0, 0, 0]);
  });
});
