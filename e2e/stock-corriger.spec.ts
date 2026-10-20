// CORRIGER UNE LIGNE DU GARDE-MANGER, SUR PLACE — T139.
//
// Le signalement, au téléphone, dans Cuisine → Stock : « je mets à jour le
// stock mais je ne peux ni retirer ni corriger ». Les cartes « À manger en
// premier » n'avaient aucun geste, et une ligne de zone ne se corrigeait que par
// le relevé de la zone entière. Ici on traverse la carte, Dexie, le rejeu et la
// requête vive : la correction d'UNE ligne doit se relire partout, et ne toucher
// qu'elle.

import { expect, test, type Page } from "@playwright/test";
import { attendreLApp, ouvrirRangement } from "./parcours";

/** Une carte « À manger en premier » : le nom d'abord, puis la raison. */
const carte = (page: Page, nom: string) =>
  page.locator(".co-lot").filter({ hasText: "paquet entamé" }).filter({ hasText: new RegExp(`^${nom}`) });

/** La carte d'une zone — touchée sur le plan depuis T141. */
const zone = (page: Page, nom: string) => ouvrirRangement(page, nom);

test("corriger puis retirer une ligne depuis « À manger en premier »", async ({ page }) => {
  await page.goto("/#/cuisine/stock");
  await attendreLApp(page);
  await expect(page.getByText("À manger en premier")).toBeVisible();

  // T139 (3) — les légumes de garde et les pignons ne « pressent » plus.
  await expect(page.locator(".co-lot").filter({ hasText: "pressé" })).toHaveCount(0);

  // CORRIGER : un tap ouvre le compte, prérempli de ce que le rejeu croit.
  const pates = carte(page, "pates");
  await pates.getByRole("button", { name: "corriger : pates" }).click();
  await expect(pates.locator("b")).toHaveText("4");
  await pates.getByRole("button", { name: "−" }).click();
  await pates.getByRole("button", { name: "C’est ça" }).click();
  await pates.getByRole("button", { name: "corriger : pates" }).click();
  await expect(pates.locator("b")).toHaveText("3");
  await pates.getByRole("button", { name: "Annuler" }).click();

  // JE N'EN AI PLUS : un seul tap, et la ligne sort — de la carte comme de sa
  // zone. Les autres denrées de la zone restent : ce n'est pas un relevé.
  await carte(page, "biscottes").getByRole("button", { name: "je n’en ai plus : biscottes" }).click();
  await expect(carte(page, "biscottes")).toHaveCount(0);
  const dessus = await zone(page, "dessus de l");
  await expect(dessus.locator(".co-lot").filter({ hasText: /^biscottes/ })).toHaveCount(0);
  await expect(dessus.locator(".co-lot").filter({ hasText: /^cracotte/ })).toHaveCount(1);
});

test("ajouter à une zone ce que le relevé ne connaît pas", async ({ page }) => {
  await page.goto("/#/cuisine/stock");
  await attendreLApp(page);
  const dessus = await zone(page, "dessus de l");
  await dessus.getByRole("button", { name: "Relever" }).click();
  await dessus.getByRole("searchbox").fill("lentilles cor");
  await dessus.getByRole("button", { name: "+ lentilles corail" }).click();
  await dessus.getByRole("button", { name: /Valider le relevé/ }).click();
  const ligne = dessus.locator(".co-lot").filter({ hasText: /^lentilles corail/ });
  await expect(ligne).toHaveCount(1);
  await expect(ligne).toContainText("ajouté au relevé");
});
