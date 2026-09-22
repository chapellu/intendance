// UN PLAT SANS ÉTAPES EST PROPOSÉ, ET LES DEUX ÉCRANS LE DISENT — T78.
//
// Le troisième chemin, choisi le 15/09/2026. Les deux autres avaient été
// construits : écrire les étapes (T76, les quinze du répertoire) et filtrer le
// plat (T77, retiré par ce ticket). Reste à tenir celui-ci, et il ne se tient
// que de bout en bout : `sansRecette()` est déjà éprouvé par
// `cuisiner.vue.test.ts`, qui dit ce qu'il REND. Ce qu'aucun test unitaire ne
// peut dire, c'est que la phrase arrive jusqu'à l'œil — sur la carte, dans la
// ligne du temps, et sur la fiche, au-dessus des quantités.
//
// LE CATALOGUE EST TRUQUÉ, ET C'EST LA SEULE FAÇON HONNÊTE. Le corpus n'a plus
// un seul plat sans étapes depuis T76 : un parcours écrit dessus serait vert
// sans rien traverser, et resterait vert si on retirait l'affichage. On
// intercepte donc `/cuisine-data.json` et on rend un corpus où les plats sont
// entrés « niveau plan » — exactement l'état dans lequel `_repertoire.yaml` a
// vécu un mois.
//
// TOUS LES PLATS PERDENT LEURS ÉTAPES, PAS UN SEUL. Ce parcours ne teste pas le
// classement : en n'en truquant qu'un, il faudrait qu'il tombe dans la main de
// cinq cartes, ce qui dépend du score, donc de la saison, donc du jour. Le
// dépôt a déjà payé cette dépendance cachée une fois (#18 → `stock-descend`).
// Ici, n'importe quelle carte fait l'affaire, et c'est le but.

import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { libellePoser } from "../src/ui/phrases";
import {
  attendreLApp,
  aujourdhuiISO,
  creneauPose,
  poserUnPlat,
  repondreAuxQuestions,
} from "./parcours";

// SANS SERVICE WORKER POUR CE FICHIER. Il sert `cuisine-data.json` depuis son
// précache — c'est tout l'objet de T18 — et il le servirait donc PAR-DESSUS
// l'interception, rendant ce parcours vert pour la mauvaise raison : le vrai
// catalogue, où plus rien ne manque.
test.use({ serviceWorkers: "block" });

const VRAI = JSON.parse(readFileSync("public/cuisine-data.json", "utf8"));

/** Le même catalogue, ramené au « niveau plan » : plus d'étapes, et le drapeau
 *  qui le déclare. Les deux doivent bouger ensemble — le chargeur refuse un
 *  export où `cuisinable` contredit `steps`, et il a raison de le refuser. */
const NIVEAU_PLAN = {
  ...VRAI,
  plats: VRAI.plats.map((p: Record<string, unknown>) => ({
    ...p,
    steps: [],
    cuisinable: false,
  })),
};

test.beforeEach(async ({ page }) => {
  await page.route("**/cuisine-data.json", (route) =>
    route.fulfill({ contentType: "application/json", body: JSON.stringify(NIVEAU_PLAN) }),
  );
});

test("la carte dit qu'un plat n'a pas sa recette, sans cesser de le proposer", async ({
  page,
}) => {
  await page.goto("/#/cuisine/semaine");
  await attendreLApp(page);
  await page.locator(".co-slot.libre").first().locator("button.resume").click();
  await page.locator(".co-slot.ouvert").getByRole("link", { name: "poser un plat" }).click();
  await repondreAuxQuestions(page);

  // PROPOSÉ D'ABORD : c'est la moitié de la décision, et celle que T77 avait
  // tranchée dans l'autre sens. Une main vide voudrait dire que le filtre est
  // revenu par une autre porte.
  const cartes = page.locator(".co-jouable");
  await expect(cartes.first()).toBeVisible({ timeout: 30_000 });

  // DIT ENSUITE, et sur chacune : ici tout le corpus est au niveau plan, donc
  // une seule carte muette signalerait que la mention dépend du plat.
  const n = await cartes.count();
  for (let i = 0; i < n; i++)
    await expect(cartes.nth(i).locator(".co-muet")).toHaveText("sans recette écrite");

  // ET LE GESTE RESTE OFFERT. Un plat qu'on annonce sans recette doit pouvoir
  // se poser quand même, sinon on a filtré en le disant.
  await expect(
    cartes.first().getByRole("button", { name: libellePoser(false) }),
  ).toBeEnabled();
});

test("la fiche le dit au-dessus des quantités", async ({ page }) => {
  const plat = VRAI.plats[0].id;
  await page.goto(`/#/cuisine/cuisiner/${aujourdhuiISO()}/diner/${plat}`);
  // PAS `attendreLApp` : la fiche est le seul écran qui sorte de la coquille,
  // elle n'a pas de barre du bas.
  await expect(page.locator(".co-fiche-tete")).toBeVisible({ timeout: 30_000 });

  const phrase = page.locator(".co-sansrecette");
  await expect(phrase).toBeVisible();
  await expect(phrase).toContainText("n’a pas encore ses étapes");

  // CE QUI MANQUE EST LA RECETTE, PAS LE PLAT. Les quantités sont là, sous la
  // phrase, et c'est ce que la phrase promet. Rien n'est posé sur ce créneau,
  // donc c'est le résumé de T91 qu'on lit — et il dit la phrase au même
  // endroit, entre le titre et les quantités.
  await expect(page.locator(".co-ing")).toBeVisible();
});

// « Terminer » RESTE LE SEUL ENDROIT OÙ LE STOCK DESCEND, et #50 l'avait
// rétabli sur les fiches sans étapes, qui n'ont pas de mode guidé pour le
// porter. Ce parcours tient cette promesse-là.
//
// IL POSE LE PLAT, ET C'EST T91 QUI L'Y OBLIGE. Il ouvrait la fiche par lien
// profond sur un créneau vide et y attendait « Terminer » — ce qui passait,
// mais décrivait un bug plutôt qu'une promesse : ce bouton journalisait alors
// la cuisson d'un plat que personne n'avait posé, et le placard descendait
// pour avoir feuilleté une recette. Lire n'engage plus rien ; terminer demande
// donc d'abord de poser, comme dans la vraie vie.
test("et elle se termine quand même, une fois le plat posé", async ({ page }) => {
  // Le budget de `stock-descend`, et pour la même raison : une passe complète
  // avec ses questions coûte des dizaines de secondes sur un runner froid.
  test.setTimeout(180_000);

  // AUCUN FILTRE SUR LA MAIN : ici tout le corpus est au niveau plan, donc
  // n'importe quelle carte fait l'affaire — c'est même tout l'intérêt du
  // catalogue truqué de ce fichier.
  const titre = await poserUnPlat(page);
  const { jour, repas } = await creneauPose(page, titre);

  // SANS PLAT DANS L'URL : c'est la fiche du créneau, donc celle qu'on ouvre
  // pour cuisiner. C'est le chemin du lien « En cuisine » d'« Aujourd'hui ».
  await page.goto(`/#/cuisine/cuisiner/${jour}/${repas}`);
  await expect(page.locator(".co-fiche-tete")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator(".co-sansrecette")).toBeVisible();
  await expect(page.getByRole("button", { name: "Terminer" })).toBeVisible();
});
