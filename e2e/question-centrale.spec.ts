// La question qui précède la main — T33.
//
// CE PARCOURS EXISTE PARCE QUE LE MÉCANISME TRAVERSE TOUT. Une question part du
// catalogue (`rayons.centraux`), passe par le rejeu du journal, décide de ce que
// `offre` a le droit de proposer, s'affiche, et sa réponse redescend en base
// pour changer la proposition suivante. Aucun test unitaire ne peut le dire :
// il faudrait qu'il traverse Dexie, la requête vive et le rendu — c'est-à-dire
// exactement ce qu'il ne traverse pas.
//
// SUR UNE APP NEUVE, LA QUESTION EST L'ÉTAT NORMAL. Rien n'a jamais été relevé,
// la viande et le poisson ne sont dans aucun relevé de placard, donc tout
// central est `inconnu`. C'est le « démarrage à froid protégé par le crescendo »
// du backlog : la première passe EST le relevé, par un autre chemin.

import { expect, test } from "@playwright/test";
import { attendreLApp, repondreAuxQuestions } from "./parcours";

/** Ouvre la proposition du premier créneau libre, sans rien y poser. */
async function ouvrirLaProposition(page: import("@playwright/test").Page): Promise<void> {
  await page.goto("/#/cuisine/semaine");
  await attendreLApp(page);
  await page.locator(".co-slot", { hasText: "à poser" }).first().locator("button.resume").click();
  await page.locator(".co-slot.ouvert").getByRole("link", { name: "poser un plat" }).click();
  await expect(page.locator(".co-question, .co-jouable").first()).toBeVisible({ timeout: 30_000 });
}

test("une app neuve demande avant de proposer, et ne montre aucune carte en attendant", async ({ page }) => {
  await ouvrirLaProposition(page);

  const question = page.locator(".co-question");
  await expect(question).toBeVisible();

  // LA SEULE CHOSE À L'ÉCRAN. Répondre change la main qui suit ; montrer les
  // cartes pendant qu'on demande, c'est montrer une main qu'on sait fausse —
  // l'erreur qui a fait perdre les variantes B et C du rail (Workspace#45).
  await expect(page.locator(".co-jouable")).toHaveCount(0);

  // Elle se justifie : une raison, et ce que la réponse débloque.
  await expect(question).toContainText(/jamais relevé|pas vu depuis|servi depuis/);
  await expect(question).toContainText(/l’attend|l’attendent/);

  // Trois états, jamais quatre.
  await expect(question.getByRole("button", { name: "Oui", exact: true })).toBeVisible();
  await expect(question.getByRole("button", { name: "Il en reste peu" })).toBeVisible();
  await expect(question.getByRole("button", { name: "Non", exact: true })).toBeVisible();
});

test("répondre finit par découvrir la main, et la réponse survit au rechargement", async ({ page }) => {
  await ouvrirLaProposition(page);
  const posees = await repondreAuxQuestions(page);
  expect(posees).toBeGreaterThan(0);

  // LA PROMESSE RÉFUTABLE, DE BOUT EN BOUT : rouvrir la même proposition ne
  // redemande rien, parce que chaque réponse était une observation. Si ce
  // `toHaveCount(0)` rougit un jour, c'est le design de T33 qui est faux, pas
  // le test — le volume de questions doit décroître à l'usage.
  await page.reload();
  await attendreLApp(page);
  await ouvrirLaProposition(page);
  await expect(page.locator(".co-question")).toHaveCount(0);
  await expect(page.locator(".co-jouable").first()).toBeVisible();
});

test("« non » retire le plat de la proposition au lieu de le classer dernier", async ({ page }) => {
  await ouvrirLaProposition(page);

  const question = page.locator(".co-question");
  const nom = (await question.locator(".nom").innerText()).trim();
  // On refuse le premier ingrédient demandé, puis on accepte tout le reste :
  // ce qui reste à l'écran ne doit contenir aucun plat qui en voulait.
  await question.getByRole("button", { name: "Non", exact: true }).dispatchEvent("click");
  await page.waitForFunction(
    (avant) => {
      const q = document.querySelector(".co-question .nom");
      return q ? q.textContent?.trim() !== avant : !!document.querySelector(".co-jouable");
    },
    nom,
    { timeout: 30_000 },
  );
  await repondreAuxQuestions(page);

  // LA MAIN N'A PAS RÉTRÉCI À RIEN, et c'est la moitié qui compte. Un « non »
  // retire les plats qui en voulaient ; il ne laisse pas l'écran vide. Un outil
  // dont le travail est que le dîner ait lieu ne peut pas répondre « plus de
  // cartes » à une réponse honnête — c'est pourquoi le blocage est une portée de
  // passe et non un bannissement.
  await expect(page.locator(".co-jouable").first()).toBeVisible();

  // ET ON NE REDEMANDE PAS UN REFUS. « Non » est une observation comme les
  // autres : elle restaure la confiance, donc elle éteint sa propre question.
  // C'était le trou trouvé à la mesure — une réponse sur un ingrédient sans lot
  // ne survivait à rien, et l'app redemandait indéfiniment.
  await page.reload();
  await attendreLApp(page);
  await ouvrirLaProposition(page);
  await expect(page.locator(".co-question")).toHaveCount(0);
});
