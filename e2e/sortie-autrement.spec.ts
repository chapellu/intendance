// « J'AI FAIT AUTREMENT » PROPOSE QUELQUE CHOSE — T102.
//
// Dit le 03/10/2026, au sortir d'une recette : « j'ai eu l'écran de fin, qui
// est mieux, mais quand j'ai cliqué sur "j'ai fait autrement" pour ranger le
// reste, rien ne m'a été proposé ». Le bouton était un REPLI : il journalisait
// la cuisson, jetait la proposition, et laissait `journaliserCuisson` retomber
// sur sa prudence — un lot par emit, au frigo.
//
// CE QU'AUCUN TEST UNITAIRE NE DIT ICI. `sortie.vue.test.ts` tient les deux
// leviers et leur arithmétique ; `journal.test.ts` tient ce que la base écrit
// d'un rangement corrigé. Ce qu'il reste à prouver est que les deux se
// touchent : qu'un doigt qui corrige l'écran fait arriver un lot AU
// CONGÉLATEUR dans l'inventaire — le seul chemin de l'app vers un
// `location: "congelo"`, et celui qui n'existait pas.
//
// LE CATALOGUE EST TRUQUÉ, POUR LA MÊME RAISON QUE `sans-recette.spec.ts` :
// la sortie se corrige en trois crans, et il faut d'abord y arriver. Sans
// étapes, la fiche s'ouvre directement sur « Terminer » — on économise une
// boucle de dix-huit clics dont `stock-descend` fait déjà la preuve. Et l'emit
// est posé À LA MAIN, parce qu'un parcours écrit sur le plat que la main tire
// dépend du score, donc de la saison, donc du jour : le dépôt a déjà payé cette
// dépendance cachée une fois (#18 → `stock-descend`).

import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { phraseHorsBoite } from "../src/ecrans/sortie.vue";
import { attendreLApp, creneauPose, poserUnPlat } from "./parcours";

// SANS SERVICE WORKER POUR CE FICHIER : il sert `cuisine-data.json` depuis son
// précache — tout l'objet de T18 — et le servirait PAR-DESSUS l'interception,
// rendant ce parcours vert contre le vrai catalogue.
test.use({ serviceWorkers: "block" });

const VRAI = JSON.parse(readFileSync("public/cuisine-data.json", "utf8"));

/**
 * Un corpus où CHAQUE plat laisse trois repas congelables, et aucun n'a
 * d'étapes.
 *
 * TROIS REPAS, ET PAS DEUX : la règle de coupe laisse le premier au frigo et
 * congèle le surplus, donc trois repas donnent deux lots de tailles
 * DIFFÉRENTES (1 + 2). C'est ce qui rend le plafond partagé visible — un cran
 * de moins sur le second doit laisser un repas rangé nulle part.
 *
 * `portions: 4` CONTRE UN FOYER DE 2,5 PARTS DONNE `f = 1` : un plat qui se
 * garde se fait en entier (`facteur()`), donc l'échelle ne brouille ni les
 * repas ni les grammes, et le parcours peut affirmer des chiffres.
 */
const TROIS_REPAS = {
  ...VRAI,
  plats: VRAI.plats.map((p: Record<string, unknown>) => ({
    ...p,
    steps: [],
    cuisinable: false,
    portions: 4,
    lotEntier: false,
    vaisselle: null,
    calibreMax: null,
    emits: [
      {
        type: "essai-sortie",
        kind: "reste-plat",
        qty: { amount: 600, unit: "g" },
        band: "3-repas",
        espace: "congelo",
        note: null,
        gardeFrigo: 3,
        congelo: true,
      },
    ],
  })),
};

test.beforeEach(async ({ page }) => {
  await page.route("**/cuisine-data.json", (route) =>
    route.fulfill({ contentType: "application/json", body: JSON.stringify(TROIS_REPAS) }),
  );
});

test("corriger la sortie fait arriver un lot au congélateur", async ({ page }) => {
  // Le budget de `stock-descend`, et pour la même raison : une passe complète
  // avec ses questions coûte des dizaines de secondes sur un runner froid.
  test.setTimeout(180_000);

  const titre = await poserUnPlat(page);
  const { jour, repas } = await creneauPose(page, titre);

  await page.goto(`/#/cuisine/cuisiner/${jour}/${repas}`);
  const terminer = page.getByRole("button", { name: "Terminer" });
  await expect(terminer).toBeVisible({ timeout: 30_000 });
  await terminer.dispatchEvent("click");

  // LA PROPOSITION D'ABORD, et elle est celle de T99 : le premier repas reste
  // au frigo, le surplus part au froid.
  const lots = page.locator(".co-lot");
  await expect(lots).toHaveCount(2, { timeout: 15_000 });
  await expect(lots.nth(0).locator(".nom")).toHaveText("Frigo · 200 g");
  await expect(lots.nth(1).locator(".nom")).toHaveText("Congélo · 400 g");
  // AUCUN LEVIER TANT QU'ON N'A RIEN DEMANDÉ : l'écran de T99 se lit, il ne se
  // règle pas, et c'est ce qui le garde lisible pour les neuf fois sur dix où
  // la proposition est juste.
  await expect(page.locator(".co-pas")).toHaveCount(0);

  // LE GESTE DU TICKET.
  await page.getByRole("button", { name: "J’ai fait autrement" }).dispatchEvent("click");
  await expect(page.locator(".co-pas")).toHaveCount(2, { timeout: 15_000 });

  // PREMIER LEVIER — « tout est allé au congélateur », en un tap, et la
  // quantité ne bouge pas.
  await lots.nth(0).getByRole("button", { name: "Congélo" }).dispatchEvent("click");
  await expect(lots.nth(0).locator(".nom")).toHaveText("Congélo · 200 g");

  // SECOND LEVIER — un cran de moins sur le gros morceau : on en a mangé un de
  // plus que prévu. Le poids suit au prorata, et ce qui n'est rangé nulle part
  // SE DIT, au lieu de disparaître de l'écran comme de la base.
  await lots.nth(1).locator(".co-pas button").first().dispatchEvent("click");
  await expect(lots.nth(1).locator(".nom")).toHaveText("Congélo · 200 g");
  await expect(page.getByText(phraseHorsBoite(1))).toBeVisible();

  // ON ATTEND QUE LA FICHE SE FERME D'ELLE-MÊME : répondre journalise PUIS
  // sort, et la sortie est un `history.back()` asynchrone. Naviguer sans
  // attendre reviendrait en arrière par-dessus notre propre `goto`.
  await page.getByRole("button", { name: "C’est bien ça" }).dispatchEvent("click");
  await expect(page).not.toHaveURL(/cuisine\/cuisiner/, { timeout: 15_000 });

  // ET L'INVENTAIRE LE SAIT.
  //
  // DEUX LOTS, TOUS LES DEUX AU CONGÉLATEUR : l'inventaire range ses lignes par
  // `location` — où la chose EST — et pas par l'espace que la recette
  // souhaitait (T87). Avant ce ticket, « j'ai fait autrement » écrivait un lot
  // unique de trois repas au frigo, parce qu'il jetait la réponse et retombait
  // sur le défaut de `journaliserCuisson`. Les trois comptes ci-dessous
  // mentaient donc tous les trois.
  //
  // LE LOT SE DÉSIGNE PAR SON TYPE, et c'est pour ça que l'emit truqué en porte
  // un qui n'existe pas dans le corpus : la ligne d'inventaire n'affiche pas de
  // quel plat elle vient — `auModele` ne reporte pas `origine` — donc un type
  // emprunté au catalogue se confondrait avec l'amorce du frigo.
  await page.goto("/#/cuisine/stock");
  await attendreLApp(page);
  const ceSoir = page.locator(".co-lot").filter({ hasText: "essai-sortie" });
  await expect(ceSoir).toHaveCount(2, { timeout: 15_000 });
  await expect(ceSoir.filter({ hasText: "Congélo" })).toHaveCount(2);
  await expect(ceSoir.filter({ hasText: "Frigo" })).toHaveCount(0);

  // ET ÇA SURVIT AU RECHARGEMENT — la différence entre un écran et un fait.
  await page.reload();
  await attendreLApp(page);
  await expect(ceSoir.filter({ hasText: "Congélo" })).toHaveCount(2);
});
