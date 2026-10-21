// T143 — le relevé dicté du 21/10 : le catalogue gagne, zone par zone, sur ce
// que le téléphone a observé AVANT lui.
//
// LE CAS QUI A OUVERT LE TICKET : un téléphone qui porte un journal depuis
// septembre (un relevé de l'étagère, des cuissons, des courses) reçoit, au
// déploiement, un catalogue relevé le 21/10. Avant T143, l'amorce n'était lue
// qu'en tête du rejeu : le relevé de septembre passait APRÈS elle et effaçait
// ce que l'utilisateur venait de dicter.

import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { calculer } from "./calcul";
import { lireCatalogue } from "./catalogue";
import { creerJeu } from "./jeu";
import { contexte, rejouer, type Evenement } from "./journal";
import type { Catalogue } from "./types";

const catalogue: Catalogue = lireCatalogue(JSON.parse(readFileSync("public/cuisine-data.json", "utf8")));
const ctx = contexte(catalogue);
const AUJOURDHUI = "2026-10-23";

const releveZone = (zone: string, jour: string, constats: { ingredient: string; unites: number }[], maj = 1): Evenement =>
  ({ sorte: "observation", portee: "zone", zone, jour, saisi: jour, maj, constats }) as Evenement;

describe("T143 — le relevé du catalogue gagne sur les observations plus vieilles", () => {
  test("les zones relevées le 21/10 portent cette date ; le sous-évier garde le 26/08", () => {
    const z = (id: string) => catalogue.gardeManger.zones.find((x) => x.id === id)!;
    expect(catalogue.gardeManger.releve).toBe("2026-10-21");
    for (const id of ["dessus-etagere", "etagere-ouverte", "etagere-basse", "demi-lune-haute", "demi-lune-basse", "placard-haut"])
      expect(z(id).releve).toBe("2026-10-21");
    expect(z("sous-evier").releve).toBe("2026-08-26");
  });

  test("un relevé de l'étagère fait sur le téléphone en septembre ne cache pas celui du 21/10", () => {
    // En septembre, l'étagère du bas était relevée avec cinq boîtes de maïs et
    // rien d'autre. Le 21/10 en dit trois, et de la ratatouille.
    const vieux = releveZone("etagere-basse", "2026-09-15", [{ ingredient: "mais", unites: 5 }]);
    const r = rejouer(catalogue, [vieux], ctx, AUJOURDHUI);
    expect(r.parIngredient.get("mais")?.unites).toBe(3);
    expect(r.parIngredient.get("ratatouille-boite")?.unites).toBe(3);
    expect(r.parIngredient.get("mais")?.vuLe).toBe("2026-10-21");
  });

  test("une cuisson d'avant le 21/10 ne décompte pas une seconde fois ce que le relevé a vu", () => {
    const chili: Evenement = {
      sorte: "cuisine", jour: "2026-10-10", saisi: "2026-10-10", maj: 2, repas: "diner", plat: "chili-sin-carne", parts: 4,
    };
    const r = rejouer(catalogue, [chili], ctx, AUJOURDHUI);
    expect(r.parIngredient.get("mais")?.unites).toBe(3);
  });

  test("ce qui vient APRÈS le relevé le corrige, comme d'habitude", () => {
    const apres = releveZone("etagere-basse", "2026-10-22", [{ ingredient: "mais", unites: 1 }]);
    const r = rejouer(catalogue, [apres], ctx, AUJOURDHUI);
    expect(r.parIngredient.get("mais")?.unites).toBe(1);
    expect(r.parIngredient.has("ratatouille-boite")).toBe(true); // le dessus en a encore une
  });

  test("le sous-évier, non relevé le 21/10, garde ce que le téléphone en sait", () => {
    const vide = releveZone("sous-evier", "2026-09-15", []);
    const r = rejouer(catalogue, [vide], ctx, AUJOURDHUI);
    expect(r.parIngredient.has("pomme-de-terre")).toBe(false);
  });

  test("les courses sans rangement : effacées si le relevé les compte, gardées sinon", () => {
    // Samedi 17/10, le fond rentre par la liste (sans zone, posé en
    // placard-haut) : du riz, que le relevé du placard haut a compté, et des
    // épinards surgelés, qu'aucun relevé du 21/10 n'a pu voir.
    const courses: Evenement = {
      sorte: "entree", jour: "2026-10-17", saisi: "2026-10-17", maj: 1,
      lignes: [
        { ingredient: "riz", unites: 2, parUnite: { amount: 1000, unit: "g" }, zone: null, etat: "sec" },
        { ingredient: "epinards-surgeles", unites: 2, parUnite: null, zone: null, etat: "sec" },
      ],
    };
    const r = rejouer(catalogue, [courses], ctx, AUJOURDHUI);
    expect(r.parIngredient.get("riz")?.unites).toBe(1); // le demi-bocal du relevé
    expect(r.parIngredient.get("epinards-surgeles")?.unites).toBe(2);
  });

  test("avant le 21/10, rien ne change : le rejeu d'un jour passé ne voit pas le relevé à venir", () => {
    const vieux = releveZone("etagere-basse", "2026-09-15", [{ ingredient: "mais", unites: 5 }]);
    expect(rejouer(catalogue, [vieux], ctx, "2026-10-01").parIngredient.get("mais")?.unites).toBe(5);
  });

  test("l'industriel se finit, il ne revient jamais au panier", () => {
    // Les nuggets panent à la biscotte : relevé à vide, les biscottes ne
    // repassent pas à la liste.
    const jeu = creerJeu(catalogue, 7, new Date(2026, 9, 26, 12));
    const r = rejouer(catalogue, [releveZone("dessus-etagere", "2026-10-24", [])], ctx, "2026-10-26");
    jeu.gardeManger = jeu.gardeManger.filter((id) => r.parIngredient.has(id));
    const i = jeu.creneaux.findIndex((c) => c.repas === "diner");
    jeu.choix[i] = "nuggets-colin-four";
    expect([...calculer(jeu).panier.values()].map((l) => l.id)).not.toContain("biscottes");
  });
});
