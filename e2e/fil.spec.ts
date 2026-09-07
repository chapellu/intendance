// La passe de planification, de bout en bout — T49, T50, T51.
//
// C'EST LE PARCOURS QUI DIT SI LA SESSION EXISTE. Le fil traverse tout : un
// réglage en base pour l'itinéraire, le routeur pour chaque pas, le journal pour
// les questions, la table des créneaux pour chaque plat posé, et le tout doit
// revenir en un écran qui dit « c'est fini ». Aucun test unitaire ne peut le
// dire — il en faudrait un qui monte Dexie, le hash et le rendu, c'est-à-dire
// précisément ce qu'il ne monte pas.

import { expect, test, type Page } from "@playwright/test";
import { attendreLApp, repondreAuxQuestions } from "./parcours";

const question = (page: Page) => page.locator(".co-question");
const carte = (page: Page) => page.locator(".co-jouable");
const points = (page: Page) => page.locator(".co-points .pt");

/** Lance une passe de N repas depuis « La semaine ». */
async function lancer(page: Page, repas: string): Promise<void> {
  await page.goto("/#/cuisine/semaine");
  await attendreLApp(page);
  await page.getByRole("link", { name: "Lancer une passe" }).click();
  await expect(page.getByText("Combien de repas ?")).toBeVisible();
  await page.getByRole("button", { name: repas, exact: true }).dispatchEvent("click");
  await expect(page.locator(".co-points")).toBeVisible({ timeout: 30_000 });
}

/** Règle le pas courant en posant la première carte, et attend d'avoir bougé. */
async function poserLePas(page: Page): Promise<void> {
  await repondreAuxQuestions(page);
  const avant = (await carte(page).first().locator(".tete .nom").innerText()).trim();
  await carte(page).first().getByRole("button", { name: "Poser sur ce créneau" }).dispatchEvent("click");
  await page.waitForFunction(
    (x) => {
      const n = document.querySelector(".co-jouable .tete .nom");
      // Ou bien la main a changé (pas suivant), ou bien la passe est finie.
      return !n || n.textContent?.trim() !== x || !!document.querySelector(".co-h");
    },
    avant,
    { timeout: 30_000 },
  );
}

test("l’horizon se choisit avant de commencer, et il fixe la longueur du rail", async ({ page }) => {
  await lancer(page, "3 repas");

  // TROIS POINTS DE CRÉNEAU, ET C'EST L'HORIZON QUI LES A COMPTÉS. Une question
  // peut s'y ajouter — elle est un pas — donc on compte ceux qui mènent
  // quelque part.
  const destinations = page.locator('.co-points a.pt');
  await expect(destinations).toHaveCount(3);

  // Aucun n'est encore « fait » : la passe vient de commencer.
  await expect(points(page).first()).toBeVisible();
  await expect(page.locator(".co-points .pt.fait")).toHaveCount(0);
});

test("une question est un PAS du fil, et la main attend derrière elle", async ({ page }) => {
  await lancer(page, "3 repas");

  // Sur une base neuve, tout central est inconnu : le premier pas EST une
  // question. C'est le démarrage à froid annoncé par T33.
  await expect(question(page)).toBeVisible();

  // LA MAIN ATTEND VRAIMENT — c'est ce qui a fait perdre les variantes B et C
  // du rail, qui montraient les cartes pendant qu'elles demandaient.
  await expect(carte(page)).toHaveCount(0);

  // Et elle porte son propre point de progression, en pointillé et courant —
  // c'est ce qui en fait un PAS et non un bandeau posé au-dessus des cartes.
  const pointQuestion = page.locator(".co-points .pt.question").first();
  await expect(pointQuestion).toBeVisible();
  await expect(pointQuestion).toHaveClass(/courant/);
  // Le point du créneau, lui, attend son tour : deux points allumés mentiraient
  // sur l'endroit où l'on est.
  await expect(page.locator(".co-points a.pt").first()).not.toHaveClass(/courant/);
});

test("le rail avance d’un pas à la fois et se termine sur une fin", async ({ page }) => {
  await lancer(page, "3 repas");
  for (let n = 0; n < 3; n += 1) await poserLePas(page);

  await expect(page.getByText("La passe est finie")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("les 3 repas sont posés")).toBeVisible();
  await expect(page.getByRole("link", { name: "Voir la liste" })).toBeVisible();
});

test("une passe rouverte reprend où elle en était, sans redemander l’horizon", async ({ page }) => {
  await lancer(page, "3 repas");
  await poserLePas(page);

  await page.goto("/#/cuisine/fil");
  await attendreLApp(page);
  // PAS L'ÉCRAN D'OUVERTURE. Redemander « combien de repas » au milieu d'une
  // passe la recommencerait, et effacerait l'itinéraire qu'on avait arrêté.
  await expect(page.getByText("Combien de repas ?")).toHaveCount(0);
  await expect(page.locator(".co-points .pt.fait").first()).toBeVisible({ timeout: 30_000 });
});

test("« Pas celui-là » n’écrit rien : le créneau reste libre dans la semaine", async ({ page }) => {
  await lancer(page, "3 repas");
  await repondreAuxQuestions(page);

  const libresAvant = await (async () => {
    await page.goto("/#/cuisine/semaine");
    await attendreLApp(page);
    return page.locator(".co-slot.libre").count();
  })();

  await page.goto("/#/cuisine/fil");
  await attendreLApp(page);
  await repondreAuxQuestions(page);
  await page.getByRole("button", { name: "Pas celui-là" }).dispatchEvent("click");
  await expect(page.locator(".co-points")).toBeVisible();

  // T51 : ce bouton raccourcit la passe, c'est de la navigation. Rien n'a été
  // décidé, donc rien ne doit avoir changé dans la semaine.
  await page.goto("/#/cuisine/semaine");
  await attendreLApp(page);
  await expect(page.locator(".co-slot.libre")).toHaveCount(libresAvant);
});

test("un créneau vide ne réclame rien dans la semaine — T51", async ({ page }) => {
  await page.goto("/#/cuisine/semaine");
  await attendreLApp(page);

  // Les cases vides existent, elles sont nombreuses, et aucune ne dit « à
  // poser » : le vide est redevenu une décision pas encore prise.
  await expect(page.locator(".co-slot.libre").first()).toBeVisible();
  await expect(page.getByText("à poser")).toHaveCount(0);
});
