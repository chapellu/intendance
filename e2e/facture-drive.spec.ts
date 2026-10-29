// T160 — une facture Carrefour Drive en PDF, du fichier à la revue, avec le
// VRAI pdf.js.
//
// Le PDF est fabriqué par Chromium (`page.pdf()`) depuis une page à chasse
// fixe, en colonnes comme la facture : un libellé replié autour de son EAN,
// deux plaquettes de beurre, un liquide vaisselle au rayon DROGUERIE, le pied
// de page et le récapitulatif. Il passe par le champ « facture » de l'écran
// Courses, puis par pdf.js servi depuis l'app — aucun réseau tiers.
// Pas de `.click()` : `dispatchEvent("click")` (voir `parcours.ts`).

import { expect, test, type Page } from "@playwright/test";
import { attendreLApp } from "./parcours";

/** Avant-hier, écrit comme la facture : la livraison est passée. */
function avantHier(): string {
  const d = new Date(Date.now() - 2 * 864e5);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

/** Une rangée à colonnes fixes : chaque cellule commence à sa colonne. */
const rangee = (cellules: [number, string][]): string =>
  cellules.reduce((l, [col, t]) => `${l.padEnd(Math.max(col, l.length + 2))}${t}`, "");
const COLS = [0, 18, 70, 76, 82, 89, 96, 103, 110] as const;
const article = (ean: string, libelle: string, n: string[]): string =>
  rangee([[COLS[0], ean], ...(libelle ? ([[COLS[1], libelle]] as [number, string][]) : []), ...n.map((t, i): [number, string] => [COLS[i + 2]!, t])]);
const texte = (l: string): string => rangee([[COLS[1], l]]);

function lignesDeLaFacture(): string[] {
  return [
    "CARREFOUR DRIVE",
    "",
    `Date de commande : ${avantHier()}`,
    `Date de livraison : ${avantHier()}`,
    "",
    rangee([[70, "Qté"], [76, "Qté"]]),
    rangee([[0, "Code EAN13"], [30, "Libellé"], [70, "Cdée"], [76, "Livrée"], [110, "Montant"]]),
    "",
    "EPICERIE",
    "",
    texte("Haricots lingots Blancs Engagé auprès des"),
    article("3560071463311", "", ["1", "1", "5.5", "2.57", "2.71", "2.71"]),
    texte("producteurs partenaires CARREFOUR BIO"),
    "",
    "P.L.S.",
    "",
    article("3155251205500", "Beurre Gastronomique Doux PRESIDENT", ["2", "2", "5.5", "2.70", "2.85", "5.70"]),
    "",
    "DROGUERIE",
    "",
    article("3450601047190", "Liquide vaisselle L'ARBRE VERT", ["1", "1", "20.0", "1.83", "2.19", "2.19"]),
    "",
    "La présente facture simplifiée sera payable à l'échéance figurant sur la facture.",
    "RCS : CAEN 519514574 - Code TVA : FR17519514574",
    "",
    "Récapitulatif de votre facture - 4 articles",
    rangee([[60, "Frais de livraison"], [100, "0.00 €"]]),
    rangee([[60, "Montant Net payé (en euros)"], [100, "10.60 €"]]),
  ];
}

async function pdfDeLaFacture(page: Page): Promise<Buffer> {
  const p = await page.context().newPage();
  const echappe = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  await p.setContent(
    `<pre style="font: 7px/1.2 'DejaVu Sans Mono', 'Courier New', monospace; margin: 0">${lignesDeLaFacture().map(echappe).join("\n")}</pre>`,
  );
  const pdf = await p.pdf({ format: "A4", margin: { top: "20px", left: "20px" } });
  await p.close();
  return pdf;
}

async function deposer(page: Page, pdf: Buffer) {
  await page.getByTestId("facture-pdf").setInputFiles({ name: "facture.pdf", mimeType: "application/pdf", buffer: pdf });
  await expect(page.getByTestId("ticket-revue")).toBeVisible({ timeout: 60_000 });
}

test("une facture drive en PDF arrive à la revue, puis rentre au stock", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/#/cuisine/courses");
  await attendreLApp(page);
  const pdf = await pdfDeLaFacture(page);
  await deposer(page, pdf);

  await expect(page.getByTestId("ticket-sans-date")).toHaveCount(0);
  await expect(page.getByTestId("ticket-rangee")).toHaveCount(3);
  await expect(page.getByTestId("ticket-total")).toContainText("comme la facture");
  // Le libellé replié est recollé ; le rayon DROGUERIE propose « pas pour la cuisine ».
  await expect(page.getByTestId("ticket-rangee").filter({ hasText: "Haricots lingots Blancs Engagé auprès des producteurs partenaires CARREFOUR BIO" })).toHaveCount(1);
  const vaisselle = page.getByTestId("ticket-rangee").filter({ hasText: "Liquide vaisselle" });
  await expect(vaisselle.getByLabel("Autre ingrédient")).toHaveValue("-");
  // Deux plaquettes livrées : deux unités.
  const beurre = page.getByTestId("ticket-rangee").filter({ hasText: "Beurre Gastronomique" });
  await beurre.getByLabel("Autre ingrédient").selectOption("beurre");
  await expect(beurre.getByLabel("Unités")).toHaveValue("2");
  await page.screenshot({ path: "/tmp/facture-revue.png", fullPage: true });

  await expect(page.getByTestId("ticket-rentrer")).toBeEnabled();
  await page.getByTestId("ticket-rentrer").dispatchEvent("click");
  await expect(page.getByTestId("ticket-fait")).toContainText("rentrée");

  // La fois suivante, la table apprise reconnaît l'EAN.
  await page.getByRole("button", { name: "Retour à la liste" }).dispatchEvent("click");
  await deposer(page, pdf);
  await expect(page.getByTestId("ticket-rangee").filter({ hasText: "Beurre Gastronomique" })).toContainText("reconnu");
  await expect(page.getByTestId("ticket-rangee").filter({ hasText: "Liquide vaisselle" })).toContainText("reconnu · pas pour la cuisine");
});
