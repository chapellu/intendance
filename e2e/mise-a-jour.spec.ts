// Le remplacement d'une version par la suivante.
//
// C'EST LA PANNE QUI NE SE VERRAIT PAS. Tout le reste de l'app crie quand il
// casse : un écran blanc, un bouton mort. Un chemin de mise à jour cassé, lui,
// ne fait rien du tout — l'app continue de marcher, simplement elle reste sur
// sa version, et personne ne s'en aperçoit avant d'avoir passé une soirée à se
// demander pourquoi un correctif « déployé » n'est pas là.
//
// LE DÉPLOIEMENT EST SIMULÉ EN TOUCHANT `dist/`, ce que fait n'importe quel
// vrai déploiement : les fichiers changent sous le serveur. On remet ensuite
// tout en place — d'où le `finally`, et le worker unique dans
// `playwright.config.ts`.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { attendreLApp, attendreLeWorker } from "./parcours";

const DIST = join(dirname(fileURLToPath(import.meta.url)), "..", "dist");
const SW = join(DIST, "sw.js");
const INDEX = join(DIST, "index.html");

test("une version installée attend un doigt, puis remplace vraiment", async ({ page }) => {
  await page.goto("/#/cuisine/semaine");
  await attendreLApp(page);
  await attendreLeWorker(page);

  // Rien à annoncer à la première visite : il n'y a pas d'ancienne version.
  await expect(page.locator(".co-maj")).toHaveCount(0);

  const swAvant = readFileSync(SW, "utf8");
  const indexAvant = readFileSync(INDEX, "utf8");
  try {
    writeFileSync(INDEX, indexAvant.replace("<title>Intendance</title>", "<title>Intendance v2</title>"));
    writeFileSync(SW, swAvant.replace(/const VERSION = "[^"]+"/, 'const VERSION = "0000e2e00000"'));

    // Le navigateur revérifie `/sw.js` à chaque navigation.
    await page.reload();
    await attendreLApp(page);
    await expect(page.locator(".co-maj")).toContainText("Une nouvelle version est prête");

    // TANT QU'ON N'A PAS DIT OUI, C'EST L'ANCIENNE QUI SERT. C'est la moitié du
    // contrat : une page en train de servir ne se fait pas échanger son code.
    await expect(page).toHaveTitle("Intendance");

    await page.locator(".co-maj").getByRole("button", { name: "Recharger" }).click();
    await expect(page).toHaveTitle("Intendance v2");
    await attendreLApp(page);
    await expect(page.locator(".co-maj")).toHaveCount(0);

    // Un seul cache reste : l'ancien est effacé à l'activation, sinon deux
    // versions cohabiteraient sur le téléphone sans que rien ne les départage.
    // `noms` et pas `caches` : nommer la variable comme le global la ferait se
    // référencer elle-même à l'intérieur de la page.
    const noms = await page.evaluate(() => caches.keys());
    expect(noms).toEqual(["intendance-0000e2e00000"]);
  } finally {
    writeFileSync(SW, swAvant);
    writeFileSync(INDEX, indexAvant);
  }
});
