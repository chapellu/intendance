// LA FICHE CRÉDITE SA SOURCE, ET NOMME L'USTENSILE — T73 et T74.
//
// Pourquoi un parcours plutôt que deux tests unitaires : `credit()` et
// `aSortir()` sont déjà tenus par `cuisiner.vue.test.ts`, qui dit ce qu'ils
// RENDENT. Ce qu'aucun test unitaire ne peut dire, c'est que ces deux phrases
// arrivent jusqu'à l'œil — elles traversent le routeur, la bascule
// « Ingrédients » et un composant qui, jusqu'à ce bloc, n'affichait ni l'une ni
// l'autre. C'est la seule chose que ce fichier vérifie.
//
// LES PLATS SONT DÉRIVÉS DU CORPUS, JAMAIS ÉNUMÉRÉS À LA MAIN — même parti que
// `stock-descend.spec.ts` et `mise-a-jour.spec.ts`. Une liste de titres
// recopiée ici vieillirait à côté du catalogue sans que personne ne le voie.
//
// LA FICHE S'OUVRE PAR LIEN PROFOND, sur un créneau qu'on n'a pas posé : c'est
// le chemin « lire un candidat avant de choisir », et il évite de faire dépendre
// ce parcours du plat que « Poser » aurait tiré. Le dépôt a déjà payé une fois
// pour cette dépendance cachée (#18 → `stock-descend`).

import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { aujourdhuiISO } from "./parcours";

interface PlatExport {
  id: string;
  source: { auteur: string; ouvrage: string } | null;
  vaisselle: { label: string } | null;
}

const plats: PlatExport[] = JSON.parse(
  readFileSync("public/cuisine-data.json", "utf8"),
).plats;

/** Un plat crédité QUI PORTE AUSSI une vaisselle : les deux phrases se lisent
 *  alors sur un seul chargement, et l'une ne masque pas l'absence de l'autre. */
const credite = plats.find((p) => p.source !== null && p.vaisselle !== null)!;

/** Un plat du foyer — sans source. Il doit DIRE qu'il est du foyer, pas se
 *  taire : c'est la décision du ticket, et c'est ce qui se vérifie ici. */
const duFoyer = plats.find((p) => p.source === null)!;

/** Ouvre la fiche d'un plat et déplie ses ingrédients.
 *
 *  `dispatchEvent("click")` ET PAS `.click()` : Playwright réessaie quand
 *  l'élément se détache sous lui, ce que chaque re-rendu React provoque, et la
 *  seconde frappe tombe sur le bouton que la première vient de faire
 *  apparaître. Le dépôt a payé ce bug trois fois. */
async function ouvrirLesIngredients(page: import("@playwright/test").Page, plat: string) {
  await page.goto(`/#/cuisine/cuisiner/${aujourdhuiISO()}/diner/${plat}`);
  // PAS `attendreLApp` ICI : il attend `.co-barre`, et la fiche est le seul
  // écran qui sorte de la coquille — elle n'a pas de barre du bas. On attend sa
  // propre tête, qui est ce que cet écran monte en premier.
  await expect(page.locator(".co-fiche-tete")).toBeVisible({ timeout: 30_000 });
  const bascule = page.getByRole("button", { name: "Ingrédients" });
  await expect(bascule).toBeVisible({ timeout: 30_000 });
  // Un plat sans `steps` s'ouvre DÉJÀ sur ses ingrédients : basculer le
  // refermerait. On ne bascule que si la liste n'est pas là.
  const liste = page.locator(".co-ing");
  if (!(await liste.isVisible())) {
    await bascule.dispatchEvent("click");
    await expect(liste).toBeVisible();
  }
}

test("une recette d'auteur crédite son auteur, et nomme ce qu'il faut sortir", async ({
  page,
}) => {
  await ouvrirLesIngredients(page, credite.id);

  // Le crédit — « auteur — ouvrage ». `ouvrage` porte déjà la page ; rien n'est
  // recomposé, donc c'est la chaîne du corpus qu'on attend, telle quelle.
  const credit = page.locator(".co-credit");
  await expect(credit).toBeVisible();
  await expect(credit).toContainText(credite.source!.auteur);
  await expect(credit).toContainText(credite.source!.ouvrage);

  // L'ustensile, taille comprise — c'est `vaisselle.label` qui la porte.
  const sortir = page.locator(".co-sortir");
  await expect(sortir).toBeVisible();
  await expect(sortir).toContainText(credite.vaisselle!.label);
});

test("un plat du foyer le dit au lieu de se taire", async ({ page }) => {
  await ouvrirLesIngredients(page, duFoyer.id);

  // LE SILENCE ÉTAIT L'AUTRE OPTION, ET IL A ÉTÉ ÉCARTÉ : un champ vide sur un
  // quart du catalogue ressemble à un bug, alors que ces plats n'ont pas de
  // source parce qu'ils sont à nous.
  await expect(page.locator(".co-credit")).toHaveText("Recette du foyer");
});

test("un plat sans vaisselle ne montre rien plutôt que d'inventer", async ({ page }) => {
  const sansVaisselle = plats.find((p) => p.vaisselle === null);
  test.skip(!sansVaisselle, "le corpus n'a plus de plat sans vaisselle");
  await ouvrirLesIngredients(page, sansVaisselle!.id);

  // Le compilateur n'a pas trouvé d'ustensile à nommer. En inventer un serait
  // pire que se taire — et la fiche reste par ailleurs complète.
  await expect(page.locator(".co-sortir")).toHaveCount(0);
  await expect(page.locator(".co-credit")).toBeVisible();
});
