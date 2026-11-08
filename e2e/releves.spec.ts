// Les relevés — un PDF FABRIQUÉ, du fichier au mois réel, avec le vrai pdf.js.
//
// Le relevé est celui de `src/model/releveBancaire.exemples.ts` : une mise en
// page de relevé, des libellés et des montants inventés. Chromium en fait un
// PDF à chasse fixe (`page.pdf()`), une colonne de texte valant 3 pt comme
// celles que `texteDeLaPage` reconstruit. Aucun relevé réel n'entre ici.
// Pas de `.click()` sur les boutons de feuille : `dispatchEvent("click")`.

import { expect, test, type Page } from "@playwright/test";
import { releve1 } from "../src/model/releveBancaire.exemples";
import { attendreLApp } from "./parcours";

async function pdfDe(page: Page, texte: string): Promise<Buffer> {
  const p = await page.context().newPage();
  const echappe = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  // 6,64 px de DejaVu Sans Mono = 4 px d'avance = 3 pt : une colonne par caractère.
  const pages = texte.split("\f").map((t) => `<pre style="margin:0;break-after:page">${echappe(t)}</pre>`);
  await p.setContent(`<div style="font: 6.64px/1.3 'DejaVu Sans Mono', 'Courier New', monospace">${pages.join("")}</div>`);
  const pdf = await p.pdf({ format: "A4", margin: { top: "20px", left: "10px" } });
  await p.close();
  return pdf;
}

const deposer = async (page: Page, pdf: Buffer) =>
  page.getByTestId("releve-pdf").setInputFiles({ name: "releve.pdf", mimeType: "application/pdf", buffer: pdf });

test("un relevé PDF s'importe une fois, se classe par motif, et un relevé faux est refusé", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/#/budget/releves");
  await attendreLApp(page);
  await expect(page.getByText("Aucun relevé importé")).toBeVisible();

  const pdf = await pdfDe(page, releve1());
  await deposer(page, pdf);
  await expect(page.getByTestId("releve-resultats")).toContainText("6 opérations ajoutées · totaux vérifiés", { timeout: 60_000 });
  await expect(page.getByRole("button", { name: /septembre/ })).toBeVisible();
  await expect(page.getByText("À classer · 6")).toBeVisible();

  // Le même relevé, une seconde fois : rien ne double.
  await deposer(page, pdf);
  await expect(page.getByTestId("releve-resultats")).toContainText("0 opération ajoutée, 6 déjà là", { timeout: 60_000 });

  // Classer la boulangerie : une dépense d'alimentation.
  await page.locator(".bu-ligne").filter({ hasText: "BOULANGERIE TEST" }).first().dispatchEvent("click");
  await expect(page.getByRole("dialog")).toContainText("BOULANGERIE TEST");
  await page.getByRole("button", { name: "Enregistrer" }).dispatchEvent("click");
  await expect(page.getByText("À classer · 5")).toBeVisible();
  await expect(page.locator(".bu-reel").filter({ hasText: "Alimentation" })).toContainText("12,30 €");
  await expect(page.locator("[data-test=sorties]")).toHaveText("12,30 €");

  // Un versement vers un placement : ni dépense, ni virement interne — épargné.
  await page.locator(".bu-ligne").filter({ hasText: "VERS EPARGNE" }).first().dispatchEvent("click");
  await page.getByRole("dialog").getByRole("button", { name: "Épargne", exact: true }).dispatchEvent("click");
  await page.getByRole("button", { name: "Enregistrer" }).dispatchEvent("click");
  await expect(page.locator("[data-test=epargne]")).toHaveText("987,50 €");
  await expect(page.locator("[data-test=sorties]")).toHaveText("12,30 €");

  // Ce qui compose un total : Dépenses → Alimentation → la boulangerie → ses
  // opérations, puis retour à la liste des catégories.
  await page.getByRole("button", { name: /^Dépenses/ }).dispatchEvent("click");
  const depenses = page.getByRole("dialog", { name: "Dépenses" });
  await expect(depenses).toBeVisible();
  await depenses.locator(".bu-ligne").filter({ hasText: "Alimentation" }).dispatchEvent("click");
  const alim = page.getByRole("dialog", { name: "Alimentation" });
  await expect(alim.locator("[data-test=composition-total]")).toHaveText("12,30 €");
  await alim.locator(".bu-ligne").filter({ hasText: "BOULANGERIE TEST" }).first().dispatchEvent("click");
  await expect(alim.locator(".bu-groupe.ouvert .bu-ligne")).toHaveCount(2);
  await alim.getByRole("button", { name: "← Toutes les dépenses" }).dispatchEvent("click");
  await expect(page.getByRole("dialog", { name: "Dépenses" })).toBeVisible();
  await page.getByRole("dialog", { name: "Dépenses" }).getByRole("button", { name: "Fermer" }).dispatchEvent("click");
  await expect(page.getByRole("dialog")).toHaveCount(0);

  // UNE OPÉRATION SEULE : le remboursement du magasin, sans poser de règle sur
  // son motif — le paiement du même magasin reste à classer.
  await expect(page.getByText("À classer · 4")).toBeVisible();
  await page.locator(".bu-ligne").filter({ hasText: "CARTE 05/09 MAGASIN TEST" }).first().dispatchEvent("click");
  await page.getByRole("dialog").getByRole("button", { name: "Seulement cette opération" }).dispatchEvent("click");
  await page.getByRole("button", { name: "Enregistrer" }).dispatchEvent("click");
  await expect(page.getByText("À classer · 3")).toBeVisible();

  // Un relevé dont le total imprimé ne tombe pas juste : refusé, rien n'entre.
  await deposer(page, await pdfDe(page, releve1("1 042,31")));
  await expect(page.getByTestId("releve-resultats")).toContainText("ne tombe pas sur le total imprimé", { timeout: 60_000 });

  // Et tout s'oublie d'un geste.
  await page.getByRole("button", { name: "Tout oublier des relevés" }).dispatchEvent("click");
  await page.getByRole("button", { name: "Effacer" }).dispatchEvent("click");
  await expect(page.getByText("Aucun relevé importé")).toBeVisible();
});

// SAFARI N'ITÈRE PAS UN `ReadableStream` (`for await (… of flux)`), et pdf.js le
// fait dans `getTextContent`. Le premier import sur iPhone est tombé là :
// « TypeError: undefined is not a function (near '...i of e...') ». On retire
// à Chromium cet itérateur AVANT que l'app se charge : c'est Safari, pour ce
// qui compte ici, et la lecture doit passer quand même.
test("comme sur Safari : un flux sans itérateur asynchrone ne casse pas la lecture", async ({ page }) => {
  test.setTimeout(120_000);
  await page.addInitScript(() => {
    delete (ReadableStream.prototype as unknown as Record<symbol, unknown>)[Symbol.asyncIterator];
    delete (ReadableStream.prototype as unknown as Record<string, unknown>)["values"];
  });
  await page.goto("/#/budget/releves");
  await attendreLApp(page);
  expect(await page.evaluate(() => Symbol.asyncIterator in ReadableStream.prototype)).toBe(false);
  await deposer(page, await pdfDe(page, releve1()));
  await expect(page.getByTestId("releve-resultats")).toContainText("6 opérations ajoutées · totaux vérifiés", { timeout: 60_000 });
});
