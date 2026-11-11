// RANGER, DÉPLACER — T180.
//
// Le signalement, au téléphone, dans Cuisine → Stock : « j'ai ajouté 2 boîtes
// de tomates pelées et 1 de pois chiches, je n'ai pas pu dire où, et je ne les
// vois plus ». Puis : « je voulais aussi ranger et déplacer d'un espace à
// l'autre ». Ici on traverse la feuille d'ajout, Dexie, le rejeu et le plan.

import { expect, test, type Page } from "@playwright/test";
import { attendreLApp, ouvrirRangement } from "./parcours";

const ligne = (panneau: ReturnType<Page["locator"]>, nom: RegExp) =>
  panneau.locator(".co-lot").filter({ has: panneau.page().locator(".nom", { hasText: nom }) });

async function ajouter(page: Page, cherche: string, n: number, ou: string | null): Promise<void> {
  await page.locator(".st-tete").getByRole("button", { name: "+ Ajouter" }).click();
  await page.getByRole("searchbox", { name: "Quoi ?" }).fill(cherche);
  await page.locator(".aj-ligne").first().click();
  for (let i = 1; i < n; i++) await page.getByRole("button", { name: "un de plus" }).click();
  if (ou) await page.getByRole("radio", { name: ou }).click();
  await page.getByRole("button", { name: /^Ajouter \d+ au stock/ }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
}

test("ajouter en disant où, puis déplacer d'une zone à l'autre", async ({ page }) => {
  await page.goto("/#/cuisine/stock");
  await attendreLApp(page);

  // RANGÉ OÙ ? — les tomates pelées vont d'office là où sont les autres.
  await page.locator(".st-tete").getByRole("button", { name: "+ Ajouter" }).click();
  await page.getByRole("searchbox", { name: "Quoi ?" }).fill("tomates pel");
  await page.locator(".aj-ligne").first().click();
  await expect(page.getByRole("radio", { name: "dessus de l'étagère ouverte" })).toHaveAttribute("aria-checked", "true");
  await page.getByRole("button", { name: "un de plus" }).click();
  await page.getByRole("button", { name: /^Ajouter 2 au stock/ }).click();

  let dessus = await ouvrirRangement(page, "dessus de l");
  await expect(ligne(dessus, /^tomates pelees/).locator(".q")).toHaveText("3 boîtes");

  // DÉPLACER deux boîtes sous l'évier.
  await ligne(dessus, /^tomates pelees/).getByRole("button", { name: "déplacer : tomates pelees" }).click();
  const bouger = dessus.getByRole("group", { name: "déplacer : tomates pelees" });
  await bouger.getByRole("button", { name: "−" }).click();
  await bouger.getByRole("button", { name: "sous-évier" }).click();
  await expect(ligne(dessus, /^tomates pelees/).locator(".q")).toHaveText("1 boîte");

  const evier = await ouvrirRangement(page, "sous-évier");
  await expect(ligne(evier, /^tomates pelees/).locator(".q")).toHaveText("2 boîtes");

  // Et ça tient après rechargement : c'est le journal qui le dit, pas l'écran.
  await page.reload();
  await attendreLApp(page);
  dessus = await ouvrirRangement(page, "dessus de l");
  await expect(ligne(dessus, /^tomates pelees/).locator(".q")).toHaveText("1 boîte");
});

test("ranger ce qui attend sous « Rentrés, à ranger »", async ({ page }) => {
  await page.goto("/#/cuisine/stock");
  await attendreLApp(page);

  // Les pois chiches n'ont pas de place au relevé : rien n'est choisi d'office.
  await ajouter(page, "pois chi", 1, null);
  const aRanger = page.locator(".co-lot").filter({ has: page.locator(".nom", { hasText: /^pois chiches$/ }) });
  await expect(aRanger).toHaveCount(1);

  await aRanger.getByRole("button", { name: "ranger : pois chiches" }).click();
  await aRanger.getByRole("button", { name: "étagère en bois, 2e niveau" }).click();
  await expect(page.getByText("Rentrés, à ranger au placard")).toHaveCount(0);

  const etagere = await ouvrirRangement(page, "étagère en bois, 2e");
  await expect(ligne(etagere, /^pois chiches/).locator(".q")).toHaveText("1 sachet");
});

test("T181 — trouver le son d'avoine, créer la levure chimique", async ({ page }) => {
  await page.goto("/#/cuisine/stock");
  await attendreLApp(page);

  await page.locator(".st-tete").getByRole("button", { name: "+ Ajouter" }).click();
  await page.getByRole("searchbox", { name: "Quoi ?" }).fill("Son d’avoine");
  await expect(page.locator(".aj-ligne", { hasText: /^son avoine$/ })).toBeVisible();

  // Inconnu du catalogue : on le crée, et on le range.
  await page.getByRole("searchbox", { name: "Quoi ?" }).fill("Levure chimique");
  await page.getByRole("button", { name: "+ Nouveau produit : « Levure chimique »" }).click();
  await page.getByRole("radio", { name: "placard haut, étagère basse" }).click();
  await page.getByRole("button", { name: /^Ajouter 1 au stock/ }).click();

  const placard = await ouvrirRangement(page, "placard haut");
  await expect(ligne(placard, /^levure chimique/)).toHaveCount(1);

  // Et la fois suivante, il se trouve comme les autres.
  await page.locator(".st-tete").getByRole("button", { name: "+ Ajouter" }).click();
  await page.getByRole("searchbox", { name: "Quoi ?" }).fill("levure chim");
  await expect(page.locator(".aj-ligne", { hasText: /^levure chimique$/ })).toBeVisible();
});

test("T182 — il me reste 2 œufs : la ligne compte des œufs, et se corrige en œufs", async ({ page }) => {
  await page.goto("/#/cuisine/stock");
  await attendreLApp(page);
  await ajouter(page, "oeufs", 1, null);

  // L'écran s'ouvre sur le frigo (T141).
  const frigo = page.locator(".st-panneau");
  const oeufs = ligne(frigo, /^œufs$/);
  await expect(oeufs.locator(".q")).toHaveText("6 œufs");

  await oeufs.getByRole("button", { name: "corriger : œufs" }).click();
  await expect(oeufs.locator("b")).toHaveText("6");
  for (let i = 0; i < 4; i++) await oeufs.getByRole("button", { name: "−" }).click();
  await oeufs.getByRole("button", { name: "OK" }).click();
  await expect(oeufs.locator(".q")).toHaveText("2 œufs");
});
