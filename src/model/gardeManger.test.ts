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

describe("l'autre issue : transformer au lieu de cuisiner", () => {
  const l = aSauver(catalogue);
  const de = (id: string) => l.find((s) => s.ingredient === id)!;

  test("LE BAIN-MARIE N'EST PROPOSÉ SUR AUCUNE DENRÉE PEU ACIDE", () => {
    // LE CONTRÔLE LE PLUS IMPORTANT DE CE FICHIER. `conservation.yaml` le dit
    // en tête : sur un aliment peu acide, un bocal stérilisé au bain-marie et
    // rangé à température ambiante est exactement le milieu anaérobie où
    // prolifère C. botulinum. Le défaut d'acidité est `basse`, aucune denrée du
    // relevé n'est déclarée acide, donc la méthode ne doit sortir nulle part.
    for (const s of l)
      for (const c of [...s.conserver, ...s.verrouille])
        expect(c.id).not.toBe("bocal-bain-marie");
  });

  test("le frigo n'est pas une conservation de matière première", () => {
    // Sa fenêtre est `household.fridge_window_days` — l'horloge des RESTES. Un
    // sachet de farine ne périme pas en quatre jours parce qu'on l'a mis au
    // frais, et y ranger un ingrédient est un choix de rangement, que les zones
    // portent déjà.
    for (const s of l)
      for (const c of [...s.conserver, ...s.verrouille]) expect(c.id).not.toBe("frigo");
  });

  test("le congélateur est acquis, et c'est la réponse pour presque tout", () => {
    expect(de("farine-epeautre").conserver.map((c) => c.id)).toContain("congeler");
    expect(de("pignons-pin").conserver.map((c) => c.id)).toContain("congeler");
    expect(de("oignon").conserver[0]?.fenetre).toBe("3 mois");
  });

  test("la pomme de terre crue ne va PAS au congélateur", () => {
    // `conserve_mal: [congeler]` — l'exception que le modèle général ne devine
    // pas : crue, elle devient farineuse et noircit. C'est la seule denrée du
    // relevé sans aucune issue de conservation, donc la seule qui n'a vraiment
    // qu'une sortie : la cuisiner.
    expect(de("pomme-de-terre").conserver).toHaveLength(0);
  });

  test("on ne lacto-fermente pas de la farine", () => {
    // `applique_a: [legume-cru]`. Le champ dormait dans conservation.yaml,
    // déclaré et jamais lu ; c'est ce module qui en est le premier lecteur.
    const ids = (id: string) => [...de(id).conserver, ...de(id).verrouille].map((c) => c.id);
    expect(ids("farine-epeautre")).not.toContain("lacto-fermentation");
    expect(ids("oignon")).toContain("lacto-fermentation");
  });

  test("ce qui est verrouillé nomme le kit et le geste", () => {
    const lacto = de("oignon").verrouille.find((c) => c.id === "lacto-fermentation");
    expect(lacto?.manque).toBe("bocaux à joint caoutchouc");
    expect(lacto?.noeud).toBe("Lacto-fermenter un légume");
  });
});
