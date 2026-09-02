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
  // quatre écrans et autant d'étapes de recette qu'en porte le plat tiré.
  //
  // UN BUDGET EXPLICITE, PAS `test.slow()`. Les deux échecs CI de ce parcours
  // ont buté très exactement sur 90 s — c'est-à-dire sur le plafond que
  // `test.slow()` accorde (trois fois 30 s). Un test qui meurt pile sur son
  // budget dit d'abord qu'il est à l'étroit, avant de dire qu'il est cassé.
  // Le runner ARM du CI met environ deux minutes pour huit parcours là où
  // cette machine en met trente secondes ; le budget est donc posé pour lui,
  // pas pour ici.
  test.setTimeout(180_000);

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
  //
  // ON ATTEND QUE L'ÉTAPE AIT BOUGÉ AVANT DE RECLIQUER, et c'est le CI qui l'a
  // appris à ce parcours, deux fois.
  //
  // Un clic ici n'est pas synchrone : il écrit dans Dexie, la requête vive
  // repart, React re-rend, et le bouton se détache le temps du re-rendu.
  // Enchaîner les clics sans attendre marche sur une machine rapide — chaque
  // clic a le temps de se poser — et se met à empiler les clics sur un runner
  // lent. Ni `click()` (qui réessaie sur un élément détaché) ni
  // `dispatchEvent()` (qui ne réessaie pas) ne règlent ça : le problème n'est
  // pas COMMENT on clique, c'est qu'on clique trop tôt.
  //
  // L'indicateur « Étape N sur M » est le témoin fiable : tant qu'il n'a pas
  // changé, le clic précédent n'est pas arrivé au bout. C'est aussi ce qui
  // rendra un vrai blocage lisible — le test dira quelle étape n'avance pas,
  // au lieu de « bouton introuvable ».
  //
  // ET AUCUN CLIC N'EST RETENTÉ — pas seulement le dernier.
  //
  // C'est la chronologie de la troisième trace CI qui l'a montré : la boucle
  // avait parcouru toutes les étapes correctement avant de se bloquer sur
  // « Terminer ». Le seul scénario compatible est qu'un `click()` INTERMÉDIAIRE
  // soit parti deux fois — Playwright réessaie quand l'élément se détache sous
  // lui, ce que chaque re-rendu provoque — la seconde frappe tombant sur le
  // « Terminer » que la première venait de faire apparaître. L'app terminait
  // donc la recette pendant que le test se croyait au milieu.
  //
  // `dispatchEvent` envoie l'événement UNE fois, sans boucle de réessai. Un
  // clic, une étape, et l'attente ci-dessous vérifie que l'étape a bougé —
  // ce que `not.toHaveText` seul ne suffisait pas à garantir, puisqu'il passe
  // aussi quand l'élément a disparu.
  const etape = page.locator(".co-kicker.accent");
  for (let i = 0; i < 40; i += 1) {
    const suiv = page.getByRole("button", { name: /C’est fait|Terminer/ });
    await expect(suiv).toBeVisible();

    if ((await suiv.innerText()).includes("Terminer")) {
      await suiv.dispatchEvent("click");
      break;
    }

    const avant = await etape.innerText();
    await suiv.dispatchEvent("click");
    // « L'étape porte un texte, ET ce texte a changé » — deux affirmations, et
    // il faut les deux : la seconde seule est satisfaite par un écran vide.
    await expect(etape).toBeVisible({ timeout: 15_000 });
    await expect(etape).not.toHaveText(avant, { timeout: 15_000 });
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
