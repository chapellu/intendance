// Les gestes que plusieurs parcours refont, et rien d'autre.
//
// AUCUNE ÉCRITURE EN BASE ICI. On pourrait semer une semaine dans IndexedDB en
// trois lignes et gagner dix secondes ; on poserait alors des plats que l'app
// n'a jamais acceptés, et le jour où « poser » cesserait de fonctionner, les
// parcours des courses resteraient verts. Ce qu'un doigt fait, le doigt le
// fait.

import { expect, type Page } from "@playwright/test";

/** La première case libre de la semaine, dépliée. Renvoie le nom du plat qu'on
 *  vient d'y poser. */
export async function poserUnPlat(page: Page): Promise<string> {
  await page.goto("/#/cuisine/semaine");
  await attendreLApp(page);

  await page.locator(".co-slot", { hasText: "à poser" }).first().locator("button.resume").click();
  // On désigne la case par le fait qu'elle est OUVERTE, pas par son texte : son
  // texte est précisément ce qu'on va changer.
  await page.locator(".co-slot.ouvert").getByRole("link", { name: "poser un plat" }).click();

  const carte = page.locator(".co-jouable").first();
  await expect(carte).toBeVisible();
  const titre = (await carte.locator(".tete .nom").innerText()).trim();
  await carte.getByRole("button", { name: "Poser sur ce créneau" }).click();

  // `jouer` renvoie sur la semaine une fois l'écriture faite : c'est là qu'on
  // sait que le tour est complet, base comprise.
  await expect(page.locator(".co-slots").first()).toBeVisible();
  return titre;
}

/**
 * Ajoute une brique à côté du plat déjà posé sur la première case décidée, et
 * renvoie son nom.
 *
 * Le repas peut être complet ou non selon la carte tirée — la main est
 * déterministe mais dépend du corpus. On passe donc par le bouton « Ajouter
 * quand même » quand il est là : le parcours doit prouver qu'on PEUT assembler,
 * pas que la première carte manque de quelque chose.
 */
export async function ajouterUnAccompagnement(page: Page, plat: string): Promise<string> {
  await page.goto("/#/cuisine/semaine");
  await attendreLApp(page);
  // La case se désigne par le plat qu'elle porte : c'est la seule chose qui la
  // distingue des treize autres, et « la première » ne veut plus rien dire une
  // fois qu'un plat y est posé.
  await page.locator(".co-slot", { hasText: plat }).first().locator("button.resume").click();
  await page.locator(".co-slot.ouvert").getByRole("link", { name: "changer le plat" }).click();

  const assiette = page.locator(".co-assiette");
  await expect(assiette).toBeVisible();
  const quandMeme = assiette.getByRole("button", { name: "Ajouter quand même" });
  if (await quandMeme.isVisible()) await quandMeme.click();

  const brique = assiette.locator(".brique").first();
  const nom = (await brique.locator(".nom").innerText()).trim();
  await brique.getByRole("button", { name: "Ajouter" }).click();
  await expect(assiette.locator(".l", { hasText: nom })).toBeVisible();
  return nom;
}

/** L'app a fini de charger : la barre des facettes est le dernier élément que
 *  la coquille monte, et elle n'apparaît qu'une fois le catalogue lu, l'amorce
 *  du stock passée et la semaine calculée. */
export async function attendreLApp(page: Page): Promise<void> {
  await expect(page.locator(".co-barre")).toBeVisible({ timeout: 30_000 });
}

/** Le service worker a pris la main. Tant qu'il n'y a pas de `controller`, la
 *  page est servie par le réseau et couper le réseau ne prouverait rien. */
export async function attendreLeWorker(page: Page): Promise<void> {
  await page.waitForFunction(async () => {
    await navigator.serviceWorker.ready;
    return !!navigator.serviceWorker.controller;
  }, null, { timeout: 30_000 });
}
