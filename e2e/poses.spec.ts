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

import { expect, test, type Page } from "@playwright/test";
import { attendreLApp, poserUnPlat, repondreAuxQuestions } from "./parcours";
import { libellePoser } from "../src/ui/phrases";

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

/**
 * Poser un plat depuis le fil DÉJÀ OUVERT — l'horizon, puis une carte.
 *
 * `poserUnPlat` passe par `#/cuisine/semaine`, qui est l'écran que T88 a éteint :
 * il ne traverse donc ni l'horizon, ni la passe persistée, ni la reprise — soit
 * exactement les trois pièces qui ont écrasé un plat le 22/09. Le chemin du
 * doigt réel est celui-ci.
 */
async function poserParLeFil(page: Page): Promise<string> {
  // ON ATTEND L'OUVERTURE, ON NE LA DEVINE PAS. Un `isVisible()` conditionnel
  // rend ici un parcours qui SAUTE le cran quand le fil n'a pas fini de se
  // rendre, puis attend des cartes sur un écran qui n'en montrera jamais.
  await expect(page.getByText("Combien de repas ?")).toBeVisible();
  await page.getByRole("button", { name: "1 repas", exact: true }).dispatchEvent("click");

  await repondreAuxQuestions(page);

  const cartes = page.locator(".co-jouable");
  await expect(cartes.first()).toBeVisible();
  const titre = (await cartes.first().locator(".tete .nom").innerText()).trim();
  await cartes.first().getByRole("button", { name: libellePoser(false) }).dispatchEvent("click");

  // La passe d'un seul repas se termine sur le plat qu'on vient de poser.
  await expect(page.getByText("La passe est finie")).toBeVisible();
  return titre;
}

test("un plat de plus s'ajoute aux posés, il ne les remplace pas", async ({ page }) => {
  // LE BUG DU 22/09, ET IL TENAIT À UN TABLEAU VIDE. `useSemaine` construisait
  // un `jeu` sur des décisions lues pour une AUTRE fenêtre — celle, sans
  // bornes, d'avant le catalogue, qui répond `[]`. Le fil y lisait « rien n'est
  // posé », sa reprise renvoyait donc sur le premier créneau de la passe, qui
  // était déjà décidé, et le plat suivant écrasait le précédent. Vu de l'écran
  // « Posés » : la liste ne grandissait jamais, elle se remplaçait.
  await page.goto("/#/cuisine/fil");
  await attendreLApp(page);
  const un = await poserParLeFil(page);

  await page.goto("/#/cuisine/poses");
  await attendreLApp(page);
  await expect(page.locator(".co-lot")).toHaveCount(1);

  // Le geste tel qu'il se fait : le bouton du bas de « Posés ».
  await page.getByRole("link", { name: "Poser un plat de plus" }).dispatchEvent("click");

  // ON NE RETOMBE PAS SUR UN CRÉNEAU DÉJÀ DÉCIDÉ. C'est l'assertion du
  // correctif : avant lui, la reprise redirigeait ici même sur le déjeuner
  // qu'on venait de poser, sans rien dire, et la main affichée reposait dessus.
  await expect(page.getByText("La passe est finie")).toBeVisible();
  await page.getByRole("button", { name: "Poser un plat de plus" }).dispatchEvent("click");
  await expect(page.getByText("Combien de repas ?")).toBeVisible();

  const deux = await poserParLeFil(page);
  expect(deux).not.toBe(un);

  await page.goto("/#/cuisine/poses");
  await attendreLApp(page);
  await expect(page.locator(".co-lot")).toHaveCount(2);
  await expect(page.locator(".co-lot").filter({ hasText: un })).toBeVisible();
  await expect(page.locator(".co-lot").filter({ hasText: deux })).toBeVisible();
});
