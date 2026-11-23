// CHAQUE ÉTAPE DIT LES QUANTITÉS QU'ELLE PREND — T113, demandé le 2026-10-16.
//
// `quantitesDeLEtape()` est tenu par `cuisiner.vue.test.ts`, qui dit ce qu'elle
// REND. Ce parcours dit qu'elle arrive sous le geste — `uses` voyageait depuis
// T72 et aucun écran ne le lisait. Depuis T193, toutes les étapes du corpus
// portent leur lien : celle qui ne prend rien (`uses: []`, un préchauffage) se
// tait. Plats dérivés du corpus, jamais nommés à la main.

import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { quantitesDeLEtape } from "../src/ecrans/cuisiner.vue";
import { facteurAffiche } from "../src/model/calcul";
import { lireCatalogue } from "../src/model/catalogue";
import { ouvrirLeGuide } from "./parcours";

const catalogue = lireCatalogue(
  JSON.parse(readFileSync("public/cuisine-data.json", "utf8")) as unknown,
);
const parts = catalogue.foyer.parts;

const avec = catalogue.plats.find((p) => (p.steps[0]?.uses?.length ?? 0) > 0)!;
const rien = catalogue.plats.find((p) => p.steps.length > 0 && p.steps[0]!.uses?.length === 0)!;

test("l'étape montre ses quantités, aux parts du créneau", async ({ page }) => {
  await ouvrirLeGuide(page, avec.id);
  const attendu = quantitesDeLEtape(avec, 0, facteurAffiche(avec, parts))!;
  const lignes = page.locator(".co-etape .co-qetape .l");
  await expect(lignes).toHaveCount(attendu.length);
  for (const [n, l] of attendu.entries()) {
    await expect(lignes.nth(n).locator(".q")).toHaveText(l.quantite);
    await expect(lignes.nth(n).locator(".nom")).toContainText(l.nom);
  }
  await expect(page.locator(".co-qetape-muet")).toHaveCount(0);
});

test("l'étape qui ne prend rien se tait", async ({ page }) => {
  await ouvrirLeGuide(page, rien.id);
  await expect(page.locator(".co-etape .co-qetape-muet")).toHaveCount(0);
  await expect(page.locator(".co-qetape")).toHaveCount(0);
});
