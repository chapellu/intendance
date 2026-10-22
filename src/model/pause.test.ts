// La proposition de 15 h — ce qu'elle PROMET (T128, Workspace#66).
//
// Écrits par promesse, sur le vrai catalogue exporté. Le premier bloc est le
// scénario qui a ouvert le ticket : l'année du foyer simulé (Workspace#71,
// deuxième passage), un jour sans courses, le fond en place — et 210 soirs de
// pâtes parce que la carte de tête réclamait six articles.

import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { lireCatalogue } from "./catalogue";
import type { LotInitial } from "./depot";
import { ceQuiEstIci, ceQuiManque, estLa } from "./ici";
import { calculer } from "./calcul";
import { creerJeu, type Jeu } from "./jeu";
import { contexte, rejouer, type Evenement } from "./journal";
import {
  aDecongelerLaVeille,
  directAuFeu,
  horaire,
  ordre,
  proposerCeSoir,
  scoreFormat,
  scoreSaison,
  TAILLE,
  type CarteDuSoir,
  type PropositionDuSoir,
} from "./pause";
import { PASSE_VIDE } from "./questions";
import { offre, type Savoir } from "./scoring";
import type { Catalogue } from "./types";

const catalogue: Catalogue = lireCatalogue(
  JSON.parse(readFileSync("public/cuisine-data.json", "utf8")) as unknown,
);
const plat = (id: string) => {
  const p = catalogue.plats.find((x) => x.id === id);
  if (!p) throw new Error(`pas de plat ${id}`);
  return p;
};

/** Lundi : pas un jour de courses pour ce foyer (mercredi et samedi). */
const LUNDI = new Date("2026-10-19T15:00:00");
/** Mercredi : jour de courses. */
const MERCREDI = new Date("2026-10-21T15:00:00");

const iso = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Le fond de roulement rentré la veille, à son minimum — le jour 0 du foyer. */
const fondRentre = (jour: string, sauf: readonly string[] = []): Evenement => ({
  sorte: "entree",
  jour,
  saisi: jour,
  maj: 1,
  lignes: catalogue.fond.denrees
    .filter((d) => !sauf.includes(d.ingredient))
    .map((d) => ({ ingredient: d.ingredient, unites: d.minimum, parUnite: null, zone: null, etat: "sec" as const })),
});

interface Monde {
  jeu: Jeu;
  savoir: Savoir;
  proposition: PropositionDuSoir;
}

function monde(o: {
  maintenant?: Date;
  evts?: Evenement[];
  stock?: LotInitial[];
  recents?: string[];
  sortis?: string[];
} = {}): Monde {
  const maintenant = o.maintenant ?? LUNDI;
  const jour = iso(maintenant);
  const rejeu = rejouer(catalogue, o.evts ?? [], contexte(catalogue), jour);
  const jeu = creerJeu(catalogue, 7, maintenant);
  jeu.stock = o.stock ?? [];
  jeu.gardeManger = jeu.gardeManger.filter((id) => rejeu.parIngredient.has(id));
  const savoir: Savoir = { rejeu, passe: PASSE_VIDE, cuisinesRecemment: new Set(), planchers: [] };
  const proposition = proposerCeSoir({
    jeu,
    savoir,
    recents: new Set(o.recents ?? []),
    maintenant,
    sortis: new Set(o.sortis ?? []),
  });
  return { jeu, savoir, proposition };
}

const ids = (cs: readonly CarteDuSoir[]) => cs.map((c) => c.plat.id);
const veille = (d: Date, n = 1): string => iso(new Date(d.getTime() - n * 86_400_000));

/* ═════════════════════════ le deuxième passage de l'année simulée (#71) */

describe("un jour sans courses, le fond en place : ce qui se fait avec ce qui est là passe devant", () => {
  const { proposition } = monde({ evts: [fondRentre(veille(LUNDI))] });

  test("la carte de tête ne demande RIEN à acheter", () => {
    expect(proposition.jourDeCourses).toBe(false);
    expect(proposition.cartes[0]!.manque).toEqual([]);
  });

  test("aucune carte de la main ne demande deux achats ou plus", () => {
    expect(proposition.cartes.length).toBeGreaterThanOrEqual(TAILLE);
    for (const c of proposition.cartes) expect(c.manque.length, c.plat.id).toBeLessThanOrEqual(1);
  });

  test("ce qui demande plusieurs achats n'est pas retiré : il attend derrière « voir plus »", () => {
    const lourds = proposition.plus.filter((c) => c.manque.length >= 2);
    expect(lourds.length).toBeGreaterThan(0);
    // Un plat à six articles et plus — le refus type de l'année simulée — est
    // toujours rangé après TOUS ceux qui se font sans courses.
    const six = proposition.plus.findIndex((c) => c.manque.length >= 6);
    const dernierFaisable = proposition.plus
      .map((c) => c.manque.length <= 1 && c.horsSaison.length === 0)
      .lastIndexOf(true);
    expect(six).toBeGreaterThan(dernierFaisable);
  });

  test("LA MESURE QUI A OUVERT LE TICKET : le score de la semaine, lui, met des achats en tête", () => {
    // `offre()` est ce que la main du fil trie. Sur le placard que l'app
    // connaissait pendant l'année simulée — le relevé du 26/08, sans le fond —
    // ses cartes de tête réclament des courses : c'est ce que le foyer simulé a
    // refusé 1 026 fois. La proposition de 15 h ne lui emprunte que ses écarts
    // et sa carte, jamais son rang, et sur le même placard elle n'en réclame
    // jamais deux.
    const releve = monde();
    const ici = ceQuiEstIci(catalogue, releve.jeu.gardeManger, releve.savoir.rejeu, iso(LUNDI));
    const tete = offre(releve.jeu, releve.jeu.choix, releve.proposition.soir, releve.savoir).slice(0, 4);
    const achats = tete.map((c) => ceQuiManque(catalogue, c.plat, ici, c.plein).ingredients.length);
    expect(Math.max(...achats)).toBeGreaterThanOrEqual(2);
    expect(releve.proposition.cartes.every((c) => c.manque.length <= 1)).toBe(true);
  });

  test("il en reste assez pour une semaine sans courses : au moins dix dîners à zéro ou un article", () => {
    const faisables = [...proposition.cartes, ...proposition.plus].filter((c) => c.manque.length <= 1);
    expect(faisables.length).toBeGreaterThanOrEqual(10);
  });
});

describe("un article manquant se NOMME", () => {
  test("sans lait de coco, le dahl demande exactement le lait de coco", () => {
    const { proposition } = monde({ evts: [fondRentre(veille(LUNDI), ["lait-coco"])] });
    const dahl = [...proposition.cartes, ...proposition.plus].find(
      (c) => c.plat.id === "dahl-lentilles-corail",
    )!;
    expect(dahl.manque.map((a) => a.id)).toEqual(["lait-coco"]);
    expect(dahl.manque[0]!.nom).toMatch(/coco/);
  });

  test("zéro passe devant un, un devant plusieurs — sans appel, un jour sans courses", () => {
    const { proposition } = monde({ evts: [fondRentre(veille(LUNDI))] });
    // La main est la tête de la liste triée, « voir plus » en est la suite :
    // bout à bout, le rang d'achats ne redescend jamais.
    // Un article hors saison ne s'achète pas : il range sa carte sous toutes
    // les autres, rang « 3 » ici.
    const rangs = [...proposition.cartes.slice(0, TAILLE), ...proposition.plus].map((c) =>
      c.horsSaison.length ? 3 : Math.min(2, c.manque.length),
    );
    expect(rangs).toEqual([...rangs].sort((a, b) => a - b));
    expect(new Set(rangs)).toEqual(new Set([0, 1, 2, 3]));
  });
});

/* ══════════════════════════════════ un article hors saison ne s'achète pas */

describe("un article hors saison ne compte pas comme « un article à acheter » — capture du 19/10", () => {
  const tout = (p: PropositionDuSoir) => [...p.cartes, ...p.plus];

  test("en octobre, le velouté d'ortie sort de la main et passe sous tout ce qui se fait", () => {
    const { proposition } = monde({ evts: [fondRentre(veille(LUNDI))] });
    expect(ids(proposition.cartes)).not.toContain("veloute-ortie");
    const liste = tout(proposition);
    const i = liste.findIndex((c) => c.plat.id === "veloute-ortie");
    const ortie = liste[i]!;
    expect(ortie.manque.map((a) => a.id)).toEqual(["orties"]);
    expect(ortie.horsSaison.map((a) => a.id)).toEqual(["orties"]);
    // Sous TOUS les plats qui se font, y compris ceux à plusieurs achats.
    expect(liste.slice(i).every((c) => c.horsSaison.length > 0)).toBe(true);
  });

  test("même un jour de courses : le marché n'a pas d'orties en octobre", () => {
    const { proposition } = monde({ maintenant: MERCREDI, evts: [fondRentre(veille(MERCREDI))] });
    expect(proposition.jourDeCourses).toBe(true);
    expect(ids(proposition.cartes)).not.toContain("veloute-ortie");
  });

  test("en avril, les orties sont de saison : le velouté redevient « un article »", () => {
    const AVRIL = new Date("2026-04-20T15:00:00"); // un lundi
    const { proposition } = monde({ maintenant: AVRIL, evts: [fondRentre(veille(AVRIL))] });
    const ortie = tout(proposition).find((c) => c.plat.id === "veloute-ortie")!;
    expect(ortie.manque.map((a) => a.id)).toEqual(["orties"]);
    expect(ortie.horsSaison).toEqual([]);
  });

  test("le rang hors saison passe même devant ce qui presse", () => {
    const base = { presse: null, manque: [], horsSaison: [], tient: true, score: 0 } as unknown as CarteDuSoir;
    const orties = { id: "orties", nom: "orties" };
    const presse = { ...base, presse: { placard: "riz" }, manque: [orties], horsSaison: [orties], plat: plat("veloute-ortie") } as CarteDuSoir;
    const deux = { ...base, manque: [orties, orties], plat: plat("lentilles-mijotees") } as CarteDuSoir;
    expect([presse, deux].sort(ordre(false))[0]).toBe(deux);
  });
});

/* ════════════════════════════════════════ ce qui doit être mangé d'abord */

const resteDe = (type: string, born: string, location: "frigo" | "congelo"): LotInitial => ({
  type,
  kind: "reste-plat",
  qty: null,
  qty_band: "3-repas",
  born,
  location,
  ref: "1",
});

describe("ce qui doit être mangé passe devant, même devant zéro article", () => {
  test("un lot du congélateur au bout de sa fenêtre passe en tête", () => {
    // 70 jours sur 90 : la marque « à manger » de T57 est franchie.
    const { proposition } = monde({
      evts: [fondRentre(veille(LUNDI))],
      stock: [resteDe("curry-pois-chiches", veille(LUNDI, 70), "congelo")],
    });
    const tete = proposition.cartes[0]!;
    expect(tete.presse).not.toBeNull();
    expect(tete.presse && "type" in tete.presse ? tete.presse.location : null).toBe("congelo");
    // Il passe devant des plats à zéro article : le rang 1 n'est pas une somme.
    expect(proposition.cartes.slice(1).some((c) => c.manque.length === 0)).toBe(true);
  });

  test("un reste au frigo se finit le soir aussi, même si son plat est déclaré pour le midi", () => {
    // `reste-de-la-veille` porte `creneaux: [dejeuner]` : le fil ne le propose
    // jamais au dîner. À 15 h, un reste d'hier est la meilleure réponse.
    expect(plat("reste-de-la-veille").creneaux).toEqual(["dejeuner"]);
    const { proposition } = monde({
      evts: [fondRentre(veille(LUNDI))],
      stock: [resteDe("lasagnes", veille(LUNDI), "frigo")],
    });
    expect(proposition.cartes[0]!.plat.id).toBe("reste-de-la-veille");
    expect(proposition.cartes[0]!.manque).toEqual([]);
  });

  test("un lot JEUNE du congélateur ne presse pas — il attend, et le cockpit le sait", () => {
    const { proposition } = monde({
      evts: [fondRentre(veille(LUNDI))],
      stock: [resteDe("curry-pois-chiches", veille(LUNDI, 5), "congelo")],
    });
    expect(proposition.cartes.every((c) => c.presse === null)).toBe(true);
    expect(proposition.attend.map((l) => [l.type, l.location])).toEqual([["curry-pois-chiches", "congelo"]]);
    // La carte qui le mangerait le dit, sans passer devant le rang.
    const reste = [...proposition.cartes, ...proposition.plus].find((c) => c.plat.id === "reste-de-la-veille")!;
    expect(reste.attend?.type).toBe("curry-pois-chiches");
  });

  test("une base cuisinée à mi-vie au frigo fait passer devant le plat qui la finit", () => {
    const born = veille(LUNDI, 3);
    const { proposition } = monde({
      evts: [fondRentre(veille(LUNDI))],
      stock: [
        { type: "lentilles-vertes-cuites", kind: "base", qty: { amount: 400, unit: "g" }, qty_band: "2-repas", born, location: "frigo", ref: "2" },
      ],
    });
    const tete = proposition.cartes[0]!;
    expect(tete.presse).not.toBeNull();
    expect(tete.carte.chaine).toBe(true);
  });
});

/* ══════════════════════════════════════════════════ le jour de courses */

describe("un jour de courses, plusieurs achats redeviennent possibles", () => {
  test("le mercredi, la main peut porter un plat à deux articles ou plus", () => {
    const { proposition } = monde({ maintenant: MERCREDI });
    expect(proposition.jourDeCourses).toBe(true);
    expect(proposition.cartes.some((c) => c.manque.length >= 2)).toBe(true);
  });

  test("le lundi, sur le même placard, jamais", () => {
    const { proposition } = monde({ maintenant: LUNDI });
    expect(proposition.jourDeCourses).toBe(false);
    expect(proposition.cartes.every((c) => c.manque.length <= 1)).toBe(true);
  });
});

/* ════════════════════════════════════════════════════════════ l'heure */

describe("ce qui tient ce soir : prêt à 18 h si on le lance maintenant", () => {
  test("une étape faite PENDANT une autre ne s'additionne pas", () => {
    const p = plat("curry-pois-chiches");
    const somme = p.steps.reduce((a, s) => a + s.minutes + (s.attente ?? 0), 0);
    expect(p.steps.some((s) => s.enParallele)).toBe(true);
    expect(horaire(p).total).toBeLessThan(somme);
  });

  test("un trempage de douze heures ne se lance pas à 15 h — sauf par son repli, qui se dit", () => {
    const p = plat("salade-orge-thon");
    const h = horaire(p);
    expect(h.total).toBeGreaterThanOrEqual(720);
    expect(h.rattrape).toBeLessThan(h.total);
  });

  test("à 17 h 30, un plat d'une heure ne tient plus, et on dit quand il sera prêt", () => {
    const tard = new Date("2026-10-19T17:30:00");
    const { proposition } = monde({ maintenant: tard, evts: [fondRentre(veille(tard))] });
    const long = [...proposition.cartes, ...proposition.plus].find((c) => c.horaire.total >= 60)!;
    expect(long.tient).toBe(false);
    expect(long.pret).toBe(17 * 60 + 30 + long.horaire.total);
  });

  test("à rang d'achats égal, ce qui tient passe devant ce qui ne tient pas", () => {
    const base = { presse: null, manque: [], horsSaison: [], score: 0 } as unknown as CarteDuSoir;
    const tient = { ...base, tient: true, score: -5, plat: plat("lentilles-mijotees") } as CarteDuSoir;
    const tard = { ...base, tient: false, score: 9, plat: plat("curry-pois-chiches") } as CarteDuSoir;
    expect([tard, tient].sort(ordre(false))[0]).toBe(tient);
  });
});

/* ═══════════════════════════════════════════ à égalité : les préférences */

describe("à rang égal, les préférences départagent — et seulement là", () => {
  test("un plat mangé ces trois derniers jours cède la tête", () => {
    const evts = [fondRentre(veille(LUNDI))];
    const avant = monde({ evts }).proposition.cartes[0]!.plat.id;
    const apres = monde({ evts, recents: [avant] }).proposition;
    expect(apres.cartes[0]!.plat.id).not.toBe(avant);
    // Un malus, pas un filtre : il reste proposé.
    expect(ids([...apres.cartes, ...apres.plus])).toContain(avant);
  });

  test("quand aucune des trois n'est aux légumineuses, une quatrième l'est", () => {
    const evts = [fondRentre(veille(LUNDI))];
    const legumineuse = (id: string) => {
      const a = plat(id).apports;
      return a.proteine === "legumineuse" || a.feculent === "legumineuse";
    };
    // On rend récents tous les plats de légumineuses : ils descendent sous trois
    // autres, et la quatrième place les rappelle.
    const recents = catalogue.plats.filter((p) => legumineuse(p.id)).map((p) => p.id);
    const { proposition } = monde({ evts, recents });
    const tete = ids(proposition.cartes.slice(0, TAILLE));
    if (tete.some(legumineuse)) return; // rien à rappeler — la promesse est tenue
    expect(proposition.cartes).toHaveLength(TAILLE + 1);
    expect(legumineuse(proposition.cartes[TAILLE]!.plat.id)).toBe(true);
  });

  test("quiche, soupe et gratin pèsent ; les pâtes non", () => {
    expect(scoreFormat(plat("quiche-courgettes-yaourt"))).toBeGreaterThan(0);
    expect(scoreFormat(plat("hachis-parmentier-lentilles"))).toBeGreaterThan(0);
    const pates = catalogue.plats.find((p) => p.format === "pates")!;
    expect(scoreFormat(pates)).toBe(0);
  });

  test("la quiche aux courgettes est de saison en juillet, pas en janvier", () => {
    const q = plat("quiche-courgettes-yaourt");
    expect(scoreSaison(catalogue, q, 7)).toBeGreaterThan(0);
    expect(scoreSaison(catalogue, q, 1)).toBeLessThan(0);
    // Un dîner du fond — oignon, carotte, lentilles — n'a pas de saison.
    expect(scoreSaison(catalogue, plat("lentilles-mijotees"), 1)).toBe(0);
  });
});

/* ══════════════════════════════════════════════ ce qui est ici, au juste */

describe("ce qui est ici : le rejeu entier, avec une vie pour le frais court", () => {
  const entree = (jour: string, ingredient: string, etat: "frais" | "sec"): Evenement => ({
    sorte: "entree",
    jour,
    saisi: jour,
    maj: 2,
    lignes: [{ ingredient, unites: 1, parUnite: null, zone: null, etat }],
  });

  test("une crème rentrée il y a dix jours n'est plus une raison de dîner", () => {
    const jour = iso(LUNDI);
    const rejeu = rejouer(catalogue, [entree(veille(LUNDI, 10), "creme", "frais")], contexte(catalogue), jour);
    expect(estLa(catalogue, rejeu.parIngredient.get("creme")!, jour)).toBe(false);
    const hier = rejouer(catalogue, [entree(veille(LUNDI), "creme", "frais")], contexte(catalogue), jour);
    expect(estLa(catalogue, hier.parIngredient.get("creme")!, jour)).toBe(true);
  });

  test("un filet d'oignons rentré il y a dix jours est encore là : il est de garde", () => {
    const jour = iso(LUNDI);
    const rejeu = rejouer(catalogue, [entree(veille(LUNDI, 10), "oignon", "frais")], contexte(catalogue), jour);
    const e = rejeu.parIngredient.get("oignon")!;
    expect(e.classe).toBe("de-garde");
    expect(estLa(catalogue, e, jour)).toBe(true);
  });

  test("ce qui est rentré compte pour la proposition SANS entrer dans la liste de courses", () => {
    // `Jeu.gardeManger` reste l'intersection de #32 : un achat rentré n'y entre
    // jamais. C'est `ceQuiEstIci` qui le voit, pour classer, et lui seul.
    const { jeu, savoir } = monde({ evts: [entree(veille(LUNDI), "lait-coco", "sec")] });
    expect(jeu.gardeManger).not.toContain("lait-coco");
    expect(ceQuiEstIci(catalogue, jeu.gardeManger, savoir.rejeu, iso(LUNDI)).has("lait-coco")).toBe(true);
  });

  test("le sel ne manque jamais, l'accompagnement se dit sans compter", () => {
    const vide = new Set<string>();
    const sel = ceQuiManque(catalogue, plat("lentilles-mijotees"), vide);
    expect(sel.ingredients.map((a) => a.id)).not.toContain("sel");
    const escalopes = ceQuiManque(catalogue, plat("escalopes-emmental-champignons"), vide);
    expect(escalopes.aCote.map((a) => a.id)).toContain("salade-verte");
    expect(escalopes.ingredients.map((a) => a.id)).not.toContain("salade-verte");
  });
});

describe("posé depuis « Ce soir », la liste ne demande que ce que la carte disait manquer — 19/10", () => {
  const cles = (jeu: Jeu) => [...calculer(jeu).panier.values()].map((l) => l.id).sort();
  const poserDepuisCeSoir = (jeu: Jeu, soir: number, c: CarteDuSoir) => {
    jeu.choix[soir] = c.plat.id;
    jeu.dejaLa[soir] = { plat: c.plat.id, ids: c.ici };
  };

  test("le dahl sans lait de coco : la liste dit lait de coco, et rien de ce que la carte disait là", () => {
    const { jeu, proposition } = monde({ evts: [fondRentre(veille(LUNDI), ["lait-coco"])] });
    const dahl = [...proposition.cartes, ...proposition.plus].find((c) => c.plat.id === "dahl-lentilles-corail")!;
    expect(dahl.manque.map((a) => a.id)).toEqual(["lait-coco"]);

    // LE BUG : posé sans l'instantané, la liste lit l'intersection de #32 et
    // réclame ce que le fond rentré a apporté — la carte et la liste se
    // contredisent.
    jeu.choix[proposition.soir] = dahl.plat.id;
    const sans = cles(jeu);
    expect(sans.length).toBeGreaterThan(1);

    poserDepuisCeSoir(jeu, proposition.soir, dahl);
    const attendu = [...dahl.manque, ...dahl.aCote].map((a) => a.id).sort();
    expect(cles(jeu)).toEqual(attendu);
    expect(cles(jeu)).toContain("lait-coco");
  });

  test("l'intersection de #32 n'est pas touchée : l'instantané ne vaut que pour CE plat", () => {
    const { jeu, proposition } = monde({ evts: [fondRentre(veille(LUNDI), ["lait-coco"])] });
    const dahl = [...proposition.cartes, ...proposition.plus].find((c) => c.plat.id === "dahl-lentilles-corail")!;
    const avant = [...jeu.gardeManger];
    poserDepuisCeSoir(jeu, proposition.soir, dahl);
    expect(jeu.gardeManger).toEqual(avant);
    // Un autre plat simulé sur le même créneau — ce que fait le comptoir pour
    // chaque candidat — n'en hérite pas.
    const choix = [...jeu.choix];
    choix[proposition.soir] = "lentilles-mijotees";
    const autre = [...calculer(jeu, choix).panier.values()].map((l) => l.id);
    jeu.choix[proposition.soir] = "lentilles-mijotees";
    jeu.dejaLa[proposition.soir] = null;
    expect(autre.sort()).toEqual(cles(jeu));
  });

  test("rentrer l'article manquant APRÈS ne retire pas sa ligne : l'instantané est figé au geste", () => {
    const { jeu, proposition } = monde({ evts: [fondRentre(veille(LUNDI), ["lait-coco"])] });
    const dahl = [...proposition.cartes, ...proposition.plus].find((c) => c.plat.id === "dahl-lentilles-corail")!;
    poserDepuisCeSoir(jeu, proposition.soir, dahl);
    // Le lait de coco rentré : le rejeu le voit, l'intersection non, et
    // l'instantané ne bouge pas — la ligne reste sous le doigt, cochée.
    const rejeu = rejouer(
      catalogue,
      [fondRentre(veille(LUNDI), ["lait-coco"]), { sorte: "entree", jour: iso(LUNDI), saisi: iso(LUNDI), maj: 3, lignes: [{ ingredient: "lait-coco", unites: 1, parUnite: null, zone: null, etat: "sec" }] }],
      contexte(catalogue),
      iso(LUNDI),
    );
    jeu.gardeManger = jeu.gardeManger.filter((id) => rejeu.parIngredient.has(id));
    expect(cles(jeu)).toContain("lait-coco");
  });
});

describe("la proposition ne pose rien et ne touche à rien", () => {
  test("le dîner de ce soir déjà posé ne s'écarte pas lui-même : « changer » reste possible", () => {
    const evts = [fondRentre(veille(LUNDI))];
    const { jeu, savoir, proposition } = monde({ evts });
    const premier = proposition.cartes[0]!.plat.id;
    jeu.choix[proposition.soir] = premier;
    const encore = proposerCeSoir({ jeu, savoir, recents: new Set(), maintenant: LUNDI });
    expect(encore.cartes[0]!.plat.id).toBe(premier);
    expect(jeu.choix[proposition.soir]).toBe(premier);
  });
});

/* ═══════════════════════════════════════════════ la décongélation — 19/10 */

describe("trois heures ne décongèlent pas un bloc : ce qui demande la veille se sort pour demain", () => {
  test("sauces, soupes et mijotés vont du congélo au feu ; gratins, quiches et pièces non", () => {
    for (const t of ["sauce-bolognaise", "curry-pois-chiches", "soupe-pois-casses", "veloute-potiron", "bouillon-maison", "bolognaise-lentilles", "pois-chiches-cuits"])
      expect(directAuFeu(catalogue, t), t).toBe(true);
    for (const t of ["gratin-pates", "lasagnes", "quiche-courgettes", "poulet-cuit", "escalopes-vegetariennes"])
      expect(directAuFeu(catalogue, t), t).toBe(false);
    // Un type que rien ne produit retombe sur la prudence.
    expect(directAuFeu(catalogue, "inconnu-au-catalogue")).toBe(false);
    // Le frigo n'a rien à décongeler.
    expect(aDecongelerLaVeille(catalogue, { type: "lasagnes", location: "frigo" })).toBe(false);
  });

  test("des lasagnes congelées ne font aucune carte du soir — elles sont à sortir pour demain", () => {
    const { proposition } = monde({
      evts: [fondRentre(veille(LUNDI))],
      stock: [resteDe("lasagnes", veille(LUNDI, 70), "congelo")],
    });
    // Pas de « Reste réchauffé » sur un bloc de lasagnes à 15 h.
    const reste = [...proposition.cartes, ...proposition.plus].find((c) => c.plat.id === "reste-de-la-veille");
    expect(reste).toBeUndefined();
    expect(proposition.cartes.every((c) => c.presse === null || "placard" in c.presse || c.presse.type !== "lasagnes")).toBe(true);
    expect(proposition.aSortir.map((a) => a.lot.type)).toEqual(["lasagnes"]);
    // Il attend toujours : le cockpit le sait.
    expect(proposition.attend.map((l) => l.type)).toContain("lasagnes");
  });

  test("une soupe congelée, elle, se cuisine ce soir et ne demande rien la veille", () => {
    const { proposition } = monde({
      evts: [fondRentre(veille(LUNDI))],
      stock: [resteDe("curry-pois-chiches", veille(LUNDI, 70), "congelo")],
    });
    expect(proposition.cartes[0]!.presse).not.toBeNull();
    expect(proposition.aSortir).toEqual([]);
  });

  test("une base qui demande la veille se sort pour le plat qui la prend", () => {
    const { proposition } = monde({
      evts: [fondRentre(veille(LUNDI))],
      stock: [{ type: "poulet-cuit", kind: "base", qty: { amount: 400, unit: "g" }, qty_band: "2-repas", born: veille(LUNDI, 10), location: "congelo", ref: "3" }],
    });
    const a = proposition.aSortir[0]!;
    expect(a.lot.type).toBe("poulet-cuit");
    expect(a.plat?.accepts.some((x) => x.type === "poulet-cuit")).toBe(true);
    // Aucune carte du soir ne compte sur ce poulet.
    for (const c of [...proposition.cartes, ...proposition.plus])
      expect(c.plat.accepts.some((x) => x.type === "poulet-cuit" && x.requis) && !c.carte.plein, c.plat.id).toBe(false);
  });

  test("sorti hier soir (le « Fait » du geste), il a décongelé : ce soir il se cuisine", () => {
    const { proposition } = monde({
      evts: [fondRentre(veille(LUNDI))],
      stock: [resteDe("lasagnes", veille(LUNDI, 70), "congelo")],
      sortis: ["lasagnes"],
    });
    expect(proposition.aSortir).toEqual([]);
    expect(proposition.cartes[0]!.plat.id).toBe("reste-de-la-veille");
  });
});

/* ═══════════════════════ T147 — posé n'est pas cuisiné (capture du 22/10) */

describe("un plat posé mais pas cuisiné ne laisse aucun reste dans « ce qui attend »", () => {
  test("trois plats posés, aucun cuisiné : le cockpit n'annonce aucun « reste de … »", () => {
    // Capture du 22/10, 16 h 23 : croque-monsieur ce soir, une soupe d'orge et
    // une tarte au potimarron posées ailleurs. Le cockpit disait « le reste de
    // soupe orge est à finir d'ici 3 jours » — une soupe que personne n'avait
    // faite. Les restes que la semaine PROJETTE sont du plan, pas du frigo.
    const maintenant = new Date("2026-10-22T16:23:00");
    const jeu = creerJeu(catalogue, 7, maintenant);
    jeu.stock = [];
    const ou = (jour: number, repas: string) => jeu.creneaux.findIndex((c) => c.jour === jour && c.repas === repas);
    jeu.choix[ou(0, "diner")] = "croque-monsieur-salade";
    for (const [j, r, p] of [
      [0, "dejeuner", "soupe-orge-petits-pois"],
      [1, "diner", "soupe-orge-petits-pois"],
      [2, "diner", "tarte-potimarron-oignons"],
    ] as const)
      if (ou(j, r) >= 0) jeu.choix[ou(j, r)] = p;
    const rejeu = rejouer(catalogue, [fondRentre(veille(maintenant))], contexte(catalogue), iso(maintenant));
    const savoir: Savoir = { rejeu, passe: PASSE_VIDE, cuisinesRecemment: new Set(), planchers: [] };
    const p = proposerCeSoir({ jeu, savoir, recents: new Set(), maintenant });
    expect(p.attend).toEqual([]);
    expect([...p.cartes, ...p.plus].every((c) => c.attend === null && !(c.presse && "type" in c.presse))).toBe(true);
  });
});
