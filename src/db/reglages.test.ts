// Ce qui a été sorti du congélateur hier soir — le « Fait » du geste du jour
// qui ferme la boucle de la décongélation (19/10).

import { describe, expect, test } from "vitest";
import { cleGeste, typesSortis, veilleDe } from "./reglages";

describe("ce qui a été sorti du congélo hier soir", () => {
  test("la veille se compte au calendrier, mois et année compris", () => {
    expect(veilleDe("2026-10-19")).toBe("2026-10-18");
    expect(veilleDe("2026-11-01")).toBe("2026-10-31");
    expect(veilleDe("2027-01-01")).toBe("2026-12-31");
  });

  test("seuls les gestes COCHÉS de la VEILLE comptent", () => {
    const r = [
      { cle: cleGeste("2026-10-18", "lasagnes"), valeur: true },
      { cle: cleGeste("2026-10-18", "poulet-cuit"), valeur: false },
      { cle: cleGeste("2026-10-17", "gratin-pates"), valeur: true },
      { cle: cleGeste("2026-10-19", "quiche"), valeur: true },
    ];
    expect([...typesSortis(r, "2026-10-19")]).toEqual(["lasagnes"]);
  });
});
