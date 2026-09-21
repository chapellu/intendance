// CE QU'ON N'A PLUS FINIT SUR LA LISTE.
//
// Le parcours d'un bug signalé à l'usage le 21/09 : « je n'ai plus de
// tagliatelles, comment je les ajoute à ma liste ? ». La réponse était qu'on ne
// pouvait pas. `provenance()` demandait « cet id est-il au garde-manger ? » au
// relevé de l'export, figé depuis le 26/08 ; un id qui y figurait n'en sortait
// jamais, et la ligne restait dans « Vous en avez — vérifiez la quantité » quoi
// qu'on relève. La liste mentait par omission, ce que `db/courses.ts` appelle
// déjà « la pire façon de mentir pour une liste de courses ».
//
// AUCUN TEST UNITAIRE NE DIT ÇA. `calcul.test.ts` et `db.test.ts` tiennent la
// règle ; ici on traverse le relevé d'une zone, Dexie, le rejeu du journal, la
// requête vive et deux écrans — c'est-à-dire tout ce qui se trouvait entre le
// doigt de l'utilisateur et sa liste.

import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { attendreLApp, poserUnPlat } from "./parcours";

/**
 * Les plats qui puisent dans une zone du placard, et ce qu'ils y prennent.
 *
 * DÉRIVÉ DU CORPUS, JAMAIS ÉNUMÉRÉ À LA MAIN — même parti que
 * `stock-descend.spec.ts`, et pour la même raison : une liste d'ids recopiée ici
 * vieillirait à côté du catalogue sans que personne le voie.
 *
 * DEUX EXCLUSIONS, ET ELLES DISENT CHACUNE QUELQUE CHOSE.
 *
 * Le `placard` des rayons d'abord : le sel et l'huile sont une APPARTENANCE, ils
 * ne passent par aucun relevé et aucun relevé ne les enverra au magasin.
 *
 * Les denrées RANGÉES DANS DEUX ZONES ensuite — le concentré de tomate en est
 * une. Vider une seule de leurs zones ne les épuise pas, et c'est correct :
 * l'app doit continuer à dire « vous en avez » tant qu'il en reste ailleurs.
 * Les prendre ici ferait échouer le parcours sur une bonne réponse.
 *
 * ON REND PLUSIEURS PLATS, PAS UN SEUL. La main ne propose que quatre cartes à
 * la fois sur 138 plats : viser un titre précis, c'est huit repioches et un
 * échec. `stock-descend.spec.ts` s'en est déjà aperçu.
 */
function cibles(): Map<string, { zone: string; ingredient: string }> {
  const c = JSON.parse(readFileSync("public/cuisine-data.json", "utf8")) as any;
  const alias = (id: string): string => c.rayons.aliases[id] ?? id;
  const toujours = new Set<string>(c.rayons.placard);

  const zones = new Map<string, string>(c.gardeManger.zones.map((z: any) => [z.id, z.label]));
  const zonesDe = new Map<string, Set<string>>();
  for (const d of c.gardeManger.denrees) {
    const id = alias(d.ingredient);
    zonesDe.set(id, (zonesDe.get(id) ?? new Set()).add(d.zone));
  }

  const seule = new Map<string, string>();
  for (const [id, z] of zonesDe)
    if (z.size === 1 && !toujours.has(id)) seule.set(id, zones.get([...z][0]!)!);

  const out = new Map<string, { zone: string; ingredient: string }>();
  for (const p of c.plats) {
    const ing = p.ingredients.find((i: any) => !i.base && seule.has(alias(i.id)));
    if (ing) out.set(p.titre, { zone: seule.get(alias(ing.id))!, ingredient: ing.nom });
  }
  if (!out.size) throw new Error("aucune zone ne porte un ingrédient qu'un plat réclame");
  return out;
}

test("relever une zone à vide met ce qui manque sur la liste de courses", async ({ page }) => {
  const parPlat = cibles();
  const titre = await poserUnPlat(page, (t) => parPlat.has(t));
  const { zone, ingredient } = parPlat.get(titre)!;

  // AVANT — la promesse de T24, qui doit continuer de tenir : ce dont le relevé
  // dit qu'il en reste ne s'achète pas les yeux fermés, il se vérifie.
  await page.goto("/#/cuisine/courses");
  await attendreLApp(page);
  await expect(page.locator(".co-vide", { hasText: "Vous en avez" })).toContainText(ingredient);
  await expect(page.locator("button.co-art", { hasText: ingredient })).toHaveCount(0);

  // LE GESTE : ouvrir le placard, constater qu'il n'y a plus rien, le dire.
  await page.goto("/#/cuisine/stock");
  await attendreLApp(page);
  const carte = page.locator(".co-espace").filter({ hasText: zone }).first();
  await carte.getByRole("button", { name: "Relever" }).click();

  // Tout descendre à zéro. Douze coups par ligne : le relevé du 26/08 ne porte
  // aucune denrée au-delà, et un « − » qui a déjà touché le fond ne fait rien.
  const moins = carte.getByRole("button", { name: "−" });
  const n = await moins.count();
  expect(n).toBeGreaterThan(0);
  for (let i = 0; i < n; i += 1) for (let k = 0; k < 12; k += 1) await moins.nth(i).click();
  await carte.getByRole("button", { name: /Valider le relevé/ }).click();

  // APRÈS — la ligne a changé de section : elle n'est plus à vérifier, elle est
  // à acheter. C'est la phrase entière de ce correctif.
  await page.goto("/#/cuisine/courses");
  await attendreLApp(page);
  await expect(page.locator("button.co-art", { hasText: ingredient }).first()).toBeVisible();
  // PAR LE COMPTE, PAS PAR `not.toContainText` : la section « Vous en avez »
  // peut avoir DISPARU — c'était sa dernière ligne — et une assertion négative
  // sur un localisateur vide échoue au lieu de passer. Le dépôt connaît le
  // piège dans l'autre sens (`not.toHaveText` passe quand l'élément n'est plus
  // là) ; c'est la même leçon, prise par l'autre bout.
  await expect(page.locator(".co-vide", { hasText: ingredient })).toHaveCount(0);

  // ET ÇA SURVIT AU RECHARGEMENT, parce que rien de tout ça n'est stocké : la
  // liste se recalcule, le niveau du placard se REJOUE depuis le journal. Si le
  // rejeu ne repassait pas par le jeu au démarrage, la ligne reviendrait se
  // cacher dans « Vous en avez » au premier F5.
  await page.reload();
  await attendreLApp(page);
  await expect(page.locator("button.co-art", { hasText: ingredient }).first()).toBeVisible();
});
