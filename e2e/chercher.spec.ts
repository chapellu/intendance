// CHERCHER UN PLAT QU'ON A DÉJÀ DANS LA TÊTE — T80.
//
// La main répond à « qu'est-ce qu'on mange ». Elle ne répond pas à « je veux
// faire ça » : quatre cartes tirées sur cent trente-huit plats, et aucun chemin
// pour nommer le sien — sinon repiocher jusqu'à ce qu'il tombe, ce qu'il peut
// ne jamais faire puisque le score l'écarte peut-être exprès.
//
// CE QUE CE PARCOURS TIENT, ET QU'AUCUN TEST UNITAIRE NE PEUT TENIR :
// `chercher()` est déjà éprouvé par `poser.vue.test.ts`, qui dit ce qu'il REND.
// Ici on vérifie que la frappe arrive jusqu'aux cartes, que le champ passe
// DEVANT la file de questions — la décision de design du ticket —, et que le
// plat écarté reste posable au lieu d'être simplement montré.
//
// AUCUN CATALOGUE TRUQUÉ, CONTRAIREMENT À `sans-recette`. Le plat cherché ici
// existe vraiment et son titre est stable depuis le premier export ; si
// « Gnocchis poêlés aux légumes » quittait le corpus, c'est ce fichier qu'il
// faudrait relire, et le message d'erreur le dira.

import { expect, test } from "@playwright/test";
import { libellePoser } from "../src/ui/phrases";
import { attendreLApp } from "./parcours";

const PLAT = "Gnocchis poêlés aux légumes";

/** Ouvre « Poser » sur la première case libre de la semaine, SANS répondre aux
 *  questions : c'est précisément ce que ce ticket rend possible. */
async function ouvrirPoser(page: import("@playwright/test").Page): Promise<void> {
  await page.goto("/#/cuisine/semaine");
  await attendreLApp(page);
  await page.locator(".co-slot.libre").first().locator("button.resume").click();
  await page.locator(".co-slot.ouvert").getByRole("link", { name: "poser un plat" }).click();
  // L'écran ne rend RIEN tant qu'il n'a pas le journal — une main calculée sans
  // lui serait une main qu'on sait fausse. Le champ arrive avec le reste.
  await expect(page.getByLabel("chercher un plat par son nom")).toBeVisible({ timeout: 30_000 });
}

test("le champ passe devant la file de questions", async ({ page }) => {
  await ouvrirPoser(page);

  // SUR UNE APP NEUVE, LA QUESTION EST LE CAS NORMAL : rien n'a jamais été
  // relevé, donc tout central est inconnu. C'est exactement la situation où
  // réserver la recherche aux créneaux sans question l'aurait retirée — on
  // n'allait pas faire payer trois relevés de placard à quelqu'un qui sait
  // déjà ce qu'il veut faire.
  await expect(page.locator(".co-question")).toBeVisible({ timeout: 30_000 });

  await page.getByLabel("chercher un plat par son nom").fill("gnocchi");

  const cartes = page.locator(".co-jouable");
  await expect(cartes).toHaveCount(1);
  await expect(cartes.locator(".tete .nom")).toHaveText(PLAT);
  await expect(page.locator(".co-question")).toBeHidden();

  // RIEN N'EST ANNULÉ, TOUT ATTEND. La question revient dès que le champ est
  // vide : la recherche est une parenthèse, pas une sortie.
  await page.getByRole("button", { name: "Effacer" }).dispatchEvent("click");
  await expect(page.locator(".co-question")).toBeVisible();
});

test("le plat cherché se pose, et il se retrouve en disant qu'il est déjà là", async ({
  page,
}) => {
  await ouvrirPoser(page);
  await page.getByLabel("chercher un plat par son nom").fill("gnocchi");

  const carte = page.locator(".co-jouable").first();
  await expect(carte.locator(".tete .nom")).toHaveText(PLAT);
  // AUCUN ÉCART SUR UN PLAT QU'ON N'A PAS ENCORE POSÉ : la carte cherchée est
  // une carte comme les autres tant que rien ne l'écarte.
  await expect(carte.locator(".co-ecart")).toHaveCount(0);

  // `dispatchEvent` et pas `.click()` : poser remplace tout le bloc sous le
  // doigt, et Playwright réessaierait sur l'élément détaché.
  await carte.getByRole("button", { name: libellePoser(false) }).dispatchEvent("click");
  // On atterrit sur « Posés » depuis le 21/09 ; la suite du parcours a besoin
  // de la grille, qui est l'écran d'où l'on ouvre une case précise.
  await expect(page.locator(".co-lot").filter({ hasText: PLAT })).toBeVisible();
  await page.goto("/#/cuisine/semaine");
  await attendreLApp(page);

  // LA CASE SUIVANTE, ET LE MÊME PLAT. C'est le cas qui a motivé l'écart :
  // l'app ne le reproposera plus de la semaine, et sans un mot on croirait
  // qu'il a disparu du catalogue.
  await page.locator(".co-slot.libre").first().locator("button.resume").click();
  await page.locator(".co-slot.ouvert").getByRole("link", { name: "poser un plat" }).click();
  await page.getByLabel("chercher un plat par son nom").fill("gnocchi");

  const revu = page.locator(".co-jouable").first();
  await expect(revu.locator(".tete .nom")).toHaveText(PLAT);
  await expect(revu.locator(".co-ecart")).toContainText("déjà posé");

  // ET LE GESTE RESTE OFFERT — « quand même » est le mot qui tient la promesse.
  // Montrer un plat pour constater qu'on ne peut pas le poser aurait été un
  // filtre poli, c'est-à-dire le chemin que T78 a écarté.
  await expect(revu.getByRole("button", { name: libellePoser(true) })).toBeEnabled();
});

test("une frappe qui ne ramène rien le dit, et une trop large dit ce qu'elle coupe", async ({
  page,
}) => {
  await ouvrirPoser(page);
  const champ = page.getByLabel("chercher un plat par son nom");

  await champ.fill("zzzz");
  await expect(page.locator(".co-jouable")).toHaveCount(0);
  await expect(page.locator(".co-vide")).toContainText("Aucun plat ne porte ce nom");

  // MESURÉ : « salade » ramène onze titres du corpus, au-dessus des huit qu'on
  // montre. Une liste coupée en silence fait chercher deux fois le plat qui
  // n'y était pas.
  await champ.fill("salade");
  await expect(page.locator(".co-jouable")).toHaveCount(8);
  await expect(page.locator(".co-note").last()).toContainText("autres plats portent ce nom");
});
