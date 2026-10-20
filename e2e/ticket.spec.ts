// T138 — scanner un ticket, de la photo à la revue, avec le VRAI tesseract.js.
//
// La photo est fabriquée dans la page : un canevas blanc, du texte à chasse
// fixe, comme une caisse l'imprime. Elle passe par le même champ fichier que
// l'appareil photo, puis par l'OCR servi depuis `/ocr/` — aucun réseau tiers.
// Pas de `.click()` : `dispatchEvent("click")` (voir `parcours.ts`).

import { expect, test, type Page } from "@playwright/test";
import { attendreLApp } from "./parcours";

async function photoDuTicket(page: Page, lignes: string[]): Promise<Buffer> {
  const b64 = await page.evaluate((ls) => {
    const c = document.createElement("canvas");
    const t = 30;
    c.width = 760;
    c.height = (ls.length + 2) * t * 1.5;
    const g = c.getContext("2d")!;
    g.fillStyle = "#fff";
    g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = "#111";
    g.font = `${t}px "DejaVu Sans Mono", "Courier New", monospace`;
    ls.forEach((l, i) => g.fillText(l, 30, (i + 1.5) * t * 1.5));
    return c.toDataURL("image/png").split(",")[1]!;
  }, lignes);
  return Buffer.from(b64, "base64");
}

const col = (g: string, d: string): string => `${g}${" ".repeat(Math.max(1, 32 - g.length - d.length))}${d}`;

/** Avant-hier, écrit comme une caisse : la date doit être passée. */
function avantHier(): string {
  const d = new Date(Date.now() - 2 * 864e5);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

const CORPS = [
  "CARREFOUR",
  "FRANCHEVILLE",
  col("4 POIREAU VRAC", "4,66"),
  "  0,932 kg x 5,00 EUR/kg",
  col("4 CAROTTES VRAC", "1,50"),
  "2 ARTICLES",
  col("TOTAL", "6,16"),
  col("CB", "6,16"),
];

async function scanner(page: Page, lignes: string[]) {
  await page.goto("/#/cuisine/courses");
  await attendreLApp(page);
  const photo = await photoDuTicket(page, lignes);
  await page.getByTestId("ticket-photo").setInputFiles({ name: "ticket.png", mimeType: "image/png", buffer: photo });
  await expect(page.getByTestId("ticket-revue")).toBeVisible({ timeout: 90_000 });
}

test("un ticket photographié arrive à la revue, puis rentre au stock", async ({ page }) => {
  test.setTimeout(120_000);
  await scanner(page, [...CORPS, `${avantHier()} 16:28`]);

  await expect(page.getByTestId("ticket-sans-date")).toHaveCount(0);
  await expect(page.getByTestId("ticket-rangee")).toHaveCount(2);
  await expect(page.getByTestId("ticket-total")).toContainText("comme le ticket");
  const poireau = page.getByTestId("ticket-rangee").filter({ hasText: "POIREAU VRAC" });
  // Présélectionné (le premier l'emporte nettement), et pesé : 932 g.
  await expect(poireau.locator(".tk-puce.on")).toHaveText(/poireau/);
  await expect(poireau.getByLabel("Poids par unité")).toHaveValue("932");
  await page.screenshot({ path: "/tmp/ticket-revue.png", fullPage: true });

  await expect(page.getByTestId("ticket-rentrer")).toBeEnabled();
  await page.getByTestId("ticket-rentrer").dispatchEvent("click");
  await expect(page.getByTestId("ticket-fait")).toContainText("rentrée");

  // La fois suivante, la table apprise reconnaît le libellé.
  await page.getByRole("button", { name: "Retour à la liste" }).dispatchEvent("click");
  const photo = await photoDuTicket(page, [...CORPS, `${avantHier()} 16:28`]);
  await page.getByTestId("ticket-photo").setInputFiles({ name: "ticket.png", mimeType: "image/png", buffer: photo });
  await expect(page.getByTestId("ticket-revue")).toBeVisible({ timeout: 90_000 });
  await expect(page.getByTestId("ticket-rangee").filter({ hasText: "POIREAU VRAC" })).toContainText("reconnu");
});

test("une photo sans date réclame le haut ou le bas du ticket, ou la date à la main", async ({ page }) => {
  test.setTimeout(120_000);
  await scanner(page, CORPS);

  await expect(page.getByTestId("ticket-sans-date")).toContainText("il manque la date");
  // Choisir un ingrédient ne suffit pas : sans date, rien ne rentre.
  const poireau = page.getByTestId("ticket-rangee").filter({ hasText: "POIREAU VRAC" });
  await poireau.getByRole("button", { name: /^poireau/ }).first().dispatchEvent("click");
  await expect(page.getByTestId("ticket-rentrer")).toBeDisabled();

  const d = new Date(Date.now() - 864e5);
  const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  await page.getByTestId("ticket-date").fill(iso);
  await expect(page.getByTestId("ticket-rentrer")).toBeEnabled();
});

/** Un JPEG dont l'EXIF dit « tourné de 90° » (orientation=6) sur des pixels
 *  déjà droits — le mensonge relevé sur les photos de livres. */
async function jpegQuiMent(page: Page, lignes: string[]): Promise<Buffer> {
  const png = await photoDuTicket(page, lignes);
  const b64 = await page.evaluate(async (src) => {
    const img = new Image();
    img.src = `data:image/png;base64,${src}`;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.width;
    c.height = img.height;
    c.getContext("2d")!.drawImage(img, 0, 0);
    const blob: Blob = await new Promise((r) => c.toBlob((b) => r(b!), "image/jpeg", 0.92));
    return btoa(String.fromCharCode(...new Uint8Array(await blob.arrayBuffer())));
  }, png.toString("base64"));
  const jpeg = Buffer.from(b64, "base64");
  const tiff = Buffer.from([0x4d, 0x4d, 0, 0x2a, 0, 0, 0, 8, 0, 1, 0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, 6, 0, 0, 0, 0, 0, 0]);
  const charge = Buffer.concat([Buffer.from("Exif\0\0", "binary"), tiff]);
  const app1 = Buffer.concat([Buffer.from([0xff, 0xe1, (charge.length + 2) >> 8, (charge.length + 2) & 0xff]), charge]);
  return Buffer.concat([jpeg.subarray(0, 2), app1, jpeg.subarray(2)]);
}

test("un EXIF qui ment (orientation=6 sur une photo droite) n'empêche pas la lecture", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/#/cuisine/courses");
  await attendreLApp(page);
  const photo = await jpegQuiMent(page, [...CORPS, `${avantHier()} 16:28`]);
  await page.getByTestId("ticket-photo").setInputFiles({ name: "ticket.jpg", mimeType: "image/jpeg", buffer: photo });
  await expect(page.getByTestId("ticket-revue")).toBeVisible({ timeout: 90_000 });
  await expect(page.getByTestId("ticket-rangee")).toHaveCount(2);
  await expect(page.getByTestId("ticket-total")).toContainText("comme le ticket");
});
