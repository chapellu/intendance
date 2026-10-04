// CE QUE LA SORTIE PROMET.
//
// Une seule phrase à tenir, celle du 24/09 : « mettre une part dans tel
// Tupperware, deux parts dans celui-ci, un au frigo l'autre au congélateur ».
// Les promesses ci-dessous la découpent en règles, et chacune est écrite contre
// le foyer RÉEL — ses 8 boîtes, ses 12 bocaux, ses 20 sacs — parce qu'une
// répartition juste sur des contenants inventés ne dit rien de celle qu'on
// lira ce soir.

import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { lireCatalogue } from "../model/catalogue";
import type { Catalogue, Emit, Plat } from "../model/types";
import {
  boitesPour,
  bougerLeLot,
  DESTINATIONS,
  phraseDesBoites,
  phraseHorsBoite,
  plafondDuLot,
  quantiteDuLot,
  rangerAilleurs,
  retouchesDe,
  vueDeLaSortie,
  vueRetouchee,
} from "./sortie.vue";

const catalogue: Catalogue = lireCatalogue(
  JSON.parse(readFileSync("public/cuisine-data.json", "utf8")) as unknown,
);
const foyer = catalogue.foyer;

const emit = (o: Partial<Emit>): Emit => ({
  type: "ratatouille",
  kind: "reste-plat",
  qty: null,
  band: "2-repas",
  espace: "congelo",
  note: null,
  gardeFrigo: 3,
  congelo: true,
  ...o,
});

const plat = (emits: Emit[]): Plat =>
  ({ id: "essai", titre: "Essai", portions: 4, emits, accepts: [], ingredients: [] }) as unknown as Plat;

describe("« un Tupperware au frigo, l'autre au congélateur »", () => {
  test("un reste congelable de deux repas se coupe en deux endroits", () => {
    const v = vueDeLaSortie(plat([emit({ band: "2-repas" })]), 2.5, 1, foyer);
    expect(v.lots.map((l) => [l.location, l.repas])).toEqual([
      ["frigo", 1],
      ["congelo", 1],
    ]);
  });

  test("le premier repas reste au frigo, et il y tient le nombre de jours de la recette", () => {
    // LA RAISON DU DÉCOUPAGE, ET PAS SEULEMENT SA FORME. Ce qu'on mangera
    // demain n'a pas à passer par le congélateur — l'en congeler serait un
    // geste à défaire — et c'est `gardeFrigo` qui dit jusqu'à quand.
    const [frais] = vueDeLaSortie(plat([emit({ band: "3-repas", gardeFrigo: 4 })]), 2.5, 1, foyer).lots;
    expect(frais!.location).toBe("frigo");
    expect(frais!.garde).toBe(4);
  });

  test("au congélateur, l'écran ne raconte aucune fenêtre", () => {
    // Le forfait du congélateur appartient à `Depot` (`horlogesDu`). Le
    // recopier ici en ferait une seconde vérité, qui divergerait un jour.
    const froid = vueDeLaSortie(plat([emit({ band: "2-repas" })]), 2.5, 1, foyer).lots[1]!;
    expect(froid.location).toBe("congelo");
    expect(froid.garde).toBeNull();
  });

  test("un reste qui ne se congèle pas reste entier au frigo", () => {
    const v = vueDeLaSortie(
      plat([emit({ band: "3-repas", congelo: false, espace: "frigo" })]),
      2.5,
      1,
      foyer,
    );
    expect(v.lots).toHaveLength(1);
    expect(v.lots[0]!.location).toBe("frigo");
    expect(v.lots[0]!.repas).toBe(3);
  });

  test("un dessert glacé ne passe pas par le frigo", () => {
    // Les trois emits à `gardeFrigo: 0` du corpus sont des desserts glacés :
    // zéro jour de frigo ne veut pas dire « à jeter demain », ça veut dire
    // « ça n'a aucune vie au frigo ».
    const v = vueDeLaSortie(plat([emit({ band: "2-repas", gardeFrigo: 0 })]), 2.5, 1, foyer);
    expect(v.lots.map((l) => l.location)).toEqual(["congelo"]);
    expect(v.lots[0]!.repas).toBe(2);
  });

  test("un repas unique ne se coupe pas — il n'y a rien à mettre de côté", () => {
    const v = vueDeLaSortie(plat([emit({ band: "lunchbox" })]), 2.5, 1, foyer);
    expect(v.lots).toHaveLength(1);
    expect(v.lots[0]!.location).toBe("frigo");
  });
});

describe("ce qu'on met dans la boîte", () => {
  test("le poids se partage au prorata des repas", () => {
    const v = vueDeLaSortie(
      plat([emit({ band: "2-repas", qty: { amount: 500, unit: "g" } })]),
      2.5,
      1,
      foyer,
    );
    expect(v.lots.map((l) => l.qty)).toEqual([250, 250]);
    expect(v.lots.map((l) => l.unite)).toEqual(["g", "g"]);
  });

  test("l'échelle multiplie le poids ET les repas", () => {
    const v = vueDeLaSortie(
      plat([emit({ band: "2-repas", qty: { amount: 500, unit: "g" } })]),
      5,
      2,
      foyer,
    );
    expect(v.lots.map((l) => l.repas)).toEqual([1, 3]);
    expect(v.lots.map((l) => l.qty)).toEqual([250, 750]);
  });

  test("un emit qui ne chiffre rien se compte en repas, et le poids ne s'invente pas", () => {
    // 91 des 126 emits du corpus ont `qty: null`. L'écran qui réclamait
    // « 200 g » n'aura donc un poids que sur un emit sur trois.
    const v = vueDeLaSortie(plat([emit({ band: "2-repas", qty: null })]), 2.5, 1, foyer);
    expect(v.lots.every((l) => l.qty === null)).toBe(true);
    expect(quantiteDuLot(v.lots[1]!)).toBe("1 repas");
  });

  test("la bande se redécoupe quand l'emit se sépare, et reste intacte sinon", () => {
    // `band` est ce que le budget de rangement compte. Deux lots qui portent
    // tous les deux « 3-repas » occuperaient six places pour trois repas.
    const coupe = vueDeLaSortie(plat([emit({ band: "3-repas" })]), 2.5, 1, foyer).lots;
    expect(coupe.map((l) => l.band)).toEqual(["1-repas", "2-repas"]);

    const entier = vueDeLaSortie(plat([emit({ band: "lunchbox" })]), 2.5, 1, foyer).lots;
    expect(entier[0]!.band).toBe("lunchbox");
  });
});

describe("les contenants du foyer", () => {
  test("le plus gros qui tient passe devant, puis on complète", () => {
    // Le foyer déclare des bocaux de 2 portions et des boîtes de 1.
    expect(boitesPour(foyer, "frigo", 3)).toEqual([
      { label: "bocaux Le Parfait 0,75 L", nombre: 1 },
      { label: "boîtes hermétiques 0,5 / 1 L", nombre: 1 },
    ]);
  });

  test("les boîtes qui se lavent passent devant les sacs qu'on rachète", () => {
    // Au congélateur, le foyer a 8 boîtes hermétiques et 20 sacs — tous deux
    // d'une portion. Proposer le sac d'abord dépenserait un consommable pour
    // épargner une vaisselle.
    expect(boitesPour(foyer, "congelo", 2)).toEqual([
      { label: "boîtes hermétiques 0,5 / 1 L", nombre: 2 },
    ]);
  });

  test("un reste plus petit qu'un contenant en reçoit quand même un", () => {
    const foyerAuxBocaux = {
      ...foyer,
      contenants: foyer.contenants.filter((c) => c.portions === 2),
    };
    expect(boitesPour(foyerAuxBocaux, "frigo", 1)).toEqual([
      { label: "bocaux Le Parfait 0,75 L", nombre: 1 },
    ]);
  });

  test("un espace sans contenant déclaré ne reçoit aucune boîte", () => {
    // On se tait plutôt que d'inventer un contenant que le foyer n'a pas.
    expect(boitesPour({ ...foyer, contenants: [] }, "congelo", 2)).toEqual([]);
  });

  test("le compte se lit « 2 × », sans accorder un pluriel qu'on n'a pas saisi", () => {
    expect(phraseDesBoites(boitesPour(foyer, "frigo", 3))).toBe(
      "1 × bocaux Le Parfait 0,75 L + 1 × boîtes hermétiques 0,5 / 1 L",
    );
  });
});

describe("ce que la sortie dit du reste", () => {
  test("les parts du soir passent à table, et c'est le troisième endroit", () => {
    // « Deux parts dans celui-ci et le reste dans les assiettes » : l'écran
    // range deux destinations et nomme la troisième.
    expect(vueDeLaSortie(plat([emit({})]), 2.5, 1, foyer).table).toBe(2.5);
  });

  test("un plat qui ne laisse rien le dit, au lieu de montrer une liste vide", () => {
    const v = vueDeLaSortie(plat([]), 2.5, 1, foyer);
    expect(v.rien).toBe(true);
    expect(v.lots).toEqual([]);
  });

  test("la ratatouille du 24/09, telle que le corpus la porte", () => {
    // LE CAS QUI A OUVERT LE TICKET, contre le catalogue réel et pas une
    // maquette : 500 g, une lunchbox, trois jours de frigo, congelable.
    const p = catalogue.plats.find((x) => x.id === "ratatouille-minute")!;
    const v = vueDeLaSortie(p, foyer.parts, 1, foyer);
    expect(v.lots).toHaveLength(1);
    expect(v.lots[0]!.location).toBe("frigo");
    expect(v.lots[0]!.garde).toBe(3);
    expect(quantiteDuLot(v.lots[0]!)).toBe("500 g");
    expect(phraseDesBoites(v.lots[0]!.boites)).toBe("1 × boîtes hermétiques 0,5 / 1 L");
  });
});

describe("le conseil de la recette, au moment où il sert", () => {
  test("la note de l'emit se dit une fois, sur le premier morceau", () => {
    // « Meilleure réchauffée le lendemain » parle du reste, pas de la boîte :
    // sur les deux morceaux, elle se lirait comme deux conseils.
    const v = vueDeLaSortie(
      plat([emit({ band: "2-repas", note: "meilleure réchauffée le lendemain" })]),
      2.5,
      1,
      foyer,
    );
    expect(v.lots.map((l) => l.note)).toEqual(["meilleure réchauffée le lendemain", null]);
  });
});

// CE QUE « J'AI FAIT AUTREMENT » PROMET — T102.
//
// Une phrase à tenir, celle du 03/10 : « quand j'ai cliqué sur "j'ai fait
// autrement" pour ranger le reste, rien ne m'a été proposé ». Les promesses
// ci-dessous disent ce qui est proposé à la place, et chacune part de la
// PROPOSITION — corriger, c'est bouger ce que l'app a calculé, pas le retaper.
describe("la sortie qu'on corrige", () => {
  /** La proposition d'un emit de 3 repas congelable : 1 au frigo, 2 au froid. */
  const troisRepas = () => {
    const p = plat([emit({ band: "3-repas", qty: { amount: 600, unit: "g" } })]);
    return { p, lots: vueDeLaSortie(p, 2.5, 1, foyer).lots };
  };

  test("la correction part de la proposition, à l'identique", () => {
    // SI ELLE PARTAIT DE ZÉRO, elle jetterait l'arithmétique qui marche — et
    // la ferait retaper à quelqu'un qui a les mains grasses.
    const { lots } = troisRepas();
    expect(retouchesDe(lots)).toEqual([
      { location: "frigo", repas: 1 },
      { location: "congelo", repas: 2 },
    ]);
  });

  test("« tout est allé au congélateur » est un tap, et la quantité ne bouge pas", () => {
    const { p, lots } = troisRepas();
    const v = vueRetouchee(p, 1, foyer, lots, rangerAilleurs(retouchesDe(lots), 0, "congelo"));
    expect(v.lots.map((l) => [l.location, l.repas])).toEqual([
      ["congelo", 1],
      ["congelo", 2],
    ]);
    expect(v.horsBoite).toBe(0);
  });

  test("passer un lot au congélateur lui retire sa fenêtre de garde", () => {
    // `gardeFrigo` est une affaire de frigo. Un lot qui part au froid et garde
    // « 3 j · à manger » afficherait une horloge qui ne court plus.
    const { p, lots } = troisRepas();
    const v = vueRetouchee(p, 1, foyer, lots, rangerAilleurs(retouchesDe(lots), 0, "congelo"));
    expect(v.lots[0]!.garde).toBeNull();
    // Et dans l'autre sens : ramené au frigo, le lot congelé la retrouve.
    const r = vueRetouchee(p, 1, foyer, lots, rangerAilleurs(retouchesDe(lots), 1, "frigo"));
    expect(r.lots[1]!.garde).toBe(3);
  });

  test("un cran de moins refait le poids, la bande ET la boîte", () => {
    // TOUT EN DÉPEND, DONC TOUT SE RECALCULE. Un écran qui n'en reprendrait
    // qu'une partie afficherait « 1 repas · 2 × boîtes », et c'est la ligne qui
    // fait douter de tout le reste de l'écran.
    const { p, lots } = troisRepas();
    const v = vueRetouchee(p, 1, foyer, lots, bougerLeLot(lots, retouchesDe(lots), 1, -1));
    const froid = v.lots[1]!;
    expect([froid.repas, froid.band, froid.qty]).toEqual([1, "1-repas", 200]);
    expect(phraseDesBoites(froid.boites)).toBe("1 × boîtes hermétiques 0,5 / 1 L");
  });

  test("le plafond d'un lot est celui de son emit, partagé avec l'autre morceau", () => {
    // Un emit de 3 repas coupé en 1 + 2 : le premier peut monter à 2 — tant
    // que le second redescend. Laisser chacun monter à 3 rangerait six repas
    // d'un plat qui en a laissé trois, et le budget les compterait tous les six.
    const { lots } = troisRepas();
    const r = retouchesDe(lots);
    expect(plafondDuLot(lots, r, 0)).toBe(1);
    expect(plafondDuLot(lots, r, 1)).toBe(2);

    const videLeFroid = bougerLeLot(lots, bougerLeLot(lots, r, 1, -1), 1, -1);
    expect(videLeFroid[1]!.repas).toBe(0);
    expect(plafondDuLot(lots, videLeFroid, 0)).toBe(3);
  });

  test("un cran de plus s'arrête au plafond, et un cran de moins à zéro", () => {
    const { lots } = troisRepas();
    const r = retouchesDe(lots);
    expect(bougerLeLot(lots, r, 0, +1)[0]!.repas).toBe(1);
    expect(bougerLeLot(lots, bougerLeLot(lots, r, 0, -1), 0, -1)[0]!.repas).toBe(0);
  });

  test("zéro repas veut dire « pas gardé » : pas de boîte, et rien en base", () => {
    const { p, lots } = troisRepas();
    const v = vueRetouchee(p, 1, foyer, lots, bougerLeLot(lots, retouchesDe(lots), 0, -1));
    expect(v.lots[0]!.repas).toBe(0);
    expect(v.lots[0]!.boites).toEqual([]);
    // La ligne reste à l'écran — c'est le seul endroit d'où l'on peut revenir
    // sur le cran de trop — mais elle ne part pas en base.
    expect(v.gardes).toHaveLength(1);
    expect(v.gardes[0]!.location).toBe("congelo");
  });

  test("ce qui n'est rangé nulle part se compte, au lieu de disparaître", () => {
    // Descendre un lot de deux repas à un, c'est déclarer qu'on en a mangé un
    // de plus. Une ligne qui rétrécit sans un mot est la perte silencieuse que
    // T100 venait de réparer à l'autre bout de l'app.
    const { p, lots } = troisRepas();
    const un = vueRetouchee(p, 1, foyer, lots, bougerLeLot(lots, retouchesDe(lots), 1, -1));
    expect(un.horsBoite).toBe(1);

    const rien = retouchesDe(lots).map((r) => ({ ...r, repas: 0 }));
    const tout = vueRetouchee(p, 1, foyer, lots, rien);
    expect(tout.horsBoite).toBe(3);
    // ET `gardes` EST VIDE, ce qui est une réponse — `journaliserCuisson` ne la
    // confond plus avec l'absence de réponse.
    expect(tout.gardes).toEqual([]);
  });

  test("ce qui n'est rangé nulle part s'écrit en français, singulier compris", () => {
    // LA PREMIÈRE VERSION VIVAIT DANS LE JSX, en trois ternaires imbriqués, et
    // elle affichait « 1 repas ne est rangé ». Une phrase est une valeur.
    expect(phraseHorsBoite(1)).toContain("1 repas n’est rangé nulle part");
    expect(phraseHorsBoite(3)).toContain("3 repas ne sont rangés nulle part");
    // ET ELLE DIT CE QUE LA BASE NE RETIENDRA PAS : il n'y a pas d'événement
    // « mangé » dans ce dépôt, donc l'écran est le seul endroit où ça se dit.
    expect(phraseHorsBoite(1)).toContain("n’en gardera pas la trace");
  });

  test("un lot remonté à la taille de son emit retrouve la bande du corpus", () => {
    // `band` est ce que le budget de rangement compte, et le corpus la nomme —
    // `lunchbox`, pas « 1-repas ». Elle ne se redécoupe que quand l'emit se
    // SÉPARE, et une correction qui déplace un lot entier ne le sépare pas :
    // réécrire « 1-repas » par-dessus `lunchbox` perdrait le nom que le
    // catalogue donne, pour une valeur que `bandRepas` calcule déjà.
    const p = plat([emit({ band: "lunchbox", congelo: false, espace: "frigo" })]);
    const lots = vueDeLaSortie(p, 2.5, 1, foyer).lots;
    const v = vueRetouchee(p, 1, foyer, lots, rangerAilleurs(retouchesDe(lots), 0, "congelo"));
    expect(v.lots[0]!.band).toBe("lunchbox");
  });

  test("le placard n'est pas une destination de fin de cuisson", () => {
    // Les 12 bocaux Le Parfait le déclarent — c'est vrai d'un bocal vide et de
    // conserves stérilisées — mais rien dans le corpus ne dit qu'une
    // ratatouille du soir se stérilise. L'offrir en un tap ferait affirmer à la
    // base une conservation que personne n'a mesurée.
    expect(DESTINATIONS).toEqual(["frigo", "congelo"]);
    expect(foyer.contenants.some((c) => c.espaces.includes("placard"))).toBe(true);
  });

  test("la ratatouille du 03/10, corrigée au congélateur", () => {
    // LE CAS QUI A OUVERT LE TICKET, contre le catalogue réel : un seul lot,
    // 500 g, une lunchbox qui ne se coupe pas. « J'ai fait autrement » n'avait
    // donc rien à proposer même en principe — et c'est l'endroit où ça se voit.
    const p = catalogue.plats.find((x) => x.id === "ratatouille-minute")!;
    const lots = vueDeLaSortie(p, foyer.parts, 1, foyer).lots;
    const v = vueRetouchee(p, 1, foyer, lots, rangerAilleurs(retouchesDe(lots), 0, "congelo"));
    expect(v.gardes.map((l) => [l.location, l.band, l.qty])).toEqual([
      ["congelo", "lunchbox", 500],
    ]);
    expect(v.gardes[0]!.garde).toBeNull();
    expect(phraseDesBoites(v.gardes[0]!.boites)).toBe("1 × boîtes hermétiques 0,5 / 1 L");
  });
});
