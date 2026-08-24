// Cocher au magasin, rentrer à la maison.
//
// LES DEUX GESTES NE SONT PAS LE MÊME, et c'est tout l'intérêt du parcours :
// cocher met dans le caddie, rentrer range. Entre les deux il y a une caisse,
// une voiture et un escalier — et une app qui confondrait les deux ferait
// disparaître de la liste un article qu'on n'a pas encore payé.

import { expect, test } from "@playwright/test";
import { attendreLApp, poserUnPlat } from "./parcours";

test("cocher un article, le rentrer, et le retrouver rentré", async ({ page }) => {
  // Une liste de courses n'existe pas toute seule : elle est ce qu'il manque
  // pour la semaine posée. On pose donc d'abord.
  await poserUnPlat(page);

  await page.goto("/#/cuisine/courses");
  await attendreLApp(page);

  const article = page.locator("button.co-art").first();
  await expect(article).toBeVisible();
  const nom = (await article.locator(".nom").innerText()).trim();

  await expect(page.locator(".co-kicker").first()).toContainText("0 sur");
  await article.click();
  await expect(page.locator(".co-kicker").first()).toContainText("1 sur");
  await expect(article).toHaveClass(/coche/);

  // Rien n'est rangé tant qu'on n'est pas rentré : côté maison, le compteur des
  // rentrés est toujours à zéro.
  await page.getByRole("button", { name: "À la maison" }).click();
  await expect(page.locator(".co-kicker").first()).toContainText("0 sur");

  await page.getByRole("button", { name: /Tout rentrer/ }).click();
  await expect(page.locator(".co-kicker").first()).toContainText("1 sur");

  await page.reload();
  await attendreLApp(page);
  await page.getByRole("button", { name: "À la maison" }).click();
  await expect(page.locator(".co-kicker").first()).toContainText("1 sur");
  await expect(page.locator("button.co-art").filter({ hasText: nom }).first()).toHaveClass(/rentre/);
});
