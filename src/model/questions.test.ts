// Le déclencheur : ce que T33 promet, épinglé.
//
// Écrits par PROMESSE et non par fonction, comme `journal.test.ts` : ce qu'on
// protège n'est pas « `questions` rend un tableau », c'est « on ne demande
// jamais sur un aromate » et « répondre "peu" laisse passer le premier plat et
// arrête le second ». Une refonte qui garde les promesses doit rester verte.

import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { lireCatalogue } from "./catalogue";
import { creerJeu } from "./jeu";
import { main, offre } from "./scoring";
import { contexte, rejouer, type Contexte, type Evenement, type Rejeu } from "./journal";
import {
  bloque, centralite, depenses, lignesInterrogeables, paris, passeDuJour, questions,
  type Passe, type Reste,
} from "./questions";
import type { Catalogue, Denree, Ingredient, Plat } from "./types";

/* ────────────────────────────────────────────────────────────── les fixtures */

const ing = (p: Partial<Ingredient> & { id: string }): Ingredient => ({
  nom: p.id, qty: 100, unit: "g", base: false, assaisonnement: false, central: false,
  ...p,
});

const plat = (p: Partial<Plat> & { id: string }): Plat =>
  ({ titre: p.id, portions: 4, minutes: 30, ingredients: [], accepts: [], emits: [], ...p }) as Plat;

const denree = (p: Partial<Denree> & { ingredient: string }): Denree => ({
  zone: "placard-haut", unites: 1, parUnite: null, poidsG: null, etat: "sec",
  sensible: [], incompatibles: [], urgence: "basse", nature: "autre",
  conservations: [], note: null,
  ...p,
});

function catalogue(o: {
  plats?: Plat[];
  denrees?: Denree[];
  centraux?: { rayons: string[]; ids: string[] };
  releve?: string | null;
}): Catalogue {
  return {
    plats: o.plats ?? [],
    rayons: {
      ordre: ["primeur", "boucherie", "poissonnerie", "crèmerie", "frais", "épicerie"],
      aliases: { oignons: "oignon" },
      rayons: {
        primeur: ["oignon", "persil", "carottes"],
        boucherie: ["boeuf-hache"],
        crèmerie: ["creme"],
        frais: ["gnocchis"],
        épicerie: ["lentilles-seches", "pates", "vinaigre-balsamique"],
      },
      placard: ["sel", "huile-olive"],
      centraux: o.centraux ?? {
        rayons: ["boucherie", "poissonnerie", "crèmerie"],
        ids: ["lentilles-seches", "pates"],
      },
    },
    gardeManger: {
      releve: o.releve === undefined ? "2026-08-26" : o.releve,
      zones: [{ id: "placard-haut", label: "placard haut", espace: "placard" }],
      denrees: o.denrees ?? [],
      alertes: [],
    },
  } as unknown as Catalogue;
}

const monde = (o: Parameters<typeof catalogue>[0], evts: Evenement[] = [], jour = "2026-08-27") => {
  const c = catalogue(o);
  const ctx = contexte(c);
  return { catalogue: c, ctx, rejeu: rejouer(c, evts, ctx, jour) };
};

const passe = (repondu: Record<string, Reste>, depense: Record<string, number> = {}): Passe => ({
  repondu: new Map(Object.entries(repondu)),
  depense: new Map(Object.entries(depense)),
});

const noms = (qs: { ingredient: string }[]) => qs.map((q) => q.ingredient);

/* ═══════════════════════════════════════════════════════ la centralité */

describe("la centralité vient du rayon", () => {
  test("boucherie, poissonnerie et crèmerie sont centraux en entier", () => {
    const { catalogue: c, ctx } = monde({});
    const est = centralite(c, ctx);
    expect(est(ing({ id: "boeuf-hache" }))).toBe(true);
    expect(est(ing({ id: "creme" }))).toBe(true);
  });

  test("le primeur est secondaire — on fait la bolognaise sans persil", () => {
    const { catalogue: c, ctx } = monde({});
    const est = centralite(c, ctx);
    expect(est(ing({ id: "persil" }))).toBe(false);
    expect(est(ing({ id: "oignon" }))).toBe(false);
  });

  test("l'épicerie n'est centrale que sur ses féculents, nommés un par un", () => {
    const { catalogue: c, ctx } = monde({});
    const est = centralite(c, ctx);
    expect(est(ing({ id: "lentilles-seches" }))).toBe(true);
    expect(est(ing({ id: "vinaigre-balsamique" }))).toBe(false);
  });

  test("la surcharge de ligne l'emporte sur le rayon", () => {
    const { catalogue: c, ctx } = monde({});
    const est = centralite(c, ctx);
    expect(est(ing({ id: "gnocchis" }))).toBe(false);
    expect(est(ing({ id: "gnocchis", central: true }))).toBe(true);
  });

  test("un alias mène au même rayon que son id d'achat", () => {
    const { catalogue: c, ctx } = monde({});
    // `oignons` → `oignon`, primeur, donc secondaire — et non « sans rayon ».
    expect(centralite(c, ctx)(ing({ id: "oignons" }))).toBe(false);
  });

  test("un catalogue sans `centraux` ne rend rien central", () => {
    const { catalogue: c, ctx } = monde({ centraux: { rayons: [], ids: [] } });
    expect(centralite(c, ctx)(ing({ id: "boeuf-hache" }))).toBe(false);
  });
});

describe("ce sur quoi une question ne porte jamais", () => {
  const lignes = (ctx: Contexte, p: Plat) => lignesInterrogeables(ctx, p).map((i) => i.id);

  test("ni base, ni assaisonnement, ni fond de placard", () => {
    const { ctx } = monde({});
    const p = plat({
      id: "x",
      ingredients: [
        ing({ id: "boeuf-hache" }),
        ing({ id: "lentilles-vertes-cuites", base: true }),
        ing({ id: "sel", assaisonnement: true }),
        ing({ id: "huile-olive" }),
      ],
    });
    expect(lignes(ctx, p)).toEqual(["boeuf-hache"]);
  });
});

/* ═══════════════════════════════════════════════════ demander ou parier */

describe("central + confiance basse → on demande, toujours", () => {
  test("la viande n'est dans aucun relevé de placard, donc elle se demande", () => {
    const bolo = plat({ id: "bolo", ingredients: [ing({ id: "boeuf-hache" }), ing({ id: "persil" })] });
    const { catalogue: c, ctx, rejeu } = monde({ plats: [bolo] });
    const qs = questions({
      catalogue: c, ctx, rejeu, proposes: [bolo], candidats: [bolo], repondu: new Map(),
    });
    expect(noms(qs)).toEqual(["boeuf-hache"]);
    expect(qs[0]!.confiance).toBe("inconnu");
    expect(qs[0]!.vuLe).toBeNull();
  });

  test("un central relevé ce matin ne se demande pas : on en est sûr", () => {
    const dahl = plat({ id: "dahl", ingredients: [ing({ id: "lentilles-seches" })] });
    const { catalogue: c, ctx, rejeu } = monde(
      { plats: [dahl], denrees: [denree({ ingredient: "lentilles-seches" })], releve: "2026-08-27" },
      [],
      "2026-08-27",
    );
    expect(rejeu.parIngredient.get("lentilles-seches")!.confiance).toBe("sur");
    expect(
      questions({ catalogue: c, ctx, rejeu, proposes: [dahl], candidats: [dahl], repondu: new Map() }),
    ).toHaveLength(0);
  });

  test("on ne redemande pas ce à quoi la passe a déjà répondu", () => {
    const bolo = plat({ id: "bolo", ingredients: [ing({ id: "boeuf-hache" })] });
    const { catalogue: c, ctx, rejeu } = monde({ plats: [bolo] });
    const qs = questions({
      catalogue: c, ctx, rejeu, proposes: [bolo], candidats: [bolo],
      repondu: new Map([["boeuf-hache", "oui"]]),
    });
    expect(qs).toHaveLength(0);
  });

  test("un secondaire incertain ne lève AUCUNE question — on parie", () => {
    // Le persil est au primeur et n'a jamais été relevé : incertain, et muet.
    const soupe = plat({ id: "soupe", ingredients: [ing({ id: "persil" }), ing({ id: "carottes" })] });
    const { catalogue: c, ctx, rejeu } = monde({ plats: [soupe] });
    expect(
      questions({ catalogue: c, ctx, rejeu, proposes: [soupe], candidats: [soupe], repondu: new Map() }),
    ).toHaveLength(0);
  });
});

describe("l'ensemble vient de ce qu'on propose, l'ordre de ce qu'on pourrait", () => {
  const bolo = plat({ id: "bolo", ingredients: [ing({ id: "boeuf-hache" })] });
  const hachis = plat({ id: "hachis", ingredients: [ing({ id: "boeuf-hache" })] });
  const gratin = plat({ id: "gratin", ingredients: [ing({ id: "boeuf-hache" })] });
  const dahl = plat({ id: "dahl", ingredients: [ing({ id: "lentilles-seches" })] });

  test("un plat candidat non proposé ne lève pas sa question", () => {
    const { catalogue: c, ctx, rejeu } = monde({ plats: [bolo, dahl] });
    const qs = questions({
      catalogue: c, ctx, rejeu, proposes: [bolo], candidats: [bolo, dahl], repondu: new Map(),
    });
    expect(noms(qs)).toEqual(["boeuf-hache"]);
  });

  test("l'ordre est celui qui débloque le plus, mesuré sur le vivier", () => {
    const { catalogue: c, ctx, rejeu } = monde({ plats: [bolo, hachis, gratin, dahl] });
    const qs = questions({
      catalogue: c, ctx, rejeu,
      proposes: [dahl, bolo],
      candidats: [bolo, hachis, gratin, dahl],
      repondu: new Map(),
    });
    // Le dahl est proposé en premier, mais les lentilles ne débloquent qu'un
    // plat quand la viande en débloque trois : c'est l'utilité qui trie, pas
    // l'ordre du tirage — ni l'ignorance, qui est la même des deux côtés.
    expect(noms(qs)).toEqual(["boeuf-hache", "lentilles-seches"]);
    expect(qs[0]!.debloque).toBe(3);
    expect(qs[0]!.plats).toEqual(["bolo"]);
  });

  test("deux plats proposés qui veulent la même chose font UNE question", () => {
    const { catalogue: c, ctx, rejeu } = monde({ plats: [bolo, hachis] });
    const qs = questions({
      catalogue: c, ctx, rejeu, proposes: [bolo, hachis], candidats: [bolo, hachis], repondu: new Map(),
    });
    expect(qs).toHaveLength(1);
    expect(qs[0]!.plats).toEqual(["bolo", "hachis"]);
  });
});

/* ═════════════════════════════════════════════════════════════ le budget */

describe("« il en reste peu » : une fois, pas deux", () => {
  const dahl = plat({ id: "dahl", ingredients: [ing({ id: "lentilles-seches" })] });
  const soupe = plat({ id: "soupe", ingredients: [ing({ id: "lentilles-seches" })] });

  test("rien de répondu ne bloque rien", () => {
    const { catalogue: c, ctx } = monde({ plats: [dahl] });
    expect(bloque(c, ctx, { repondu: new Map(), depense: new Map() })(dahl)).toBe(false);
  });

  test("« peu » laisse passer tant que rien n'est posé dessus", () => {
    const { catalogue: c, ctx } = monde({ plats: [dahl] });
    expect(bloque(c, ctx, passe({ "lentilles-seches": "peu" }))(dahl)).toBe(false);
  });

  test("« peu » arrête le SECOND plat qui compte dessus", () => {
    const { catalogue: c, ctx } = monde({ plats: [dahl, soupe] });
    const p = passe({ "lentilles-seches": "peu" }, { "lentilles-seches": 1 });
    expect(bloque(c, ctx, p)(soupe)).toBe(true);
  });

  test("« oui » ne s'épuise jamais", () => {
    const { catalogue: c, ctx } = monde({ plats: [dahl] });
    const p = passe({ "lentilles-seches": "oui" }, { "lentilles-seches": 4 });
    expect(bloque(c, ctx, p)(dahl)).toBe(false);
  });

  test("« non » est le même mécanisme, budget nul : le plat sort tout de suite", () => {
    const { catalogue: c, ctx } = monde({ plats: [dahl] });
    expect(bloque(c, ctx, passe({ "lentilles-seches": "non" }))(dahl)).toBe(true);
  });

  test("une réponse sur un secondaire ne bloque rien — elle ne le pouvait pas", () => {
    const soupePersil = plat({ id: "sp", ingredients: [ing({ id: "persil" })] });
    const { catalogue: c, ctx } = monde({ plats: [soupePersil] });
    expect(bloque(c, ctx, passe({ persil: "non" }, { persil: 3 }))(soupePersil)).toBe(false);
  });
});

describe("ce que les créneaux posés dépensent", () => {
  test("un plat compte une fois par ingrédient, jamais par ligne", () => {
    const p = plat({
      id: "double",
      ingredients: [ing({ id: "pates", qty: 200 }), ing({ id: "pates", qty: 50 })],
    });
    const { catalogue: c, ctx } = monde({ plats: [p] });
    expect(depenses(c, ctx, [p]).get("pates")).toBe(1);
  });

  test("deux plats posés dépensent deux fois", () => {
    const a = plat({ id: "a", ingredients: [ing({ id: "pates" })] });
    const b = plat({ id: "b", ingredients: [ing({ id: "pates" })] });
    const { catalogue: c, ctx } = monde({ plats: [a, b] });
    expect(depenses(c, ctx, [a, b]).get("pates")).toBe(2);
  });

  test("un secondaire ne se dépense pas : il n'a pas de budget", () => {
    const a = plat({ id: "a", ingredients: [ing({ id: "persil" })] });
    const { catalogue: c, ctx } = monde({ plats: [a] });
    expect(depenses(c, ctx, [a]).has("persil")).toBe(false);
  });
});

describe("la passe, faute d'objet passe, est le JOUR", () => {
  const obs = (ingredient: string, reste: Reste, saisi: string): Evenement => ({
    sorte: "observation", portee: "ingredient", zone: null,
    jour: saisi, saisi, constats: [{ ingredient, unites: null, reste }], maj: 1,
  });

  test("une réponse d'aujourd'hui gouverne, celle d'hier non", () => {
    const { catalogue: c, ctx } = monde({});
    const p = passeDuJour(
      c, ctx,
      [obs("pates", "non", "2026-08-26"), obs("lentilles-seches", "peu", "2026-08-27")],
      [], "2026-08-27",
    );
    expect(p.repondu.get("lentilles-seches")).toBe("peu");
    expect(p.repondu.has("pates")).toBe(false);
  });

  test("répondre deux fois, c'est se corriger — la dernière gagne", () => {
    const { catalogue: c, ctx } = monde({});
    const p = passeDuJour(
      c, ctx,
      [obs("pates", "non", "2026-08-27"), obs("pates", "oui", "2026-08-27")],
      [], "2026-08-27",
    );
    expect(p.repondu.get("pates")).toBe("oui");
  });

  test("une observation sans `reste` n'est pas une réponse", () => {
    const { catalogue: c, ctx } = monde({});
    const sans: Evenement = {
      sorte: "observation", portee: "ingredient", zone: null,
      jour: "2026-08-27", saisi: "2026-08-27",
      constats: [{ ingredient: "pates", unites: 2 }], maj: 1,
    };
    expect(passeDuJour(c, ctx, [sans], [], "2026-08-27").repondu.size).toBe(0);
  });
});

/* ═══════════════════════════════════════════════════════════════ le pari */

describe("le pari se dit, et seulement sur ce que le modèle prétend avoir", () => {
  const soupe = plat({
    id: "soupe",
    ingredients: [ing({ id: "carottes" }), ing({ id: "persil" }), ing({ id: "boeuf-hache" })],
  });

  const rejeuAvec = (denrees: Denree[], evts: Evenement[] = [], jour = "2026-09-20"): [Catalogue, Contexte, Rejeu] => {
    const m = monde({ plats: [soupe], denrees }, evts, jour);
    return [m.catalogue, m.ctx, m.rejeu];
  };

  /** Une cuisson qui dépense la confiance sur ce que le plat mange. */
  const cuisson = (jour: string): Evenement => ({
    sorte: "cuisine", jour, saisi: jour, repas: "diner", plat: "soupe", parts: 4, maj: 1,
  });

  test("LE TEMPS SEUL NE FAIT PAS UN PARI", () => {
    // Relevé le 26/08, lu un mois plus tard, et toujours « sûr ». C'est
    // l'asymétrie de #42 et elle est délibérée : la dérive élargit le doute, le
    // calendrier non. Un niveau qui descend sans que rien de constaté ait été
    // mangé serait de la consommation inventée.
    const [c, ctx, rejeu] = rejeuAvec([denree({ ingredient: "carottes" })]);
    expect(rejeu.parIngredient.get("carottes")!.confiance).toBe("sur");
    expect(paris(c, ctx, rejeu, soupe)).toEqual([]);
  });

  test("un secondaire SERVI depuis son relevé est un pari", () => {
    const [c, ctx, rejeu] = rejeuAvec([denree({ ingredient: "carottes" })], [cuisson("2026-09-01")]);
    expect(paris(c, ctx, rejeu, soupe)).toEqual(["carottes"]);
  });

  test("un central n'est jamais un pari — il a eu sa question", () => {
    const [c, ctx, rejeu] = rejeuAvec([denree({ ingredient: "carottes" })], [cuisson("2026-09-01")]);
    expect(paris(c, ctx, rejeu, soupe)).not.toContain("boeuf-hache");
  });

  test("ce que le placard n'a jamais porté n'est pas un pari, c'est une course", () => {
    // Le persil n'est dans aucun relevé : l'app ne croit rien, elle l'achète, et
    // la carte le dit déjà avec son « +N articles ».
    const [c, ctx, rejeu] = rejeuAvec([denree({ ingredient: "carottes" })], [cuisson("2026-09-01")]);
    expect(paris(c, ctx, rejeu, soupe)).not.toContain("persil");
  });

  test("relevé ce matin : plus rien à parier", () => {
    const [c, ctx, rejeu] = rejeuAvec(
      [denree({ ingredient: "carottes" })],
      [{
        sorte: "observation", portee: "zone", zone: "placard-haut",
        jour: "2026-09-20", saisi: "2026-09-20",
        constats: [{ ingredient: "carottes", unites: 1 }], maj: 1,
      }],
    );
    expect(paris(c, ctx, rejeu, soupe)).toEqual([]);
  });
});

/* ══════════════════════ la promesse réfutable, sur le corpus réel ════════ */

describe("le volume de questions DOIT décroître à l'usage", () => {
  // LA SEULE PROMESSE DE T33 QUI SE MESURE. Le plafond de ~5 de #34 a été
  // supprimé et remplacé par un argument : chaque réponse est une observation,
  // qui restaure la confiance, qui supprime les questions suivantes. Si le
  // volume ne décroît pas, ce design est faux — ce test est là pour le dire.
  //
  // ET IL A DÉJÀ SERVI. Écrit avant la mesure, il l'a trouvée fausse : `rejouer`
  // jetait toute observation portant sur un ingrédient sans lot, donc les
  // réponses sur la viande ne survivaient à rien et la passe 2 redemandait les
  // seize mêmes questions. D'où `Rejeu.vus`.
  const reel = lireCatalogue(
    JSON.parse(readFileSync("public/cuisine-data.json", "utf8")) as unknown,
  );
  const ctxReel = contexte(reel);
  const JOUR = "2026-09-06";

  /** Une passe de N dîners : on demande, on répond « oui » à tout, on pose. */
  function passeDe(evts: Evenement[], n: number): number {
    const jeu = creerJeu(reel, 7, new Date(`${JOUR}T12:00:00Z`));
    const rejeu = rejouer(reel, evts, ctxReel, JOUR);
    const savoir = { rejeu, passe: passeDuJour(reel, ctxReel, evts, [], JOUR) };
    let total = 0;
    const dinersDeLaSemaine = jeu.creneaux
      .map((c, i) => [c, i] as const)
      .filter(([c]) => c.repas === "diner")
      .slice(0, n);

    for (const [, i] of dinersDeLaSemaine) {
      jeu.slot = i;
      const cartes = main(jeu, 4, savoir);
      if (!cartes.length) continue;
      const qs = questions({
        catalogue: reel, ctx: ctxReel, rejeu,
        proposes: cartes.map((c) => c.plat),
        candidats: offre(jeu, jeu.choix, i, savoir).map((c) => c.plat),
        repondu: new Map(),
      });
      total += qs.length;
      for (const q of qs)
        evts.push({
          sorte: "observation", portee: "ingredient", zone: null,
          jour: JOUR, saisi: JOUR, maj: evts.length + 1,
          constats: [{ ingredient: q.ingredient, unites: null, reste: "oui" }],
        });
      jeu.choix[i] = cartes[0]!.plat.id;
    }
    return total;
  }

  test("la première passe demande, la seconde se tait", () => {
    const evts: Evenement[] = [];
    const froid = passeDe(evts, 3);
    // Le démarrage à froid coûte, et c'est assumé : la première passe EST le
    // relevé, par un autre chemin. Ce qui compte est ce qui se passe ensuite.
    expect(froid).toBeGreaterThan(0);
    expect(passeDe(evts, 3)).toBe(0);
  });

  test("une passe plus large ne redemande que ce qu'elle découvre", () => {
    const evts: Evenement[] = [];
    const trois = passeDe(evts, 3);
    expect(passeDe(evts, 7)).toBeLessThan(trois);
  });
});
