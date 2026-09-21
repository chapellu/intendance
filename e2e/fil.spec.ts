// La passe de planification, de bout en bout — T49, T50, T51.
//
// C'EST LE PARCOURS QUI DIT SI LA SESSION EXISTE. Le fil traverse tout : un
// réglage en base pour l'itinéraire, le routeur pour chaque pas, le journal pour
// les questions, la table des créneaux pour chaque plat posé, et le tout doit
// revenir en un écran qui dit « c'est fini ». Aucun test unitaire ne peut le
// dire — il en faudrait un qui monte Dexie, le hash et le rendu, c'est-à-dire
// précisément ce qu'il ne monte pas.

import { expect, test, type Page } from "@playwright/test";
import { libellePoser } from "../src/ui/phrases";
import { attendreLApp, repondreAuxQuestions } from "./parcours";

const question = (page: Page) => page.locator(".co-question");
const carte = (page: Page) => page.locator(".co-jouable");

/**
 * Le pas courant, quelle que soit sa forme — une question ou une main.
 *
 * C'ÉTAIT `.co-points` AVANT T88, et c'est tout ce que le ticket a changé ici.
 * La barre de points était le seul repère stable du parcours ; en la cachant on
 * lui retire son point d'appui, pas ses promesses. Ce qu'on attend désormais est
 * ce qu'un doigt attend : que le pas s'affiche.
 */
const pas = (page: Page) => page.locator(".co-question, .co-jouable");

/** Lance une passe de N repas par la PORTE DE LA FACETTE — `#/cuisine`, qui est
 *  ce que touche le bouton de la barre du bas. */
async function lancer(page: Page, repas: string): Promise<void> {
  await page.goto("/#/cuisine");
  await attendreLApp(page);
  await expect(page.getByText("Combien de repas ?")).toBeVisible();
  await page.getByRole("button", { name: repas, exact: true }).dispatchEvent("click");
  await expect(pas(page).first()).toBeVisible({ timeout: 30_000 });
}

/** Règle le pas courant en posant la première carte, et attend d'avoir bougé. */
async function poserLePas(page: Page): Promise<void> {
  await repondreAuxQuestions(page);
  const avant = (await carte(page).first().locator(".tete .nom").innerText()).trim();
  await carte(page).first().getByRole("button", { name: libellePoser(false) }).dispatchEvent("click");
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

  // TROIS PAS, ET C'EST L'HORIZON QUI LES A COMPTÉS. Le compte se lisait sur la
  // barre de points ; il se lit maintenant en toutes lettres, ce qui est la
  // seule chose que le fil ait jamais comptée pour de bon (`avancement`).
  await expect(page.getByText("0 sur 3")).toBeVisible();
});

test("l’agenda de la semaine ne s’affiche nulle part — T88", async ({ page }) => {
  // LA PROMESSE EST « CACHÉ », PAS « SUPPRIMÉ », et c'est pour ça qu'elle se
  // teste : `JOURS_VISIBLES` rallume tout, et ce parcours est ce qui rend le
  // rallumage délibéré plutôt qu'accidentel. Demandé le 20/09/2026 — « ça ne me
  // sert à rien actuellement et ça me complique plus les choses ».
  await lancer(page, "3 repas");

  // Plus de barre de créneaux : c'est elle qui offrait de sauter du déjeuner au
  // dîner au milieu d'une décision, et donc de perdre la main qu'on regardait.
  await expect(page.locator(".co-points")).toHaveCount(0);
  // Plus de sous-titre de semaine, et plus d'onglets de calendrier.
  await expect(page.locator(".co-tete .sous")).toHaveCount(0);
  const sousnav = page.locator(".co-sousnav a");
  await expect(sousnav).toHaveText(["Proposer", "Stock", "Courses"]);
});

test("une question est un PAS du fil, et la main attend derrière elle", async ({ page }) => {
  await lancer(page, "3 repas");

  // Sur une base neuve, tout central est inconnu : le premier pas EST une
  // question. C'est le démarrage à froid annoncé par T33.
  await expect(question(page)).toBeVisible();

  // LA MAIN ATTEND VRAIMENT — c'est ce qui a fait perdre les variantes B et C
  // du rail, qui montraient les cartes pendant qu'elles demandaient.
  await expect(carte(page)).toHaveCount(0);

  // Et elle NE FAIT PAS AVANCER LE COMPTE : une question est un pas du fil, mais
  // elle ne règle aucun repas. Le compte du haut dit ce qui est décidé, et rien
  // n'est encore décidé.
  await expect(page.getByText("0 sur 3")).toBeVisible();
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
  // Et elle reprend AVEC SON COMPTE : un repas de posé, deux qui attendent.
  await expect(page.getByText("1 sur 3")).toBeVisible({ timeout: 30_000 });
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
  await expect(pas(page).first()).toBeVisible({ timeout: 30_000 });

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

test("une passe que la semaine a dépassée ne ferme pas la cuisine", async ({ page }) => {
  // LE BUG DU 21/09, DE BOUT EN BOUT, ET IL FALLAIT L'HORLOGE POUR L'AVOIR.
  //
  // La semaine est un rail glissant de sept jours qui commence AUJOURD'HUI. Une
  // passe ouverte jeudi vise donc, le lundi suivant, trois créneaux qui
  // n'existent plus — et le fil y renvoyait à chaque ouverture, sur un écran
  // dont le seul bouton ramenait à la semaine. Comme la porte de la facette
  // ouvre sur le fil depuis T88, la cuisine entière devenait une boucle :
  // impossible de lancer une passe.
  //
  // C'est une promesse du TEMPS, pas d'un écran : elle ne peut se vérifier
  // qu'en faisant vieillir l'app sous une passe ouverte, ce qu'aucun test
  // unitaire ne monte (routeur + Dexie + rendu).
  await page.clock.install();
  await lancer(page, "3 repas");

  // Quatre jours passent, la passe reste ouverte sur le créneau où on l'a
  // laissée — c'est l'onglet que le téléphone a gardé.
  await page.clock.fastForward(4 * 24 * 60 * 60 * 1000);
  await page.reload();
  await attendreLApp(page);

  await expect(page.getByText("Ce créneau n’est plus là")).toHaveCount(0);
  // Pas d'agenda non plus : l'impasse renvoyait sur la semaine, que T88 cache.
  await expect(page.locator(".co-slots")).toHaveCount(0);
  // Et on peut relancer une passe, ce qui est tout ce qu'on demandait.
  await expect(page.getByText("Combien de repas ?")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "3 repas", exact: true }).dispatchEvent("click");
  await expect(pas(page).first()).toBeVisible({ timeout: 30_000 });
});
