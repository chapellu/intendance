// Les PNG du manifeste, rendus depuis les SVG.
//
// POURQUOI UN SCRIPT ET PAS UNE ÉTAPE DU BUILD. Les icônes changent une fois
// par an ; les reconstruire à chaque `npm run build` ferait payer un navigateur
// entier à chaque déploiement. La source de vérité reste les SVG de
// `public/icones/` : les PNG en sont un rendu, commité pour que le build n'ait
// besoin de rien.
//
// POURQUOI CHROMIUM. Ni ImageMagick ni librsvg ne sont là, et surtout : c'est
// un navigateur qui affichera ces icônes. Les faire rendre par celui-là même
// évite de découvrir qu'un moteur SVG plus tolérant acceptait un chemin que
// Chrome dessine autrement.
//
//   node scripts/icones.mjs
//
// Playwright est une dépendance du projet depuis T20 (les parcours de bout en
// bout) ; ce script n'a donc plus rien à installer. `CHROMIUM=/chemin/vers/chrome`
// force un binaire déjà présent, là où le téléchargement est coupé.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const ICONES = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "icones");

/** Ce que le manifeste et iOS demandent, et rien de plus : trois tailles, deux
 *  glyphes. Le SVG arrondi (`intendance.svg`) ne se rend pas — il ne sert qu'à
 *  l'onglet d'un navigateur, qui lit le vectoriel. */
const RENDUS = [
  ["intendance-carre.svg", "icone-192.png", 192],
  ["intendance-carre.svg", "icone-512.png", 512],
  ["intendance-carre.svg", "apple-touch-icon.png", 180],
  ["intendance-masque.svg", "icone-masque-512.png", 512],
];

const options = process.env["CHROMIUM"] ? { executablePath: process.env["CHROMIUM"] } : {};
const navigateur = await chromium.launch(options);

for (const [source, sortie, taille] of RENDUS) {
  // Le SVG est INJECTÉ dans la page, pas chargé par `<img src="file://…">` :
  // une page montée par `setContent` n'a pas le droit d'aller chercher un
  // fichier local, et l'image sortirait blanche sans que rien n'échoue.
  const svg = readFileSync(join(ICONES, source), "utf8")
    .replace(/width="512" height="512"/, `width="${taille}" height="${taille}"`);
  const page = await navigateur.newPage({ viewport: { width: taille, height: taille }, deviceScaleFactor: 1 });
  await page.setContent(`<style>html,body{margin:0;padding:0;line-height:0}</style>${svg}`);
  await page.screenshot({ path: join(ICONES, sortie) });
  await page.close();
  console.log(`${sortie} — ${taille}×${taille}`);
}

await navigateur.close();
