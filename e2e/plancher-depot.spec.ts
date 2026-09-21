// POSER UN PLANCHER DE DÉPÔT À LA MAIN — T89.
//
// CE QUE CE PARCOURS TIENT, ET QU'AUCUN TEST UNITAIRE NE PEUT TENIR : jusqu'ici
// un plancher de congélateur ne pouvait NAÎTRE que d'une proposition, et une
// proposition ne paraît qu'après deux cuissons au journal. Sur une app neuve le
// journal est vide — donc, jusqu'à ce ticket, il n'existait aucune suite de
// gestes menant à un plancher posé. `stock.vue.test.ts` dit que la vue sait
// fabriquer la liste ; ici on vérifie qu'un DOIGT en tire une décision, et que
// la décision survit.
//
// LE JOURNAL RESTE VIDE, ET C'EST LE POINT. Rien n'est cuisiné, donc la section
// ne propose rien d'elle-même. Si un plancher apparaît, c'est la main, et rien
// d'autre.
//
// `sauce-bolognaise` EST LE BON TÉMOIN : un seul plat le produit (« Sauce
// bolognaise »), il se congèle, et l'amorce du catalogue en porte deux portions
// — donc un plancher à 1 est TENU et un plancher à 3 ne l'est pas, ce qui donne
// les deux côtés du seuil sans rien cuisiner.

import { expect, test } from "@playwright/test";
import { attendreLApp } from "./parcours";

type Page = import("@playwright/test").Page;

/** La ligne d'un plancher POSÉ, désignée par le seul bouton qui n'existe que
 *  là. Le nom ne suffirait pas : le même type paraît dans la liste des lots,
 *  plus bas sur le même écran, et paraissait dans « Sur quoi ? » à l'instant. */
const posee = (page: Page, nom: string) =>
  page
    .locator(".co-lot")
    .filter({ hasText: nom })
    .filter({ has: page.getByRole("button", { name: "Ne plus suivre" }) });

/** La ligne d'un type POSABLE — celle qui offre de commencer à le suivre. */
const posable = (page: Page, nom: string) =>
  page
    .locator(".co-lot")
    .filter({ hasText: nom })
    .filter({ has: page.getByRole("button", { name: "En garder 1" }) });

test("un plancher de congélateur se pose à la main, se règle, et se retire", async ({ page }) => {
  await page.goto("/#/cuisine/stock");
  await attendreLApp(page);

  await expect(page.getByText("Ce qu’on veut toujours avoir")).toBeVisible();
  // RIEN N'EST POSÉ ET RIEN N'EST PROPOSÉ : le journal est vide. C'est l'état
  // dans lequel l'app vivait, et dont elle ne pouvait pas sortir.
  await expect(page.getByRole("button", { name: "Ne plus suivre" })).toHaveCount(0);

  await page
    .getByRole("button", { name: "en ajouter un au congélateur" })
    .dispatchEvent("click");

  // CE QUI EST INTERDIT EST NOMMÉ, comme T46 le fait au placard : un plancher
  // compte des portions au tiroir, donc il ne se pose pas sur ce qui n'y va pas.
  await expect(page.getByText(/Pas de plancher sur ce qui ne se congèle pas/)).toBeVisible();

  // LA LISTE MONTRE CE QUI RECHARGE AVANT LE GESTE : accepter un plancher, c'est
  // accepter de revoir ces plats-là (T34).
  await expect(posable(page, "sauce bolognaise")).toContainText("Sauce bolognaise");
  await posable(page, "sauce bolognaise")
    .getByRole("button", { name: "En garder 1" })
    .dispatchEvent("click");

  // ON ATTEND UN PROGRÈS EXPLICITE, jamais la disparition d'un texte : la ligne
  // change de section sous nous à chaque écriture.
  await expect(posee(page, "sauce bolognaise")).toBeVisible();

  // Deux portions à l'amorce, plancher à 1 : TENU. Un plancher est un seuil, il
  // ne réclame rien tant qu'on est au-dessus.
  await expect(posee(page, "sauce bolognaise")).toContainText("2 / 1");
  await expect(posee(page, "sauce bolognaise")).toContainText("tenu");

  // On monte de deux crans : le tiroir passe sous son plancher, et le dit.
  const plus = () => posee(page, "sauce bolognaise").getByRole("button", { name: "+" });
  await plus().dispatchEvent("click");
  await expect(posee(page, "sauce bolognaise")).toContainText("2 / 2");
  await plus().dispatchEvent("click");
  await expect(posee(page, "sauce bolognaise")).toContainText("2 / 3");
  await expect(posee(page, "sauce bolognaise")).toContainText("à refaire");

  // ET ÇA SURVIT AU RECHARGEMENT. Le plancher est une décision, donc il est en
  // base ; ce qu'il y a EN FACE est recalculé. C'est la règle de tête de
  // `db/schema.ts`, et c'est ce qui sépare un réglage d'une illusion.
  await page.reload();
  await attendreLApp(page);
  await expect(posee(page, "sauce bolognaise")).toContainText("2 / 3");
});

test("le « − » descend jusqu'à un et s'y arrête", async ({ page }) => {
  // UN PLANCHER À ZÉRO N'EXISTE PAS — toujours tenu, jamais sous son seuil, il
  // occuperait une ligne à prétendre qu'on suit quelque chose. Et descendre à
  // zéro ne peut pas valoir retrait ici : retirer, c'est refuser, et un bouton
  // de réglage n'a pas à décider « ne redemande jamais » au douzième appui.
  await page.goto("/#/cuisine/stock");
  await attendreLApp(page);
  await page
    .getByRole("button", { name: "en ajouter un au congélateur" })
    .dispatchEvent("click");
  await posable(page, "sauce bolognaise")
    .getByRole("button", { name: "En garder 1" })
    .dispatchEvent("click");
  await expect(posee(page, "sauce bolognaise")).toContainText("2 / 1");

  const moins = () => posee(page, "sauce bolognaise").getByRole("button", { name: "−" });
  await moins().dispatchEvent("click");
  await moins().dispatchEvent("click");

  // Toujours là, toujours à un. L'assertion porte sur ce qui RESTE, parce
  // qu'une assertion négative passerait aussi si la ligne avait disparu.
  await expect(posee(page, "sauce bolognaise")).toContainText("2 / 1");
});

test("cesser de suivre un type le laisse posable, et ne le repropose pas", async ({ page }) => {
  // LE RETRAIT S'ÉCRIT `niveau: null`, c'est-à-dire un refus. Cesser de suivre
  // un type qu'on suivait est la réponse la plus informée qu'on puisse donner
  // sur lui ; le reproposer serait redemander ce qu'on vient d'entendre. Il
  // reste posable à la main, rangé à la fin — un refus n'est pas un interdit.
  await page.goto("/#/cuisine/stock");
  await attendreLApp(page);
  await page
    .getByRole("button", { name: "en ajouter un au congélateur" })
    .dispatchEvent("click");
  await posable(page, "sauce bolognaise")
    .getByRole("button", { name: "En garder 1" })
    .dispatchEvent("click");
  await expect(posee(page, "sauce bolognaise")).toBeVisible();

  await posee(page, "sauce bolognaise")
    .getByRole("button", { name: "Ne plus suivre" })
    .dispatchEvent("click");

  // Il redevient posable, et il le dit : « déjà écarté ».
  await expect(posable(page, "sauce bolognaise")).toContainText("déjà écarté");
  await expect(page.getByRole("button", { name: "Ne plus suivre" })).toHaveCount(0);

  await page.reload();
  await attendreLApp(page);
  await page
    .getByRole("button", { name: "en ajouter un au congélateur" })
    .dispatchEvent("click");
  await expect(posable(page, "sauce bolognaise")).toContainText("déjà écarté");
});
