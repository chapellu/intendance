// Le budget en base : ce qu'on saisit revient tel quel, et rien d'autre n'est
// écrit.

import { afterEach, beforeEach, describe, expect, test } from "vitest";
import type { Echeance } from "../model/budget";
import { lireBudget, poserDepart, poserDetail, poserEcheance, poserEnveloppe, poserLieu, poserProjets, poserRevenus, releverCourant, releverSolde, retirerEcheance } from "./budget";
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

describe("le départ et le lieu des provisions", () => {
  test("le premier relevé pose le départ ; les suivants ne le bougent pas", async () => {
    await releverSolde({ montant: 0, jour: "2026-11-09" }, base);
    await releverSolde({ montant: 25_000, jour: "2026-12-09" }, base);
    expect((await lireBudget(base)).depart).toBe("2026-11-09");
    await poserDepart("2026-09-01", base);
    expect((await lireBudget(base)).depart).toBe("2026-09-01");
  });

  test("le lieu se choisit et se relit", async () => {
    await poserLieu("courant", base);
    expect((await lireBudget(base)).lieu).toBe("courant");
  });
});

describe("l'épargne en base", () => {
  test("les projets se relisent dans l'ordre : l'ordre est la priorité", async () => {
    const p = (id: string) => ({ id, nom: id, rythme: { sorte: "vite" as const, cible: 100_000 }, deja: 0 });
    await poserProjets([p("b"), p("a"), p("c")], base);
    expect((await lireBudget(base)).projets.map((x) => x.id)).toEqual(["b", "a", "c"]);
    await poserProjets([], base);
    expect((await lireBudget(base)).projets).toEqual([]);
  });

  test("le détail d'un projet s'écrit sur lui seul, et pas sur un projet disparu", async () => {
    const p = (id: string) => ({ id, nom: id, rythme: { sorte: "vite" as const, cible: 100_000 }, deja: 0 });
    await poserProjets([p("a"), p("b")], base);
    const detail = { postes: [{ id: "x", nom: "X", groupe: "", calcul: { sorte: "montant" as const, montant: 1 }, quand: null, certitude: "estime" as const }], financements: [] };
    await poserDetail("b", detail, base);
    await poserDetail("zz", detail, base);
    const lus = (await lireBudget(base)).projets;
    expect(lus.map((x) => [x.id, x.detail?.postes.length ?? 0])).toEqual([["a", 0], ["b", 1]]);
  });

  test("le compte courant se relève à part — sauf quand les provisions y dorment : c'est le même relevé", async () => {
    await releverCourant({ montant: 500_000, jour: "2026-11-09" }, null, base);
    let b = await lireBudget(base);
    expect([b.courant?.montant, b.solde, b.depart]).toEqual([500_000, null, null]);

    await releverCourant({ montant: 700_000, jour: "2026-11-09" }, "courant", base);
    b = await lireBudget(base);
    expect([b.courant?.montant, b.solde?.montant, b.depart]).toEqual([500_000, 700_000, "2026-11-09"]);
  });
});

describe("le budget en base", () => {
  test("une base neuve n'a rien, et le dit sans zéro inventé", async () => {
    expect(await lireBudget(base)).toEqual({ echeances: [], enveloppes: [], revenus: [], solde: null, depart: null, lieu: null, projets: [], courant: null });
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
