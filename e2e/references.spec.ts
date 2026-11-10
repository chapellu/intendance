// T179 — Les références du magasin : la clé se colle une fois, le fichier
// arrive par `/prive/`, et chaque ligne de courses dit quel produit prendre.
//
// LE FICHIER EST SIMULÉ (`page.route`) : le vrai est un Secret du cluster, et
// la passerelle qui exige la clé n'existe pas devant `vite preview`. Ce que le
// parcours prouve, c'est le côté téléphone — l'en-tête part, une clé refusée
// ne vide rien, et le service worker laisse `/prive/` au réseau (sans quoi
// `page.route` ne verrait jamais la requête : le worker l'aurait servie).

import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { attendreLApp, poserUnPlat } from "./parcours";

const catalogue = JSON.parse(readFileSync("public/cuisine-data.json", "utf8")) as {
  rayons: { rayons: Record<string, string[]> };
};
const ids = Object.values(catalogue.rayons.rayons).flat();
const fichier = {
  releve: "2026-11-09",
  magasin: "drive",
  articles: Object.fromEntries(ids.map((id) => [id, { statut: "ok", produit: `Produit ${id}`, prix: 1.5 }])),
};

test("coller la clé fait arriver les références sous chaque ligne", async ({ page }) => {
  const entetes: (string | undefined)[] = [];
  await page.route("**/prive/references.json", async (route) => {
    const cle = route.request().headers()["x-intendance-cle"];
    entetes.push(cle);
    await route.fulfill(
      cle === "la-bonne"
        ? { status: 200, contentType: "application/json", body: JSON.stringify(fichier) }
        : { status: 401, body: "" },
    );
  });

  await poserUnPlat(page);
  await page.goto("/#/cuisine/courses");
  await attendreLApp(page);

  const article = page.locator("button.co-art").filter({ hasText: /pour \d plats?/ }).first();
  await expect(article).toBeVisible();
  await expect(article.locator(".co-ref")).toHaveCount(0);

  await page.getByRole("button", { name: /Références du magasin/ }).click();
  await expect(page.getByText("Aucune référence sur ce téléphone.")).toBeVisible();

  // Une mauvaise clé : refusée, et rien n'apparaît.
  await page.getByLabel("Clé du magasin").fill("la-mauvaise");
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await expect(page.getByText(/Clé refusée/)).toBeVisible();
  await expect(article.locator(".co-ref")).toHaveCount(0);

  // La bonne : la ligne dit son produit et son prix.
  await page.getByLabel("Clé du magasin").fill("la-bonne");
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await expect(article.locator(".co-ref")).toContainText(/Produit .* · 1,50 €/);
  expect(entetes).toEqual(expect.arrayContaining(["la-mauvaise", "la-bonne"]));

  // HORS LIGNE, LA COPIE RESTE : le serveur ne répond plus, la ligne parle encore.
  await page.unroute("**/prive/references.json");
  await page.route("**/prive/references.json", (route) => route.abort());
  await page.reload();
  await attendreLApp(page);
  await expect(page.locator("button.co-art .co-ref").first()).toContainText(/Produit /);
});
