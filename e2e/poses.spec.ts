// RELIRE CE QU'ON A POSÉ — le parcours qui manquait depuis T88.
//
// « I've selected 3 recipes but I have nowhere to check them » (21/09/2026).
// L'agenda éteint, plus aucun écran ATTEIGNABLE ne nommait les plats posés :
// `#/cuisine/semaine` répondait encore si on tapait l'URL, mais rien n'y
// menait sauf un « ‹ La semaine » en tête de l'inventaire, qui se lit comme un
// retour en arrière et pas comme une destination.
//
// LE PARCOURS EST CELUI D'UN DOIGT, et il doit l'être : ce qui a échoué ici
// n'est pas un calcul — `vueDeLaSemaine` nommait correctement les trois plats
// depuis toujours — c'est la NAVIGATION. Un test unitaire l'aurait déclaré vert
// tout du long.

import { expect, test } from "@playwright/test";
import { attendreLApp, poserUnPlat } from "./parcours";

test("les plats posés se relisent depuis un onglet, sans grille ni agenda", async ({ page }) => {
  const un = await poserUnPlat(page);
  const deux = await poserUnPlat(page);

  // L'ONGLET EXISTE ET S'ATTEINT AU DOIGT. C'est la moitié du ticket : le
  // contenu était déjà juste, il n'avait pas de porte.
  await page.goto("/#/cuisine/courses");
  await attendreLApp(page);
  await page.getByRole("link", { name: "Posés" }).click();

  await expect(page.locator(".co-lot").filter({ hasText: un })).toBeVisible();
  await expect(page.locator(".co-lot").filter({ hasText: deux })).toBeVisible();

  // LA GRILLE N'EST PAS REVENUE PAR LA PETITE PORTE. Deux plats posés donnent
  // deux lignes — pas quatorze cases dont douze vides, qui sont précisément ce
  // qu'on a demandé à ne plus voir.
  await expect(page.locator(".co-lot")).toHaveCount(2);
  await expect(page.locator(".co-slot")).toHaveCount(0);

  // Et chaque ligne ouvre la recette : « check them » veut dire la lire.
  await page.locator(".co-lot").filter({ hasText: un }).getByRole("link", { name: "Voir la recette" }).click();
  await expect(page.getByText(un, { exact: false }).first()).toBeVisible();
});

test("un dessert se compte à part d'un repas", async ({ page }) => {
  // « I would also like to add another one as one of them was a dessert and
  // not a main course. » Le dessert ÉTAIT bien rangé — `convient()` interdit de
  // le poser sur un déjeuner — mais rien ne le disait, et trois recettes
  // posées se lisaient comme trois dîners.
  await poserUnPlat(page);

  await page.goto("/#/cuisine/poses");
  await attendreLApp(page);
  // Le premier plat tombe sur un créneau `choisi` : un repas, et la phrase le
  // dit au singulier sans inventer de pluriel.
  await expect(page.locator(".co-kicker").first()).toHaveText("1 repas");

  // La sortie vers « Proposer » est sur l'écran : relire ses choix et en
  // ajouter un sont le même geste, à une seconde d'intervalle.
  await page.getByRole("link", { name: "Poser un plat de plus" }).click();
  await expect(page.getByText("Combien de repas ?")).toBeVisible();
});
