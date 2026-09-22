// LE MINUTEUR SE TAIT SUR UN GESTE, ET L'ÉTAPE NOMME SON RÉCIPIENT — 15/09/2026.
//
// Deux retours du même écran, capture à l'appui, sur la sauce bolognaise :
// « tu mets en permanence un timer alors que je n'ai pas besoin de timer pour
// couper des légumes » et « sur l'étape 2 il me manquerait la casserole à
// utiliser ».
//
// POURQUOI UN PARCOURS ALORS QUE `minuteurUtile` ET `outilDe` SONT DÉJÀ TENUS
// PAR `cuisiner.vue.test.ts` : ces deux tests-là disent ce que les fonctions
// RENDENT. Ce qu'aucun test unitaire ne peut dire, c'est qu'un bouton a bien
// disparu de l'écran et qu'une ligne y est bien apparue — la condition vit dans
// le JSX, et c'est exactement là que le bug d'origine vivait aussi.
//
// LE PLAT EST DÉRIVÉ DU CORPUS, JAMAIS ÉNUMÉRÉ À LA MAIN. La bolognaise a
// déclenché le retour, mais la recopier ici ferait vieillir le parcours à côté
// du catalogue : on cherche la FORME — un geste, puis une cuisson dans un
// récipient nommé — et le corpus fournit l'exemplaire.

import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { minuteurUtile, outilDe } from "../src/ecrans/cuisiner.vue";
import { lireCatalogue } from "../src/model/catalogue";
import { ouvrirLeGuide } from "./parcours";

const catalogue = lireCatalogue(
  JSON.parse(readFileSync("public/cuisine-data.json", "utf8")) as unknown,
);
const { foyer } = catalogue;

const plat = catalogue.plats.find(
  (p) =>
    p.steps.length > 1 &&
    // Une durée écrite, et pourtant pas de minuteur : c'est tout le ticket.
    p.steps[0]!.minutes > 0 &&
    !minuteurUtile(p.steps[0]!) &&
    // Et juste derrière, une cuisson qui, elle, en porte un et nomme sa gamelle.
    minuteurUtile(p.steps[1]!) &&
    outilDe(foyer, p.steps[1]!)?.methode === false,
)!;

const geste = plat.steps[0]!;
const cuisson = plat.steps[1]!;

/** Un plat dont la PREMIÈRE étape porte une astuce — 229 étapes sur 744 en ont
 *  une, donc le corpus en fournit toujours un. Dérivé et jamais nommé à la
 *  main, même parti que ci-dessus. */
const commente = catalogue.plats.find((p) => p.steps[0]?.astuce)!;

test("un geste n'ouvre pas de minuteur, mais garde sa durée", async ({ page }) => {
  await ouvrirLeGuide(page, plat.id);

  await expect(page.locator(".co-etape .geste")).toHaveText(geste.action);
  await expect(page.locator(".co-minuteur")).toHaveCount(0);

  // ON CACHE LE CHRONOMÈTRE, PAS LA DURÉE. Les 8 minutes servent encore à dire
  // à quelle heure s'y mettre ; les retirer aurait résolu la plainte en
  // supprimant l'information, ce qui est l'autre façon de se tromper.
  await expect(page.locator(".co-etape .texte")).toContainText(`${geste.minutes} min.`);
});

test("la cuisson qui suit porte son minuteur ET son récipient", async ({ page }) => {
  await ouvrirLeGuide(page, plat.id);

  // `dispatchEvent` et jamais `.click()` : Playwright réessaie quand l'élément
  // se détache sous lui, ce que chaque re-rendu React provoque. Et on attend un
  // PROGRÈS EXPLICITE — le geste attendu — plutôt qu'un `not.toHaveText`, qui
  // passerait aussi si l'écran avait disparu.
  await page.getByRole("button", { name: /C’est fait|Terminer/ }).dispatchEvent("click");
  await expect(page.locator(".co-etape .geste")).toHaveText(cuisson.action);

  await expect(page.locator(".co-minuteur")).toBeVisible();
  await expect(page.locator(".co-outil")).toContainText(outilDe(foyer, cuisson)!.texte);
});

test("le pourquoi du geste se lit sous le geste, jamais dans le titre", async ({ page }) => {
  await ouvrirLeGuide(page, commente.id);

  const astuce = commente.steps[0]!.astuce!;
  await expect(page.locator(".co-astuce")).toHaveText(astuce);

  // LA MOITIÉ QUI COMPTE, ET LA RAISON D'ÊTRE DU CHAMP. Avant T85 cette phrase
  // vivait DANS `action`, donc dans le `.geste` — rendu en Caprasimo 27 px. Un
  // titre de six lignes dont la moitié n'est pas l'instruction est exactement
  // ce que la capture du 15/09 montrait.
  await expect(page.locator(".co-etape .geste")).not.toContainText(astuce);
});
