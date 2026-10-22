// Ce que le fond de roulement, la garde des denrées, les saisons et les formats
// PROMETTENT — 2026-10-18.
//
// Écrits par promesse, sur le vrai catalogue exporté : c'est l'export qui
// pourrait trahir (un champ jeté, une famille oubliée), et c'est lui qu'on lit.

import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { CatalogueInvalide, lireCatalogue } from "./catalogue";
import { classeDe, contexte, rejouer } from "./journal";
import { posables } from "./plancherGardeManger";
import { deSaison, familleDe, saisonDuPlat } from "./saisons";
import type { Catalogue } from "./types";

const brut = JSON.parse(readFileSync("public/cuisine-data.json", "utf8")) as Record<string, unknown>;
const catalogue: Catalogue = lireCatalogue(brut);
const ctx = contexte(catalogue);
const plat = (id: string) => catalogue.plats.find((p) => p.id === id)!;
/** Une copie modifiable de l'export, pour fabriquer un JSON fautif. */
const copie = (): Record<string, any> => JSON.parse(JSON.stringify(brut));

/* ═════════════════════════════════ le fond fait exister le stock qui manquait */

describe("le fond de roulement fait exister comme stock ce qu'aucun relevé n'avait vu", () => {
  test("lentilles corail, pois cassés, surgelés et œufs sont posables, à zéro", () => {
    const rejeu = rejouer(catalogue, [], ctx, "2026-10-19");
    const p = new Map(posables(catalogue, rejeu).map((x) => [x.ingredient, x]));
    for (const id of ["lentilles-corail", "pois-casses", "epinards-surgeles", "oeufs", "lait-coco"]) {
      expect(p.get(id), id).toBeDefined();
      expect(p.get(id)!.comptable, id).toBe(true);
      expect(p.get(id)!.minimumDuFond, id).toBeGreaterThanOrEqual(1);
    }
    expect(p.get("pois-casses")!.a).toBe(0);
  });

  test("le minimum du fond reste une PROPOSITION : aucun plancher ne se pose tout seul", () => {
    // `posables` rend le minimum, `sousLeurPlancher` ne lit que les planchers
    // décidés. Sans doigt, la liste de courses ne bouge pas.
    const rejeu = rejouer(catalogue, [], ctx, "2026-10-19");
    expect(posables(catalogue, rejeu).every((p) => p.minimumDuFond === null || p.minimumDuFond >= 1))
      .toBe(true);
  });

  test("un surgelé jamais relevé vit déjà au congélateur", () => {
    expect(classeDe(ctx, "petits-pois-surgeles", [])).toBe("congelateur");
  });

  test("chaque denrée du fond a une famille de garde qui la dit « du fond »", () => {
    // `hebdo` est la seule porte d'une famille `fond: false` (T142) — le
    // fruit de la semaine (T144).
    for (const d of catalogue.fond.denrees) {
      const f = familleDe(catalogue, d.ingredient);
      expect(f, d.ingredient).not.toBeNull();
      if (!d.hebdo) expect(f!.fond, d.ingredient).toBe(true);
    }
  });

  // T142 : neuf — les gnocchis sont sortis du fond, et leur dîner avec eux.
  test("les neuf dîners du fond désignent des plats qui existent", () => {
    expect(catalogue.fond.diners).toHaveLength(9);
    for (const d of catalogue.fond.diners) expect(plat(d.plat), d.plat).toBeDefined();
  });

  test("un dîner du fond qui ne désigne aucun plat est refusé au chargement", () => {
    const c = copie();
    c.fond.diners.push({ plat: "plat-imaginaire", titre: "x" });
    expect(() => lireCatalogue(c)).toThrow(CatalogueInvalide);
  });

  test("un minimum qui n'est pas une unité d'achat entière est refusé", () => {
    const c = copie();
    c.fond.denrees[0].minimum = 1.5;
    expect(() => lireCatalogue(c)).toThrow(CatalogueInvalide);
  });
});

/* ═════════════════════════════════════════ une horloge, d'autres longueurs */

describe("la garde : une seule horloge, des jours aux années (Workspace#50)", () => {
  test("les conserves tiennent des années, les secs des mois, les œufs des semaines", () => {
    expect(familleDe(catalogue, "tomates-pelees")!.fenetreJours).toBeGreaterThanOrEqual(365);
    expect(familleDe(catalogue, "lentilles-corail")!.fenetreJours).toBeGreaterThanOrEqual(90);
    expect(familleDe(catalogue, "oeufs")!.fenetreJours).toBe(28);
    expect(familleDe(catalogue, "salade-verte")!.fenetreJours).toBeLessThan(14);
  });

  test("le frais fragile est hors du fond, et c'est là que le conseil compte", () => {
    for (const id of ["salade-verte", "courgettes", "boeuf-hache", "persil"]) {
      const f = familleDe(catalogue, id)!;
      expect(f.fond, id).toBe(false);
      expect(f.methode, id).toBe("congeler");
    }
  });

  test("chaque famille dit d'où vient sa fenêtre, et une seule se dit réglementaire", () => {
    for (const f of catalogue.garde) {
      expect(f.source.trim(), f.id).not.toBe("");
      expect(f.conseil.trim(), f.id).not.toBe("");
    }
    expect(catalogue.garde.filter((f) => /réglementaire/i.test(f.source)).map((f) => f.id))
      .toEqual(["oeufs"]);
  });

  test("le conseil s'affiche là où la denrée est rangée : le relevé porte sa famille", () => {
    const pdt = catalogue.gardeManger.denrees.find((d) => d.ingredient === "pomme-de-terre")!;
    expect(pdt.garde).toBe("legume-de-garde");
    expect(familleDe(catalogue, "pomme-de-terre")!.conseil).toMatch(/oignons/);
  });

  test("un id dans deux familles est refusé au chargement", () => {
    const c = copie();
    c.garde[1].ids.push(c.garde[0].ids[0]);
    expect(() => lireCatalogue(c)).toThrow(CatalogueInvalide);
  });
});

/* ════════════════════════════════════════════════════════════ les saisons */

describe("les saisons parlent des légumes, jamais de la garde", () => {
  test("la courgette est de saison en juillet, pas en janvier", () => {
    expect(deSaison(catalogue, "courgettes", 7)).toBe(true);
    expect(deSaison(catalogue, "courgettes", 1)).toBe(false);
  });

  test("un oignon n'est pas un signal de saison : douze mois, c'est une garde", () => {
    expect(deSaison(catalogue, "oignon", 1)).toBeNull();
    expect(deSaison(catalogue, "citron", 1)).toBeNull();
  });

  test("un plat se lit par ses légumes : la quiche aux courgettes, l'été", () => {
    const q = plat("quiche-courgettes-yaourt");
    expect(saisonDuPlat(catalogue, q, 7)).toEqual({ deSaison: ["courgettes"], horsSaison: [] });
    expect(saisonDuPlat(catalogue, q, 12).horsSaison).toEqual(["courgettes"]);
  });

  test("les dîners du fond ne sont ni de saison ni hors saison — ils se font toute l'année", () => {
    for (const d of catalogue.fond.diners)
      for (const m of [1, 4, 7, 10])
        expect(saisonDuPlat(catalogue, plat(d.plat), m).horsSaison, d.plat).toEqual([]);
  });

  test("un mois hors de 1–12 est refusé au chargement", () => {
    const c = copie();
    c.saisons.mois.courgettes = [6, 13];
    expect(() => lireCatalogue(c)).toThrow(CatalogueInvalide);
  });
});

/* ═════════════════════════════════════════════════════════════ les formats */

describe("le format : la forme du dîner, dans les mots du foyer", () => {
  const diners = catalogue.plats.filter(
    (p) => p.role === "plat" && (p.creneaux.length === 0 || p.creneaux.includes("diner")),
  );

  test("tout plat de dîner a un format", () => {
    expect(diners.filter((p) => p.format === null).map((p) => p.id)).toEqual([]);
  });

  test("quiches, soupes et gratins sont là, en nombre", () => {
    const n = (f: string) => diners.filter((p) => p.format === f).length;
    expect(n("quiche")).toBeGreaterThanOrEqual(10);
    expect(n("soupe")).toBeGreaterThanOrEqual(10);
    expect(n("gratin")).toBeGreaterThanOrEqual(10);
  });

  test("un format inconnu est refusé au chargement", () => {
    const c = copie();
    c.plats[0].format = "tajine";
    expect(() => lireCatalogue(c)).toThrow(CatalogueInvalide);
  });
});

/* ══════════════════════════════════════ les recettes du foyer et la sécurité */

describe("les haricots rouges secs bouillent dix minutes à gros bouillons", () => {
  test("toute recette qui part de haricots rouges trempés a une étape d'ébullition franche", () => {
    // La lectine des haricots rouges crus ne se détruit qu'à la vraie
    // ébullition ; un mijotage seul peut rendre malade. Le chili du fond est
    // le premier plat du corpus à partir du sachet sec.
    for (const p of catalogue.plats) {
      const trempe = p.steps.some((s) => (s.attente ?? 0) >= 480);
      if (!trempe || !p.ingredients.some((i) => i.id === "haricots-rouges")) continue;
      expect(p.steps.some((s) => /gros bouillons/.test(s.action) && /10 minutes/.test(s.action)), p.id)
        .toBe(true);
    }
    expect(plat("chili-haricots-rouges").steps.map((s) => s.id)).toContain("bouillir");
  });
});
