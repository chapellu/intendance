// UNE SÉANCE DE CUISINE S'OUVRE SUR SA MISE EN PLACE — T112, demandé le
// 2026-10-16 : « un écran résumé au début d'une séance de cuisine ».
//
// POURQUOI UN PARCOURS : `miseEnPlace()`, `recipient()` et
// `montrerMiseEnPlace()` sont tenus par `cuisiner.vue.test.ts`, qui dit ce
// qu'ils RENDENT. Ce qu'aucun test unitaire ne peut dire, c'est quel écran sort
// quand on ouvre le guide, et qu'il NE ressort PAS quand on revient — la
// condition vit dans `Fiche`, entre une requête vive et un réglage persisté.
//
// LE PLAT EST DÉRIVÉ DU CORPUS, JAMAIS ÉNUMÉRÉ À LA MAIN — même parti que
// `etape-outil.spec.ts` : on cherche la FORME (un récipient nommé, des boîtes à
// prévoir) et le corpus fournit l'exemplaire.

import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { miseEnPlace } from "../src/ecrans/cuisiner.vue";
import { facteurAffiche } from "../src/model/calcul";
import { lireCatalogue } from "../src/model/catalogue";
import { aujourdhuiISO } from "./parcours";

// SANS SERVICE WORKER : le second parcours truque `cuisine-data.json`, et le
// précache le servirait par-dessus l'interception — voir `sans-recette.spec.ts`.
test.use({ serviceWorkers: "block" });

const VRAI = JSON.parse(readFileSync("public/cuisine-data.json", "utf8"));
const catalogue = lireCatalogue(VRAI as unknown);
const { foyer } = catalogue;

/** Un plat qui remplit toute la mise en place : un récipient, des étapes, et
 *  au moins une boîte à prévoir pour la sortie. */
const plat = catalogue.plats.find(
  (p) =>
    p.steps.length > 1 &&
    p.vaisselle !== null &&
    miseEnPlace(p, foyer.parts, facteurAffiche(p, foyer.parts), foyer).ranger.some((l) => l.boites),
)!;
const attendu = miseEnPlace(plat, foyer.parts, facteurAffiche(plat, foyer.parts), foyer);

/** La fiche en lecture, puis la porte du guide — le chemin de T91. On s'arrête
 *  AVANT la mise en place : c'est elle qu'on vient voir. */
async function ouvrirLaCuisson(page: Page, id: string): Promise<void> {
  await page.goto(`/#/cuisine/cuisiner/${aujourdhuiISO()}/diner/${id}`);
  await expect(page.locator(".co-fiche-tete")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Ouvrir le guide" }).dispatchEvent("click");
}

test("ouvrir le guide montre d'abord ce qu'il faut sortir", async ({ page }) => {
  await ouvrirLaCuisson(page, plat.id);

  // PAS ENCORE L'ÉTAPE 1 : c'est tout le ticket.
  const parti = page.getByRole("button", { name: "C’est parti" });
  await expect(parti).toBeVisible({ timeout: 30_000 });
  await expect(page.locator(".co-etape")).toHaveCount(0);

  // Les quantités aux parts du créneau, la même liste que la fiche.
  await expect(page.locator(".co-ing .l")).toHaveCount(plat.ingredients.length);
  // Le récipient ET s'il tient — aux parts du foyer, tout tient (mesuré).
  const sortir = page.locator(".co-sortir");
  await expect(sortir).toContainText(plat.vaisselle!.label);
  await expect(sortir).toContainText("Ça tient");
  // Le temps, devant le feu et en tout.
  await expect(page.locator(".co-mep .temps")).toContainText("Devant le feu");
  // Les boîtes que la sortie demandera, annoncées avant.
  await expect(page.getByText("Pour ranger à la fin")).toBeVisible();
  const boites = attendu.ranger.find((l) => l.boites)!.boites!;
  await expect(page.locator(".co-mep .co-lot .ou").filter({ hasText: boites }).first()).toBeVisible();

  await parti.dispatchEvent("click");
  await expect(page.locator(".co-etape .co-kicker.accent")).toHaveText(
    `Étape 1 sur ${plat.steps.length}`,
    { timeout: 15_000 },
  );
});

test("une fois passée, elle ne revient pas au milieu de la cuisson — sauf si on la demande", async ({
  page,
}) => {
  await ouvrirLaCuisson(page, plat.id);
  await page.getByRole("button", { name: "C’est parti" }).dispatchEvent("click");
  await expect(page.locator(".co-etape")).toBeVisible({ timeout: 15_000 });

  // ON QUITTE ET ON REVIENT — le téléphone posé, l'app rouverte. La lecture
  // n'est pas persistée (T91), donc on repasse par la porte du guide ; ce qui
  // l'est, c'est que la mise en place a été faite.
  await page.reload();
  await expect(page.locator(".co-fiche-tete")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Ouvrir le guide" }).dispatchEvent("click");
  await expect(page.locator(".co-etape")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("button", { name: "C’est parti" })).toHaveCount(0);

  // « ‹ » sur l'étape 1 la redonne : c'est le seul chemin pour revoir ce qu'il
  // fallait sortir sans quitter la cuisson.
  await page.getByRole("button", { name: "Étape précédente" }).dispatchEvent("click");
  await expect(page.getByRole("button", { name: "C’est parti" })).toBeVisible({
    timeout: 15_000,
  });
});

test("un récipient trop petit se dit avant d'allumer le feu", async ({ page }) => {
  // LE CORPUS EST TRUQUÉ, ET C'EST LA SEULE FAÇON HONNÊTE : aux parts du foyer,
  // aucun des 77 plats à vaisselle ne déborde, et poser une table de huit
  // demanderait une passe entière plus l'écran des parts. On rabat donc le
  // `facteurMax` du plat témoin sous le facteur qu'on cuisine.
  const truque = {
    ...VRAI,
    plats: VRAI.plats.map((p: { id: string; vaisselle: object | null }) =>
      p.id === plat.id ? { ...p, vaisselle: { ...p.vaisselle, facteurMax: 0.25 } } : p,
    ),
  };
  await page.route("**/cuisine-data.json", (route) =>
    route.fulfill({ contentType: "application/json", body: JSON.stringify(truque) }),
  );

  await ouvrirLaCuisson(page, plat.id);
  const sortir = page.locator(".co-sortir.deborde");
  await expect(sortir).toBeVisible({ timeout: 30_000 });
  await expect(sortir).toContainText(`⚠ Ça ne tient pas dans ${plat.vaisselle!.label}`);
  await expect(sortir).toContainText("tournées");
});
