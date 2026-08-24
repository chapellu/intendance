// Poser une semaine, et la retrouver.
//
// C'EST LE PARCOURS QUI JUSTIFIE TOUT LE RESTE. Le prototype savait déjà poser
// des plats ; ce que l'app ajoute, c'est que la décision survit au
// rechargement. Un test unitaire ne peut pas le dire — il faudrait qu'il
// traverse le routeur, Dexie, la requête vive et le rendu, c'est-à-dire tout ce
// qu'il ne traverse justement pas.

import { expect, test } from "@playwright/test";
import { attendreLApp, poserUnPlat } from "./parcours";

test("poser un plat, le retrouver après rechargement", async ({ page }) => {
  const titre = await poserUnPlat(page);

  // Le créneau porte le plat, et il ne dit plus « à poser ».
  await expect(page.locator(".co-slot").filter({ hasText: titre }).first()).toBeVisible();

  await page.reload();
  await attendreLApp(page);
  await expect(page.locator(".co-slot").filter({ hasText: titre }).first()).toBeVisible();
});

test("un créneau sauté se dit, et se reprend", async ({ page }) => {
  await page.goto("/#/cuisine/semaine");
  await attendreLApp(page);

  await page.locator(".co-slot", { hasText: "à poser" }).first().locator("button.resume").click();
  // LA CASE OUVERTE, ET PAS « LA PREMIÈRE QUI DIT À POSER ». Une fois sautée,
  // elle ne dit plus « à poser » : un localisateur écrit sur son texte se
  // déplacerait alors sur la case suivante, et le test vérifierait
  // tranquillement autre chose que ce qu'il croit. La case ouverte est unique —
  // l'écran n'en déplie qu'une.
  const slot = page.locator(".co-slot.ouvert");
  await slot.getByRole("button", { name: "sauter" }).click();
  await expect(slot).toContainText("on ne mange pas là");

  await page.reload();
  await attendreLApp(page);
  // Le pli ne survit pas au rechargement, et c'est voulu : c'est un regard, pas
  // une décision. Le saut, lui, est une décision, et il est là.
  const saute = page.locator(".co-slot.saute").first();
  await expect(saute).toContainText("on ne mange pas là");

  // Et on remange ici : le refus n'est pas définitif, c'est une décision comme
  // une autre.
  await saute.locator("button.resume").click();
  await page.locator(".co-slot.ouvert").getByRole("button", { name: "on remange ici" }).click();
  await expect(page.locator(".co-slot.saute")).toHaveCount(0);
});

test("un lien profond vers un jour sorti de la semaine se dit au lieu de mentir", async ({ page }) => {
  // Une URL d'il y a un mois, rouverte aujourd'hui : le créneau n'est plus dans
  // la fenêtre affichée. L'app doit le DIRE — un écran vide se confondrait avec
  // une route cassée, et une case au hasard serait pire.
  await page.goto("/#/cuisine/poser/2020-01-01/diner");
  await attendreLApp(page);
  await expect(page.getByText("Ce créneau n’est plus là")).toBeVisible();
  await page.getByRole("link", { name: "Revenir à la semaine" }).click();
  await expect(page.locator(".co-slots").first()).toBeVisible();
});
