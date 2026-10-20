// T135 — la rotation : l'année simulée n° 4 servait 41 veloutés carotte-corail
// et 41 soupes de pois chiches, vingt dîners distincts sur 126. Le départage ne
// connaissait que « mangé ces trois derniers jours » : le rang 2-3 tournait sur
// une poignée de plats. Ici, 28 soirs sur un fond fixe, en prenant chaque soir
// la première carte.

import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { lireCatalogue } from "./catalogue";
import { creerJeu } from "./jeu";
import { contexte, rejouer, type Evenement } from "./journal";
import { JOURS_DE_VARIETE, POIDS, proposerCeSoir, scoreRotation } from "./pause";
import { PASSE_VIDE } from "./questions";
import type { Savoir } from "./scoring";
import type { Catalogue } from "./types";

const catalogue: Catalogue = lireCatalogue(JSON.parse(readFileSync("public/cuisine-data.json", "utf8")));
const ctx = contexte(catalogue);
const DEBUT = new Date("2026-10-19T15:00:00");

const iso = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const jourN = (n: number): Date => new Date(DEBUT.getTime() + n * 86_400_000);

/** Le fond, rentré la veille du premier soir — et jamais consommé : il est fixe. */
const fond: Evenement = {
  sorte: "entree", jour: iso(jourN(-1)), saisi: iso(jourN(-1)), maj: 1,
  lignes: catalogue.fond.denrees.map((d) => ({
    ingredient: d.ingredient, unites: d.minimum * 3, parUnite: null, zone: null, etat: "sec" as const,
  })),
};

describe("T135 — la rotation garde les favoris sans les servir 41 fois", () => {
  test("28 soirs sur un fond fixe : aucun plat plus de 5 fois, aucun format plus de 3 soirs de suite", () => {
    const mange: { plat: string; jour: string }[] = [];
    const servis: string[] = [];
    for (let n = 0; n < 28; n += 1) {
      const maintenant = jourN(n);
      const aujourdhui = iso(maintenant);
      const rejeu = rejouer(catalogue, [fond], ctx, aujourdhui);
      const jeu = creerJeu(catalogue, 7, maintenant);
      jeu.stock = [];
      jeu.gardeManger = jeu.gardeManger.filter((id) => rejeu.parIngredient.has(id));
      const savoir: Savoir = { rejeu, passe: PASSE_VIDE, cuisinesRecemment: new Set(), planchers: [] };
      const recents = new Set(
        mange.filter((m) => (maintenant.getTime() - new Date(`${m.jour}T15:00:00`).getTime()) / 86_400_000 < JOURS_DE_VARIETE)
          .map((m) => m.plat),
      );
      const p = proposerCeSoir({ jeu, savoir, recents, maintenant, sortis: new Set(), mange });
      const carte = p.cartes[0];
      expect(carte).toBeDefined();
      mange.push({ plat: carte!.plat.id, jour: aujourdhui });
      servis.push(carte!.plat.id);
    }

    const fois = new Map<string, number>();
    for (const id of servis) fois.set(id, (fois.get(id) ?? 0) + 1);
    expect(Math.max(...fois.values())).toBeLessThanOrEqual(5);
    expect(fois.size).toBeGreaterThanOrEqual(8);

    const formats = servis.map((id) => catalogue.plats.find((x) => x.id === id)!.format);
    let suite = 1;
    let pire = 1;
    for (let i = 1; i < formats.length; i += 1) {
      suite = formats[i] !== null && formats[i] === formats[i - 1] ? suite + 1 : 1;
      pire = Math.max(pire, suite);
    }
    expect(pire).toBeLessThanOrEqual(3);
  });

  test("les trois termes : répétition sur 14 jours, format sur 2 soirs, oubli au-delà de 30 jours si faisable", () => {
    const soupe = catalogue.plats.find((p) => p.format === "soupe")!;
    const autreSoupe = catalogue.plats.find((p) => p.format === "soupe" && p.id !== soupe.id)!;
    const j = "2026-10-20";
    expect(scoreRotation(catalogue, soupe, [{ plat: soupe.id, jour: "2026-10-10" }, { plat: soupe.id, jour: "2026-10-15" }], j, true))
      .toBe(2 * POIDS.repetition);
    expect(scoreRotation(catalogue, soupe, [{ plat: soupe.id, jour: "2026-10-01" }], j, true)).toBe(0);
    expect(scoreRotation(catalogue, soupe, [{ plat: autreSoupe.id, jour: "2026-10-19" }, { plat: autreSoupe.id, jour: "2026-10-18" }], j, true))
      .toBe(2 * POIDS.memeFormat + POIDS.oublie);
    expect(scoreRotation(catalogue, soupe, [{ plat: soupe.id, jour: "2026-09-01" }], j, true)).toBe(POIDS.oublie);
    expect(scoreRotation(catalogue, soupe, [{ plat: soupe.id, jour: "2026-09-01" }], j, false)).toBe(0);
  });
});
