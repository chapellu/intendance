// LE PARCOURS QUI PROUVE LA PROMESSE DE T41 : la liste vit sans plan.
//
// « Ce qui est sous son plancher EST la liste Carrefour. » Aucun test unitaire
// ne peut dire ça : il faudrait traverser l'inventaire, Dexie, la requête vive,
// le rejeu du placard et l'écran des courses — c'est-à-dire exactement les
// coutures qu'un test unitaire ne traverse pas. `courses.vue.test.ts` vérifie
// que la vue sait fabriquer la ligne ; ici on vérifie qu'un DOIGT la fabrique.
//
// LA SEMAINE RESTE VIDE, ET C'EST LE POINT. Aucun plat n'est posé, donc la liste
// n'a aucune raison d'exister — sauf le placard. Et la denrée choisie
// (`graines-courge`, `usage: apero`) est citée par zéro des 86 recettes : il
// n'existe littéralement aucun chemin par lequel la semaine puisse la faire
// apparaître. Si elle est dans la liste, c'est le plancher, et rien d'autre.

import { expect, test } from "@playwright/test";
import { attendreLApp } from "./parcours";

/** La ligne d'un plancher posé, désignée par le seul bouton qui n'existe que
 *  là. Le NOM ne suffirait pas : la même denrée paraît aussi dans le relevé de
 *  sa zone, quelques centimètres plus bas. */
const posee = (page: import("@playwright/test").Page, nom: string) =>
  page
    .locator(".co-lot")
    .filter({ hasText: nom })
    .filter({ has: page.getByRole("button", { name: "Ne plus suivre" }) });

test("un plancher posé au placard part tout seul dans les courses", async ({ page }) => {
  await page.goto("/#/cuisine/courses");
  await attendreLApp(page);
  // On part d'une liste vide : la semaine ne demande rien.
  await expect(page.getByText("Rien à acheter")).toBeVisible();

  await page.goto("/#/cuisine/stock");
  await attendreLApp(page);

  // La section existe et ne propose rien d'elle-même — T39 : ici l'app ne
  // devine aucune habitude, contrairement au congélateur.
  await expect(page.getByText("Ce qu’on veut toujours au placard")).toBeVisible();
  await expect(page.getByRole("button", { name: "Ne plus suivre" })).toHaveCount(0);

  await page.getByRole("button", { name: "En ajouter" }).dispatchEvent("click");

  // T46 — CE QUI EST INTERDIT EST NOMMÉ. L'oignon n'a pas de bouton, et l'app
  // dit pourquoi plutôt que de laisser un trou dans la liste.
  await expect(page.getByText(/Pas de plancher sur.*oignon/)).toBeVisible();

  const candidat = page.locator(".co-lot").filter({ hasText: "graines courge" });
  await candidat.getByRole("button", { name: "En garder 1" }).dispatchEvent("click");

  // ON ATTEND UN PROGRÈS EXPLICITE, jamais la disparition d'un texte : la ligne
  // change de section sous nous à chaque écriture, et `not.toHaveText` passerait
  // aussi si l'écran s'était simplement vidé.
  await expect(posee(page, "graines courge")).toBeVisible();

  // Un plancher à 1 sur un bocal qu'on a déjà est TENU : rien à acheter. C'est
  // la moitié de la promesse — un plancher est un seuil, il ne réclame pas tant
  // qu'on est au-dessus.
  await expect(posee(page, "graines courge")).toContainText("tenu");

  // On monte le niveau d'un cran : le placard passe sous son plancher.
  await posee(page, "graines courge").getByRole("button", { name: "+" }).dispatchEvent("click");
  await expect(posee(page, "graines courge")).toContainText("1 / 2");

  await page.goto("/#/cuisine/courses");
  await attendreLApp(page);

  // LA LIGNE EST LÀ, DANS SON RAYON, ET ELLE DIT POURQUOI. Aucun plat ne la
  // réclame — « 0 plat » aurait été exact et incompréhensible, donc la phrase
  // parle du placard.
  const article = page.locator(".co-art").filter({ hasText: "graines courge" });
  await expect(article).toBeVisible();
  await expect(article).toContainText("sous son plancher — 1 sur 2");
  await expect(article).toContainText("pour l’apéro");
  await expect(article).toContainText("1 unité");

  // ET ÇA SURVIT AU RECHARGEMENT. Le plancher est une décision, donc il est en
  // base ; la ligne, elle, est recalculée — c'est la règle de tête de
  // `db/schema.ts`, et c'est ce qui distingue une liste d'une farce.
  await page.reload();
  await attendreLApp(page);
  await expect(page.locator(".co-art").filter({ hasText: "graines courge" })).toBeVisible();
});
