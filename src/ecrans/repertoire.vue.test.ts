// CE QUE « LE RÉPERTOIRE » PROMET — T81.
//
// Les plats sont tirés du corpus, jamais énumérés à la main : une liste d'ids
// recopiée ici vieillirait à côté du catalogue sans qu'on le voie.

import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { cleCreneau, jourISO } from "../db";
import { lireCatalogue } from "../model/catalogue";
import { creerJeu, SAUTE } from "../model/jeu";
import type { Catalogue, Plat } from "../model/types";
import { pourLire, sansRecette, tempsDuPlat } from "./cuisiner.vue";
import { normaliser } from "./poser.vue";
import {
  ceQuIlDonne,
  ceQuIlPrend,
  creneauDeLecture,
  GROUPES,
  groupeDe,
  legumeConnu,
  ligneDe,
  phraseDesApports,
  proteineConnue,
  vueDuRepertoire,
} from "./repertoire.vue";

const LUNDI = new Date("2026-08-17T12:00:00Z");
const catalogue: Catalogue = lireCatalogue(
  JSON.parse(readFileSync("public/cuisine-data.json", "utf8")) as unknown,
);
const plats = catalogue.plats;
const titres = (v: ReturnType<typeof vueDuRepertoire>) =>
  v.groupes.flatMap((g) => g.lignes.map((l) => l.plat.titre));

describe("le répertoire montre tout", () => {
  test("chaque plat du catalogue, une fois et une seule", () => {
    const v = vueDuRepertoire(plats);
    const ids = v.groupes.flatMap((g) => g.lignes.map((l) => l.plat.id));
    expect(ids).toHaveLength(plats.length);
    expect(new Set(ids).size).toBe(plats.length);
    expect(v.montres).toBe(v.total);
  });

  test("les groupes viennent dans leur ordre, et chacun est alphabétique", () => {
    const v = vueDuRepertoire(plats);
    const ordre = GROUPES.map((g) => g.cle);
    const vus = v.groupes.map((g) => g.cle);
    expect(vus).toEqual(ordre.filter((c) => vus.includes(c)));
    for (const g of v.groupes) {
      const t = g.lignes.map((l) => normaliser(l.plat.titre));
      expect(t).toEqual([...t].sort((a, b) => a.localeCompare(b, "fr")));
    }
  });

  test("un guillemet ne fait pas passer un titre devant les A", () => {
    const repas = vueDuRepertoire(plats).groupes[0]!.lignes.map((l) => l.plat.titre);
    expect(repas[0]!.startsWith("«")).toBe(false);
  });

  test("l'ordre ne dépend que du catalogue : aucun score, aucune semaine", () => {
    // La vue ne prend pas de jeu — c'est la promesse, écrite dans la
    // signature. Ce test dit l'autre moitié : l'ordre d'entrée du catalogue
    // ne fuit pas non plus jusqu'à l'écran.
    expect(titres(vueDuRepertoire([...plats].reverse()))).toEqual(titres(vueDuRepertoire(plats)));
  });

  test("une base n'est jamais rangée parmi les repas", () => {
    const repas = vueDuRepertoire(plats).groupes.find((g) => g.cle === "repas")!;
    expect(repas.lignes.every((l) => l.plat.role === "plat")).toBe(true);
    expect(plats.some((p) => p.role === "base")).toBe(true);
  });

  test("un plat de goûter ou de dessert n'est pas un repas, bien qu'il soit un `plat`", () => {
    const gouter = plats.find(
      (p) => p.role === "plat" && p.creneaux.length && !p.creneaux.some((c) => c === "dejeuner" || c === "diner"),
    )!;
    expect(gouter).toBeDefined();
    expect(groupeDe(gouter)).toBe("autres-moments");
    // Le silence de `creneaux` vaut « repas principal », comme pour la main.
    expect(groupeDe({ ...gouter, creneaux: [] })).toBe("repas");
  });
});

describe("chercher dans le répertoire", () => {
  test("c'est la recherche de T80 : début de mot, sans accent", () => {
    const pates = plats.find((p) => p.titre.startsWith("Pâtes"))!;
    expect(titres(vueDuRepertoire(plats, "pates"))).toContain(pates.titre);
  });

  test("elle amincit la liste sans la réordonner", () => {
    const tout = titres(vueDuRepertoire(plats));
    const v = vueDuRepertoire(plats, "salade");
    const trouves = titres(v);
    expect(trouves.length).toBeGreaterThan(1);
    expect(trouves.length).toBeLessThan(tout.length);
    // Même ordre relatif que la liste entière : rien ne remonte sous le doigt.
    expect(trouves).toEqual(tout.filter((t) => trouves.includes(t)));
    expect(v.montres).toBe(trouves.length);
  });

  test("et pas de plafond : une ligne ne coûte pas un écran", () => {
    // `TROUVAILLES_MAX` vaut 8 dans « Proposer » ; « salade » en trouve plus.
    expect(titres(vueDuRepertoire(plats, "salade")).length).toBeGreaterThan(8);
  });

  test("une seule lettre ne cherche rien, elle laisse tout", () => {
    expect(vueDuRepertoire(plats, "a").montres).toBe(plats.length);
  });

  test("un nom que personne ne porte vide la liste, et le dit par ses comptes", () => {
    const v = vueDuRepertoire(plats, "zzzz");
    expect(v.groupes).toHaveLength(0);
    expect(v.montres).toBe(0);
    expect(v.total).toBe(plats.length);
  });
});

describe("ce qu'une ligne dit", () => {
  test("toutes les clés d'apports du corpus ont un mot", () => {
    const prot = [...new Set(plats.map((p) => p.apports.proteine))];
    const leg = [...new Set(plats.flatMap((p) => p.apports.legumes))];
    expect(prot.filter((k) => !proteineConnue(k))).toEqual([]);
    expect(leg.filter((k) => !legumeConnu(k))).toEqual([]);
  });

  test("les apports se disent en français, et « aucune » se tait", () => {
    const p = plats.find((x) => x.apports.proteine === "viande-rouge" && x.apports.legumes.length)!;
    expect(phraseDesApports(p)).toMatch(/^viande rouge · /);
    const rien = { ...p, apports: { ...p.apports, proteine: "aucune", legumes: [] } };
    expect(phraseDesApports(rien)).toBeNull();
  });

  test("un reste se dit « des restes », une base se nomme", () => {
    const base = plats.find((p) => p.emits.some((e) => e.kind === "base"))!;
    const e = base.emits.find((x) => x.kind === "base")!;
    expect(ceQuIlDonne(base.emits)).toContain(e.type.replace(/-/g, " "));
    const reste = plats.find((p) => p.emits.some((x) => x.kind === "reste-plat"))!;
    expect(ceQuIlDonne(reste.emits)).toContain("des restes");
    expect(ceQuIlDonne(reste.emits).filter((x) => x === "des restes")).toHaveLength(1);
  });

  test("ce qu'un plat prend dit s'il peut s'en passer", () => {
    const requis = plats.flatMap((p) => p.accepts).find((a) => a.requis && a.type)!;
    const souple = plats.flatMap((p) => p.accepts).find((a) => !a.requis && a.type)!;
    expect(ceQuIlPrend([requis])).toEqual([{ texte: requis.type!.replace(/-/g, " "), requis: true }]);
    expect(ceQuIlPrend([souple])[0]!.requis).toBe(false);
    // Une classe entière (« Reste réchauffé ») se dit par sa classe.
    expect(ceQuIlPrend([{ ...requis, type: null, kind: "reste-plat" }])[0]!.texte).toBe("un reste");
  });

  test("le temps est celui de la fiche qu'elle ouvre, pas celui de la carte", () => {
    // Mesuré le 16/10 : `minutes` et la somme des étapes divergent sur plus
    // de cent plats. La ligne et le résumé de T91 doivent dire le même chiffre.
    for (const p of plats.filter((x) => x.steps.length)) {
      const t = tempsDuPlat(p.steps);
      const l = ligneDe(p);
      expect(l.temps.total).toBe(t.total);
      expect(l.temps.actif).toBe(t.libre ? t.total - t.libre : null);
    }
  });

  test("un plat sans recette écrite le dit avec le mot de T78, et garde son temps", () => {
    const p = plats.find((x) => x.steps.length)!;
    const muet: Plat = { ...p, steps: [], cuisinable: false };
    const l = ligneDe(muet);
    expect(l.sansRecette).toBe(sansRecette(muet)!.court);
    expect(l.temps).toEqual({ total: p.minutes, actif: null });
    expect(ligneDe(p).sansRecette).toBeNull();
  });
});

describe("ouvrir la fiche pour LIRE, jamais le guide", () => {
  const plat = plats.find((p) => groupeDe(p) === "repas")!;
  const indexDe = (jeu: ReturnType<typeof creerJeu>, c: { jour: string; repas: string }) =>
    jeu.creneaux.findIndex(
      (x) => cleCreneau(jourISO(jeu.jours[x.jour]!.date), x.repas) === cleCreneau(c.jour, c.repas),
    );

  test("le créneau visé ne porte pas ce plat, donc la fiche s'ouvre en résumé", () => {
    const jeu = creerJeu(catalogue, 7, LUNDI);
    const c = creneauDeLecture(jeu, plat.id)!;
    const i = indexDe(jeu, c);
    expect(i).toBeGreaterThanOrEqual(0);
    expect(pourLire(plat.id, jeu.choix[i] ?? null)).toBe(true);
  });

  test("un créneau vide, et un repas qui convient au plat", () => {
    const jeu = creerJeu(catalogue, 7, LUNDI);
    const i = indexDe(jeu, creneauDeLecture(jeu, plat.id)!);
    expect(jeu.choix[i]).toBeNull();
    expect(["dejeuner", "diner"]).toContain(jeu.creneaux[i]!.repas);
  });

  test("posé sur ce créneau-là, le plat fait viser un autre créneau", () => {
    const jeu = creerJeu(catalogue, 7, LUNDI);
    const premier = indexDe(jeu, creneauDeLecture(jeu, plat.id)!);
    jeu.choix[premier] = plat.id;
    const i = indexDe(jeu, creneauDeLecture(jeu, plat.id)!);
    expect(i).not.toBe(premier);
    expect(pourLire(plat.id, jeu.choix[i] ?? null)).toBe(true);
  });

  test("un créneau qui porte un AUTRE plat ne passe qu'après tous les vides", () => {
    // Il prêterait son facteur à la fiche : « on en cuisine 9 » sous une
    // recette qui en fait 4.
    const jeu = creerJeu(catalogue, 7, LUNDI);
    const autre = plats.find((p) => p.id !== plat.id)!;
    jeu.choix = jeu.choix.map((_, i) => (i === jeu.choix.length - 1 ? null : autre.id));
    const i = indexDe(jeu, creneauDeLecture(jeu, plat.id)!);
    expect(i).toBe(jeu.choix.length - 1);
    // Un repas sauté compte pour vide : il ne porte aucun plat, ni facteur.
    jeu.choix[i] = SAUTE;
    expect(indexDe(jeu, creneauDeLecture(jeu, plat.id)!)).toBe(i);
  });

  test("si tous les créneaux portent ce plat, pas de lien plutôt qu'un guide", () => {
    const jeu = creerJeu(catalogue, 7, LUNDI);
    jeu.choix = jeu.choix.map(() => plat.id);
    expect(creneauDeLecture(jeu, plat.id)).toBeNull();
  });
});
