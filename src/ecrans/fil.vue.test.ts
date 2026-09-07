import { describe, expect, test } from "vitest";
import type { Question } from "../model/questions";
import type { CleCreneau } from "../nav/routes";
import { avancement, libelleCran, pointsDuFil, resteAPoser } from "./fil.vue";

const c = (jour: string, repas = "diner"): CleCreneau => ({ jour, repas });
const cle = (x: CleCreneau) => `${x.jour}|${x.repas}`;

const q = (ingredient: string): Question => ({
  ingredient,
  nom: ingredient.replace(/-/g, " "),
  confiance: "inconnu",
  vuLe: null,
  plats: ["x"],
  debloque: 1,
});

const JOURS: Record<string, { jour: string; repas: string }> = {
  "2026-09-07|diner": { jour: "lundi", repas: "dîner" },
  "2026-09-08|diner": { jour: "mardi", repas: "dîner" },
  "2026-09-09|diner": { jour: "mercredi", repas: "dîner" },
};
const nommer = (x: CleCreneau) => JOURS[cle(x)] ?? { jour: x.jour, repas: x.repas };

const trois = [c("2026-09-07"), c("2026-09-08"), c("2026-09-09")];
const rien = new Set<string>();

const points = (o: Partial<Parameters<typeof pointsDuFil>[0]> = {}) =>
  pointsDuFil({
    creneaux: trois,
    nommer,
    decides: rien,
    courant: trois[0]!,
    questions: [],
    ...o,
  });

describe("les points de progression", () => {
  test("un point par créneau, dans l'ordre de l'itinéraire", () => {
    expect(points().map((p) => p.label)).toEqual(["lun. dîner", "mar. dîner", "mer. dîner"]);
  });

  test("chacun mène à son créneau — ce sont des destinations", () => {
    // #45 : « on retourne à *jeudi déjeuner*, on ne recule pas d'un ». D'où
    // l'absence de bouton « précédent », et d'où le fait que chaque point porte
    // une cible plutôt qu'un décalage.
    expect(points().every((p) => p.creneau !== null)).toBe(true);
  });

  test("le courant se distingue du fait et de ce qui vient", () => {
    const p = points({ decides: new Set([cle(trois[0]!)]), courant: trois[1]! });
    expect(p.map((x) => x.etat)).toEqual(["fait", "courant", "a-venir"]);
  });

  test("un créneau réglé reste « fait » même si on y revient", () => {
    const p = points({ decides: new Set([cle(trois[0]!)]), courant: trois[0]! });
    expect(p[0]!.etat).toBe("fait");
  });
});

describe("une question est un pas — T50", () => {
  test("elle s'insère AVANT son créneau, parce qu'elle le précède vraiment", () => {
    const p = points({ questions: [q("boeuf-hache")] });
    expect(p.map((x) => x.label)).toEqual([
      "boeuf hache", "lun. dîner", "mar. dîner", "mer. dîner",
    ]);
    expect(p[0]!.question).toBe(true);
  });

  test("elle prend le pas courant, et la main attend derrière", () => {
    const p = points({ questions: [q("boeuf-hache")] });
    expect(p[0]!.etat).toBe("courant");
    // Le créneau n'est PAS courant tant qu'une question est posée : sinon deux
    // points s'allumeraient et l'écran mentirait sur où l'on est.
    expect(p[1]!.etat).toBe("a-venir");
  });

  test("la seconde question attend son tour", () => {
    const p = points({ questions: [q("boeuf-hache"), q("riz")] });
    expect(p.slice(0, 2).map((x) => x.etat)).toEqual(["courant", "a-venir"]);
  });

  test("elle ne mène nulle part : elle est là où on est", () => {
    // Un point de question cliquable promettrait d'y revenir, alors qu'elle
    // aura disparu dès qu'on aura répondu.
    expect(points({ questions: [q("riz")] })[0]!.creneau).toBeNull();
  });

  test("les questions des pas SUIVANTS ne s'affichent pas", () => {
    // Elles ne sont pas connues : une question naît de la proposition, et la
    // proposition d'un créneau dépend de ce qui a été posé avant lui. Les
    // deviner afficherait une file qu'on sait fausse.
    const p = points({ courant: trois[2]!, questions: [q("riz")] });
    expect(p.filter((x) => x.question)).toHaveLength(1);
    expect(p.indexOf(p.find((x) => x.question)!)).toBe(2);
  });
});

describe("l'avancement", () => {
  test("compte ce qui est réglé, pas les pas parcourus", () => {
    expect(avancement(3, 1)).toBe("1 sur 3");
  });

  test("le dit au singulier quand il n'y en a qu'un", () => {
    expect(avancement(1, 1)).toBe("le repas est posé");
    expect(avancement(3, 3)).toBe("les 3 repas sont posés");
  });

  test("une passe vide ne prétend rien", () => {
    expect(avancement(0, 0)).toBe("rien à poser");
  });
});

describe("l'ouverture", () => {
  test("les crans se disent en repas, jamais en jours", () => {
    // Trois repas ne font pas trois jours, et le fil pose des créneaux.
    expect(libelleCran(1)).toBe("1 repas");
    expect(libelleCran(7)).toBe("7 repas");
  });

  test("elle dit ce qui reste au lieu de griser un bouton", () => {
    expect(resteAPoser(2, 14)).toContain("2 repas");
    expect(resteAPoser(14, 14)).toBeNull();
  });

  test("une semaine pleine se dit en toutes lettres", () => {
    expect(resteAPoser(0, 3)).toContain("Tout est posé");
  });
});
