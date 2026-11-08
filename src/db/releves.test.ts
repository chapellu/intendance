// Les relevés en base : l'IBAN n'est jamais écrit, et réimporter ne double rien.

import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { lireReleve } from "../model/releveBancaire";
import { releve1 } from "../model/releveBancaire.exemples";
import { classer, classerOperation, importerReleve, lireReleves, oublierLesReleves } from "./releves";
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

  test("une lecture améliorée remplace l'ancienne au lieu de la doubler, et la règle suit", async () => {
    await importerReleve(lu(), base);
    // L'opération telle qu'une lecture plus ancienne l'aurait gardée : un
    // accent du vieux jeu français resté en accolade, donc un autre libellé,
    // une autre clé, un autre motif — et une règle posée sur ce motif-là.
    const vraie = (await base.operations.toArray()).find((o) => o.libelle === "CARTE 01/09 BOULANGERIE TEST")!;
    await base.operations.delete(vraie.cle);
    const vieille = { ...vraie, libelle: "CARTE 01/09 BOULANGERI{ TEST", cle: vraie.cle.replace("BOULANGERIE", "BOULANGERI{"), motif: "BOULANGERI TEST" };
    await base.operations.put(vieille);
    await classer("BOULANGERI TEST", { sorte: "depense", categorie: "alimentation", nature: "essentiel" }, base);

    const r = await importerReleve(lu(), base);
    expect(r).toMatchObject({ nouvelles: 0, deja: 6 });
    expect(await base.operations.count()).toBe(6);
    expect(await base.operations.get(vieille.cle)).toBeUndefined();
    expect(await base.operations.get(vraie.cle)).toBeDefined();
    expect((await lireReleves(base)).regles.get("BOULANGERIE TEST")).toMatchObject({ categorie: "alimentation" });
  });

  test("le motif se recalcule à la lecture, et la règle de l'ancien motif suit", async () => {
    await importerReleve(lu(), base);
    // Une opération gardée avec le motif d'un ancien calcul, classée sous lui.
    const op = (await base.operations.toArray()).find((o) => o.libelle.includes("MAGASIN TEST 12,50 EUR"))!;
    await base.operations.put({ ...op, motif: "MAGASIN TEST EUR" });
    await classer("MAGASIN TEST EUR", { sorte: "depense", categorie: "loisirs", nature: "plaisir" }, base);

    const d = await lireReleves(base);
    const relue = d.operations.find((o) => o.cle === op.cle)!;
    expect(relue.motif).toBe("MAGASIN TEST");
    expect(d.regles.get("MAGASIN TEST")).toMatchObject({ categorie: "loisirs" });
  });

  test("une règle se pose sur un motif, et tout s'oublie d'un geste", async () => {
    await importerReleve(lu(), base);
    await classer("BOULANGERIE TEST", { sorte: "depense", categorie: "alimentation", nature: "essentiel" }, base);
    expect((await lireReleves(base)).regles.get("BOULANGERIE TEST")).toMatchObject({ categorie: "alimentation" });
    const une = (await base.operations.toArray())[0]!;
    await classerOperation(une.cle, { sorte: "interne" }, base);
    expect((await lireReleves(base)).exceptions.get(une.cle)).toEqual({ sorte: "interne" });
    await oublierLesReleves(base);
    const vide = await lireReleves(base);
    expect([vide.comptes.length, vide.operations.length, vide.regles.size, vide.exceptions.size]).toEqual([0, 0, 0, 0]);
  });
});
