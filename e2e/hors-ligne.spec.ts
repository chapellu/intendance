// Sans réseau.
//
// LA PROMESSE DE T18, VÉRIFIÉE AUTREMENT QUE SUR PAROLE. Une cuisine n'a pas
// toujours de réseau, et une app qui s'ouvre sur une page blanche au moment
// exact où l'on cherche la recette n'a pas d'excuse. Ce parcours coupe tout et
// rouvre — y compris par lien profond, ce que seul le routeur en dièse rend
// possible sans un serveur pour réécrire les URL.

import { expect, test } from "@playwright/test";
import { attendreLApp, attendreLeWorker, poserUnPlat } from "./parcours";

test("la semaine posée s'ouvre sans réseau, par lien profond", async ({ page, context }) => {
  const titre = await poserUnPlat(page);
  await attendreLeWorker(page);

  await context.setOffline(true);
  try {
    for (const url of ["/#/cuisine/semaine", "/#/cuisine/courses", "/#/cockpit"]) {
      await page.goto(url);
      // Le rechargement est ce qui compte : sans lui, on ne ferait que changer
      // de hash dans une page déjà chargée, et le réseau n'aurait jamais été
      // sollicité.
      await page.reload();
      await attendreLApp(page);
    }

    await page.goto("/#/cuisine/semaine");
    await page.reload();
    await attendreLApp(page);
    await expect(page.locator(".co-slot").filter({ hasText: titre }).first()).toBeVisible();

    // Les polices sont auto-hébergées depuis T2 et précachées depuis T18 : sans
    // ça, l'app hors ligne s'afficherait dans la police par défaut du système,
    // c'est-à-dire comme un document cassé.
    const polices = await page.evaluate(
      () => document.fonts.check("16px Figtree") && document.fonts.check("16px Caprasimo"),
    );
    expect(polices).toBe(true);
  } finally {
    await context.setOffline(false);
  }
});
