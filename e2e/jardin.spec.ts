// La facette jardin — la carte, et le verdict d'une cellule.
//
// AUCUNE ASSERTION SUR UNE DATE, ET C'EST LA CONTRAINTE PRINCIPALE DU FICHIER.
// Tout ce que cet écran affiche est une fonction de (cellule, aujourd'hui) :
// « 41 jours avant le 4 novembre » est vrai ce matin, faux demain, et absurde
// en mars. Le dépôt a déjà payé ce bug — `fiche-provenance.spec.ts` était vert
// le 14 au soir et rouge le 15 au matin. Les promesses tenues ici sont donc
// toutes STRUCTURELLES, ou reposent sur un fait du site qui ne bouge pas
// (l'arc sud n'est pas relevé, un lilas ne libère jamais son bac).

import { expect, test } from "@playwright/test";
import { attendreLApp } from "./parcours";

test.beforeEach(async ({ page }) => {
  await page.goto("/#/jardin");
  await attendreLApp(page);
  await expect(page.locator(".co-terrasse")).toBeVisible();
});

test("la carte porte les neuf cellules, et le bac 2 en fait trois", async ({ page }) => {
  // LE DÉCOUPAGE EST LA DÉCISION, PAS LE DESSIN. En un seul tenant, le bac 2
  // perdrait la seule granularité de rotation du site.
  await expect(page.locator(".co-cellule")).toHaveCount(9);
  await expect(page.locator(".co-cellule").filter({ hasText: "Bac 2" })).toHaveCount(3);
});

test("rien n'est jamais retiré : dix fiches, sur n'importe quelle cellule", async ({ page }) => {
  // La règle CLASSE, elle n'interdit pas. Une culture impossible reste
  // affichée avec ses conditions — un écran qui la cacherait n'apprendrait
  // jamais pourquoi elle manque.
  await expect(page.locator(".co-verdict")).toHaveCount(10);

  await page.getByRole("button", { name: /Pot libre 2/ }).dispatchEvent("click");
  await expect(page.locator(".co-verdict")).toHaveCount(10);
  // Un pot de 20 cm ferme des cultures que les 70 cm du bac 2 ouvrent.
  await expect(page.locator(".co-verdict.jamais-ici").first()).toBeVisible();
});

test("choisir une cellule change le détail — un meuble le dit", async ({ page }) => {
  await page.getByRole("button", { name: /Bac 1/ }).dispatchEvent("click");
  // Le lilas ne libérera pas le bac en octobre : il ne le libérera jamais.
  await expect(page.locator(".co-verdict").first()).toContainText("Occupée en permanence");
  // Et la carte le dit dans un mot différent de « occupée ».
  await expect(page.locator(".co-cellule.permanent").first()).toBeVisible();
});

test("le pot annonce qu'il n'a pas de rotation ; le bac ne l'annonce pas", async ({ page }) => {
  // L'échappatoire à la rotation est MÉCANIQUE, et elle se lit à l'écran :
  // une cellule sans ligne de rotation ressemblerait sinon à une cellule dont
  // on n'a pas l'historique.
  await page.getByRole("button", { name: /Pot libre 1/ }).dispatchEvent("click");
  await expect(page.locator(".co-verdicts")).toContainText("la rotation ne s'applique pas");

  await page.getByRole("button", { name: /Bac 2 · carré B/ }).dispatchEvent("click");
  await expect(page.locator(".co-verdicts")).not.toContainText("la rotation ne s'applique pas");
});

test("la mesure qui manque est demandée, pas devinée", async ({ page }) => {
  // Workspace#18 : sept relevés au téléphone, dix minutes, et six cultures
  // passent de pari à fait. Tant que l'arc sud n'est pas relevé, l'écran le
  // RÉCLAME — il n'écrit pas un chiffre plausible à sa place.
  await expect(page.locator(".co-faits")).toContainText("l'hiver, non relevé");
  await expect(page.locator(".co-verdict .raisons li.observer").first()).toContainText(
    "n'a jamais été relevé",
  );
  await expect(page.locator(".co-verdict .bandes .observer").first()).toBeVisible();
});

test("l'horizon recalcule la même cellule au lieu d'ouvrir un écran", async ({ page }) => {
  const avant = await page.locator(".co-verdict").first().innerText();
  await page.getByRole("button", { name: "au printemps" }).dispatchEvent("click");
  await expect(page.locator(".co-pilule.actif")).toHaveText("au printemps");
  // On reste sur la carte, sur la même cellule, et la liste a rebattu ses
  // cartes : la planification est un MODE, pas une destination.
  await expect(page.locator(".co-terrasse")).toBeVisible();
  await expect(page.locator(".co-verdict").first()).not.toHaveText(avant);
});
