// LIRE UNE RECETTE N'EST PAS LA CUISINER — T91.
//
// Pourquoi un parcours plutôt qu'un test unitaire : `pourLire()` et
// `tempsDuPlat()` sont déjà tenus par `cuisiner.vue.test.ts`, qui dit ce qu'ils
// RENDENT. Ce qu'aucun test unitaire ne peut dire, c'est quel ÉCRAN sort au
// bout — et c'est tout l'objet du ticket : la même URL rendait le mode guidé,
// une étape à la fois, à quelqu'un qui voulait seulement savoir ce qu'il y a
// dans le plat avant de le poser.
//
// LE LIEN PROFOND EST LE CHEMIN DU BOUTON « FICHE ». Une carte de « Proposer »
// ouvre `#/cuisine/cuisiner/<jour>/<repas>/<plat>` sur un créneau qui ne porte
// pas ce plat (T11) ; y aller directement teste la même chose sans dépendre de
// la main que la proposition aurait tirée. Le dépôt a déjà payé une fois pour
// cette dépendance cachée (#18 → `stock-descend`).
//
// LE PLAT EST DÉRIVÉ DU CORPUS, JAMAIS ÉNUMÉRÉ À LA MAIN — même parti que
// `fiche-provenance.spec.ts` et `stock-descend.spec.ts`.

import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { aujourdhuiISO, ouvrirLeGuide } from "./parcours";

interface EtapeExport {
  action: string;
  minutes: number;
  surveille: boolean;
}

interface PlatExport {
  id: string;
  titre: string;
  steps: EtapeExport[];
}

const plats: PlatExport[] = JSON.parse(
  readFileSync("public/cuisine-data.json", "utf8"),
).plats;

/** Un plat qui a de quoi remplir un résumé : plusieurs gestes, et du temps qui
 *  passe sans personne devant. Les deux moitiés de ce que le résumé promet. */
const long = plats
  .filter((p) => p.steps.length >= 3 && p.steps.some((e) => !e.surveille && e.minutes > 0))
  .sort((a, b) => b.steps.length - a.steps.length)[0]!;

/** Ouvre la fiche d'un plat que rien n'a posé — donc une lecture. */
async function lire(page: import("@playwright/test").Page, plat: string) {
  await page.goto(`/#/cuisine/cuisiner/${aujourdhuiISO()}/diner/${plat}`);
  // PAS `attendreLApp` ICI : la fiche est le seul écran qui sorte de la
  // coquille — elle n'a pas de barre du bas. On attend sa propre tête.
  await expect(page.locator(".co-fiche-tete")).toBeVisible({ timeout: 30_000 });
}

test("une recette qu'on n'a pas posée s'ouvre en résumé, pas en mode guidé", async ({ page }) => {
  await lire(page, long.id);

  // LES QUANTITÉS SONT LÀ SANS QU'ON TOUCHE RIEN. Avant ce ticket il fallait
  // trouver la bascule « Ingrédients » — un bouton dont le mode guidé a besoin,
  // et dont une lecture n'a aucune raison d'avoir besoin.
  await expect(page.locator(".co-ing")).toBeVisible();

  // LE DÉROULÉ ENTIER, EN UNE FOIS. C'est la phrase du ticket : neuf écrans
  // feuilletés pour savoir ce que le plat demande, ça n'est pas une réponse.
  const pas = page.locator(".co-etapes .l");
  await expect(pas).toHaveCount(long.steps.length);
  await expect(pas.first()).toContainText(long.steps[0]!.action);

  // ET LE TEMPS QUI NE DEMANDE PERSONNE. « 1 h 10 » se lit comme un refus un
  // mardi soir ; « dont 55 min sans surveiller » est une autre phrase.
  const tete = page.locator(".co-etapes .tete");
  await expect(tete).toContainText("sans surveiller");
  await expect(tete).toContainText(`${long.steps.length} étapes`);
});

test("un résumé n'offre aucun geste qui touche au stock", async ({ page }) => {
  await lire(page, long.id);

  // « Terminer » EST LE SEUL ENDROIT OÙ LE STOCK DESCEND, et il journalise sur
  // le créneau. Offert au lecteur, il journalisait la cuisson d'un plat jamais
  // posé — c'est le bug que ce ticket ferme, et il se touchait au doigt sur les
  // plats sans étapes, dont la fiche s'ouvrait droit sur ce bouton.
  await expect(page.getByRole("button", { name: /C’est fait|Terminer/ })).toHaveCount(0);

  // Ni guide, ni minuteur, ni barre d'avancement : rien n'est commencé.
  await expect(page.locator(".co-etape")).toHaveCount(0);
  await expect(page.locator(".co-minuteur")).toHaveCount(0);
  await expect(page.locator(".co-segments")).toHaveCount(0);

  // La sortie ramène là où la décision se prend — on est allé voir, on revient.
  await expect(page.getByRole("button", { name: "‹ Revenir" })).toBeVisible();
});

// LE GUIDE N'EST PAS PERDU, IL EST DERRIÈRE UN DOIGT. On peut vouloir faire un
// plat sans l'avoir posé — la cuisine ne demande pas la permission du planning
// — et c'était déjà vrai avant ce ticket. Ce qui change est l'ordre : le
// pas-à-pas s'ouvre parce qu'on l'a demandé, au lieu d'accueillir quelqu'un qui
// venait lire.
test("le guide s'ouvre depuis le résumé, et reprend tous ses gestes", async ({ page }) => {
  await ouvrirLeGuide(page, long.id);

  await expect(page.locator(".co-etape .geste")).toHaveText(long.steps[0]!.action);
  // Et « Terminer » redevient atteignable, au bout des étapes : demander le
  // guide, c'est dire qu'on cuisine.
  await expect(page.getByRole("button", { name: /C’est fait|Terminer/ })).toBeVisible();
});
