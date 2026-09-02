// L'événement cuisiné, côté base : les trois effets, ou aucun.
//
// Ce qui est vérifié ici ne l'est pas dans `model/journal.test.ts` : le modèle
// rejoue un journal qu'on lui donne, la base l'ÉCRIT et engage en même temps ce
// que la cuisson change au dépôt. C'est cette simultanéité qui est le ticket.

import "fake-indexeddb/auto";
import { beforeEach, describe, expect, test } from "vitest";
import { Base, type LotStock } from "./schema";
import { annulerCuisson, dejaCuisine, journaliserCuisson, journaliserEntree, lireJournal, poidsConnu, releverDepot } from "./journal";
import type { Catalogue, Plat } from "../model/types";

let base: Base;
let n = 0;

const plat = (p: Partial<Plat> & { id: string }): Plat =>
  ({ titre: p.id, portions: 4, minutes: 30, ingredients: [], accepts: [], emits: [], ...p }) as Plat;

const bolognaise = plat({
  id: "sauce-bolognaise",
  portions: 4,
  emits: [
    {
      type: "sauce-bolognaise", kind: "base", qty: { amount: 700, unit: "g" },
      band: "2-repas", espace: "congelo", congelo: true, gardeFrigo: 3,
    },
  ],
} as Partial<Plat> & { id: string });

const pates = plat({
  id: "pates-bolo",
  portions: 4,
  accepts: [{ type: "sauce-bolognaise", kind: null, qty: { amount: 300, unit: "g" } }],
} as Partial<Plat> & { id: string });

const lot = (o: Partial<LotStock> & { type: string }): LotStock =>
  ({
    kind: "base", qty: null, unite: null, band: "2-repas", espace: "congelo",
    born: "2026-08-01", origine: null, maj: 1, ...o,
  }) as LotStock;

beforeEach(async () => {
  n += 1;
  base = new Base(`test-journal-${n}`);
  await base.open();
});

describe("T26 — trois effets, une seule transaction", () => {
  test("EFFET 3 : cuisiner une bolognaise en PRODUIT une", async () => {
    await journaliserCuisson(base, {
      jour: "2026-09-01", repas: "diner", plat: bolognaise, parts: 4,
    });
    const stock = await base.stock.toArray();
    expect(stock).toHaveLength(1);
    expect(stock[0]!.type).toBe("sauce-bolognaise");
    expect(stock[0]!.qty).toBe(700);
    expect(stock[0]!.origine).toBe("sauce-bolognaise");
    // C'est CE test qui rend vraie la phrase qui a lancé la carte : « si je
    // déstocke la dernière bolognaise, il faut encourager d'en refaire ».
  });

  test("les parts mettent la production à l'échelle", async () => {
    await journaliserCuisson(base, {
      jour: "2026-09-01", repas: "diner", plat: bolognaise, parts: 2,
    });
    expect((await base.stock.toArray())[0]!.qty).toBe(350);
  });

  test("EFFET 2 : le bocal quitte VRAIMENT la base", async () => {
    await base.stock.add(lot({ type: "sauce-bolognaise", qty: 700, unite: "g" }));
    await journaliserCuisson(base, { jour: "2026-09-02", repas: "diner", plat: pates, parts: 4 });
    // 700 − 300 = 400 : le lot reste, entamé. C'est la différence entre une
    // prévision (qui recalculait 700 à chaque rendu) et un fait.
    expect((await base.stock.toArray())[0]!.qty).toBe(400);
  });

  test("un lot épuisé disparaît au lieu de tomber à zéro", async () => {
    await base.stock.add(lot({ type: "sauce-bolognaise", qty: 300, unite: "g" }));
    await journaliserCuisson(base, { jour: "2026-09-02", repas: "diner", plat: pates, parts: 4 });
    expect(await base.stock.count()).toBe(0);
  });

  test("UN SEUL BOCAL NE SERT PAS DEUX `accepts` — le bug de jeton reste mort", async () => {
    await base.stock.add(lot({ type: "sauce-bolognaise", qty: 700, unite: "g" }));
    const gourmand = plat({
      id: "gourmand", portions: 4,
      accepts: [
        { type: "sauce-bolognaise", kind: null, qty: { amount: 300, unit: "g" } },
        { type: "sauce-bolognaise", kind: null, qty: { amount: 300, unit: "g" } },
      ],
    } as Partial<Plat> & { id: string });
    await journaliserCuisson(base, { jour: "2026-09-02", repas: "diner", plat: gourmand, parts: 4 });
    // Le second `accepts` ne retrouve rien : un seul lot, déjà servi.
    expect((await base.stock.toArray())[0]!.qty).toBe(400);
  });

  test("EFFET 1 : l'événement porte deux dates et les parts figées", async () => {
    await journaliserCuisson(
      base,
      { jour: "2026-09-01", repas: "diner", plat: bolognaise, parts: 3 },
      new Date(2026, 8, 3),
    );
    const [e] = await lireJournal(base);
    expect(e!.sorte).toBe("cuisine");
    expect(e!.jour).toBe("2026-09-01");
    // Saisi deux jours plus tard : c'est `saisi` qui pourra dire « je n'ai rien
    // vu depuis », jamais `jour`.
    expect(e!.saisi).toBe("2026-09-03");
    expect(e!.sorte === "cuisine" && e!.parts).toBe(3);
  });
});

describe("marquer deux fois « fait » ne décrémente pas deux fois", () => {
  test("le créneau se sait cuisiné", async () => {
    expect(await dejaCuisine(base, "2026-09-01", "diner")).toBe(false);
    await journaliserCuisson(base, { jour: "2026-09-01", repas: "diner", plat: bolognaise, parts: 4 });
    expect(await dejaCuisine(base, "2026-09-01", "diner")).toBe(true);
    // Un autre repas du même jour reste libre.
    expect(await dejaCuisine(base, "2026-09-01", "midi")).toBe(false);
  });
});

describe("annuler un « fait » touché par erreur", () => {
  test("les lots produits repartent avec l'événement", async () => {
    const id = await journaliserCuisson(base, {
      jour: "2026-09-01", repas: "diner", plat: bolognaise, parts: 4,
    });
    expect(await base.stock.count()).toBe(1);
    await annulerCuisson(base, id);
    expect(await base.stock.count()).toBe(0);
    expect(await base.evenements.count()).toBe(0);
  });
});

describe("T32 — le relevé du dépôt referme le trou du hors-plan", () => {
  test("ce qui n'est pas gardé n'est plus là", async () => {
    const a = await base.stock.add(lot({ type: "ratatouille", espace: "congelo" }));
    const b = await base.stock.add(lot({ type: "fantome", espace: "congelo" }));
    await base.stock.add(lot({ type: "reste-frigo", espace: "frigo" }));
    await releverDepot(base, "congelo", [a as number]);
    const restants = (await base.stock.toArray()).map((l) => l.type).sort();
    // `fantome` est parti, `reste-frigo` n'a pas été touché : un relevé est
    // exhaustif SUR SA ZONE, et pas au-delà.
    expect(restants).toEqual(["ratatouille", "reste-frigo"]);
    void b;
  });
});

describe("T27 — le poids se dérive, il ne se saisit pas", () => {
  const catalogue = {
    gardeManger: {
      denrees: [{ ingredient: "thon-boite", parUnite: { amount: 140, unit: "g" } }],
    },
  } as unknown as Catalogue;

  test("le dernier poids rentré l'emporte sur celui du relevé", async () => {
    await journaliserEntree(base, [
      { ingredient: "thon-boite", unites: 1, parUnite: { amount: 160, unit: "g" }, zone: null, etat: "conserve" },
    ]);
    const evts = await lireJournal(base);
    expect(poidsConnu(catalogue, evts, "thon-boite")).toEqual({ amount: 160, unit: "g" });
  });

  test("sans entrée, le relevé fait foi", () => {
    expect(poidsConnu(catalogue, [], "thon-boite")).toEqual({ amount: 140, unit: "g" });
  });

  test("un id qu'on n'a jamais pesé ne rend rien — on n'invente pas", () => {
    expect(poidsConnu(catalogue, [], "pates")).toBeNull();
  });
});
