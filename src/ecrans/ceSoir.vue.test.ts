// Ce que la proposition de 15 h DIT — les phrases, par promesse (T128, T129).

import { describe, expect, test } from "vitest";
import type { CarteDuSoir, LotMange } from "../model/pause";
import { ceQuiAttend, classeAchats, de, ligneAchats, ligneHeure, nomCourt, phraseDuLot, raison } from "./ceSoir.vue";

const lot = (o: Partial<LotMange>): LotMange => ({
  type: "lentilles",
  kind: "reste-plat",
  location: "frigo",
  band: "2-repas",
  joursRestants: 1,
  ...o,
});

const carte = (o: Partial<CarteDuSoir>): CarteDuSoir =>
  ({
    plat: { titre: "Un plat", apports: { proteine: "aucune", feculent: "aucun", legumes: [] }, format: null },
    manque: [],
    horsSaison: [],
    aCote: [],
    presse: null,
    attend: null,
    horaire: { total: 40, actif: 15, rattrape: 40 },
    tient: true,
    parRattrapage: false,
    pret: 15 * 60 + 40,
    recent: false,
    score: 0,
    ...o,
  }) as CarteDuSoir;

describe("un lot se dit comme on le dirait en ouvrant le frigo", () => {
  test("le congélateur se dit en repas : « 3 repas d'escalopes au congélo »", () => {
    expect(phraseDuLot(lot({ type: "escalopes", location: "congelo", band: "3-repas" }))).toBe(
      "3 repas d’escalopes au congélo",
    );
  });

  test("un reste du frigo se dit par son délai : « à finir demain »", () => {
    expect(phraseDuLot(lot({}))).toBe("le reste de lentilles est à finir demain");
    expect(phraseDuLot(lot({ joursRestants: 0 }))).toBe("le reste de lentilles est à finir aujourd’hui");
  });

  test("aucune phrase ne dit « à jeter » : les fenêtres ordonnent, elles ne condamnent pas", () => {
    for (const j of [0, 1, 5])
      for (const location of ["frigo", "congelo"] as const)
        expect(phraseDuLot(lot({ joursRestants: j, location }))).not.toMatch(/jeter/);
  });

  test("deux lots au plus sur la ligne, le plus pressé d'abord", () => {
    const l = [lot({ type: "a" }), lot({ type: "b" }), lot({ type: "c" })];
    expect(ceQuiAttend(l).split(" · ")).toHaveLength(2);
  });

  test("l'élision", () => {
    expect(de("escalopes")).toBe("d’escalopes");
    // Le h aspiré ne s’élide pas : « de haricots », jamais « d’haricots ».
    expect(de("haricots")).toBe("de haricots");
    expect(de("lentilles")).toBe("de lentilles");
  });
});

describe("la ligne qui décide à 15 h : ce qu'il faut acheter", () => {
  test("zéro, un — nommé —, plusieurs", () => {
    expect(ligneAchats(carte({}))).toBe("Rien à acheter");
    expect(ligneAchats(carte({ manque: [{ id: "creme", nom: "crème" }] }))).toBe("il manque : crème");
    expect(
      ligneAchats(carte({ manque: [{ id: "a", nom: "crème" }, { id: "b", nom: "lardons" }] })),
    ).toBe("il manque : crème et lardons");
  });
});

describe("un nom d'article tient sur une ligne — capture du 19/10", () => {
  const ORTIES = "pointes d'orties (ou fanes de navets ou de radis, ou jeunes pousses d'épinards, ou roquette)";

  test("les alternatives se disent en deux mots et un « … »", () => {
    expect(nomCourt(ORTIES)).toBe("orties (ou fanes, épinards…)");
  });

  test("ce qui tient reste tel quel", () => {
    expect(nomCourt("parmesan ou comté râpé")).toBe("parmesan ou comté râpé");
    expect(nomCourt("courge butternut (ou potimarron)")).toBe("courge butternut (ou potimarron)");
  });

  test("une glose après un tiret tombe, l'alternative reste", () => {
    expect(nomCourt("parmesan râpé (ou Grana Padano) — 150 g dans la garniture, 50 g sur le dessus")).toBe(
      "parmesan râpé (ou Grana Padano)",
    );
    expect(
      nomCourt("jarret de bœuf avec l'os (ou gîte, paleron — des morceaux « à braiser », donc à cuire longtemps)"),
    ).toBe("jarret de bœuf avec l'os (ou gîte, paleron)");
  });

  test("hors saison, la ligne le dit, en court", () => {
    const orties = { id: "orties", nom: ORTIES };
    const c = carte({ manque: [orties], horsSaison: [orties] });
    expect(ligneAchats(c)).toBe("il manque : orties (ou fanes, épinards…), hors saison");
    // L'œil lit la couleur avant les mots : ce n'est pas « un article ».
    expect(classeAchats(c)).toBe("plusieurs");
  });
});

describe("l'heure de début, pas la durée", () => {
  test("un plat qui tient se dit par l'heure où le lancer", () => {
    expect(ligneHeure(carte({}))).toBe("à lancer avant 17h20 · 15 min devant le feu");
  });

  test("un plat qui ne tient plus dit quand il sera prêt", () => {
    expect(ligneHeure(carte({ tient: false, pret: 19 * 60 + 5 }))).toBe("prêt vers 19h05 · 15 min devant le feu");
  });
});

describe("une raison, la première, dans l'ordre du rang", () => {
  test("ce qui presse passe devant ce qui attend, qui passe devant le reste", () => {
    expect(raison(carte({ presse: lot({}), attend: lot({ location: "congelo" }) }))).toMatch(/^finit le reste/);
    expect(raison(carte({ attend: lot({ type: "escalopes", location: "congelo", band: "3-repas" }) }))).toBe(
      "mange 3 repas d’escalopes au congélo",
    );
    expect(raison(carte({}))).toBeNull();
  });
});
