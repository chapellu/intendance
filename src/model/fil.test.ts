// Le fil : ce que T49 promet, épinglé.
//
// Écrits par promesse, comme le reste : ce qu'on protège n'est pas
// « `itineraire` rend un tableau », c'est « le rail ne glisse pas sous le
// doigt » et « un dessert ne se pose pas d'office ».

import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { lireCatalogue } from "./catalogue";
import { CRANS, cleDuPas, decidesDuFil, itineraire, pasSuivant, premierPas, type Fil } from "./fil";
import { creerJeu, SAUTE, type Jeu } from "./jeu";
import type { Catalogue } from "./types";

const LUNDI = new Date("2026-08-17T12:00:00Z");
const catalogue: Catalogue = lireCatalogue(
  JSON.parse(readFileSync("public/cuisine-data.json", "utf8")) as unknown,
);

const neuf = (): Jeu => creerJeu(catalogue, 7, LUNDI);
const vide = new Set<string>();

describe("l'itinéraire", () => {
  test("prend les N premiers créneaux à poser, dans l'ordre", () => {
    const jeu = neuf();
    const trois = itineraire(jeu, 3);
    expect(trois).toHaveLength(3);
    // Chronologique : c'est ce qui donne sa sémantique au rail — le midi du
    // jour 3 ne peut voir que ce que le jour 2 a laissé derrière lui.
    const ordre = [...trois].sort((a, b) => a.jour.localeCompare(b.jour));
    expect(trois.map((c) => c.jour)).toEqual(ordre.map((c) => c.jour));
  });

  test("ne s'arrête QUE sur des créneaux `choisi`", () => {
    // UN DESSERT NE SE POSE PAS D'OFFICE. `creneaux.yaml` a inventé
    // `optionnel` pour ça : une semaine sans dessert n'est pas incomplète, et
    // faire atterrir le rail dessus en poserait un tous les soirs.
    const jeu = neuf();
    const cles = new Set(itineraire(jeu, 21).map(cleDuPas));
    for (const [i, c] of jeu.creneaux.entries()) {
      if (c.nature === "choisi") continue;
      const j = jeu.jours[c.jour]!;
      const cle = cleDuPas({ jour: j.date.toLocaleDateString("sv-SE"), repas: c.repas });
      expect(cles.has(cle), `${cle} (${c.nature}) ne doit pas être dans l'itinéraire`).toBe(false);
      void i;
    }
  });

  test("saute ce qui est déjà décidé, posé comme sauté", () => {
    const jeu = neuf();
    const avant = itineraire(jeu, 3);
    const premier = jeu.creneaux.findIndex((c) => c.nature === "choisi");
    jeu.choix[premier] = SAUTE;
    const apres = itineraire(jeu, 3);
    // « On ne mange pas là » est une réponse : le rail n'y revient pas.
    expect(apres[0]).not.toEqual(avant[0]);
  });

  test("rend moins que demandé plutôt que d'inventer", () => {
    const jeu = neuf();
    for (const [i, c] of jeu.creneaux.entries()) if (c.nature === "choisi") jeu.choix[i] = SAUTE;
    expect(itineraire(jeu, 14)).toEqual([]);
  });

  test("les crans vont de « juste ce soir » à quatorze", () => {
    expect(CRANS[0]).toBe(1);
    expect(Math.max(...CRANS)).toBe(14);
  });
});

describe("le rail ne glisse pas sous le doigt", () => {
  // C'EST LA RAISON D'ÊTRE DE `Fil.creneaux`. « Les N premiers indécis » change
  // de sens à chaque plat posé : recalculer ferait du deuxième pas le premier,
  // et les points de progression se renuméroteraient à chaque geste.
  test("l'itinéraire figé ne bouge pas quand un pas est posé", () => {
    const jeu = neuf();
    const fil: Fil = { horizon: 3, creneaux: itineraire(jeu, 3) };
    const depart = [...fil.creneaux];

    const i = jeu.creneaux.findIndex((c) => c.nature === "choisi");
    jeu.choix[i] = catalogue.plats[0]!.id;

    expect(fil.creneaux).toEqual(depart);
    // Alors qu'un itinéraire recalculé, lui, aurait glissé.
    expect(itineraire(jeu, 3)).not.toEqual(depart);
  });
});

describe("avancer dans le fil", () => {
  const filDe = (jeu: Jeu, n: number): Fil => ({ horizon: n, creneaux: itineraire(jeu, n) });

  test("le pas suivant est le suivant dans l'itinéraire", () => {
    const jeu = neuf();
    const fil = filDe(jeu, 3);
    expect(pasSuivant(fil, vide, vide, fil.creneaux[0]!)).toEqual(fil.creneaux[1]);
  });

  test("il enjambe ce qui a été décidé entre-temps", () => {
    const jeu = neuf();
    const fil = filDe(jeu, 3);
    const decides = new Set([cleDuPas(fil.creneaux[1]!)]);
    expect(pasSuivant(fil, decides, vide, fil.creneaux[0]!)).toEqual(fil.creneaux[2]);
  });

  test("il enjambe aussi ce qu'on a simplement passé", () => {
    // « Pas celui-là » n'écrit rien, donc il ne peut pas se dire par `decides` :
    // c'est le second ensemble qui le porte, et il ne survit pas au rechargement.
    const jeu = neuf();
    const fil = filDe(jeu, 3);
    const passes = new Set([cleDuPas(fil.creneaux[1]!)]);
    expect(pasSuivant(fil, vide, passes, fil.creneaux[0]!)).toEqual(fil.creneaux[2]);
  });

  test("la fin de l'itinéraire rend `null`, et c'est la fin de la passe", () => {
    const jeu = neuf();
    const fil = filDe(jeu, 3);
    expect(pasSuivant(fil, vide, vide, fil.creneaux[2]!)).toBeNull();
  });

  test("une passe rouverte reprend au premier pas encore à faire", () => {
    const jeu = neuf();
    const fil = filDe(jeu, 3);
    const decides = new Set([cleDuPas(fil.creneaux[0]!)]);
    expect(premierPas(fil, decides, vide)).toEqual(fil.creneaux[1]);
  });

  test("une passe entièrement réglée n'a plus de premier pas", () => {
    const jeu = neuf();
    const fil = filDe(jeu, 2);
    const decides = new Set(fil.creneaux.map(cleDuPas));
    expect(premierPas(fil, decides, vide)).toBeNull();
  });
});

describe("ce que la passe compte comme fait", () => {
  test("un plat posé et un repas sauté comptent tous les deux", () => {
    const jeu = neuf();
    const fil: Fil = { horizon: 3, creneaux: itineraire(jeu, 3) };
    const indices = jeu.creneaux
      .map((c, i) => [c, i] as const)
      .filter(([c]) => c.nature === "choisi")
      .slice(0, 2)
      .map(([, i]) => i);

    jeu.choix[indices[0]!] = catalogue.plats[0]!.id;
    jeu.choix[indices[1]!] = SAUTE;
    expect(decidesDuFil(jeu, fil).size).toBe(2);
  });

  test("ce qui est posé HORS du fil ne compte pas dedans", () => {
    // L'avancement mesure la passe, pas la semaine : poser un dessert pendant
    // qu'un fil de trois dîners est ouvert ne le fait pas progresser.
    const jeu = neuf();
    const fil: Fil = { horizon: 1, creneaux: itineraire(jeu, 1) };
    const dehors = jeu.creneaux.findIndex(
      (c, i) =>
        c.nature === "choisi" &&
        cleDuPas({ jour: jeu.jours[c.jour]!.date.toLocaleDateString("sv-SE"), repas: c.repas }) !==
          cleDuPas(fil.creneaux[0]!) &&
        i >= 0,
    );
    jeu.choix[dehors] = catalogue.plats[0]!.id;
    expect(decidesDuFil(jeu, fil).size).toBe(0);
  });
});
