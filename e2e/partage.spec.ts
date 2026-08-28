// Partager la liste avec quelqu'un qui n'a pas d'intendance.
//
// LE SEUL PARCOURS QUI DEMANDE DEUX NAVIGATEURS, et c'est tout son intérêt.
// L'app est locale : Dexie sur IndexedDB, aucun serveur. Le partage ne se
// prouve donc qu'avec une SECONDE base, vide — un test qui rouvrirait le lien
// dans le même contexte lirait la semaine déjà posée et resterait vert le jour
// où le lien ne transporte plus rien.

import { expect, test } from "@playwright/test";
import { attendreLApp, poserUnPlat } from "./parcours";

test("la liste s'ouvre chez quelqu'un dont la base est vide", async ({ browser }) => {
  const expediteur = await browser.newContext({
    permissions: ["clipboard-read", "clipboard-write"],
  });
  const page = await expediteur.newPage();
  await poserUnPlat(page);

  await page.goto("/#/cuisine/courses");
  await attendreLApp(page);
  const attendus = await page.locator("button.co-art .nom").allInnerTexts();
  expect(attendus.length).toBeGreaterThan(0);

  await page.getByRole("button", { name: /Partager la liste/ }).click();
  await expect(page.getByRole("button", { name: /Lien copié/ })).toBeVisible();
  const lien = await page.evaluate(() => navigator.clipboard.readText());

  // LA BASE DU DESTINATAIRE EST VIDE : contexte neuf, donc IndexedDB neuf.
  // C'est la situation qui a motivé la fonctionnalité — ouvrir l'adresse sur un
  // second téléphone ne montrait rien.
  const destinataire = await browser.newContext();
  const autre = await destinataire.newPage();
  await autre.goto(lien);

  await expect(autre.getByText("La liste de courses")).toBeVisible({ timeout: 30_000 });
  for (const nom of attendus) await expect(autre.getByText(nom, { exact: true }).first()).toBeVisible();

  // ON N'OFFRE PAS CE QU'ON NE PEUT PAS TENIR : sans serveur, cocher ne
  // remonterait nulle part. Il n'y a donc aucune case à cocher, et l'écran dit
  // que c'est un instantané.
  await expect(autre.locator("button.co-art")).toHaveCount(0);
  await expect(autre.getByText(/instantané/)).toBeVisible();

  // Et la base du destinataire n'a pas été écrite : sa propre semaine reste vide.
  await autre.goto("/#/cuisine/semaine");
  await attendreLApp(autre);
  await expect(autre.locator(".co-slot", { hasText: "à poser" }).first()).toBeVisible();

  await expediteur.close();
  await destinataire.close();
});

test("un lien abîmé le dit au lieu d'afficher une liste fausse", async ({ page }) => {
  await page.goto("/#/partage/ceci-nest-pas-un-lien");
  await expect(page.getByText("Ce lien n’est pas lisible")).toBeVisible({ timeout: 30_000 });
});
