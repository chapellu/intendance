// LE RÉPERTOIRE — T81.
//
// Ce que `repertoire.vue.test.ts` ne peut pas dire : qu'un doigt y ARRIVE (la
// sous-navigation est sa seule porte, et T88 a appris au dépôt ce que coûte un
// écran qu'aucun lien n'atteint), que la ligne touchée ouvre le RÉSUMÉ de T91
// et non le guide, et que « ‹ Revenir » ramène au répertoire tel qu'on l'avait
// laissé.
//
// LE PLAT EST DÉRIVÉ DU CORPUS, JAMAIS ÉNUMÉRÉ À LA MAIN — même parti que
// `fiche-resume.spec.ts`.

import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { attendreLApp } from "./parcours";

interface PlatExport {
  id: string;
  titre: string;
  steps: { action: string }[];
}

const plats: PlatExport[] = JSON.parse(readFileSync("public/cuisine-data.json", "utf8")).plats;

/** Un plat qui a un déroulé à montrer, et un titre que personne d'autre ne
 *  porte en entier — la recherche doit le ramener sans ambiguïté. */
const cible = plats.find(
  (p) => p.steps.length >= 3 && plats.filter((q) => q.titre.includes(p.titre)).length === 1,
)!;

test("on ouvre le répertoire, on trouve un plat, on lit sa fiche, on revient", async ({ page }) => {
  // PAR LA PORTE DE LA FACETTE, puis par l'onglet : c'est le chemin d'un doigt,
  // quel que soit `JOURS_VISIBLES` — l'onglet est dans les deux rangées.
  await page.goto("/#/cuisine");
  await attendreLApp(page);
  await page.locator(".co-sousnav a", { hasText: "Recettes" }).dispatchEvent("click");

  // TOUT LE CATALOGUE, ET IL LE DIT.
  await expect(page.locator(".co-corps > .co-kicker").first()).toHaveText(`${plats.length} plats`, {
    timeout: 30_000,
  });
  await expect(page.locator(".co-sousnav a.actif")).toHaveText("Recettes");

  await page.getByLabel("chercher un plat par son nom").fill(cible.titre);
  const ligne = page.locator("a.co-rep", { has: page.locator(".nom", { hasText: cible.titre }) });
  await expect(ligne).toHaveCount(1);

  // LA LIGNE OUVRE LE RÉSUMÉ, JAMAIS LE GUIDE.
  await ligne.dispatchEvent("click");
  await expect(page.locator(".co-fiche-tete .t")).toHaveText(cible.titre, { timeout: 30_000 });
  await expect(page.locator(".co-etapes .l")).toHaveCount(cible.steps.length);
  await expect(page.locator(".co-etape")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /C’est fait|Terminer/ })).toHaveCount(0);

  // ET « REVENIR » RAMÈNE AU RÉPERTOIRE, RECHERCHE COMPRISE : lire trois fiches
  // de suite ne doit pas coûter trois fois la frappe.
  await page.getByRole("button", { name: "‹ Revenir" }).dispatchEvent("click");
  await expect(page.locator(".co-sousnav a.actif")).toHaveText("Recettes", { timeout: 30_000 });
  await expect(page.getByLabel("chercher un plat par son nom")).toHaveValue(cible.titre);
  await expect(ligne).toHaveCount(1);
});
