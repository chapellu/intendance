import { describe, expect, test } from "vitest";
import type { Question } from "../model/questions";
import { constatDe, enjeu, raison, REPONSES, titre } from "./questions.vue";

const q = (p: Partial<Question> = {}): Question => ({
  ingredient: "lentilles-seches",
  nom: "lentilles seches",
  confiance: "inconnu",
  vuLe: null,
  plats: ["dahl"],
  debloque: 1,
  ...p,
});

describe("la question se justifie", () => {
  test("jamais relevé se dit tel quel, sans date inventée", () => {
    expect(raison(q({ vuLe: null }))).toBe("jamais relevé");
  });

  test("une date se lit en jour/mois, pas en ISO", () => {
    expect(raison(q({ vuLe: "2026-08-26" }))).toBe("pas vu depuis le 26/08");
  });

  test("« probable » dit qu'on a servi depuis, pas qu'on n'a rien vu", () => {
    // Les deux confiances basses n'ont pas la même histoire : l'une n'a jamais
    // été vue, l'autre l'a été puis dépensée. Les dire pareil effacerait la
    // seule chose que le relevé a achetée.
    expect(raison(q({ vuLe: "2026-08-26", confiance: "probable" }))).toBe("vu le 26/08, et servi depuis");
  });
});

describe("l'enjeu dit ce que ça rapporte, pas ce qu'on ignore", () => {
  test("un seul plat proposé", () => {
    expect(enjeu(q({ plats: ["dahl"], debloque: 1 }))).toBe("un plat proposé l’attend");
  });

  test("plusieurs plats proposés", () => {
    expect(enjeu(q({ plats: ["dahl", "soupe"], debloque: 2 }))).toBe("2 plats proposés l’attendent");
  });

  test("le vivier ne s'annonce que s'il dit quelque chose de plus", () => {
    expect(enjeu(q({ plats: ["dahl"], debloque: 5 }))).toBe("un plat proposé l’attend · 5 en tout");
    expect(enjeu(q({ plats: ["dahl"], debloque: 1 }))).not.toContain("en tout");
  });
});

describe("le titre nomme l'ingrédient d'abord", () => {
  test("c'est le seul mot qui sert à ouvrir le placard", () => {
    expect(titre(q())).toBe("Des lentilles seches ?");
  });
});

describe("les trois états, et rien de plus", () => {
  test("trois réponses, dans l'ordre oui / peu / non", () => {
    expect(REPONSES.map((r) => r.reste)).toEqual(["oui", "peu", "non"]);
  });

  test("chacune dit ce qu'elle fait", () => {
    expect(REPONSES.every((r) => r.libelle && r.effet)).toBe(true);
  });
});

describe("ce qu'une réponse écrit", () => {
  test("« oui » ne prétend à aucun chiffre", () => {
    // `null` n'est pas un trou : « il y en a, je n'ai pas compté » restaure la
    // confiance sur l'existence sans inventer un nombre.
    expect(constatDe("oui", null)).toEqual({ unites: null, reste: "oui" });
  });

  test("« peu » non plus — le signal est dans le mot", () => {
    expect(constatDe("peu", null)).toEqual({ unites: null, reste: "peu" });
  });

  test("« non » porte le seul chiffre qu'on connaisse : zéro", () => {
    expect(constatDe("non", null)).toEqual({ unites: 0, reste: "non" });
  });

  test("une quantité tapée l'emporte, y compris sur « non »", () => {
    expect(constatDe("peu", 3)).toEqual({ unites: 3, reste: "peu" });
    expect(constatDe("non", 1)).toEqual({ unites: 1, reste: "non" });
  });

  test("une saisie absurde ne descend pas sous zéro", () => {
    expect(constatDe("oui", -2).unites).toBe(0);
  });

  test("une saisie illisible retombe sur le défaut de la réponse", () => {
    expect(constatDe("oui", Number.NaN)).toEqual({ unites: null, reste: "oui" });
  });
});
