import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { lireCatalogue } from "./catalogue";
import { fractionDe } from "./axe";
import { aEcouler, aSauver, bonusPlacard, PLAFOND_ARTICLES } from "./gardeManger";
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

describe("ce que le placard offre à écouler", () => {
  test("un paquet entamé porte une horloge, et c'est la seule que cuisiner arrête", () => {
    // Trois fonds de paquet de pâtes entamés et rien d'autre. `moyenne` se
    // projette à 0,4 : la barrière est rompue, l'horloge tourne, et finir le
    // paquet ce soir l'arrête pour de bon.
    expect(aEcouler(catalogue).get("pates")).toBe(fractionDe("moyenne"));
  });

  test("le frais du primeur est nommé mais plus payé", () => {
    // T60. L'app a raison de dire que ces oignons courent — ils restent dans
    // « à sauver » — mais les pousser au dîner revenait à pousser les 42 % de
    // plats qui contiennent un oignon.
    expect(aEcouler(catalogue).has("pomme-de-terre")).toBe(false);
    expect(aSauver(catalogue).some((s) => s.ingredient === "pomme-de-terre")).toBe(true);
  });

  test("LE SOUS-ÉVIER N'EST PAS LA RAISON, ET C'EST LA MESURE QUI LE DIT", () => {
    // Le ticket voulait écarter du score « ce que la zone abîme ». Sur le relevé
    // du 26/08 ce geste-là ne fait rien : les quatre légumes sous l'évier sont
    // `frais`, et l'export tranche sur le frais AVANT de regarder la zone. Ils
    // seraient tout aussi pressés dans une cave sèche. Si ce test tombe un jour,
    // c'est que le relevé a changé — pas que la règle est fausse.
    const sousEvier = catalogue.gardeManger.denrees.filter((d) => d.zone === "sous-evier");
    expect(sousEvier).toHaveLength(4);
    expect(sousEvier.every((d) => d.etat === "frais")).toBe(true);
  });

  test("un sachet que sa zone abîme ne paie pas non plus : c'est un geste de rangement", () => {
    // Les pignons sont secs et scellés ; s'ils pressent, c'est la lumière et la
    // bouilloire. Ça se corrige en les déplaçant, pas en dînant — et l'app le dit
    // déjà, à sa place, dans « À déplacer ».
    expect(aEcouler(catalogue).has("pignons-pin")).toBe(false);
    expect(catalogue.gardeManger.alertes.some((a) => a.includes("pignons"))).toBe(true);
  });

  test("une conserve scellée n'entre pas sur l'axe", () => {
    // Elle n'est pas « au début de sa vie » : elle n'a pas d'horloge du tout.
    expect(aEcouler(catalogue).has("mais")).toBe(false);
  });

  test("un ingrédient absent du placard n'a pas d'entrée", () => {
    expect(aEcouler(catalogue).has("saumon")).toBe(false);
  });
});

describe("ce qu'un plat sauve", () => {
  const u = aEcouler(catalogue);

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

  test("LE PLACARD VAUT EXACTEMENT CE QU'IL VALAIT AVANT L'AXE", () => {
    // La promesse de T57 : 0,4 × `ecoule: 5` rend l'ancien
    // `ecoule_placard_entame: 2`, au point près. Ce bloc donne une échelle au
    // placard, il ne lui donne pas un poids neuf — et le jour où l'on voudra
    // qu'il pèse plus, ça se décidera dans `equilibre.yaml`.
    expect(bonusPlacard(catalogue, platAvec(["pates"]), u, poids).score).toBe(2);
  });

  test("LE SCORE CUMULE — un plat qui sauve trois choses vaut mieux qu'un qui en sauve une", () => {
    // La règle « un seul bonus par plat » est abandonnée (T59). Elle défendait
    // contre le bruit des aromates ubiquitaires ; T60 les a retirés à la source,
    // et le remède n'a plus rien à soigner.
    const un = bonusPlacard(catalogue, platAvec(["pates"]), u, poids).score;
    const trois = bonusPlacard(
      catalogue,
      platAvec(["pates", "biscottes", "poudre-amande"]),
      u,
      poids,
    ).score;
    expect(trois).toBe(3 * un);
  });

  test("PAS DE DÉGRESSIVITÉ : les trois premiers comptent plein", () => {
    const forte = new Map([["a", 1], ["b", 1], ["c", 1]]);
    expect(bonusPlacard(catalogue, platAvec(["a", "b", "c"]), forte, poids).score).toBe(
      3 * (poids["ecoule"] ?? 0),
    );
  });

  test("au-delà de trois articles le plat ne gagne plus rien", () => {
    // Le quatrième ne dit plus rien de neuf sur ce plat-là : il dit qu'il a une
    // longue liste d'ingrédients, et `article_marginal` la fait déjà payer.
    const m = new Map([["a", 1], ["b", 1], ["c", 1], ["d", 1]]);
    const trois = bonusPlacard(catalogue, platAvec(["a", "b", "c"]), m, poids);
    const cinq = bonusPlacard(catalogue, platAvec(["a", "b", "c", "d", "e"]), m, poids);
    expect(cinq.score).toBe(trois.score);
    // Mais la LISTE, elle, dit tout ce que le plat sauve : la phrase ne ment pas
    // pour justifier le chiffre.
    expect(cinq.noms).toHaveLength(4);
    expect(PLAFOND_ARTICLES).toBe(3);
  });

  test("le plafond coupe la queue de la liste, pas un article au hasard", () => {
    // Les plus pressés d'abord. Sans cet ordre, le plafond retiendrait ce que
    // l'ordre des lignes de la recette met en tête — un fait sur la rédaction du
    // fichier, pas sur ce que le plat sauve.
    const m = new Map([
      ["tard", 0.4],
      ["tot", 1],
      ["milieu", 0.8],
    ]);
    const c = bonusPlacard(catalogue, platAvec(["tard", "tot", "milieu", "absent"]), m, poids);
    expect(c.noms).toEqual(["tot", "milieu", "tard"]);
    expect(c.score).toBe(11);
  });

  test("le mot suit le même axe que le chiffre", () => {
    // `urgent` n'est pas un rang à part : c'est le seuil haut de T57, franchi par
    // le plus pressé des articles. Le placard seul ne l'atteint plus — il n'offre
    // que des paquets entamés à 0,4 — et c'est le dépôt qui le fera, avec T47.
    expect(bonusPlacard(catalogue, platAvec(["pates"]), u, poids).urgent).toBe(false);
    expect(bonusPlacard(catalogue, platAvec(["a"]), new Map([["a", 1]]), poids).urgent).toBe(true);
  });

  test("UNE DENRÉE QU'AUCUN PLAT NE CONSOMME NE PEUT RIEN BRUITER", () => {
    // T60 (a). Ce n'est pas un filtre, c'est la forme de la boucle : on part des
    // lignes du PLAT et on cherche dedans, jamais l'inverse. Une propriété vraie
    // par accident se perd au premier refactor, donc on l'épingle ici. Les quatre
    // du relevé du 26/08 sont du petit-déjeuner qu'aucune recette de dîner ne
    // mange : elles ne peuvent pas être sauvées en cuisinant.
    const horsRecette = ["cracotte", "krisprolls", "ble-lentilles", "farine-epeautre"];
    for (const id of horsRecette) expect(aEcouler(catalogue).has(id)).toBe(true);
    for (const p of catalogue.plats) {
      const noms = bonusPlacard(catalogue, p, u, poids).noms;
      for (const id of horsRecette) expect(noms).not.toContain(id.replace(/-/g, " "));
    }
  });

  test("un ingrédient cité deux fois ne compte qu'une", () => {
    // Une recette peut nommer les pâtes dans le plat ET dans la garniture.
    // Les payer deux fois récompenserait la façon dont la recette est écrite.
    const deux = bonusPlacard(catalogue, platAvec(["pates", "pates"]), u, poids);
    expect(deux.noms).toEqual(["pates"]);
    expect(deux.score).toBe(2);
  });

  test("une ligne `from_accepts` est ignorée", () => {
    // Elle réclame une base cuisinée — « 250 g de lentilles cuites » — pas une
    // matière première. Le chaînage a ses propres poids pour ça.
    expect(bonusPlacard(catalogue, platAvec([], ["pates"]), u, poids).score).toBe(0);
  });

  test("les noms sortent lisibles, pas en identifiants", () => {
    expect(bonusPlacard(catalogue, platAvec(["poudre-amande"]), u, poids).noms).toEqual([
      "poudre amande",
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
