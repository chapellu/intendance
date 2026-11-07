// Le budget en base : ce qu'on saisit revient tel quel, et rien d'autre n'est
// écrit.

import { afterEach, beforeEach, describe, expect, test } from "vitest";
import type { Echeance } from "../model/budget";
import { lireBudget, poserEcheance, poserEnveloppe, poserRevenus, releverSolde, retirerEcheance } from "./budget";
import { Base } from "./schema";

let base: Base;
let n = 0;

beforeEach(async () => {
  base = new Base(`budget-${++n}`);
  await base.open();
});
afterEach(async () => {
  await base.delete();
});

const eau: Echeance = {
  id: "eau",
  nom: "Eau",
  montant: 18_000,
  tousLes: 3,
  reference: "2026-01-15",
  categorie: "logement",
  nature: "obligatoire",
};

describe("le budget en base", () => {
  test("une base neuve n'a rien, et le dit sans zéro inventé", async () => {
    expect(await lireBudget(base)).toEqual({ echeances: [], enveloppes: [], revenus: [], solde: null });
  });

  test("ce qu'on pose se relit, ce qu'on retire disparaît", async () => {
    await poserEcheance(eau, base);
    await poserEcheance({ ...eau, montant: 19_500 }, base);
    await poserEnveloppe({ id: "c", nom: "Courses", montant: 60_000, categorie: "alimentation", nature: "essentiel" }, base);
    await poserRevenus([{ id: "s", nom: "Salaires", montant: 400_000 }], base);
    await releverSolde({ montant: 120_000, jour: "2026-11-07" }, base);

    const b = await lireBudget(base);
    // Corriger une échéance la remplace, elle ne se duplique pas.
    expect(b.echeances).toEqual([{ ...eau, montant: 19_500 }]);
    expect(b.enveloppes).toHaveLength(1);
    expect(b.revenus[0]!.montant).toBe(400_000);
    expect(b.solde).toEqual({ montant: 120_000, jour: "2026-11-07" });

    await retirerEcheance("eau", base);
    await poserRevenus([], base);
    const apres = await lireBudget(base);
    expect(apres.echeances).toEqual([]);
    expect(apres.revenus).toEqual([]);
  });
});
