// Ce que la proposition de 15 h DIT — les phrases, par promesse (T128, T129).

import { describe, expect, test } from "vitest";
import type { CarteDuSoir, LotMange } from "../model/pause";
import { ceQuiAttend, de, ligneAchats, ligneHeure, phraseDuLot, raison } from "./ceSoir.vue";

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
