// Le journal : ce que chaque règle du contrat de #42 promet, épinglé.
//
// Les tests sont écrits par PROMESSE, pas par fonction : ce qu'on veut protéger
// n'est pas « `retirer` rend un objet », c'est « un lot non chiffré n'invente
// jamais un gramme ». Une refonte qui garde la promesse doit rester verte.

import { describe, expect, test } from "vitest";
import {
  classeDe, confiance, contexte, demandes, doute, ordreDeService, rejouer, retirer,
  SEUIL_RESTE, type Contexte, type Evenement, type LotPlacard,
} from "./journal";
import type { Catalogue, Denree, Plat } from "./types";

/* ────────────────────────────────────────────────────────────── les fixtures */

const denree = (p: Partial<Denree> & { ingredient: string }): Denree => ({
  zone: "placard-haut",
  unites: 1,
  parUnite: null,
  poidsG: null,
  etat: "sec",
  sensible: [],
  incompatibles: [],
  urgence: "basse",
  nature: "autre",
  conservations: [],
  note: null,
  ...p,
});

const lot = (p: Partial<LotPlacard> & { ingredient: string }): LotPlacard => ({
  zone: "placard-haut",
  unites: 1,
  parUnite: null,
  etat: "sec",
  entame: null,
  court: false,
  ...p,
});

const plat = (p: Partial<Plat> & { id: string }): Plat =>
  ({
    titre: p.id, portions: 4, minutes: 30, ingredients: [], accepts: [], emits: [],
    ...p,
  }) as Plat;

function catalogue(o: {
  denrees?: Denree[];
  plats?: Plat[];
  rayons?: Record<string, string[]>;
  placard?: string[];
  releve?: string | null;
}): Catalogue {
  return {
    plats: o.plats ?? [],
    rayons: {
      ordre: ["primeur", "boucherie", "poissonnerie", "crèmerie", "frais", "épicerie"],
      aliases: { oignons: "oignon" },
      rayons: o.rayons ?? { épicerie: ["mais", "pates", "farine", "thon-boite"], primeur: ["oignon"] },
      placard: o.placard ?? ["sel"],
    },
    gardeManger: {
      releve: o.releve === undefined ? "2026-08-26" : o.releve,
      zones: [
        { id: "placard-haut", label: "placard haut", espace: "placard" },
        { id: "tiroir-congelo", label: "tiroir", espace: "congelo" },
      ],
      denrees: o.denrees ?? [],
      alertes: [],
    },
  } as unknown as Catalogue;
}

const ctxDe = (c: Catalogue): Contexte => contexte(c);

/* ═══════════════════════════════════════════ T28 — les deux modes de décrément */

describe("T28 — deux modes, choisis par le lot", () => {
  test("un lot chiffré perd des grammes", () => {
    const lots = [lot({ ingredient: "farine", parUnite: { amount: 1000, unit: "g" }, etat: "entame", entame: 800 })];
    const r = retirer(lots, "farine", 300);
    expect(r.effet).toBe("grammes");
    expect(r.grammes).toBe(300);
    expect(lots[0]!.entame).toBe(500);
  });

  test("UN LOT NON CHIFFRÉ N'INVENTE AUCUN GRAMME : il avance son état", () => {
    const lots = [lot({ ingredient: "pates", etat: "sec", parUnite: null })];
    const r = retirer(lots, "pates", 250);
    expect(r.effet).toBe("etat");
    expect(r.grammes).toBeNull();
    // « la barrière est rompue, l'horloge tourne » — et `garde_manger.py` lit
    // déjà cet état pour faire monter l'urgence.
    expect(lots[0]!.etat).toBe("entame");
  });

  test("une ligne qui ne trouve rien est un no-op DIT, pas un silence", () => {
    const lots: LotPlacard[] = [];
    const r = retirer(lots, "curcuma", 5);
    expect(r.effet).toBe("aucun");
    expect(r.grammes).toBeNull();
  });

  test("jamais sous zéro", () => {
    const lots = [lot({ ingredient: "farine", parUnite: { amount: 100, unit: "g" }, etat: "entame", entame: 100 })];
    retirer(lots, "farine", 5000);
    expect(lots.every((l) => (l.entame ?? 0) >= 0 && l.unites >= 0)).toBe(true);
  });

  test("ordre de service : l'entamé avant le scellé — le distributeur avant la réserve", () => {
    const reserve = lot({ ingredient: "farine", parUnite: { amount: 4000, unit: "g" }, etat: "sec" });
    const distributeur = lot({ ingredient: "farine", parUnite: { amount: 1000, unit: "g" }, etat: "entame", entame: 900 });
    expect(ordreDeService([reserve, distributeur])[0]).toBe(distributeur);
  });

  test("le distributeur se vide avant qu'on entame la réserve", () => {
    const lots = [
      lot({ ingredient: "farine", parUnite: { amount: 4000, unit: "g" }, etat: "sec" }),
      lot({ ingredient: "farine", parUnite: { amount: 1000, unit: "g" }, etat: "entame", entame: 300 }),
    ];
    retirer(lots, "farine", 200);
    expect(lots.find((l) => l.etat === "entame")!.entame).toBe(100);
    expect(lots.find((l) => l.parUnite?.amount === 4000)!.unites).toBe(1);
  });
});

/* ══════════════════════════════════════════════ T29 — l'unité scellée */

describe("T29 — l'unité scellée part en entier", () => {
  test("ouvrir une conserve consomme l'unité : 4 boîtes de maïs deviennent 3", () => {
    const lots = [lot({ ingredient: "mais", unites: 4, parUnite: { amount: 285, unit: "g" }, etat: "conserve" })];
    const r = retirer(lots, "mais", 80);
    expect(r.effet).toBe("unite");
    expect(lots[0]!.unites).toBe(3);
  });

  test("un petit reste ne devient pas un lot : 85 g de maïs, non", () => {
    const lots = [lot({ ingredient: "mais", unites: 4, parUnite: { amount: 285, unit: "g" }, etat: "conserve" })];
    // 285 − 200 = 85, soit moins d'un tiers de 285.
    const r = retirer(lots, "mais", 200);
    expect(r.restePose).toBeNull();
    expect(lots).toHaveLength(1);
  });

  test("un gros reste devient un lot court : 600 g de crème sur 800, oui", () => {
    const lots = [lot({ ingredient: "creme", unites: 1, parUnite: { amount: 800, unit: "g" }, etat: "bocal" })];
    const r = retirer(lots, "creme", 200);
    expect(r.restePose).toBe(600);
    const court = lots.find((l) => l.court);
    expect(court).toBeDefined();
    // En frais court, donc urgent, donc le score ira chercher un plat qui le mange.
    expect(court!.etat).toBe("frais");
  });

  test("LE SEUIL EST UNE FRACTION, PAS UN PLANCHER ABSOLU", () => {
    // 100 g de crème et 100 g de concentré ne sont pas la même quantité de
    // cuisine : le même reste absolu tombe des deux côtés du seuil.
    const creme = [lot({ ingredient: "creme", unites: 1, parUnite: { amount: 800, unit: "g" }, etat: "bocal" })];
    retirer(creme, "creme", 700);
    expect(creme.some((l) => l.court)).toBe(false); // 100 g sur 800 : jeté

    const concentre = [lot({ ingredient: "concentre", unites: 1, parUnite: { amount: 140, unit: "g" }, etat: "conserve" })];
    retirer(concentre, "concentre", 40);
    expect(concentre.some((l) => l.court)).toBe(true); // 100 g sur 140 : gardé
    expect(SEUIL_RESTE).toBeCloseTo(1 / 3);
  });

  test("un paquet sec s'entame, il ne part pas en entier", () => {
    const lots = [lot({ ingredient: "lentilles-seches", unites: 1, parUnite: { amount: 500, unit: "g" }, etat: "sec" })];
    const r = retirer(lots, "lentilles-seches", 200);
    expect(r.effet).toBe("grammes");
    expect(lots[0]!.etat).toBe("entame");
    expect(lots[0]!.entame).toBe(300);
  });
});

/* ══════════════════════════════════════════ T30 — les classes et la confiance */

describe("T30 — la classe se dérive, elle ne se saisit pas", () => {
  const ctx = ctxDe(catalogue({}));

  test("ce qu'on a TOUJOURS l'emporte sur ce qu'on a EN CE MOMENT", () => {
    const c = ctxDe(catalogue({ placard: ["sel"], rayons: { épicerie: ["sel"] } }));
    expect(classeDe(c, "sel", [lot({ ingredient: "sel" })])).toBe("fond-de-placard");
  });

  test("aucun rayon → non suivi, et l'app ne prétend rien", () => {
    expect(classeDe(ctx, "curcuma", [lot({ ingredient: "curcuma" })])).toBe("non-suivi");
  });

  test("le congélateur l'emporte sur le rayon", () => {
    expect(classeDe(ctx, "pates", [lot({ ingredient: "pates", zone: "tiroir-congelo" })])).toBe("congelateur");
  });

  test("le primeur ne s'estime pas", () => {
    expect(classeDe(ctx, "oignon", [lot({ ingredient: "oignon" })])).toBe("fruits-legumes");
  });

  test("un reste de T29 bascule l'ingrédient en frais court", () => {
    expect(classeDe(ctx, "mais", [lot({ ingredient: "mais", court: true })])).toBe("frais-court");
  });

  test("l'épicerie est le cas par défaut d'un placard", () => {
    expect(classeDe(ctx, "mais", [lot({ ingredient: "mais", etat: "conserve" })])).toBe("epicerie");
  });
});

describe("T30 — l'asymétrie observation / décrément", () => {
  test("juste observé, on est sûr", () => {
    expect(confiance("epicerie", doute(0, 0, 0))).toBe("sur");
  });

  test("un décrément dépense la confiance", () => {
    expect(confiance("epicerie", doute(1, 0, 0))).toBe("probable");
  });

  test("le frais court ne se parie jamais longtemps", () => {
    expect(confiance("frais-court", doute(2, 0, 0))).toBe("inconnu");
  });

  test("les fruits & légumes ne s'estiment pas du tout", () => {
    expect(confiance("fruits-legumes", doute(1, 0, 0))).toBe("inconnu");
  });

  test("le fond de placard reste crédible quoi qu'il arrive", () => {
    expect(confiance("fond-de-placard", doute(50, 0, 400))).toBe("probable");
  });
});

/* ═════════════════════════════════════════════════════════ T31 — la dérive */

describe("T31 — la dérive élargit le doute, elle ne bouge pas le chiffre", () => {
  test("elle ne touche jamais le niveau, seulement le doute", () => {
    expect(doute(0, 0.5, 10)).toBe(5);
    // et le niveau, lui, n'a pas de terme de dérive : il n'y en a pas dans
    // `rejouer`, ce que le test suivant vérifie sur des données réelles.
  });

  test("DÉMARRAGE À FROID À ZÉRO : sans seconde observation, aucune dérive", () => {
    const c = catalogue({ denrees: [denree({ ingredient: "mais", unites: 4 })] });
    const r = rejouer(c, [], ctxDe(c), "2026-09-01");
    expect(r.parIngredient.get("mais")!.derive).toBe(0);
  });

  test("elle s'apprend entre deux observations, sur ce que les décréments n'expliquent pas", () => {
    const c = catalogue({ denrees: [denree({ ingredient: "mais", unites: 10, etat: "conserve" })] });
    const evts: Evenement[] = [
      // Dix jours plus tard il n'en reste que 6, sans aucune cuisson journalisée :
      // quatre unités que le journal ne voit pas, soit 0,4/jour.
      {
        sorte: "observation", portee: "ingredient", zone: null,
        jour: "2026-09-05", saisi: "2026-09-05", maj: 1,
        constats: [{ ingredient: "mais", unites: 6 }],
      },
    ];
    const r = rejouer(c, evts, ctxDe(c), "2026-09-05");
    const e = r.parIngredient.get("mais")!;
    expect(e.derive).toBeGreaterThan(0);
    // ET LE CHIFFRE EST CELUI QU'ON A VU, pas une extrapolation.
    expect(e.unites).toBe(6);
  });
});

/* ═════════════════════════════════════════════════ T25 / T26 — le rejeu */

describe("T25 — le niveau est un rejeu, jamais un stock", () => {
  test("journal vide → l'amorce du catalogue, datée du relevé", () => {
    const c = catalogue({ denrees: [denree({ ingredient: "mais", unites: 4, etat: "conserve" })] });
    const r = rejouer(c, [], ctxDe(c), "2026-08-26");
    const e = r.parIngredient.get("mais")!;
    expect(e.unites).toBe(4);
    expect(e.vuLe).toBe("2026-08-26");
    expect(e.confiance).toBe("sur");
  });

  test("SANS DATE DE RELEVÉ, RIEN N'EST SÛR — l'absence ne s'approxime pas", () => {
    const c = catalogue({ denrees: [denree({ ingredient: "mais", unites: 4 })], releve: null });
    const r = rejouer(c, [], ctxDe(c), "2026-08-26");
    expect(r.parIngredient.get("mais")!.confiance).toBe("inconnu");
  });

  test("une cuisson journalisée fait descendre le placard", () => {
    const c = catalogue({
      denrees: [denree({ ingredient: "lentilles-seches", unites: 1, parUnite: { amount: 500, unit: "g" } })],
      plats: [plat({
        id: "dahl", portions: 4,
        ingredients: [{ id: "lentilles-seches", nom: "lentilles", qty: 200, unit: "g", base: false, assaisonnement: false }],
      })],
      rayons: { épicerie: ["lentilles-seches"] },
    });
    const evts: Evenement[] = [
      { sorte: "cuisine", jour: "2026-08-28", saisi: "2026-08-28", repas: "diner", plat: "dahl", parts: 4, maj: 1 },
    ];
    const r = rejouer(c, evts, ctxDe(c), "2026-08-28");
    expect(r.parIngredient.get("lentilles-seches")!.grammes).toBe(300);
    // Cuisiner N'EST PAS observer : la confiance s'est dépensée.
    expect(r.parIngredient.get("lentilles-seches")!.confiance).toBe("probable");
  });

  test("l'ordre est celui des FAITS, pas celui des saisies", () => {
    const c = catalogue({ denrees: [denree({ ingredient: "mais", unites: 10, etat: "conserve" })] });
    // Saisi en dernier, mais daté d'avant : doit s'appliquer AVANT la cuisson.
    const evts: Evenement[] = [
      {
        sorte: "observation", portee: "ingredient", zone: null,
        jour: "2026-09-10", saisi: "2026-09-10", maj: 2,
        constats: [{ ingredient: "mais", unites: 2 }],
      },
      {
        sorte: "observation", portee: "ingredient", zone: null,
        jour: "2026-09-01", saisi: "2026-09-11", maj: 3,
        constats: [{ ingredient: "mais", unites: 7 }],
      },
    ];
    const r = rejouer(c, evts, ctxDe(c), "2026-09-11");
    // La dernière observation DANS LE TEMPS est celle du 10, qui dit 2.
    expect(r.parIngredient.get("mais")!.unites).toBe(2);
  });

  test("les assaisonnements ne comptent jamais", () => {
    const p = plat({
      id: "x",
      ingredients: [
        { id: "sel", nom: "sel", qty: 5, unit: "g", base: false, assaisonnement: true },
        { id: "mais", nom: "maïs", qty: 100, unit: "g", base: false, assaisonnement: false },
      ],
    });
    expect(demandes(p, 1).map((d) => d.ingredient)).toEqual(["mais"]);
  });

  test("les bases vont au dépôt, pas au placard", () => {
    const p = plat({
      id: "x",
      ingredients: [{ id: "lentilles-vertes-cuites", nom: "lentilles cuites", qty: 250, unit: "g", base: true, assaisonnement: false }],
    });
    expect(demandes(p, 1)).toHaveLength(0);
  });

  test("une unité qui n'est pas une masse ne se soustrait pas d'un poids", () => {
    const p = plat({
      id: "x",
      ingredients: [{ id: "ail", nom: "ail", qty: 2, unit: "gousse", base: false, assaisonnement: false }],
    });
    expect(demandes(p, 1)[0]!.grammes).toBeNull();
  });
});

/* ═════════════════════════════════════════════════════ T32 — le relevé */

describe("T32 — un relevé est exhaustif sur sa zone", () => {
  const c = catalogue({
    denrees: [
      denree({ ingredient: "mais", zone: "placard-haut", unites: 4, etat: "conserve" }),
      denree({ ingredient: "pates", zone: "placard-haut", unites: 3 }),
      denree({ ingredient: "thon-boite", zone: "tiroir-congelo", unites: 2, etat: "conserve" }),
    ],
  });

  test("CE QUI N'Y EST PAS N'Y EST PLUS : zéro, pas silence", () => {
    const evts: Evenement[] = [
      {
        sorte: "observation", portee: "zone", zone: "placard-haut",
        jour: "2026-09-01", saisi: "2026-09-01", maj: 1,
        constats: [{ ingredient: "mais", unites: 2 }],
      },
    ];
    const r = rejouer(c, evts, ctxDe(c), "2026-09-01");
    expect(r.parIngredient.get("mais")!.unites).toBe(2);
    // Les pâtes n'ont pas été mentionnées : elles ne sont plus là.
    expect(r.parIngredient.has("pates")).toBe(false);
  });

  test("il ne touche pas aux autres zones", () => {
    const evts: Evenement[] = [
      {
        sorte: "observation", portee: "zone", zone: "placard-haut",
        jour: "2026-09-01", saisi: "2026-09-01", maj: 1,
        constats: [],
      },
    ];
    const r = rejouer(c, evts, ctxDe(c), "2026-09-01");
    expect(r.parIngredient.get("thon-boite")!.unites).toBe(2);
  });

  test("UN QUART D'HEURE ACHÈTE DES SEMAINES DE SILENCE : il restaure toute la zone", () => {
    // `mais` n'est pas dans les constats mais reste dans la zone via `pates` :
    // ce qui compte est que les lignes SURVIVANTES de la zone soient rafraîchies.
    const evts: Evenement[] = [
      {
        sorte: "observation", portee: "zone", zone: "placard-haut",
        jour: "2026-09-20", saisi: "2026-09-20", maj: 1,
        constats: [{ ingredient: "mais", unites: 4 }, { ingredient: "pates", unites: 3 }],
      },
    ];
    const r = rejouer(c, evts, ctxDe(c), "2026-09-20");
    expect(r.parIngredient.get("pates")!.vuLe).toBe("2026-09-20");
    expect(r.parIngredient.get("pates")!.confiance).toBe("sur");
  });
});

/* ══════════════════════════════════════════════════════ T27 — les entrées */

describe("T27 — rentrer crée un lot, et le lot porte son poids", () => {
  test("le lot entre avec le poids de son canal", () => {
    const c = catalogue({ denrees: [] });
    const evts: Evenement[] = [
      {
        sorte: "entree", jour: "2026-09-01", saisi: "2026-09-01", maj: 1,
        lignes: [{ ingredient: "thon-boite", unites: 2, parUnite: { amount: 160, unit: "g" }, zone: "placard-haut", etat: "conserve" }],
      },
    ];
    const r = rejouer(c, evts, ctxDe(c), "2026-09-01");
    expect(r.parIngredient.get("thon-boite")!.grammes).toBe(320);
  });

  test("RENTRER N'EST PAS OBSERVER : la confiance ne se restaure pas", () => {
    // On sait ce qu'on vient de poser ; on ne sait pas mieux ce qu'il y avait
    // déjà. Le maïs du relevé garde son âge.
    const c = catalogue({ denrees: [denree({ ingredient: "mais", unites: 4, etat: "conserve" })] });
    const evts: Evenement[] = [
      {
        sorte: "entree", jour: "2026-10-01", saisi: "2026-10-01", maj: 1,
        lignes: [{ ingredient: "pates", unites: 1, parUnite: null, zone: "placard-haut", etat: "sec" }],
      },
    ];
    const r = rejouer(c, evts, ctxDe(c), "2026-10-01");
    expect(r.parIngredient.get("mais")!.vuLe).toBe("2026-08-26");
  });

  test("sans poids, pas de chiffre — et c'est une information", () => {
    const c = catalogue({ denrees: [] });
    const evts: Evenement[] = [
      {
        sorte: "entree", jour: "2026-09-01", saisi: "2026-09-01", maj: 1,
        lignes: [{ ingredient: "pates", unites: 1, parUnite: null, zone: "placard-haut", etat: "sec" }],
      },
    ];
    const r = rejouer(c, evts, ctxDe(c), "2026-09-01");
    expect(r.parIngredient.get("pates")!.grammes).toBeNull();
    expect(r.parIngredient.get("pates")!.unites).toBe(1);
  });
});

/* ═══════════════════════════════════════════════════════════ les alias */

describe("les alias se résolvent, sinon le rapprochement échoue en silence", () => {
  test("`oignons` et `oignon` sont le même stock", () => {
    const c = catalogue({ denrees: [denree({ ingredient: "oignons", unites: 3 })] });
    const r = rejouer(c, [], ctxDe(c), "2026-08-26");
    expect(r.parIngredient.has("oignon")).toBe(true);
    expect(r.parIngredient.has("oignons")).toBe(false);
  });
});
