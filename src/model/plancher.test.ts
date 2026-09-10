// Ce que les planchers PROMETTENT — T34 à T38.
//
// Les tests portent des promesses, jamais des fonctions : « deux recettes qui
// produisent le même type sont encouragées toutes les deux » doit rester vraie
// si `bonusPlancher` est réécrit demain. Les chiffres de corpus, eux, ne sont
// pas ici : ils bougent au premier fichier ajouté au catalogue, et `npm run
// planchers` les imprime pour qu'on les lise plutôt que de les figer.

import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, test } from "vitest";
import { calculer } from "./calcul";
import { lireCatalogue } from "./catalogue";
import type { LigneDepot } from "./depot";
import { creerJeu, type Jeu } from "./jeu";
import type { Evenement } from "./journal";
import {
  bonusPlancher,
  CUISSONS_AVANT_PROPOSITION,
  cuissonsParType,
  etatDuCongelo,
  planchables,
  populationDe,
  producteurs,
  propositions,
  reglagesDuCongelo,
  type Plancher,
} from "./plancher";
import { offre } from "./scoring";
import type { Catalogue, EmitKind, Plat } from "./types";

const LUNDI = new Date("2026-08-17T12:00:00Z");
const catalogue: Catalogue = lireCatalogue(
  JSON.parse(readFileSync("public/cuisine-data.json", "utf8")) as unknown,
);
const poids = catalogue.equilibre.poids;
const reglages = reglagesDuCongelo(catalogue);

let jeu: Jeu;
beforeEach(() => {
  jeu = creerJeu(catalogue, 7, LUNDI);
});

/** Un lot au congélateur, réduit à ce que le plancher regarde : un type, une
 *  population, un nombre de portions. */
const lot = (type: string, kind: EmitKind, portions: number): LigneDepot => ({
  type,
  kind,
  qty: null,
  band: `${portions}-repas`,
  espace: "congelo",
  location: "congelo",
  born: null,
  gardeFrigo: null,
  congelo: true,
  dluo: null,
  from: null,
  ref: null,
  reste: null,
  unite: null,
  epuise: false,
});

const etat = (lignes: LigneDepot[]) => etatDuCongelo(catalogue, lignes);

/** Un congélateur qui tient son plancher de secours : assez de portions, assez
 *  de types. Sert de fond neutre quand le test parle d'autre chose. */
const REPOSE: LigneDepot[] = [
  lot("ratatouille", "reste-plat", 2),
  lot("soupe-de-poule", "reste-plat", 2),
  lot("bouillon-maison", "base", 2),
];

/** Le premier plat du catalogue qui produit ce type. */
const producteurDe = (type: string): Plat => {
  const p = catalogue.plats.find((x) => x.emits.some((e) => e.type === type && e.congelo));
  if (!p) throw new Error(`aucun plat ne produit ${type} au congélateur`);
  return p;
};

const cuisine = (plat: string, jour: string): Evenement => ({
  sorte: "cuisine",
  jour,
  saisi: jour,
  maj: Date.parse(jour),
  repas: "diner",
  plat,
  parts: 2.5,
});

/* ═══════════════════ T34 — le plancher porte sur ce qu'on PRODUIT ═════════ */

describe("T34 — le plancher se pose sur ce qu'un plat produit", () => {
  test("deux recettes qui produisent le même type sont encouragées toutes les deux", () => {
    // C'est l'argument entier du ticket : `reste-roti` sort d'un poulet en
    // cocotte comme d'un rôti roulé, et c'est le même bocal dans le même
    // tiroir. Un plancher sur la recette en ferait deux réserves distinctes.
    const qui = producteurs(catalogue).get("reste-roti") ?? [];
    expect(qui.length).toBeGreaterThan(1);

    const plancher: Plancher[] = [{ type: "reste-roti", niveau: 1 }];
    for (const id of qui) {
      const p = catalogue.plats.find((x) => x.id === id)!;
      expect(bonusPlancher(p, etat(REPOSE), plancher, poids).score).toBeGreaterThan(0);
    }
  });

  test("et aucune ne touche une part réduite parce qu'elles sont deux", () => {
    // « Partager » ne veut pas dire diviser. Fractionner ferait qu'un type
    // facile à refaire vaudrait moins qu'un type qu'une seule recette sait
    // produire, ce qui est l'inverse du vrai.
    const qui = producteurs(catalogue).get("reste-roti") ?? [];
    const scores = qui.map(
      (id) =>
        bonusPlancher(
          catalogue.plats.find((x) => x.id === id)!,
          etat(REPOSE),
          [{ type: "reste-roti", niveau: 1 }],
          poids,
        ).score,
    );
    expect(new Set(scores).size).toBe(1);
    expect(scores[0]).toBe(poids["plancher_type"]);
  });

  test("un type que rien ne produit ne se propose jamais", () => {
    // Trois types sont `accepts` sans que rien ne les émette. Le modèle n'a
    // aucune ligne pour ce cas : dériver le producteur suffit à l'écarter.
    const qui = producteurs(catalogue);
    const acceptes = new Set(
      catalogue.plats.flatMap((p) => p.accepts.map((a) => a.type).filter((t): t is string => !!t)),
    );
    const orphelins = [...acceptes].filter((t) => !qui.has(t));
    expect(orphelins.length).toBeGreaterThan(0);
    for (const t of orphelins) expect(planchables(catalogue).has(t)).toBe(false);
  });

  test("un plat qui produit deux types sous leur plancher les nomme tous les deux", () => {
    const p = catalogue.plats.find(
      (x) => new Set(x.emits.filter((e) => e.congelo).map((e) => e.type)).size > 1,
    );
    if (!p) return; // le corpus peut ne pas en porter ; la promesse reste vraie
    const types = [...new Set(p.emits.filter((e) => e.congelo).map((e) => e.type))];
    const b = bonusPlancher(
      p,
      etat(REPOSE),
      types.map((type) => ({ type, niveau: 1 })),
      poids,
    );
    expect(b.types.length).toBe(types.length);
  });

  test("mais il ne touche qu'un bonus, pas un par type", () => {
    // Cumuler ferait gagner les recettes à longue liste d'emits plutôt que celles
    // qui rendent service. Le terme d'écoulement cumule, lui, depuis T59 — et la
    // raison de la différence est dans l'en-tête de `bonusPlancher` : le plancher
    // paie une mécanique, l'axe paie des objets.
    const p = catalogue.plats.find(
      (x) => new Set(x.emits.filter((e) => e.congelo).map((e) => e.type)).size > 1,
    );
    if (!p) return;
    const types = [...new Set(p.emits.filter((e) => e.congelo).map((e) => e.type))];
    const b = bonusPlancher(p, etat(REPOSE), types.map((type) => ({ type, niveau: 1 })), poids);
    expect(b.score).toBe(poids["plancher_type"]);
  });
});

/* ═══════════════════ T35 — deux populations, deux plafonds ════════════════ */

describe("T35 — un bouillon et un dîner ne sont pas la même réserve", () => {
  test("une base et un reste de plat ne comptent pas dans le même plafond", () => {
    const e = etat([lot("bouillon-maison", "base", 3), lot("ratatouille", "reste-plat", 4)]);
    expect(e.parPopulation.apport).toBe(3);
    expect(e.parPopulation.diner).toBe(4);
    expect(populationDe("base")).toBe("apport");
    expect(populationDe("reste-plat")).toBe("diner");
  });

  test("les deux plafonds tiennent dans les places du congélateur", () => {
    // Si les bocaux de bouillon peuvent manger les dix-huit places, il n'y a
    // plus de soir qu'on sauve — et deux plafonds qui se recouvrent ne
    // plafonnent rien.
    expect(reglages.plafonds.apport + reglages.plafonds.diner).toBe(reglages.limite);
  });

  test("une population saturée n'éteint pas l'autre", () => {
    const lignes = [
      lot("bouillon-maison", "base", reglages.plafonds.apport),
      lot("ratatouille", "reste-plat", 1),
      lot("soupe-de-poule", "reste-plat", 1),
    ];
    const e = etat(lignes);
    expect(e.sature.apport).toBe(true);
    expect(e.sature.diner).toBe(false);

    const base = producteurDe("bouillon-maison");
    expect(bonusPlancher(base, e, [{ type: "bouillon-maison", niveau: 8 }], poids).types).toEqual([]);
    const diner = producteurDe("ratatouille");
    expect(
      bonusPlancher(diner, e, [{ type: "ratatouille", niveau: 4 }], poids).types.length,
    ).toBeGreaterThan(0);
  });
});

/* ═══════════ T36 — par type ET secours mutualisé, à deux métiers ══════════ */

describe("T36 — quatre portions du même plat ne font pas une réserve", () => {
  test("quatre portions d'un seul type restent sous le plancher de secours", () => {
    const e = etat([lot("ratatouille", "reste-plat", reglages.secours)]);
    expect(e.secours.portions).toBe(reglages.secours);
    expect(e.secours.types).toBe(1);
    expect(e.secours.sous).toBe(true);
  });

  test("les mêmes portions réparties sur assez de types le tiennent", () => {
    const e = etat(REPOSE);
    expect(e.secours.portions).toBeGreaterThanOrEqual(reglages.secours);
    expect(e.secours.types).toBeGreaterThanOrEqual(reglages.diversite);
    expect(e.secours.sous).toBe(false);
  });

  test("assez de types mais pas assez de portions ne le tient pas non plus", () => {
    const e = etat([
      lot("ratatouille", "reste-plat", 1),
      lot("soupe-de-poule", "reste-plat", 1),
      lot("bouillon-maison", "base", 1),
    ]);
    expect(e.secours.types).toBeGreaterThanOrEqual(reglages.diversite);
    expect(e.secours.sous).toBe(true);
  });

  test("le secours paie sans qu'aucun plancher ait été validé", () => {
    // C'est ce qui le distingue du par-type : il ne suppose aucune habitude,
    // seulement dix-huit places et un soir qui peut s'effondrer.
    const p = producteurDe("ratatouille");
    const b = bonusPlancher(p, etat([]), [], poids);
    expect(b.score).toBe(poids["plancher_congelo"]);
    expect(b.types).toEqual([]);
  });

  test("les deux mécaniques s'ajoutent quand les deux manquent", () => {
    const p = producteurDe("ratatouille");
    const b = bonusPlancher(p, etat([]), [{ type: "ratatouille", niveau: 2 }], poids);
    expect(b.score).toBe(poids["plancher_congelo"]! + poids["plancher_type"]!);
    expect(b.raisons).toHaveLength(2);
  });

  test("un plat qui ne congèle rien ne touche ni l'une ni l'autre", () => {
    const p = catalogue.plats.find((x) => !x.emits.some((e) => e.congelo))!;
    expect(bonusPlancher(p, etat([]), [], poids).score).toBe(0);
  });
});

/* ═══════════════════ T37 — propose-puis-valide, jamais d'office ═══════════ */

describe("T37 — l'app propose, elle ne pose pas", () => {
  test("un journal vide ne propose aucun plancher", () => {
    expect(propositions(catalogue, [], new Set())).toEqual([]);
  });

  test("une première cuisson ne propose rien ; la deuxième propose", () => {
    const p = producteurDe("sauce-bolognaise");
    const une = propositions(catalogue, [cuisine(p.id, "2026-08-10")], new Set());
    expect(une.some((x) => x.type === "sauce-bolognaise")).toBe(false);

    const deux = propositions(
      catalogue,
      [cuisine(p.id, "2026-08-10"), cuisine(p.id, "2026-08-17")],
      new Set(),
    );
    const prop = deux.find((x) => x.type === "sauce-bolognaise");
    expect(prop?.cuissons).toBe(CUISSONS_AVANT_PROPOSITION);
    expect(prop?.niveau).toBe(1);
  });

  test("deux recettes différentes du même type comptent pour deux cuissons", () => {
    // Conséquence directe de T34 : c'est le TYPE qui a été produit deux fois,
    // et le tiroir n'a pas d'avis sur la recette d'où sort le bocal.
    const [a, b] = producteurs(catalogue).get("reste-roti") ?? [];
    expect(a).toBeDefined();
    expect(b).toBeDefined();
    const n = cuissonsParType(catalogue, [cuisine(a!, "2026-08-10"), cuisine(b!, "2026-08-17")]);
    expect(n.get("reste-roti")).toBe(2);
  });

  test("la proposition montre ce qui recharge le type", () => {
    const [a, b] = producteurs(catalogue).get("reste-roti") ?? [];
    const prop = propositions(
      catalogue,
      [cuisine(a!, "2026-08-10"), cuisine(b!, "2026-08-17")],
      new Set(),
    ).find((x) => x.type === "reste-roti");
    expect(prop?.plats).toEqual(expect.arrayContaining([a, b]));
  });

  test("ce qui a été décidé ne se repropose pas — accepté comme refusé", () => {
    const p = producteurDe("sauce-bolognaise");
    const evts = [cuisine(p.id, "2026-08-10"), cuisine(p.id, "2026-08-17")];
    expect(propositions(catalogue, evts, new Set(["sauce-bolognaise"])).some(
      (x) => x.type === "sauce-bolognaise",
    )).toBe(false);
  });

  test("seuls des types congelables se proposent", () => {
    const evts = catalogue.plats.flatMap((p) => [
      cuisine(p.id, "2026-08-10"),
      cuisine(p.id, "2026-08-17"),
    ]);
    const planchable = planchables(catalogue);
    for (const prop of propositions(catalogue, evts, new Set()))
      expect(planchable.has(prop.type)).toBe(true);
  });

  test("démarrage à froid : aucun bonus par type n'est inventé", () => {
    const p = producteurDe("sauce-bolognaise");
    expect(bonusPlancher(p, etat(REPOSE), [], poids).score).toBe(0);
  });
});

/* ═══════════════ T38 — le plafond éteint, il ne pénalise pas ══════════════ */

describe("T38 — au-dessus, ça ne coûte rien ; plein, ça ne rapporte plus", () => {
  test("au-dessus de son plancher, un type n'est pas pénalisé", () => {
    // Un plancher est un SEUIL, pas une bande : au-dessus, le bonus s'arrête,
    // il ne se retourne pas.
    const p = producteurDe("ratatouille");
    const lignes = [...REPOSE, lot("ratatouille", "reste-plat", 5)];
    const b = bonusPlancher(p, etat(lignes), [{ type: "ratatouille", niveau: 2 }], poids);
    expect(b.score).toBe(0);
    expect(b.raisons).toEqual([]);
  });

  test("congélateur plein : plus un bonus, quels que soient les déficits", () => {
    const plein = etat([lot("ratatouille", "reste-plat", reglages.limite)]);
    expect(plein.plein).toBe(true);
    const p = producteurDe("lasagnes");
    const b = bonusPlancher(p, plein, [{ type: "lasagnes", niveau: 3 }], poids);
    expect(b.score).toBe(0);
  });

  test("et l'app dit ce qui prend la place, au lieu de se taire", () => {
    const plein = etat([lot("ratatouille", "reste-plat", reglages.limite)]);
    const p = producteurDe("lasagnes");
    const b = bonusPlancher(p, plein, [{ type: "lasagnes", niveau: 3 }], poids);
    expect(b.raisons.join(" ")).toContain("ratatouille");
    expect(b.raisons.join(" ")).toContain(String(reglages.limite));
  });

  test("un congélateur plein d'un seul plat éteint jusqu'au secours", () => {
    // Le seul cas où les deux mécaniques se contredisent : la place manque ET
    // la diversité manque. La place gagne — on ne cuisine pas dans un tiroir
    // plein.
    const plein = etat([lot("ratatouille", "reste-plat", reglages.limite)]);
    expect(plein.secours.sous).toBe(true);
    const p = producteurDe("lasagnes");
    expect(bonusPlancher(p, plein, [], poids).score).toBe(0);
  });

  test("un lot mangé par la semaine rend sa place, donc son plancher rouvre", () => {
    const mange = { ...lot("ratatouille", "reste-plat", reglages.limite), epuise: true };
    const e = etat([mange]);
    expect(e.total).toBe(0);
    expect(e.plein).toBe(false);
  });
});

/* ═══════════════════════ le catalogue commande vraiment ═══════════════════ */

describe("les nombres viennent du catalogue, pas du code", () => {
  test("`equilibre.congelateur` porte les quatre réglages que le modèle lit", () => {
    // La leçon de T48 : un réglage lu, typé, et sans source est un réglage
    // mort. Les défauts du modèle sont un filet ; ce test dit que le fichier
    // les porte vraiment, et rougira le jour où quelqu'un en retire un.
    const c = catalogue.equilibre.congelateur;
    for (const cle of ["plancher", "diversite_min", "plafond_apports", "plafond_diners"])
      expect(typeof c[cle]).toBe("number");
    expect(typeof poids["plancher_congelo"]).toBe("number");
    expect(typeof poids["plancher_type"]).toBe("number");
  });

  test("reconstituer départage, ça ne commande pas", () => {
    // Le même garde-fou que l'anti-gaspi : un plat qui remplit le congélateur
    // mais sature une protéine doit rester derrière un plat qui comble un
    // manque.
    expect(poids["plancher_congelo"]).toBeLessThan(poids["proteine_manquante"]!);
    expect(poids["plancher_type"]).toBeLessThan(poids["plancher_congelo"]!);
  });
});

/* ═════════════════════ ce que la carte en dit, bout en bout ═══════════════ */

describe("la proposition le dit sur la carte", () => {
  const slot = () => jeu.creneaux.findIndex((c) => c.repas === "diner");

  test("sans plancher validé, aucune carte ne prétend en reconstituer un", () => {
    for (const c of offre(jeu, jeu.choix, slot())) expect(c.plancher).toEqual([]);
  });

  test("avec un plancher sous son seuil, la carte le nomme et remonte", () => {
    const avant = offre(jeu, jeu.choix, slot());
    const rang = (l: typeof avant, id: string) => l.findIndex((c) => c.plat.id === id);
    const p = producteurDe("reste-roti");
    const apres = offre(jeu, jeu.choix, slot(), {
      rejeu: { parIngredient: new Map(), vus: new Map(), retraits: [] },
      passe: { repondu: new Map(), depense: new Map() },
      cuisinesRecemment: new Set<string>(),
      planchers: [{ type: "reste-roti", niveau: 1 }],
    });
    const carte = apres.find((c) => c.plat.id === p.id)!;
    expect(carte.plancher).toContain("reste roti");
    expect(carte.pourquoi.some((x) => x.startsWith("reconstitue"))).toBe(true);
    expect(rang(apres, p.id)).toBeLessThan(rang(avant, p.id));
  });

  test("le congélateur de l'amorce est sous son plancher de secours, et ça se dit", () => {
    // L'amorce du catalogue porte un seul bocal au congélo : deux portions,
    // un type. C'est exactement le cas que `congelateur.plancher` décrit.
    const e = etatDuCongelo(catalogue, calculer(jeu, jeu.choix).depot.lignes);
    expect(e.secours.sous).toBe(true);
    const dites = offre(jeu, jeu.choix, slot()).filter((c) =>
      c.pourquoi.some((x) => x.startsWith("remonte le stock")),
    );
    expect(dites.length).toBeGreaterThan(0);
    for (const c of dites) expect(c.plat.emits.some((e2) => e2.congelo)).toBe(true);
  });
});
