// T141 — L'ÉCRAN STOCK EST UN PLAN DE LA CUISINE.
//
// La vue dit les pastilles et le filtre (`stock.vue.test.ts`). Ce parcours dit
// le geste entier, celui qu'on fait debout devant l'évier : toucher le meuble,
// lire ce qu'il porte, dire qu'une chose n'y est plus — et voir le meuble
// cesser de la signaler.

import { expect, test } from "@playwright/test";
import { attendreLApp, ouvrirRangement } from "./parcours";

test("toucher le sous-évier sur le plan, puis « je n'en ai plus »", async ({ page }) => {
  await page.goto("/#/cuisine/stock");
  await attendreLApp(page);

  const plan = page.getByRole("group", { name: /Plan de la cuisine/ });
  const sousEvier = plan.getByRole("button", { name: /^sous-évier/ });
  // Quatre légumes à l'humidité : le meuble le dit avant qu'on l'ouvre.
  await expect(sousEvier).toHaveAccessibleName(/4 à déplacer/);

  const panneau = await ouvrirRangement(page, "sous-évier");
  await expect(sousEvier).toHaveAttribute("aria-pressed", "true");
  // SES lignes, et seulement les siennes — rien du frigo ni des autres placards.
  await expect(panneau.locator(".co-lot").filter({ hasText: /^pomme de terre/ })).toHaveCount(1);
  await expect(panneau.locator(".co-lot").filter({ hasText: /^biscottes/ })).toHaveCount(0);
  // Le conseil de rangement, dans l'encart vert.
  await expect(panneau.locator(".st-conseil")).toContainText("loin du sous-évier");

  await panneau.getByRole("button", { name: "je n’en ai plus : pomme de terre" }).click();
  await expect(panneau.locator(".co-lot").filter({ hasText: /^pomme de terre/ })).toHaveCount(0);
  await expect(panneau.locator(".co-lot").filter({ hasText: /^oignon/ })).toHaveCount(1);
  await expect(sousEvier).toHaveAccessibleName(/3 à déplacer/);
});

test("un signal éteint les meubles qui n'ont rien à dire", async ({ page }) => {
  await page.goto("/#/cuisine/stock");
  await attendreLApp(page);
  const plan = page.getByRole("group", { name: /Plan de la cuisine/ });

  await page
    .getByRole("group", { name: "Allumer sur le plan" })
    .getByRole("button", { name: /à déplacer/ })
    .click();
  await expect(plan.getByRole("button", { name: /^sous-évier/ })).not.toHaveClass(/eteint/);
  await expect(plan.getByRole("button", { name: /^dessus de l/ })).toHaveClass(/eteint/);
  // Éteint n'est pas caché : le meuble se touche toujours.
  await ouvrirRangement(page, "dessus de l");
});
