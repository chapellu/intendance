// T134 — le fond se recharge : ce que l'année simulée n° 3 a mesuré, rejoué.
//
// Jour 0 : les 30 planchers du fond posés, le fond rentré par la liste (lignes
// `unité`, sans poids). Ensuite, 75 hachis de lentilles — et l'app disait
// « Rien à acheter » toute l'année, la liste du mercredi restant vide. Deux
// causes : le mode non chiffré de `retirer` ne faisait jamais partir une unité,
// et un ingrédient épuisé gardait sa clé dans `parIngredient`, donc restait
// « ici » par `Jeu.gardeManger`.

import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { ligneAchats } from "../ecrans/ceSoir.vue";
import { phraseDuPlancher } from "../ecrans/courses.vue";
import { lireCatalogue } from "./catalogue";
import { creerJeu } from "./jeu";
import { contenuDUnite, contexte, rejouer, retirer, type Evenement } from "./journal";
import { proposerCeSoir } from "./pause";
import { minimumsDuFond, sousLeurPlancher } from "./plancherGardeManger";
import { PASSE_VIDE } from "./questions";
import type { Savoir } from "./scoring";
import type { Catalogue, Plat } from "./types";

const catalogue: Catalogue = lireCatalogue(JSON.parse(readFileSync("public/cuisine-data.json", "utf8")));
const ctx = contexte(catalogue);
const planchers = [...minimumsDuFond(catalogue)].map(([ingredient, niveau]) => ({ ingredient, niveau }));
const LUNDI = new Date("2026-10-19T15:00:00");

const jourAvant = (n: number): string => {
  const d = new Date(LUNDI.getTime() - n * 86_400_000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** Le fond rentré par la liste : des lignes de plancher, comptées en unités, sans poids. */
const fondRentre: Evenement = {
  sorte: "entree",
  jour: jourAvant(30),
  saisi: jourAvant(30),
  maj: 1,
  lignes: catalogue.fond.denrees.map((d) => ({
    ingredient: d.ingredient, unites: d.minimum, parUnite: null, zone: null, etat: "sec" as const,
  })),
};

const cuisson = (plat: string, n: number): Evenement[] =>
  Array.from({ length: n }, (_, i) => ({
    sorte: "cuisine" as const, jour: jourAvant(29 - i), saisi: jourAvant(29 - i), maj: 2 + i,
    repas: "diner" as const, plat, parts: 4,
  }));

function apres(n: number) {
  const rejeu = rejouer(catalogue, [fondRentre, ...cuisson("hachis-parmentier-lentilles", n)], ctx, jourAvant(0));
  const jeu = creerJeu(catalogue, 7, LUNDI);
  jeu.stock = [];
  // L'intersection de #32, telle que `hydraterGardeManger` la fait.
  jeu.gardeManger = jeu.gardeManger.filter((id) => rejeu.parIngredient.has(id));
  const savoir: Savoir = { rejeu, passe: PASSE_VIDE, cuisinesRecemment: new Set(), planchers: [] };
  const p = proposerCeSoir({ jeu, savoir, recents: new Set(), maintenant: LUNDI, sortis: new Set() });
  const carte = [...p.cartes, ...p.plus].find((c) => c.plat.id === "hachis-parmentier-lentilles");
  return { rejeu, jeu, carte, liste: sousLeurPlancher(catalogue, rejeu, planchers) };
}

describe("T134 — cuisiner un plat du fond le consomme, et la liste le recharge", () => {
  test("le fond juste rentré : aucune ligne de plancher, et le hachis ne demande pas de lentilles", () => {
    const { liste, carte } = apres(0);
    expect(liste.map((l) => l.ingredient)).not.toContain("lentilles-seches");
    expect(carte?.manque.map((a) => a.id) ?? []).not.toContain("lentilles-seches");
  });

  // T135 — 200 g par hachis (250 g pour 5 parts, cuisiné pour 4). T142 : le
  // fond rentre trois sachets de 500 g ; T143 : le relevé du 21/10 n'a plus de
  // lentilles vertes, c'est donc 1,5 kg en tout.
  test("deux hachis (400 g) : un sachet entamé et deux scellés, la liste ne demande rien", () => {
    const { liste } = apres(2);
    expect(liste.map((l) => l.ingredient)).not.toContain("lentilles-seches");
  });

  test("six hachis (1,2 kg) : il reste un sachet entamé, la liste dit « pour le fond »", () => {
    const { liste } = apres(6);
    const l = liste.find((x) => x.ingredient === "lentilles-seches");
    expect(l).toMatchObject({ a: 1, niveau: 3, manque: 2, fond: true });
    expect(phraseDuPlancher(l!, 0)).toContain("pour le fond");
  });

  test("dix hachis : les lentilles sont épuisées au rejeu, et « Ce soir » le dit", () => {
    const { rejeu, jeu, carte, liste } = apres(10);
    expect(rejeu.parIngredient.has("lentilles-seches")).toBe(false);
    expect(jeu.gardeManger).not.toContain("lentilles-seches");
    expect(liste.find((x) => x.ingredient === "lentilles-seches")).toMatchObject({ a: 0, manque: 3 });
    expect(carte).toBeDefined();
    expect(carte!.manque.map((a) => a.id)).toContain("lentilles-seches");
    expect(ligneAchats(carte!)).not.toBe("Rien à acheter");
  });

  test("une conserve sans poids se vide d'un coup ; un paquet sans poids sert deux fois", () => {
    const boite = [{ ingredient: "mais", zone: "z", unites: 2, parUnite: null, etat: "conserve" as const, entame: null, court: false }];
    expect(retirer(boite, "mais", 140).effet).toBe("unite");
    expect(boite[0]!.unites).toBe(1);
    const paquet = [{ ingredient: "pates", zone: "z", unites: 1, parUnite: null, etat: "sec" as const, entame: null, court: false }];
    expect(retirer(paquet, "pates", 250).effet).toBe("etat");
    expect(retirer(paquet, "pates", 250).effet).toBe("unite");
    expect(paquet).toEqual([]);
  });

  test("T136 — un frais constaté à l'unité s'entame, il ne part pas sous le premier plat", () => {
    const sac = [{ ingredient: "pomme-de-terre", zone: "z", unites: 1, parUnite: null, etat: "frais" as const, entame: null, court: false }];
    expect(retirer(sac, "pomme-de-terre", 3, "pièce").effet).toBe("etat");
    expect(sac[0]).toMatchObject({ unites: 1, etat: "entame" });
    expect(retirer(sac, "pomme-de-terre", 3, "pièce").effet).toBe("unite");
    expect(sac).toEqual([]);
    const trois = [{ ingredient: "courgettes", zone: "z", unites: 3, parUnite: null, etat: "frais" as const, entame: null, court: false }];
    expect(retirer(trois, "courgettes", 1, "pièce").effet).toBe("unite");
    expect(trois[0]!.unites).toBe(2);
  });
});

// T135 — l'année simulée n° 4 : 12 kg de lentilles corail au placard en fin
// d'année (un sachet « fini » en deux plats), et à l'inverse du fromage râpé,
// des yaourts, des œufs à zéro pendant que la fiche disait « rien à acheter ».
// Un paquet du fond rentré sans poids prend la taille que `fond.yaml` lui donne.
describe("T135 — le fond se consomme à la quantité, pas au paquet", () => {
  const platDe = (id: string, ingredient: string, qty: number, unit: string, portions = 4): Plat => ({
    ...catalogue.plats[0]!,
    id,
    portions,
    ingredients: [{ ...catalogue.plats[0]!.ingredients[0]!, id: ingredient, ref: ingredient, qty, unit, base: false, assaisonnement: false }],
  });

  /** Un paquet rentré sans poids, puis `n` cuissons ; le relevé de cet id est retiré. */
  const rejeuDe = (cat: Catalogue, ingredient: string, plat: Plat, n: number, parts: number) => {
    const c: Catalogue = {
      ...cat,
      plats: [...cat.plats, plat],
      gardeManger: { ...cat.gardeManger, denrees: cat.gardeManger.denrees.filter((d) => d.ingredient !== ingredient) },
    };
    const entree: Evenement = {
      // T137 : rentré il y a 12 jours — en deçà de la fenêtre des œufs (28 j)
      // et du râpé (21 j), que l'âge finirait sinon avant les cuissons.
      sorte: "entree", jour: jourAvant(12), saisi: jourAvant(12), maj: 1,
      lignes: [{ ingredient, unites: 1, parUnite: null, zone: "test", etat: "sec" }],
    };
    const cuissons: Evenement[] = Array.from({ length: n }, (_, i) => ({
      sorte: "cuisine" as const, jour: jourAvant(11 - i), saisi: jourAvant(11 - i), maj: 2 + i,
      repas: "diner" as const, plat: plat.id, parts,
    }));
    return { c, rejeu: rejouer(c, [entree, ...cuissons], contexte(c), jourAvant(0)) };
  };

  test("la taille d'une unité se lit dans les mots du fond", () => {
    expect(contenuDUnite("sachet de 500 g")).toEqual({ amount: 500, unit: "g" });
    expect(contenuDUnite("paquet de 1 kg")).toEqual({ amount: 1000, unit: "g" });
    expect(contenuDUnite("sachet de 500 g ou bocal")).toEqual({ amount: 500, unit: "g" });
    expect(contenuDUnite("boîte de 6")).toEqual({ amount: 6, unit: "pièce" });
    expect(contenuDUnite("sachet")).toBeNull();
    // T142 : le fromage s'achète en bloc de 400 g, le lait en briques d'un litre.
    expect(ctx.contenu("fromage-rape")).toEqual({ amount: 400, unit: "g" });
    expect(contenuDUnite("brique de 1 L")).toEqual({ amount: 1000, unit: "ml" });
    expect(ctx.contenu("oeufs")).toEqual({ amount: 6, unit: "pièce" });
  });

  test("un sac de 1 kg de lentilles corail tient quatre dahls de 200 g, et la liste ne le demande qu'au cinquième", () => {
    const dahl = platDe("dahl-test", "lentilles-corail", 200, "g");
    const cat: Catalogue = {
      ...catalogue,
      fond: {
        ...catalogue.fond,
        denrees: catalogue.fond.denrees.map((d) =>
          d.ingredient === "lentilles-corail" ? { ...d, minimum: 1, unite: "sac de 1 kg" } : d),
      },
    };
    const plancher = [{ ingredient: "lentilles-corail", niveau: 1 }];
    for (const n of [1, 2, 3, 4]) {
      const { c, rejeu } = rejeuDe(cat, "lentilles-corail", dahl, n, 4);
      expect(rejeu.parIngredient.get("lentilles-corail")?.grammes).toBeCloseTo(1000 - 200 * n);
      expect(sousLeurPlancher(c, rejeu, plancher).map((l) => l.ingredient)).not.toContain("lentilles-corail");
    }
    const { c, rejeu } = rejeuDe(cat, "lentilles-corail", dahl, 5, 4);
    expect(rejeu.parIngredient.has("lentilles-corail")).toBe(false);
    expect(sousLeurPlancher(c, rejeu, plancher).find((l) => l.ingredient === "lentilles-corail"))
      .toMatchObject({ a: 0, manque: 1 });
  });

  test("une boîte de 6 œufs : deux quiches à 3 œufs la vident, pas une de plus", () => {
    const quiche = platDe("quiche-test", "oeufs", 3, "pièce");
    expect(rejeuDe(catalogue, "oeufs", quiche, 1, 4).rejeu.parIngredient.get("oeufs")?.lots[0]?.entame).toBe(3);
    expect(rejeuDe(catalogue, "oeufs", quiche, 2, 4).rejeu.parIngredient.has("oeufs")).toBe(false);
  });

  test("à l'échelle des parts, la pièce s'arrondit au-dessus : 3 œufs pour 4, cuisiné pour 5 → 4 œufs", () => {
    const quiche = platDe("quiche-test", "oeufs", 3, "pièce");
    expect(rejeuDe(catalogue, "oeufs", quiche, 1, 5).rejeu.parIngredient.get("oeufs")?.lots[0]?.entame).toBe(2);
  });

  test("un bloc de 400 g de fromage s'épuise : 80 g cinq fois, puis plus rien", () => {
    const gratin = platDe("gratin-test", "fromage-rape", 80, "g");
    expect(rejeuDe(catalogue, "fromage-rape", gratin, 4, 4).rejeu.parIngredient.get("fromage-rape")?.grammes).toBeCloseTo(80);
    expect(rejeuDe(catalogue, "fromage-rape", gratin, 5, 4).rejeu.parIngredient.has("fromage-rape")).toBe(false);
  });

  test("un paquet de taille inconnue garde l'heuristique de T134 (il s'ouvre, puis se finit)", () => {
    const poelee = platDe("poelee-test", "champignons-surgeles", 300, "g");
    expect(ctx.contenu("champignons-surgeles")).toBeNull();
    expect(rejeuDe(catalogue, "champignons-surgeles", poelee, 1, 4).rejeu.parIngredient.get("champignons-surgeles")?.lots[0]?.etat).toBe("entame");
    expect(rejeuDe(catalogue, "champignons-surgeles", poelee, 2, 4).rejeu.parIngredient.has("champignons-surgeles")).toBe(false);
  });
});

// L'année simulée n° 5 : 275 « manques réels » sur œufs, yaourts et fromage
// râpé, la fiche disant « rien à acheter ». Le modèle n'y est pour rien — c'est
// ce que ce bloc établit, du bout de la liste à la carte du soir : la faute
// était au grand livre du harnais, qui faisait pourrir ces trois denrées en
// sept jours quand `conservation.yaml` leur en donne 28 et 21.
describe("T136 — œufs, yaourts, fromage râpé : achetés par la liste, cuisinés, redemandés", () => {
  /** Le fond rentré par la liste, les trois laitages retirés du relevé, puis `n` fois `plat` pour `parts`. */
  function scenario(ingredient: string, plat: string, n: number, parts: number) {
    const c: Catalogue = {
      ...catalogue,
      gardeManger: {
        ...catalogue.gardeManger,
        denrees: catalogue.gardeManger.denrees.filter((d) => !["oeufs", "fromage-rape", "yaourt-nature"].includes(d.ingredient)),
      },
    };
    const cx = contexte(c);
    // T137 : rentré il y a 12 jours, sous la fenêtre de garde des laitages.
    const rentre: Evenement = { ...fondRentre, jour: jourAvant(12), saisi: jourAvant(12) };
    const cuissons: Evenement[] = Array.from({ length: n }, (_, i) => ({
      sorte: "cuisine" as const, jour: jourAvant(11 - i), saisi: jourAvant(11 - i), maj: 2 + i,
      repas: "diner" as const, plat, parts,
    }));
    const rejeu = rejouer(c, [rentre, ...cuissons], cx, jourAvant(0));
    const jeu = creerJeu(c, 7, LUNDI);
    jeu.stock = [];
    jeu.gardeManger = jeu.gardeManger.filter((id) => rejeu.parIngredient.has(id));
    const savoir: Savoir = { rejeu, passe: PASSE_VIDE, cuisinesRecemment: new Set(), planchers: [] };
    const p = proposerCeSoir({ jeu, savoir, recents: new Set(), maintenant: LUNDI, sortis: new Set() });
    const carte = [...p.cartes, ...p.plus].find((x) => x.plat.id === plat);
    const ligne = sousLeurPlancher(c, rejeu, planchers).find((l) => l.ingredient === ingredient);
    return { rejeu, carte, ligne };
  }

  const cas = [
    // T142 — le fond rentre 3 boîtes de 6 œufs (jusqu'à 4), un bloc de 400 g,
    // 3 packs de 4 yaourts (jusqu'à 9) : la liste remonte jusqu'au `jusqua`.
    // quiche-poireaux : 6 parts, 3 œufs, 80 g de fromage râpé
    { ingredient: "oeufs", nom: "œufs", plat: "quiche-poireaux", parts: 6, avant: 5, apres: 6, manque: 4 },
    { ingredient: "fromage-rape", nom: "râpé", plat: "quiche-poireaux", parts: 6, avant: 4, apres: 5, manque: 1 },
    // quiche-courgettes-yaourt : 6 parts, 2 yaourts
    { ingredient: "yaourt-nature", nom: "yaourt", plat: "quiche-courgettes-yaourt", parts: 6, avant: 5, apres: 6, manque: 9 },
  ];

  for (const k of cas) {
    test(`${k.ingredient} : ${k.avant} × ${k.plat} n'épuise pas l'unité, ${k.apres} la vident`, () => {
      const avant = scenario(k.ingredient, k.plat, k.avant, k.parts);
      expect(avant.rejeu.parIngredient.has(k.ingredient)).toBe(true);
      // Sous le minimum, la ligne peut déjà exister (T142 : le minimum est à
      // trois unités) — mais jamais à zéro tant qu'il en reste.
      expect(avant.ligne?.a ?? Infinity).toBeGreaterThan(0);

      const { rejeu, carte, ligne } = scenario(k.ingredient, k.plat, k.apres, k.parts);
      expect(rejeu.parIngredient.has(k.ingredient)).toBe(false);
      expect(ligne).toMatchObject({ a: 0, manque: k.manque, fond: true });
      expect(phraseDuPlancher(ligne!, 0)).toMatch(/pour le fond|frais de la semaine/);
      expect(carte).toBeDefined();
      expect(carte!.manque.map((a) => a.id)).toContain(k.ingredient);
      // La phrase de la carte tronque à deux noms (« et 2 autres ») ; la liste
      // complète de ce qui manque est `carte.manque`.
      expect(carte!.manque.map((a) => a.nom.toLowerCase()).join(" · ")).toContain(k.nom);
      expect(ligneAchats(carte!)).toMatch(/^il manque : /);
    });
  }
});

describe("T137 — un article du fond à garde courte se finit par son âge", () => {
  /** Le fond rentré il y a `jours` jours (laitages et lentilles retirés du relevé), puis `autres` ; le rejeu au jour J. */
  function rentreIlYA(jours: number, autres: Evenement[] = []) {
    const c: Catalogue = {
      ...catalogue,
      gardeManger: {
        ...catalogue.gardeManger,
        denrees: catalogue.gardeManger.denrees.filter(
          (d) => !["oeufs", "fromage-rape", "yaourt-nature", "lentilles-seches"].includes(d.ingredient)),
      },
    };
    const rentre: Evenement = { ...fondRentre, jour: jourAvant(jours), saisi: jourAvant(jours) };
    const rejeu = rejouer(c, [rentre, ...autres], contexte(c), jourAvant(0));
    const jeu = creerJeu(c, 7, LUNDI);
    jeu.stock = [];
    const avant = new Set(jeu.gardeManger);
    jeu.gardeManger = jeu.gardeManger.filter((id) => rejeu.parIngredient.has(id));
    const savoir: Savoir = { rejeu, passe: PASSE_VIDE, cuisinesRecemment: new Set(), planchers: [] };
    const p = proposerCeSoir({ jeu, savoir, recents: new Set(), maintenant: LUNDI, sortis: new Set() });
    const carte = [...p.cartes, ...p.plus].find((x) => x.plat.id === "quiche-poireaux");
    return { rejeu, jeu, avant, carte, liste: sousLeurPlancher(c, rejeu, planchers) };
  }

  test("des œufs achetés il y a 29 jours, jamais cuisinés : la liste les redemande et la quiche dit « il manque »", () => {
    const { rejeu, carte, liste } = rentreIlYA(29);
    expect(rejeu.parIngredient.has("oeufs")).toBe(false);
    expect(rejeu.finis.get("oeufs")).toBe(29);
    const l = liste.find((x) => x.ingredient === "oeufs");
    expect(l).toMatchObject({ a: 0, fond: true });
    expect(phraseDuPlancher(l!, 0)).toContain("pour le fond");
    expect(phraseDuPlancher(l!, 0)).not.toContain("jeter");
    expect(carte).toBeDefined();
    expect(carte!.manque.map((a) => a.id)).toContain("oeufs");
    expect(ligneAchats(carte!)).toMatch(/^il manque : /);
  });

  test("à 27 jours les œufs sont encore là", () => {
    const { rejeu, liste } = rentreIlYA(27);
    expect(rejeu.parIngredient.has("oeufs")).toBe(true);
    expect(liste.map((l) => l.ingredient)).not.toContain("oeufs");
  });

  test("des lentilles achetées il y a 60 jours sont encore là : le sec ne disparaît pas en silence", () => {
    const { rejeu, liste } = rentreIlYA(60);
    expect(rejeu.parIngredient.has("lentilles-seches")).toBe(true);
    expect(rejeu.finis.has("lentilles-seches")).toBe(false);
    expect(liste.map((l) => l.ingredient)).not.toContain("lentilles-seches");
    // …mais le râpé (21 j) et les pommes de terre (6 semaines), si.
    expect(rejeu.finis.has("fromage-rape")).toBe(true);
    expect(rejeu.finis.has("pomme-de-terre")).toBe(true);
  });

  test("une observation après l'achat relance l'horloge : « Des œufs ? oui » est la confirmation", () => {
    const vu = {
      sorte: "observation", jour: jourAvant(10), saisi: jourAvant(10), maj: 5,
      portee: "ingredient", zone: null, constats: [{ ingredient: "oeufs", unites: 1 }],
    } as unknown as Evenement;
    expect(rentreIlYA(29, [vu]).rejeu.parIngredient.has("oeufs")).toBe(true);
  });

  test("#32 : la liste ne fait que gagner des lignes, et le garde-manger rien", () => {
    const frais = rentreIlYA(1);
    const vieux = rentreIlYA(60);
    const ids = new Set(vieux.liste.map((l) => l.ingredient));
    for (const l of frais.liste) expect(ids.has(l.ingredient)).toBe(true);
    for (const id of vieux.jeu.gardeManger) expect(vieux.avant.has(id)).toBe(true);
  });

  test("acheté puis mangé n'est pas « jamais vu » : la ligne dit d'où vient l'article", () => {
    const quiches: Evenement[] = [0, 1].map((i) => ({
      sorte: "cuisine" as const, jour: jourAvant(5 - i), saisi: jourAvant(5 - i), maj: 2 + i,
      repas: "diner" as const, plat: "quiche-poireaux", parts: 6,
    }));
    const l = rentreIlYA(6, quiches).liste.find((x) => x.ingredient === "oeufs");
    // T142 : trois boîtes rentrées, deux quiches en prennent une.
    expect(l).toMatchObject({ a: 2, rentreLe: jourAvant(6) });
    expect(phraseDuPlancher(l!, 0)).not.toContain("jamais vu");
    expect(phraseDuPlancher(l!, 0)).toContain(`rentré le ${jourAvant(6)}`);
  });
});
