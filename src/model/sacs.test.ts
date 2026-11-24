// T198 — un sac de congélation sert une fois.
//
// Le 24/11 : « un sac n'est pas libre, il est jeté et il faut en racheter ».
// L'app comptait les vingt sacs comme un pool qui revient quand on mange ce
// qu'ils tenaient. Ils se comptent désormais au stock : rentrés par la liste,
// retirés à chaque rangement au congélateur, rachetés sous le minimum du fond.
import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { contenantsLibres } from "../ecrans/sortie.vue";
import { lireCatalogue } from "./catalogue";
import { contexte, rejouer, SACS, sacsEnReserve, type Evenement } from "./journal";
import { sousLeurPlancher } from "./plancherGardeManger";
import type { Catalogue } from "./types";

const catalogue: Catalogue = lireCatalogue(JSON.parse(readFileSync("public/cuisine-data.json", "utf8")));
const ctx = contexte(catalogue);

const boite = (jour: string): Evenement => ({
  sorte: "entree", jour, saisi: jour, maj: 1,
  lignes: [{ ingredient: SACS, unites: 1, parUnite: { amount: 20, unit: "pièce" }, zone: null, etat: "sec" }],
});
const cuisson = (jour: string, sacs: number, maj = 2): Evenement => ({
  sorte: "cuisine", jour, saisi: jour, maj, repas: "diner", plat: "banana-bread-avoine", parts: 4, sacs,
});

describe("les sacs de congélation se dépensent", () => {
  test("le fond les suit, et le foyer les déclare consommables", () => {
    expect(catalogue.fond?.denrees.some((d) => d.ingredient === SACS)).toBe(true);
    expect(catalogue.foyer.contenants.find((c) => c.id === SACS)?.consommable).toBe(true);
  });

  test("une boîte de 20 rentrée, deux cuissons en rangent 2 et 3 : il en reste 15", () => {
    const r = rejouer(catalogue, [boite("2026-11-02"), cuisson("2026-11-03", 2), cuisson("2026-11-04", 3, 3)], ctx, "2026-11-05");
    expect(sacsEnReserve(r)).toBe(15);
  });

  test("« En garder 1 » ne dit pas la taille : la boîte du fond fait 20 sacs, et la liste les redemande", () => {
    const garder: Evenement = { sorte: "entree", jour: "2026-11-02", saisi: "2026-11-02", maj: 1,
      lignes: [{ ingredient: SACS, unites: 1, parUnite: null, zone: null, etat: "sec" }] };
    expect(sacsEnReserve(rejouer(catalogue, [garder], ctx, "2026-11-02"), catalogue)).toBe(20);
    const r = rejouer(catalogue, [garder, cuisson("2026-11-03", 6)], ctx, "2026-11-04");
    expect(sacsEnReserve(r, catalogue)).toBe(14);
    const ligne = sousLeurPlancher(catalogue, r, [{ ingredient: SACS, niveau: 1 }]).find((l) => l.ingredient === SACS);
    expect(ligne).toBeDefined();
  });

  test("congeler une denrée du frigo prend un sac", () => {
    const deplacer: Evenement = { sorte: "deplacement", jour: "2026-11-03", saisi: "2026-11-03", maj: 2, ingredient: "poulet-filets", de: null, vers: "congelo", unites: null };
    const r = rejouer(catalogue, [boite("2026-11-02"), deplacer], ctx, "2026-11-04");
    expect(sacsEnReserve(r)).toBe(19);
  });

  test("manger ce qu'un sac tenait ne le rend pas : les sacs libres sont ceux du stock", () => {
    const foyer = catalogue.foyer;
    const auCongelo = [{ type: "compote-maison", kind: "reste-plat" as const, qty: null, qty_band: "2-repas", born: "2026-11-03", location: "congelo" as const, ref: "1" }];
    // Sans stock relevé, l'ancien compte : le nombre déclaré moins ce qui est rangé.
    expect(contenantsLibres(foyer, auCongelo).get(SACS)).toBe(18);
    // Au stock : 3 sacs, quoi que le congélateur tienne ou ait tenu.
    expect(contenantsLibres(foyer, [], new Map([[SACS, 3]])).get(SACS)).toBe(3);
    expect(contenantsLibres(foyer, auCongelo, new Map([[SACS, 3]])).get(SACS)).toBe(3);
  });
});
