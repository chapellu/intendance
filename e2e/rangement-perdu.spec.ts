// T105 — « TOUT CE QUI ÉTAIT AU CONGÉLO EST PERDU », D'UN GESTE, ET RÉVERSIBLE.
//
// La vue dit le nombre et les clés (`stock.vue.test.ts`). Ce parcours dit le
// reste : que la question est posée DANS la page avant que rien ne parte, que
// la confirmation atteint la base, et qu'« Annuler » rend le rangement entier.
//
// L'amorce d'une base neuve porte une sauce bolognaise au congélateur : c'est
// le rangement qu'on perd. Aucune date en jeu — le geste ne regarde pas l'âge.

import { expect, test } from "@playwright/test";
import { attendreLApp } from "./parcours";

test("un congélateur perdu se vide d'un geste confirmé, et se rend d'un autre", async ({ page }) => {
  await page.goto("/#/cuisine/stock");
  await attendreLApp(page);

  const bocal = page.locator(".co-lot").filter({ hasText: "sauce-bolognaise" });
  await page.locator(".co-cats button").filter({ hasText: "Congélo" }).dispatchEvent("click");
  await expect(bocal).toHaveCount(1);

  await page.getByRole("button", { name: "Tout ce qui était au congélo est perdu" }).dispatchEvent("click");
  // LA QUESTION D'ABORD, ET RIEN N'EST PARTI : elle dit combien.
  await expect(page.getByText("Le lot au congélo va sortir de l’inventaire.")).toBeVisible();
  await expect(bocal).toHaveCount(1);

  await page.getByRole("button", { name: "Oui, retirer le lot" }).dispatchEvent("click");
  await expect(page.getByText("« sauce-bolognaise » retiré de l’inventaire.")).toBeVisible();
  await expect(bocal).toHaveCount(0);

  await page.getByRole("button", { name: "Annuler" }).dispatchEvent("click");
  await expect(bocal).toHaveCount(1);
});
