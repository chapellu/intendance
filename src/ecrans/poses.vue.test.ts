// CE QUE « POSÉS » PROMET.
//
// L'écran est né d'un retour du 21/09 en deux moitiés — « nowhere to check
// them » et « one of them was a dessert and not a main course » — et les deux
// moitiés sont ici, parce que c'est la même panne : on ne voyait pas ses choix,
// donc on ne pouvait pas savoir qu'un dessert était bien rangé.

import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, test } from "vitest";
import { calculer } from "../model/calcul";
import { lireCatalogue } from "../model/catalogue";
import { creerJeu, SAUTE, type Jeu } from "../model/jeu";
import type { Catalogue } from "../model/types";
import { phraseDesPoses, vueDesPoses } from "./poses.vue";

const LUNDI = new Date("2026-08-17T12:00:00Z");
const catalogue: Catalogue = lireCatalogue(
  JSON.parse(readFileSync("public/cuisine-data.json", "utf8")) as unknown,
);

let jeu: Jeu;
beforeEach(() => {
  jeu = creerJeu(catalogue, 7, LUNDI);
});

const creneau = (jour: number, repas: string): number => {
  const i = jeu.creneaux.findIndex((c) => c.jour === jour && c.repas === repas);
  if (i < 0) throw new Error(`pas de créneau ${repas} le jour ${jour}`);
  return i;
};
const poser = (jour: number, repas: string, rid: string) => {
  jeu.choix[creneau(jour, repas)] = rid;
};
const vue = () => vueDesPoses(jeu, calculer(jeu));

/** Un plat qui accepte ce créneau — le corpus décide, jamais une liste d'ids
 *  recopiée ici, qui vieillirait à côté du catalogue sans qu'on le voie.
 *
 *  `role === "plat"` DEPUIS T93 : ce helper sert les promesses qui comptent des
 *  REPAS, et le premier plat du corpus à accepter un dîner pourrait demain être
 *  une base ou un accompagnement. Le compte basculerait alors en silence, et
 *  c'est le test qui aurait l'air faux. */
const platPour = (repas: string): string =>
  catalogue.plats.find(
    (p) =>
      p.role === "plat" &&
      (p.creneaux.length ? p.creneaux : ["dejeuner", "diner"]).includes(repas),
  )!.id;

describe("la liste des posés", () => {
  test("ne montre que ce qui porte un plat", () => {
    // LA RAISON D'ÊTRE DE L'ÉCRAN : la grille montre quatorze cases dont douze
    // sont vides, et c'est ce dont T88 a débarrassé l'app. Ici on ne garde que
    // les décisions.
    poser(0, "dejeuner", platPour("dejeuner"));
    poser(2, "diner", platPour("diner"));
    const v = vue();
    expect(v.lignes).toHaveLength(2);
    expect(v.lignes.every((l) => l.slot.plat !== null)).toBe(true);
  });

  test("un repas sauté est une décision, pas une recette à relire", () => {
    // « On ne mange pas là » a sa place dans la grille, qui montre des cases.
    // L'aligner sous « Posés » ferait compter deux choix là où il y a une
    // recette et une absence.
    poser(0, "dejeuner", platPour("dejeuner"));
    jeu.choix[creneau(0, "diner")] = SAUTE;
    expect(vue().lignes).toHaveLength(1);
  });

  test("les lignes arrivent dans l'ordre où on les mangera", () => {
    // Sans les jours, l'ordre est la SEULE chose qui situe une ligne. Le
    // casser rendrait la liste illisible pour exactement la raison qui a fait
    // cacher l'agenda : on ne saurait plus de quoi on parle.
    poser(2, "diner", platPour("diner"));
    poser(0, "dejeuner", platPour("dejeuner"));
    poser(1, "diner", platPour("diner"));
    // L'index du créneau EST l'ordre chronologique — c'est la promesse que
    // `jeu.creneaux` tient depuis le port (voir l'en-tête de `model/jeu.ts`).
    const index = vue().lignes.map((l) => l.slot.i);
    expect(index).toEqual([...index].sort((a, b) => a - b));
    expect(index).toHaveLength(3);
  });

  test("le total des minutes ne compte que ce qui est posé", () => {
    poser(0, "dejeuner", platPour("dejeuner"));
    const un = vue().minutes;
    expect(un).toBe(jeu.plats[platPour("dejeuner")]!.minutes);
    poser(1, "diner", platPour("diner"));
    expect(vue().minutes).toBe(un + jeu.plats[platPour("diner")]!.minutes);
  });
});

describe("un accompagnement posé sur un dîner n'est pas un dîner", () => {
  // LE DESSERT SE DISTINGUAIT PAR SON CRÉNEAU ; UN ACCOMPAGNEMENT, NON. Il est
  // posé SUR un dîner — c'est même la seule façon de le poser — donc la nature
  // du créneau ne peut rien en dire. Sans le rôle, la liste annonçait « 2
  // repas » là où il y a un dîner et un tian.
  test("il se compte à part, sous le nom de son rôle", () => {
    poser(0, "diner", platPour("diner"));
    poser(1, "diner", "tian-ratatouille-parmesan");
    const v = vue();
    expect(v.lignes).toHaveLength(2);
    expect(v.repas).toBe(1);
    expect(v.extras).toEqual([{ label: "accompagnement", n: 1 }]);
    expect(phraseDesPoses(v)).toBe("1 repas · 1 accompagnement");
  });

  // IL RESTE UN CHOIX QU'ON A PRIS, et le créneau reste OCCUPÉ — un plat par
  // créneau, c'est le modèle depuis le port. Le compte des repas qui manquent
  // ne le sait donc pas : poser un tian sur mardi soir retire mardi soir de la
  // liste des soirs à décider, alors qu'il n'y a pas encore de dîner. C'est la
  // limite connue de ce ticket, épinglée ici pour qu'elle se voie le jour où un
  // créneau pourra porter deux plats.
  test("il occupe quand même son créneau, faute de pouvoir en partager un", () => {
    poser(1, "diner", "tian-ratatouille-parmesan");
    const v = vue();
    expect(v.lignes).toHaveLength(1);
    expect(v.lignes[0]!.slot.plat?.id).toBe("tian-ratatouille-parmesan");
    expect(v.repas).toBe(0);
    expect(v.restent).toBe(jeu.creneaux.filter((c) => c.nature === "choisi").length - 1);
  });
});

describe("un dessert n'est pas un repas", () => {
  test("il se compte à part, et la phrase le dit", () => {
    // LE RETOUR DU 21/09, MOT POUR MOT : « one of them was a dessert and not a
    // main course ». Trois recettes posées ne font pas trois dîners. Le cockpit
    // le savait déjà — il annonçait « 2/14 répondus » — mais il excluait le
    // dessert SANS UN MOT, ce qui se lit comme une erreur de compte.
    poser(0, "dejeuner", platPour("dejeuner"));
    poser(0, "diner", platPour("diner"));
    poser(0, "dessert", platPour("dessert"));
    const v = vue();
    expect(v.lignes).toHaveLength(3);
    expect(v.repas).toBe(2);
    expect(v.extras).toEqual([{ label: "dessert", n: 1 }]);
    expect(phraseDesPoses(v)).toBe("2 repas · 1 dessert");
  });

  test("c'est la NATURE qui tranche, pas le label", () => {
    // Le label ne suffit pas : « dessert » et « dîner » se lisent pareil, et
    // seule `nature` dit lequel compte comme un repas. C'est pour ça qu'elle
    // voyage désormais jusqu'à `VueSlot`.
    poser(0, "dessert", platPour("dessert"));
    const [l] = vue().lignes;
    expect(l?.slot.nature).toBe("optionnel");
    expect(vue().repas).toBe(0);
  });

  test("« repas » est invariable, le label s'accorde", () => {
    // « 2 repass » a l'air cassé, et un écran qui a l'air cassé ne se croit
    // plus — c'est déjà l'argument de `quantiteDeLArticle` sur « 2 unité ».
    poser(0, "dejeuner", platPour("dejeuner"));
    expect(phraseDesPoses(vue())).toBe("1 repas");
    poser(0, "diner", platPour("diner"));
    expect(phraseDesPoses(vue())).toBe("2 repas");
    poser(0, "dessert", platPour("dessert"));
    poser(1, "dessert", platPour("dessert"));
    expect(phraseDesPoses(vue())).toBe("2 repas · 2 desserts");
  });

  test("une semaine vide le dit, au lieu d'annoncer zéro repas", () => {
    // « 0 repas » est exact et décourageant ; la phrase doit dire que l'écran
    // se remplira, pas constater un échec.
    expect(vue().lignes).toHaveLength(0);
    expect(phraseDesPoses(vue())).toBe("Rien de posé pour l’instant.");
  });
});

describe("ce qui reste à décider", () => {
  test("ne compte que les repas, jamais les desserts", () => {
    // Un dessert non posé n'est pas un trou — `prochainVide` ne le vise déjà
    // jamais. Le compter ici réclamerait sept desserts par semaine.
    const avant = vue().restent;
    poser(0, "dessert", platPour("dessert"));
    expect(vue().restent).toBe(avant);
    poser(0, "dejeuner", platPour("dejeuner"));
    expect(vue().restent).toBe(avant - 1);
  });
});
