// LES TROIS AUTRES REPAS — T142 (décision du 21/10).
//
// « Je lance ça » nourrit aussi demain midi quand les boîtes le permettent : la
// carte le dit avant le tap (« + le déjeuner de demain, 3 boîtes »), et le
// cockpit le redit après (« Demain midi : le reste de … »). Quand les boîtes
// sont pleines, la carte le dit aussi, et le dîner reste à sa taille.
//
// L'AMORCE DU CATALOGUE OCCUPE LES QUATRE BOÎTES (les lentilles cuites au
// frigo, la bolognaise au congélateur) : c'est le premier cas, sans rien
// écrire. Le second vide la table `stock` — une base neuve par test, rien ne
// fuit vers les autres parcours.

import { expect, test, type Page } from "@playwright/test";
import { LIBELLE_LANCER } from "../src/ui/phrases";
import { attendreLApp, aujourdhuiISO } from "./parcours";

const A_15H = (): Date => new Date(`${aujourdhuiISO()}T15:00:00`);

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(A_15H());
});

/** Vide le dépôt : les quatre boîtes redeviennent propres. Dexie ne voit pas
 *  une écriture faite hors de lui — d'où le rechargement. */
async function viderLeDepot(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((ok, ko) => {
        const r = indexedDB.open("intendance");
        r.onsuccess = () => {
          const t = r.result.transaction("stock", "readwrite");
          t.objectStore("stock").clear();
          t.oncomplete = () => {
            r.result.close();
            ok();
          };
          t.onerror = () => ko(t.error);
        };
        r.onerror = () => ko(r.error);
      }),
  );
  await page.reload();
  await attendreLApp(page);
}

test("les boîtes de l'amorce sont pleines : la carte du soir le dit", async ({ page }) => {
  await page.goto("/#/cuisine/ce-soir");
  await attendreLApp(page);
  await expect(page.locator(".co-soir:not(.pose)").first()).toBeVisible({ timeout: 30_000 });
  // Une carte peut se taire (les pâtes : la casserole ne prend pas trois parts
  // de plus) ; celles qui parlent du midi disent les boîtes pleines.
  const midis = page.locator(".co-soir .midi");
  await expect(midis.first()).toContainText("ce soir seulement");
  await expect(page.getByText("+ le déjeuner de demain")).toHaveCount(0);
});

test("« Je lance ça » prend aussi demain midi, et le cockpit le redit", async ({ page }) => {
  await page.goto("/#/cuisine/ce-soir");
  await attendreLApp(page);
  await viderLeDepot(page);

  const cartes = page.locator(".co-soir:not(.pose)");
  await expect(cartes.first()).toBeVisible({ timeout: 30_000 });
  const carte = cartes.filter({ has: page.locator(".midi", { hasText: "+ le déjeuner de demain" }) }).first();
  await expect(carte.locator(".midi")).toHaveText("+ le déjeuner de demain, 3 boîtes");
  await page.screenshot({ path: "/tmp/trois-repas-carte.png", fullPage: true });
  const titre = (await carte.locator(".nom").innerText()).trim();
  await carte.getByRole("button", { name: LIBELLE_LANCER }).dispatchEvent("click");
  await expect(page).toHaveURL(new RegExp(`#/cuisine/cuisiner/${aujourdhuiISO()}/diner$`));

  await page.goto("/#/cockpit");
  const repas = page.locator('[aria-label="les autres repas"]');
  await expect(repas).toBeVisible({ timeout: 30_000 });
  await expect(repas.locator('[data-repas="demain"]')).toHaveText(
    `Demain midi : le reste de ${titre}, mis de côté ce soir (3 parts)`,
  );
  // Les routines, en une ligne calme chacune ; la fournée, puisque le
  // congélateur n'a aucun goûter.
  await expect(repas.locator('[data-repas="petit-dejeuner"]')).toContainText("Petit-déj : porridge");
  await expect(repas.locator('[data-repas="gouter"]')).toContainText("Goûter :");
  await expect(repas.locator('[data-repas="fournee"]')).toContainText("Fournée :");
  await page.screenshot({ path: "/tmp/trois-repas-cockpit.png", fullPage: true });
});
