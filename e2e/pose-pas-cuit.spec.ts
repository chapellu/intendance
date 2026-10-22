// POSÉ N'EST PAS CUISINÉ — T147 (capture du 22/10, 16 h 23).
//
// Trois plats posés par « Proposer » — croque-monsieur, une soupe d'orge, une
// tarte au potimarron — et le cockpit disait « le reste de soupe orge est à
// finir d'ici 3 jours · le reste de tarte potimarron est à finir d'ici 4
// jours ». Rien n'avait été cuit : la ligne lisait le dépôt PROJETÉ par la
// semaine, où un plat posé naît comme s'il était fait. `pause.test.ts` tient
// la règle ; ce parcours tient le chemin du doigt, du fil jusqu'au cockpit.

import { expect, test } from "@playwright/test";
import { libellePoser } from "../src/ui/phrases";
import { attendreLApp, aujourdhuiISO } from "./parcours";

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date(`${aujourdhuiISO()}T16:23:00`));
});

test("trois plats posés par « Proposer », aucun cuit : le cockpit n'annonce aucun de leurs restes", async ({
  page,
}) => {
  await page.goto("/#/cuisine");
  await attendreLApp(page);
  await expect(page.getByText("Combien de repas ?")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "3 repas", exact: true }).dispatchEvent("click");
  const champ = page.getByLabel("chercher un plat par son nom");
  await expect(champ).toBeVisible({ timeout: 30_000 });

  for (const [n, mot] of ["croque-monsieur et salade", "soupe d'orge", "tarte au potimarron"].entries()) {
    await champ.fill(mot);
    const carte = page.locator(".co-jouable").first();
    await expect(carte.locator(".tete .nom")).toContainText(mot.split(" ")[0]!, { ignoreCase: true });
    await carte.getByRole("button", { name: libellePoser(false) }).dispatchEvent("click");
    if (n < 2) await expect(page.getByText(`${n + 1} sur 3`)).toBeVisible({ timeout: 30_000 });
  }

  await page.goto("/#/cuisine/poses");
  await attendreLApp(page);
  await expect(page.locator(".co-lot")).toHaveCount(3, { timeout: 30_000 });

  await page.goto("/#/cockpit");
  await attendreLApp(page);
  await expect(page.locator(".co-tache", { hasText: "Ce soir :" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/reste de (soupe|tarte|croque)/i)).toHaveCount(0);
});
