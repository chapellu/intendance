// CE QUE PROMET LE REPORT — correctif du 23/09/2026.
//
// La panne qu'on tient ici ne se voit qu'en faisant passer une nuit, et c'est
// pour ça qu'elle a survécu trois jours à l'usage réel : tout test qui construit
// sa semaine et la relit le même jour est vert, et la suite en comptait déjà
// une dizaine. Chaque test ci-dessous fait donc deux dates.

import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { lireCatalogue } from "../model/catalogue";
import { creerJeu, SAUTE, type Jeu } from "../model/jeu";
import type { Catalogue } from "../model/types";
import { Base, cleCreneau, jourISO } from "./schema";
import { hydrater, lireSemaine, poser, reglerParts, toutOublier } from "./semaine";
import { reporterLesPoses } from "./report";

const catalogue: Catalogue = lireCatalogue(
  JSON.parse(readFileSync("public/cuisine-data.json", "utf8")) as unknown,
);
const MARDI = new Date(2026, 7, 18, 12, 0, 0); // 18 août 2026, en heure locale
const MERCREDI = new Date(2026, 7, 19, 12, 0, 0);

let base: Base;
let mardi: Jeu;
let n = 0;

beforeEach(async () => {
  base = new Base(`report-${++n}`);
  await base.open();
  mardi = creerJeu(catalogue, 7, MARDI);
});
afterEach(async () => {
  await base.delete();
});

const creneau = (j: Jeu, jour: number, repas: string): number => {
  const i = j.creneaux.findIndex((c) => c.jour === jour && c.repas === repas);
  if (i < 0) throw new Error(`pas de créneau ${repas} le jour ${jour}`);
  return i;
};

/** Rouvrir l'app un autre jour : le squelette, le report, puis la lecture —
 *  dans l'ordre exact où `useSemaine` les enchaîne. */
const rouvrir = async (depuis: Date): Promise<Jeu> => {
  const j = creerJeu(catalogue, 7, depuis);
  await reporterLesPoses(base, j);
  return hydrater(j, await lireSemaine(base, j));
};

/** Ce qu'un écran montre : les plats posés, dans l'ordre. */
const poses = (j: Jeu): string[] => j.choix.filter((c): c is string => !!c && c !== SAUTE);

describe("ce qui est posé ne vieillit pas", () => {
  test("un plat posé hier se relit aujourd’hui, sans qu’on l’ait demandé", async () => {
    // LA PANNE, EXACTEMENT. Mardi soir on pose un dîner ; mercredi la fenêtre
    // commence à mercredi, et mardi est passé sous la borne basse.
    await poser(base, mardi, creneau(mardi, 0, "diner"), "poulet-roti");

    const sansReport = hydrater(
      creerJeu(catalogue, 7, MERCREDI),
      await lireSemaine(base, creerJeu(catalogue, 7, MERCREDI)),
    );
    expect(poses(sansReport)).toEqual([]);

    // Avec le report, le même geste rend le plat — c'est tout le ticket.
    expect(poses(await rouvrir(MERCREDI))).toEqual(["poulet-roti"]);
  });

  test("un dîner redevient un dîner, pas le premier créneau venu", async () => {
    await poser(base, mardi, creneau(mardi, 0, "diner"), "poulet-roti");
    const mercredi = await rouvrir(MERCREDI);
    const i = mercredi.choix.findIndex((c) => c === "poulet-roti");
    expect(mercredi.creneaux[i]?.repas).toBe("diner");
    // Et sur le PREMIER dîner disponible : on ne le repousse pas à la fin de la
    // semaine sous prétexte qu'il a déjà attendu un jour.
    expect(mercredi.creneaux[i]?.jour).toBe(0);
  });

  test("les parts réglées suivent le plat", async () => {
    const soir = creneau(mardi, 0, "diner");
    await poser(base, mardi, soir, "poulet-roti");
    await reglerParts(base, mardi, soir, 6);

    const mercredi = await rouvrir(MERCREDI);
    const i = mercredi.choix.findIndex((c) => c === "poulet-roti");
    expect(mercredi.parts[i]).toBe(6);
  });

  test("deux plats d’hier ne se marchent pas dessus, et gardent leur ordre", async () => {
    await poser(base, mardi, creneau(mardi, 0, "dejeuner"), "poulet-roti");
    await poser(base, mardi, creneau(mardi, 0, "diner"), "pates-bolognaise");

    const mercredi = await rouvrir(MERCREDI);
    expect(poses(mercredi)).toEqual(["poulet-roti", "pates-bolognaise"]);
    const midi = mercredi.choix.indexOf("poulet-roti");
    const soir = mercredi.choix.indexOf("pates-bolognaise");
    expect(mercredi.creneaux[midi]?.repas).toBe("dejeuner");
    expect(mercredi.creneaux[soir]?.repas).toBe("diner");
  });

  test("quatre jours d’absence ne coûtent rien non plus", async () => {
    // Le report ne regarde pas COMBIEN de nuits ont passé : il regarde ce qui
    // est en amont de la borne. Un week-end sans ouvrir l'app est le cas
    // ordinaire, pas le cas limite.
    await poser(base, mardi, creneau(mardi, 0, "diner"), "poulet-roti");
    const samedi = await rouvrir(new Date(2026, 7, 22, 12, 0, 0));
    expect(poses(samedi)).toEqual(["poulet-roti"]);
  });

  test("il ne touche pas ce qui est déjà dans la fenêtre", async () => {
    // Posé mardi pour jeudi : jeudi est encore devant, rien à reporter, et le
    // plat ne doit surtout pas remonter au mercredi.
    await poser(base, mardi, creneau(mardi, 2, "diner"), "poulet-roti");
    const mercredi = await rouvrir(MERCREDI);
    const i = mercredi.choix.indexOf("poulet-roti");
    expect(jourISO(mercredi.jours[mercredi.creneaux[i]!.jour]!.date)).toBe("2026-08-20");
  });

  test("rouvrir deux fois ne duplique rien", async () => {
    await poser(base, mardi, creneau(mardi, 0, "diner"), "poulet-roti");
    await rouvrir(MERCREDI);
    const bis = await rouvrir(MERCREDI);
    expect(poses(bis)).toEqual(["poulet-roti"]);
    expect(await base.creneaux.count()).toBe(1);
  });

  test("et le second report ne fait rien du tout", async () => {
    await poser(base, mardi, creneau(mardi, 0, "diner"), "poulet-roti");
    const j = creerJeu(catalogue, 7, MERCREDI);
    expect(await reporterLesPoses(base, j)).toEqual({ reportees: 1, closes: 0, bloquees: 0 });
    expect(await reporterLesPoses(base, j)).toEqual({ reportees: 0, closes: 0, bloquees: 0 });
  });
});

describe("ce qui ne se reporte pas, et pourquoi", () => {
  test("un créneau déjà cuisiné ne revient pas — il a eu lieu", async () => {
    // LE SEUL « J'AI FINI » QUI SE DIT SANS BOUTON. Le journal porte la
    // cuisson ; reporter le plat le remettrait en « à cuisiner » et la liste
    // de courses le recompterait.
    const soir = creneau(mardi, 0, "diner");
    await poser(base, mardi, soir, "poulet-roti");
    await base.evenements.add({
      sorte: "cuisine",
      jour: "2026-08-18",
      saisi: "2026-08-18",
      repas: "diner",
      plat: "poulet-roti",
      parts: 4,
      maj: Date.now(),
    } as never);

    expect(poses(await rouvrir(MERCREDI))).toEqual([]);
    expect(await base.creneaux.count()).toBe(0);
  });

  test("un repas sauté hier ne se reporte pas : ce n’est pas une recette", async () => {
    await poser(base, mardi, creneau(mardi, 0, "diner"), SAUTE);
    const mercredi = await rouvrir(MERCREDI);
    expect(mercredi.choix.filter((c) => c === SAUTE)).toEqual([]);
    expect(await base.creneaux.count()).toBe(0);
  });

  test("des parts réglées sur un créneau sans plat ne survivent pas à leur repas", async () => {
    await reglerParts(base, mardi, creneau(mardi, 0, "diner"), 6);
    await rouvrir(MERCREDI);
    expect(await base.creneaux.count()).toBe(0);
  });

  test("ce qui ne trouve pas de place reste en base, il ne disparaît pas", async () => {
    // LA PERTE SILENCIEUSE EST CE QU'ON RÉPARE : on ne va pas la refaire à
    // l'autre bout. Une fenêtre entièrement posée n'a nulle part où reporter ;
    // la ligne attend son tour, et le report suivant la reprendra.
    await poser(base, mardi, creneau(mardi, 0, "diner"), "poulet-roti");

    const mercredi = creerJeu(catalogue, 7, MERCREDI);
    for (const [i, c] of mercredi.creneaux.entries())
      if (c.nature !== "routine") await poser(base, mercredi, i, "pates-bolognaise");

    expect(await reporterLesPoses(base, mercredi)).toEqual({
      reportees: 0,
      closes: 0,
      bloquees: 1,
    });
    expect((await base.creneaux.get(cleCreneau("2026-08-18", "diner")))?.plat).toBe("poulet-roti");
  });
});

describe("« j’ai fini » est le seul geste qui efface en gros", () => {
  test("il vide la table, y compris ce qui est resté en amont", async () => {
    // Ce qui est bloqué en amont est justement ce qu'on ne VOIT pas : l'épargner
    // le ferait revenir demain, après qu'on a dit avoir fini.
    await poser(base, mardi, creneau(mardi, 0, "diner"), "poulet-roti");
    const mercredi = await rouvrir(MERCREDI);
    await poser(base, mercredi, creneau(mercredi, 3, "dejeuner"), "pates-bolognaise");

    expect(await toutOublier(base, mercredi)).toBe(2);
    expect(await base.creneaux.count()).toBe(0);
    expect(poses(mercredi)).toEqual([]);
  });

  test("il remet les parts du foyer, pas zéro", async () => {
    const soir = creneau(mardi, 0, "diner");
    await poser(base, mardi, soir, "poulet-roti");
    await reglerParts(base, mardi, soir, 6);
    await toutOublier(base, mardi);
    expect(mardi.parts[soir]).toBe(catalogue.foyer.parts);
  });

  test("et rien ne le déclenche tout seul", async () => {
    // La promesse en creux du ticket — « only clean recipes when I say I'm
    // done ». Trente nuits d'affilée ne doivent pas valoir un geste.
    await poser(base, mardi, creneau(mardi, 0, "diner"), "poulet-roti");
    let dernier = mardi;
    for (let n = 1; n <= 30; n++)
      dernier = await rouvrir(new Date(2026, 7, 18 + n, 12, 0, 0));
    expect(poses(dernier)).toEqual(["poulet-roti"]);
  });
});
