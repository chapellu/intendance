// Assembler un repas : un créneau porte plusieurs plats.
//
// CE QUE CE PARCOURS PROUVE, ET QU'AUCUN TEST UNITAIRE NE PEUT PROUVER : que la
// brique traverse tout le chemin. Le modèle sait composer une assiette et la
// base sait la garder ; ce sont deux choses différentes, et entre les deux il y
// a une écriture, un `useLiveQuery`, un rechargement et une liste de courses.
// La faute qu'on cherche ici est celle qui laisse tous les tests verts et le riz
// absent du panier.

import { expect, test } from "@playwright/test";
import { ajouterUnAccompagnement, attendreLApp, poserUnPlat } from "./parcours";

test("le riz posé à côté du plat survit au rechargement et arrive aux courses", async ({ page }) => {
  const plat = await poserUnPlat(page);

  await page.goto("/#/cuisine/courses");
  await attendreLApp(page);
  const avant = await page.locator(".co-corps").innerText();

  const brique = await ajouterUnAccompagnement(page, plat);

  // LE RECHARGEMENT EST LE POINT DU TEST. Le composant a pu afficher la brique
  // depuis son état local sans que rien n'ait atteint IndexedDB — c'est
  // exactement ce qui distingue une décision d'un affichage.
  await page.reload();
  await attendreLApp(page);
  await expect(page.locator(".co-assiette .l", { hasText: brique })).toBeVisible();

  // La case de la semaine montre l'assiette entière, pas seulement le plat.
  await page.goto("/#/cuisine/semaine");
  await attendreLApp(page);
  await expect(page.locator(".co-slot", { hasText: plat }).locator(".cotes")).toContainText(brique);

  // ET L'ÉCRAN DES COURSES A BOUGÉ — ou alors rien de tout ça ne sert. On
  // compare le texte entier plutôt que le nombre d'articles : une brique du
  // placard n'allonge pas la liste, elle s'inscrit en « vous en avez, vérifiez
  // la quantité ». Les deux sont des réponses justes ; « rien du tout » n'en
  // est pas une.
  await page.goto("/#/cuisine/courses");
  await attendreLApp(page);
  await expect.poll(() => page.locator(".co-corps").innerText()).not.toBe(avant);
});

test("retirer la brique la retire partout", async ({ page }) => {
  const plat = await poserUnPlat(page);
  const brique = await ajouterUnAccompagnement(page, plat);

  await page
    .locator(".co-assiette .l", { hasText: brique })
    .getByRole("button", { name: "Retirer" })
    .click();
  await expect(page.locator(".co-assiette .l", { hasText: brique })).toHaveCount(0);

  await page.goto("/#/cuisine/semaine");
  await attendreLApp(page);
  await expect(page.locator(".co-slot", { hasText: plat }).locator(".cotes")).toHaveCount(0);
});
