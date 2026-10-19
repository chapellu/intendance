// T103 — UN RESTE DE FRIGO PASSÉ SE JETTE D'UN GESTE, ET IL SORT DE PARTOUT.
//
// Les tests unitaires disent que la vue porte la tâche et que le budget ne
// compte plus le lot. Ils ne disent pas que le bouton du cockpit ATTEINT la
// base, ni que l'inventaire — un autre écran, une autre requête vive — le
// perd avec lui. C'est ce que ce parcours traverse.
//
// PAS DE LOT SEMÉ, ET PAS D'HORLOGE FIXÉE : l'amorce du catalogue en fournit un.
// Les lentilles cuites du relevé sont nées le 2026-08-06 et tiennent 4 jours au
// frigo ; passées depuis le 10/08, elles le resteront à toute date où ce
// parcours tournera. C'est une date du CORPUS, pas d'aujourd'hui — elle ne
// pourrit pas la nuit comme celle que `aujourdhuiISO` répare. Le jour où un
// ré-export rajeunira l'amorce, ce parcours rougira, et c'est ce qu'on veut :
// son premier `expect` dit lequel.

import { expect, test } from "@playwright/test";
import { attendreLApp } from "./parcours";

test("« c'est jeté » retire les restes passés, du cockpit comme de l'inventaire", async ({ page }) => {
  await page.goto("/");
  await attendreLApp(page);

  const tache = page.locator(".co-tache").filter({ hasText: /passé sa date/ });
  await expect(tache).toHaveCount(1);
  await expect(tache).toContainText("lentilles vertes cuites");

  // L'INVENTAIRE LE DIT AVANT LE GESTE — et il le dit à jeter, pas « urgent ».
  await page.goto("/#/cuisine/stock");
  await attendreLApp(page);
  const lot = page.locator(".co-lot").filter({ hasText: "lentilles vertes cuites" });
  await expect(lot).toContainText("périmé · à jeter");

  await page.goto("/");
  await attendreLApp(page);
  await tache.getByRole("button", { name: "C’est jeté" }).dispatchEvent("click");
  // LE PROGRÈS EXPLICITE : la tâche s'en va, parce que la base a répondu.
  await expect(tache).toHaveCount(0);

  await page.goto("/#/cuisine/stock");
  await attendreLApp(page);
  // La sauce de l'amorce, elle, est toujours là : on a jeté ce qui était passé,
  // pas le contenu du frigo.
  await expect(page.locator(".co-lot").filter({ hasText: "sauce bolognaise" }).first()).toBeVisible();
  await expect(lot).toHaveCount(0);
});
