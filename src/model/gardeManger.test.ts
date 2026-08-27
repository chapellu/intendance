import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { lireCatalogue } from "./catalogue";
import { aSauver, bonusPlacard, urgences } from "./gardeManger";
import type { Catalogue, Plat } from "./types";

const catalogue: Catalogue = lireCatalogue(
  JSON.parse(readFileSync("public/cuisine-data.json", "utf8")) as unknown,
);
const poids = catalogue.equilibre.poids;

const platAvec = (ids: string[], base: string[] = []): Plat =>
  ({
    id: "essai",
    ingredients: [
      ...ids.map((id) => ({ id, ref: id, nom: id, qty: 1, unit: "u", base: false, assaisonnement: false })),
      ...base.map((id) => ({ id, ref: id, nom: id, qty: 1, unit: "u", base: true, assaisonnement: false })),
    ],
  }) as unknown as Plat;

describe("l'urgence par ingrédient", () => {
  test("le lot le plus pressé commande", () => {
    // Trois fonds de paquet de pâtes entamés et rien d'autre : `pates` court.
    // S'il y avait aussi un paquet neuf, c'est encore l'entamé qui compte —
    // c'est lui qui a une horloge.
    expect(urgences(catalogue).get("pates")).toBe("moyenne");
  });

  test("le frais et l'abîmé passent en haute", () => {
    const u = urgences(catalogue);
    expect(u.get("pomme-de-terre")).toBe("haute");
    expect(u.get("pignons-pin")).toBe("haute");
  });

  test("une conserve scellée reste basse", () => {
    expect(urgences(catalogue).get("mais")).toBe("basse");
  });

  test("un ingrédient absent du placard n'a pas d'entrée", () => {
    expect(urgences(catalogue).has("saumon")).toBe(false);
  });
});

describe("ce qu'un plat sauve", () => {
  const u = urgences(catalogue);

  test("un plat qui ne touche à rien ne gagne rien", () => {
    expect(bonusPlacard(catalogue, platAvec(["saumon", "creme"]), u, poids)).toMatchObject({
      score: 0,
      noms: [],
      urgent: false,
    });
  });

  test("une conserve ne paie pas : elle attendra", () => {
    // C'est le point du terme. `article_marginal` récompense déjà l'usage du
    // placard ; payer une deuxième fois le maïs ferait gagner les plats à
    // longue liste d'épicerie.
    expect(bonusPlacard(catalogue, platAvec(["mais", "thon-boite"]), u, poids).score).toBe(0);
  });

  test("un paquet entamé paie moins qu'une denrée pressée", () => {
    const entame = bonusPlacard(catalogue, platAvec(["farine-epeautre"]), u, poids);
    const presse = bonusPlacard(catalogue, platAvec(["pomme-de-terre"]), u, poids);
    expect(entame.score).toBe(poids["ecoule_placard_entame"]);
    expect(presse.score).toBe(poids["ecoule_placard_urgent"]);
    expect(presse.score).toBeGreaterThan(entame.score);
    expect(entame.urgent).toBe(false);
    expect(presse.urgent).toBe(true);
  });

  test("LE BONUS NE SE CUMULE PAS — un plat, un bonus", () => {
    // Mesuré sur le corpus : l'oignon est dans 42 % des 86 plats, l'ail dans
    // 19 %. Cumuler donnait +10 à presque tout ce qui contient les deux, et
    // faisait gagner les longues listes d'ingrédients — l'inverse du service.
    const un = bonusPlacard(catalogue, platAvec(["oignon"]), u, poids);
    const quatre = bonusPlacard(
      catalogue,
      platAvec(["oignon", "ail", "pomme-de-terre", "echalote"]),
      u,
      poids,
    );
    expect(quatre.score).toBe(un.score);
    // Mais la LISTE, elle, dit bien tout ce que le plat mange.
    expect(quatre.noms).toHaveLength(4);
  });

  test("une denrée pressée l'emporte sur un simple entamé", () => {
    const melange = bonusPlacard(catalogue, platAvec(["farine-epeautre", "pomme-de-terre"]), u, poids);
    expect(melange.score).toBe(poids["ecoule_placard_urgent"]);
    expect(melange.urgent).toBe(true);
  });

  test("un ingrédient cité deux fois ne compte qu'une", () => {
    // Une recette peut nommer l'oignon dans la garniture ET dans la sauce.
    // Le payer deux fois récompenserait la façon dont la recette est écrite.
    const deux = bonusPlacard(catalogue, platAvec(["oignon", "oignon"]), u, poids);
    expect(deux.noms).toEqual(["oignon"]);
  });

  test("une ligne `from_accepts` est ignorée", () => {
    // Elle réclame une base cuisinée — « 250 g de lentilles cuites » — pas une
    // matière première. Le chaînage a ses propres poids pour ça.
    expect(bonusPlacard(catalogue, platAvec([], ["pomme-de-terre"]), u, poids).score).toBe(0);
  });

  test("les noms sortent lisibles, pas en identifiants", () => {
    expect(bonusPlacard(catalogue, platAvec(["pomme-de-terre"]), u, poids).noms).toEqual([
      "pomme de terre",
    ]);
  });
});

describe("ce qui se perd", () => {
  test("les pressées d'abord, et rien de scellé", () => {
    const l = aSauver(catalogue);
    expect(l.length).toBeGreaterThan(0);
    expect(l.every((s) => s.urgence !== "basse")).toBe(true);
    const dernierHaut = l.map((s) => s.urgence).lastIndexOf("haute");
    const premierMoyen = l.map((s) => s.urgence).indexOf("moyenne");
    expect(dernierHaut).toBeLessThan(premierMoyen);
  });

  test("la raison distingue « mange-le » de « range-le ailleurs »", () => {
    const l = aSauver(catalogue);
    // Les pignons sont secs et scellés : s'ils pressent, c'est la zone.
    expect(l.find((s) => s.ingredient === "pignons-pin")?.raison).toBe("s’abîme à la lumière");
    // Les pâtes ne craignent rien de leur zone : c'est le paquet qui est ouvert.
    expect(l.find((s) => s.ingredient === "pates")?.raison).toBe("paquet entamé");
  });

  test("chaque ligne dit où aller chercher", () => {
    // On ne sauve pas ce qu'on ne retrouve pas.
    expect(aSauver(catalogue).every((s) => s.zone.length > 0)).toBe(true);
    expect(aSauver(catalogue).find((s) => s.ingredient === "pomme-de-terre")?.zone).toBe("sous-évier");
  });
});
