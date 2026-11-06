// Cocher au magasin, rentrer à la maison.
//
// LES DEUX GESTES NE SONT PAS LE MÊME, et c'est tout l'intérêt du parcours :
// cocher met dans le caddie, rentrer range. Entre les deux il y a une caisse,
// une voiture et un escalier — et une app qui confondrait les deux ferait
// disparaître de la liste un article qu'on n'a pas encore payé.

import { expect, test } from "@playwright/test";
import { attendreLApp, poserUnPlat } from "./parcours";

test("mettre un article dans le sac, le ranger, et le retrouver rangé", async ({ page }) => {
  await poserUnPlat(page);

  await page.goto("/#/cuisine/courses");
  await attendreLApp(page);

  const article = page.locator("button.co-art").filter({ hasText: /pour \d plats?/ }).first();
  await expect(article).toBeVisible();
  const nom = (await article.locator(".nom").innerText()).trim();

  // UN SEUL GESTE SUR LA LISTE : toucher met dans le sac, sans toucher au stock.
  await expect(page.getByRole("button", { name: /Ranger au stock/ })).toHaveCount(0);
  await article.click();
  await expect(article).toHaveClass(/coche/);
  await expect(page.getByText(/1 dans le sac/)).toBeVisible();

  // Ranger fait entrer le sac au stock : l'article quitte la liste.
  await page.getByRole("button", { name: /Ranger au stock — 1 article/ }).click();
  await expect(page.locator("button.co-art").filter({ hasText: nom })).toHaveCount(0);

  await page.reload();
  await attendreLApp(page);
  await page.getByRole("button", { name: /Déjà rangés \(\d+\)/ }).click();
  await expect(page.locator("button.co-art").filter({ hasText: nom }).first()).toHaveClass(/rentre/);
});
