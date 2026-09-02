// LE PARCOURS QUI PROUVE LA PROMESSE DE T25–T32 : le stock descend.
//
// Tout le reste de cette livraison — le journal, les deux modes de décrément,
// les classes, la confiance — n'existe que pour rendre cette phrase vraie.
// Aucun test unitaire ne peut la dire : il faudrait traverser le routeur, la
// fiche recette, Dexie, la requête vive et deux écrans, c'est-à-dire exactement
// ce qu'un test unitaire ne traverse pas.
//
// LE PARCOURS EST CELUI D'UN DOIGT, jamais une écriture semée en base. Semer un
// événement cuisiné gagnerait quinze secondes et prouverait que `rejouer()`
// fonctionne — ce que `model/journal.test.ts` dit déjà. Ce qu'on veut savoir
// ici, c'est que TERMINER UNE RECETTE journalise, ce qui est une tout autre
// affirmation.

import { expect, test } from "@playwright/test";
import { attendreLApp, poserUnPlat } from "./parcours";

test("terminer une recette journalise, et la confiance du placard se dépense", async ({ page }) => {
  // LE PLUS LONG PARCOURS DE LA SUITE, et il l'est pour une raison : il traverse
  // quatre écrans et autant d'étapes de recette qu'en porte le plat tiré. Le
  // délai par défaut de 30 s le serrait de trop près — il passait seul et
  // rougissait en suite, ce qui est la pire des deux façons d'échouer.
  test.slow();

  const titre = await poserUnPlat(page);

  // ON LIT LE CRÉNEAU SUR LE SLOT POSÉ. Le lien « En cuisine » vit sur l'écran
  // « Aujourd'hui », donc seulement pour les créneaux du jour, alors que le
  // plat qu'on vient de poser peut tomber n'importe quand dans la semaine. Le
  // href de « régler les parts » porte le couple (jour, repas) — la même clé
  // que la base — et c'est elle qui ouvre la fiche.
  const slot = page.locator(".co-slot").filter({ hasText: titre }).first();
  await slot.locator("button.resume").click();
  const href = await page
    .locator(".co-slot.ouvert")
    .getByRole("link", { name: "régler les parts" })
    .getAttribute("href");
  const creneau = /#\/cuisine\/parts\/(\d{4}-\d{2}-\d{2})\/([^/]+)/.exec(href ?? "");
  expect(creneau, `href inattendu : ${href}`).not.toBeNull();
  const [, jour, repas] = creneau!;

  // L'INVENTAIRE AVANT, ET CE QU'ON Y MESURE.
  //
  // Pas le nombre de lots : tous les plats n'`emit` pas — l'omelette du
  // potager s'en explique dans son propre fichier (« 4 portions pour un foyer
  // qui en pèse 2,75 ») — donc un parcours qui compte des lots dépend du plat
  // que « Poser » a tiré, et se met à rougir sans qu'aucun code ait changé.
  //
  // Ce qui est vrai QUEL QUE SOIT LE PLAT, c'est l'asymétrie de T30 : cuisiner
  // n'est pas observer, donc ça DÉPENSE la confiance. Journal vide, tout le
  // garde-manger date du relevé et se lit « vu » ; après une cuisson, ce que le
  // plat a touché ne se lit plus « vu ».
  const lignes = page.locator('.co-espace:has-text("Relever") .src');
  await page.goto("/#/cuisine/stock");
  await attendreLApp(page);
  await expect(lignes.first()).toBeVisible();
  expect(await lignes.filter({ hasText: /estimé|à vérifier/ }).count()).toBe(0);

  await page.goto(`/#/cuisine/cuisiner/${jour}/${repas}`);
  await expect(page.getByRole("button", { name: /C’est fait|Terminer/ })).toBeVisible({
    timeout: 30_000,
  });

  // Avancer jusqu'à la dernière étape, puis terminer.
  for (let i = 0; i < 40; i += 1) {
    const suiv = page.getByRole("button", { name: /C’est fait|Terminer/ });
    await expect(suiv).toBeVisible();
    const dernier = (await suiv.innerText()).includes("Terminer");
    await suiv.click();
    if (dernier) break;
  }

  // ON ATTEND QUE LA FICHE SE FERME D'ELLE-MÊME. « Terminer » journalise, PUIS
  // sort — et la sortie est un `history.back()` asynchrone. Naviguer sans
  // attendre le ferait revenir en arrière par-dessus notre propre `goto`, ce qui
  // est exactement ce qui a fait échouer la première version de ce parcours.
  await expect(page).not.toHaveURL(/cuisine\/cuisiner/, { timeout: 15_000 });

  // L'INVENTAIRE APRÈS. Au moins une denrée a cessé d'être « vue » : le journal
  // a reçu la cuisson, le rejeu l'a décrémentée, et la confiance s'est
  // dépensée. C'est toute la chaîne, du doigt à l'écran.
  await page.goto("/#/cuisine/stock");
  await attendreLApp(page);
  await expect(lignes.filter({ hasText: /estimé|à vérifier/ }).first()).toBeVisible({
    timeout: 15_000,
  });

  // ET ÇA SURVIT AU RECHARGEMENT — la différence entre une projection et un
  // fait. Le niveau n'est stocké nulle part : c'est le JOURNAL qui a survécu, et
  // le rejeu qui refait le chiffre.
  await page.reload();
  await attendreLApp(page);
  await expect(lignes.filter({ hasText: /estimé|à vérifier/ }).first()).toBeVisible();
});

test("relever une zone remet le placard à ce que l'œil voit", async ({ page }) => {
  await page.goto("/#/cuisine/stock");
  await attendreLApp(page);

  // La première zone du garde-manger, et son relevé.
  const relever = page.getByRole("button", { name: "Relever" }).first();
  await expect(relever).toBeVisible();
  await relever.click();

  // Tout descendre à zéro : la zone est déclarée vide, ce qui est le geste que
  // rien d'autre dans l'app ne sait faire — dire « il n'y en a plus » sans
  // énumérer les absents.
  const moins = page.getByRole("button", { name: "−" });
  const n = await moins.count();
  expect(n).toBeGreaterThan(0);
  for (let i = 0; i < n; i += 1) for (let k = 0; k < 12; k += 1) await moins.nth(i).click();

  await page.getByRole("button", { name: /Valider le relevé/ }).click();

  // La zone ne porte plus rien, et ça survit au rechargement.
  await page.reload();
  await attendreLApp(page);
  await expect(page.locator(".co-espace", { hasText: "Rien de relevé ici." }).first()).toBeVisible();
});
