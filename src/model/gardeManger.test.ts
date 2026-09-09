import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { lireCatalogue } from "./catalogue";
import { fractionDe } from "./axe";
import { aEcouler, aSauver, placardDuPlat } from "./gardeManger";
import type { Catalogue, Plat } from "./types";

const catalogue: Catalogue = lireCatalogue(
  JSON.parse(readFileSync("public/cuisine-data.json", "utf8")) as unknown,
);

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

describe("ce que le plat prend au placard", () => {
  const u = aEcouler(catalogue);
  const ids = (p: Plat) => placardDuPlat(catalogue, p, u).map((a) => a.id);

  test("CETTE FONCTION NE NOTE PLUS RIEN, ET C'EST LE CŒUR DE T47", () => {
    // Elle rendait un score, un plafond et une phrase. Le plafond est désormais
    // PARTAGÉ avec le dépôt — trois articles pour les deux stocks, pas trois
    // chacun — donc il ne peut plus se poser ici sans mentir. Ne reste que la
    // collecte, et `ecoulement()` tranche sur la somme entière.
    const un = placardDuPlat(catalogue, platAvec(["pates"]), u);
    expect(un).toEqual([{ id: "pates", fraction: fractionDe("moyenne"), ou: "placard" }]);
  });

  test("TOUT CE QUI SORT D'ICI EST MARQUÉ `placard`, et la phrase en dépend", () => {
    // Le score ne regarde plus d'où ça vient ; la PHRASE, si. L'app ne peut pas
    // dire « finit des paquets entamés : sauce bolognaise », donc chaque article
    // porte sa provenance jusqu'au bout.
    for (const p of catalogue.plats)
      for (const a of placardDuPlat(catalogue, p, u)) expect(a.ou).toBe("placard");
  });

  test("un plat qui ne touche à rien ne rapporte rien", () => {
    expect(placardDuPlat(catalogue, platAvec(["saumon", "creme"]), u)).toEqual([]);
  });

  test("une conserve ne paie pas : elle attendra", () => {
    // C'est le point du terme. `article_marginal` récompense déjà l'usage du
    // placard ; payer une deuxième fois le maïs ferait gagner les plats à
    // longue liste d'épicerie.
    expect(placardDuPlat(catalogue, platAvec(["mais", "thon-boite"]), u)).toEqual([]);
  });

  test("UNE DENRÉE QU'AUCUN PLAT NE CONSOMME NE PEUT RIEN BRUITER", () => {
    // T60 (a). Ce n'est pas un filtre, c'est la forme de la boucle : on part des
    // lignes du PLAT et on cherche dedans, jamais l'inverse. Une propriété vraie
    // par accident se perd au premier refactor, donc on l'épingle ici. Les quatre
    // du relevé du 26/08 sont du petit-déjeuner qu'aucune recette de dîner ne
    // mange : elles ne peuvent pas être sauvées en cuisinant.
    const horsRecette = ["cracotte", "krisprolls", "ble-lentilles", "farine-epeautre"];
    for (const id of horsRecette) expect(aEcouler(catalogue).has(id)).toBe(true);
    for (const p of catalogue.plats)
      for (const id of horsRecette) expect(ids(p)).not.toContain(id);
  });

  test("un ingrédient cité deux fois ne compte qu'une", () => {
    // Une recette peut nommer les pâtes dans le plat ET dans la garniture.
    // Les compter deux fois récompenserait la façon dont la recette est écrite —
    // et, depuis que le plafond est partagé, ça volerait en plus une place au
    // dépôt.
    expect(ids(platAvec(["pates", "pates"]))).toEqual(["pates"]);
  });

  test("une ligne `from_accepts` est ignorée", () => {
    // Elle réclame une base cuisinée — « 250 g de lentilles cuites » — pas une
    // matière première. Le DÉPÔT la compte de son côté, avec la vraie horloge du
    // lot ; la payer ici aussi la compterait deux fois dans la même somme, ce qui
    // n'était qu'un doublon avant T47 et serait maintenant une erreur.
    expect(placardDuPlat(catalogue, platAvec([], ["pates"]), u)).toEqual([]);
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
