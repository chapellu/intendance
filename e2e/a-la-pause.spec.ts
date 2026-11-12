// LA PAUSE DE 15 H, DEPUIS LE COCKPIT — T128 et T129 (Workspace#66).
//
// POURQUOI UN PARCOURS : `proposerCeSoir()` est tenu par `pause.test.ts`, qui
// dit ce qu'il RANGE. Ce qu'aucun test unitaire ne peut dire, c'est que le doigt
// y arrive en un ou deux taps depuis l'écran d'ouverture, que le plat choisi se
// POSE sur le dîner de ce soir (une écriture, un `useLiveQuery` qui la relit),
// et que la fiche s'ouvre sur sa MISE EN PLACE et pas sur un résumé de lecture —
// la différence entre les deux est le seul `pose` que la fiche relit en base.
//
// L'HEURE EST FIXÉE À 15 H, LE JOUR EST LE PROCHAIN JOUR DE COURSES (T185). Un jour codé en dur
// pourrit pendant la nuit (`fiche-provenance.spec.ts`, le 15/09) ; une heure non
// fixée ferait dire « prêt vers 22h40 » à un parcours lancé le soir, et la
// phrase testée changerait avec l'horloge du CI.
//
// AUCUNE ÉCRITURE EN BASE ICI (règle de `parcours.ts`) : l'amorce du catalogue
// porte déjà un bocal de bolognaise au congélateur, né le 20/07 — passé la
// moitié de sa fenêtre de 90 jours dès le 4 septembre, il presse pour toujours
// ensuite, et c'est exactement le cas « le congélo d'abord » à montrer.

import { expect, test } from "@playwright/test";
import { libellePoser, LIBELLE_LANCER } from "../src/ui/phrases";
import { attendreLApp, jourDeCoursesISO } from "./parcours";

const A_15H = (): Date => new Date(`${jourDeCoursesISO()}T15:00:00`);

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(A_15H());
});

test("depuis le cockpit, la ligne « Ce soir » nomme un plat et ce qui attend — plus jamais « Rien n'est posé »", async ({
  page,
}) => {
  await page.goto("/#/cockpit");
  await attendreLApp(page);

  const ligne = page.locator(".co-tache", { hasText: "Ce soir :" });
  await expect(ligne).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Rien n'est posé")).toHaveCount(0);
  // Le bocal du congélateur est nommé — c'est la promesse « je compte sur toi
  // pour t'en souvenir ».
  await expect(ligne).toContainText("sauce bolognaise");
  await page.screenshot({ path: "/tmp/a-la-pause-cockpit.png", fullPage: true });

  // Deux taps : la ligne, puis le plat.
  await ligne.locator("a").first().dispatchEvent("click");
  await expect(page).toHaveURL(/#\/cuisine\/ce-soir$/);
  await expect(page.getByText("Ce soir, à 18 h")).toBeVisible();
  const cartes = page.locator(".co-soir:not(.pose)");
  await expect(cartes.first()).toBeVisible();
  // T165 — la main ne garde que ce qui se fait avec ce qui est là : sur la base
  // de démo, une seule carte peut suffire.
  expect(await cartes.count()).toBeGreaterThanOrEqual(1);
  expect(await cartes.count()).toBeLessThanOrEqual(4);
  await page.screenshot({ path: "/tmp/a-la-pause-proposition.png", fullPage: true });

  const titre = (await cartes.first().locator(".nom").innerText()).trim();
  await cartes.first().getByRole("button", { name: LIBELLE_LANCER }).dispatchEvent("click");

  // LA MISE EN PLACE, PAS LA LECTURE : le plat est posé, la fiche le relit.
  await expect(page).toHaveURL(new RegExp(`#/cuisine/cuisiner/${jourDeCoursesISO()}/diner$`));
  await expect(page.locator(".co-fiche-tete .t")).toHaveText(titre);
  await expect(page.locator(".co-mep")).toBeVisible();
  await expect(page.getByRole("button", { name: "‹ Revenir" })).toHaveCount(0);

  // Et le cockpit le sait : le dîner est posé, avec l'heure où le lancer.
  await page.goto("/#/cockpit");
  const posee = page.locator(".co-tache", { hasText: `Ce soir : ${titre}` });
  await expect(posee).toBeVisible({ timeout: 30_000 });
  await expect(posee).toContainText("posé — à lancer avant");
});

test("un seul tap : « Je lance ça » sur la ligne du cockpit pose le plat et ouvre sa mise en place", async ({
  page,
}) => {
  await page.goto("/#/cockpit");
  await attendreLApp(page);

  const ligne = page.locator(".co-tache", { hasText: "Ce soir :" });
  await expect(ligne).toBeVisible({ timeout: 30_000 });
  const titre = (await ligne.locator(".t").innerText()).replace(/^Ce soir : /, "").trim();
  // LE BOUTON NAÎT DÉSACTIVÉ, et `dispatchEvent` ne l'attend pas (T173).
  // « Je lance ça » lit sa propre semaine (`Lancer`, `useSemaine`) et reste
  // désactivé tant qu'elle n'est pas là ; la ligne, elle, s'affiche avant. Un
  // clic envoyé sur un bouton désactivé n'arrive à personne : le parcours
  // restait au cockpit 6 fois sur 15, en local. Un doigt, lui, voit le bouton
  // grisé et attend — le parcours fait de même.
  const lancer = ligne.getByRole("button", { name: LIBELLE_LANCER });
  await expect(lancer).toBeEnabled({ timeout: 30_000 });
  await lancer.dispatchEvent("click");

  await expect(page).toHaveURL(new RegExp(`#/cuisine/cuisiner/${jourDeCoursesISO()}/diner$`));
  await expect(page.locator(".co-fiche-tete .t")).toHaveText(titre);
  await expect(page.locator(".co-mep")).toBeVisible();
});

test("la porte de la facette s'ouvre sur ce soir ; « Combien de repas ? » reste, en dessous", async ({
  page,
}) => {
  await page.goto("/#/cuisine");
  await attendreLApp(page);
  await expect(page.getByText("Ce soir, à 18 h")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Combien de repas ?")).toBeVisible();
  // Le libellé du fil n'a pas bougé : ses cartes posent, celles-ci lancent.
  await expect(page.getByRole("button", { name: libellePoser(false) })).toHaveCount(0);
  await expect(page.getByRole("button", { name: LIBELLE_LANCER }).first()).toBeVisible();
});
