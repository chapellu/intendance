// La facette budget — ce qu'un doigt saisit se retrouve dans les trois vues.
//
// AUCUN MONTANT QUI DÉPEND DU JOUR N'EST AFFIRMÉ. Ce qui devrait être de côté
// pour une provision est une fonction de (échéance, aujourd'hui) : vrai ce
// matin, faux demain — le piège que `jardin.spec.ts` décrit déjà. Les promesses
// tenues ici sont donc celles du mois TYPE, qui ne bouge pas avec la date, et
// des faits structurels (une charge mensuelle n'est pas une provision).

import { expect, test, type Page } from "@playwright/test";
import { attendreLApp } from "./parcours";

const enregistrer = async (page: Page) => {
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await expect(page.locator(".aj-fond")).toHaveCount(0);
};

test("revenus, échéances et enveloppes font le reste à épargner", async ({ page }) => {
  await page.goto("/#/budget");
  await attendreLApp(page);
  await expect(page.locator("[data-test=capacite]")).toHaveText("0 €");

  await page.getByRole("button", { name: "+ Revenu" }).click();
  await page.getByPlaceholder(/Salaire/).fill("Revenu A");
  await page.getByPlaceholder("0").fill("3000");
  await enregistrer(page);

  await page.getByRole("link", { name: "Provisions" }).click();
  // Une provision : 1 200 € par an, soit 100 € par mois au mois type.
  await page.getByRole("button", { name: "+ Échéance" }).click();
  await page.getByPlaceholder(/Eau, taxe/).fill("Provision annuelle");
  await page.getByPlaceholder("0").fill("1200");
  await page.locator("input[type=date]").fill("2027-10-15");
  await expect(page.getByText(/100 € à mettre de côté par mois/)).toBeVisible();
  await enregistrer(page);

  // Une charge mensuelle : elle compte au mois type, pas dans les provisions.
  await page.getByRole("button", { name: "+ Échéance" }).click();
  await page.getByPlaceholder(/Eau, taxe/).fill("Charge fixe");
  await page.getByPlaceholder("0").fill("500");
  await page.locator(".bu-champ select").first().selectOption("1");
  await page.locator("input[type=date]").fill("2026-11-05");
  await enregistrer(page);
  await expect(page.locator(".bu-provision")).toHaveCount(1);
  await expect(page.locator(".bu-ligne").filter({ hasText: "Charge fixe" })).toContainText(/500\s€\/mois/);

  await page.getByRole("link", { name: "Enveloppes" }).click();
  await page.getByRole("button", { name: "+ Enveloppe" }).click();
  await page.getByPlaceholder(/Courses/).fill("Enveloppe A");
  await page.getByPlaceholder("0").fill("400,50");
  await enregistrer(page);

  await page.getByRole("link", { name: "Le mois" }).click();
  // 3 000 − 500 − 100 − 400,50
  await expect(page.locator("[data-test=capacite]")).toHaveText(/1\s999,50\s€/);

  // Et ça survit au rechargement : c'est la base, pas la mémoire de l'écran.
  await page.reload();
  await attendreLApp(page);
  await expect(page.locator("[data-test=capacite]")).toHaveText(/1\s999,50\s€/);
});

test("un montant illisible ne s'enregistre pas en zéro", async ({ page }) => {
  await page.goto("/#/budget/enveloppes");
  await attendreLApp(page);
  await page.getByRole("button", { name: "+ Enveloppe" }).click();
  await page.getByPlaceholder(/Courses/).fill("Essence");
  await page.getByPlaceholder("0").fill("douze");
  await expect(page.getByText(/Un montant en euros/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Enregistrer" })).toBeDisabled();
});

test("la facette a sa place dans la barre du bas", async ({ page }) => {
  await page.goto("/#/cockpit");
  await attendreLApp(page);
  await page.getByRole("navigation", { name: "Facettes" }).getByRole("button", { name: /Budget/ }).click();
  await expect(page).toHaveURL(/#\/budget$/);
  await expect(page.getByRole("navigation", { name: "Vues du budget" })).toBeVisible();
});

test("la nature suit la catégorie, jusqu'à ce qu'on la choisisse soi-même", async ({ page }) => {
  await page.goto("/#/budget/enveloppes");
  await attendreLApp(page);
  await page.getByRole("button", { name: "+ Enveloppe" }).click();
  const nature = (n: string) => page.getByRole("dialog").getByRole("button", { name: n, exact: true });
  await expect(nature("Essentiel")).toHaveAttribute("aria-pressed", "true");
  await page.locator(".bu-champ select").selectOption("cadeaux");
  await expect(nature("Plaisir")).toHaveAttribute("aria-pressed", "true");
  // Choisie à la main, elle ne bouge plus.
  await nature("Essentiel").click();
  await page.locator(".bu-champ select").selectOption("loisirs");
  await expect(nature("Essentiel")).toHaveAttribute("aria-pressed", "true");
});
