// Le greffon Vite qui fabrique `dist/sw.js`.
//
// POURQUOI PAS `vite-plugin-pwa`. Workbox répond à des problèmes que cette app
// n'a pas : plusieurs stratégies par route, des ressources tierces, des chunks
// chargés à la demande. Ici le build est UN document, un JS, un CSS, quatre
// polices, un JSON et des icônes — un ensemble fini, plat, connu à la seconde
// où Rollup a fini. Ce qui reste à écrire tient en quarante lignes, et c'est
// quarante lignes qu'on pourra lire le jour où le cache ment.
//
// POURQUOI CE FICHIER EST DANS `src/`. C'est de l'outillage de build, pas de
// l'app — mais `tsconfig.json` ne typecheck que `src`, et Vitest ne cherche des
// tests que là. Un greffon rangé dans `scripts/` ne serait ni vérifié ni testé,
// et c'est lui qui décide ce que l'app aura sous la main sans réseau. Rien dans
// l'app ne l'importe : il ne part pas dans le bundle.

import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, posix, sep } from "node:path";
import type { Plugin, ResolvedConfig } from "vite";

/**
 * Ce qui entre au cache, à partir de ce que le build a écrit.
 *
 * Le tri n'est pas cosmétique : la liste part dans `sw.js`, dont le CONTENU
 * décide si le navigateur voit une nouvelle version. Un ordre qui dépendrait de
 * celui du disque annoncerait de temps en temps une mise à jour qui n'existe
 * pas.
 */
export function aPrecacher(fichiers: readonly string[]): string[] {
  return fichiers
    .filter((f) => f !== "sw.js" && !f.endsWith(".map"))
    .sort()
    .map((f) => `/${f}`);
}

/**
 * L'empreinte d'un build — le nom de son cache, et donc ce qui distingue deux
 * versions.
 *
 * ELLE PORTE LE CONTENU, PAS SEULEMENT LES NOMS. Les assets de Rollup sont
 * hachés dans leur nom, mais pas ce qui vient de `public/` : `cuisine-data.json`
 * s'appellera toujours `cuisine-data.json`. Un catalogue réexporté sans qu'une
 * ligne de code bouge doit quand même produire une version neuve, sinon l'app
 * calcule sur le catalogue d'avant jusqu'au prochain déploiement de code.
 */
export function empreinte(entrees: readonly (readonly [string, string])[]): string {
  const h = createHash("sha256");
  for (const [chemin, hachage] of [...entrees].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    h.update(`${chemin} ${hachage} `);
  }
  return h.digest("hex").slice(0, 12);
}

async function lister(racine: string, sous = ""): Promise<string[]> {
  const entrees = await readdir(join(racine, sous), { withFileTypes: true });
  const out: string[] = [];
  for (const e of entrees) {
    const chemin = sous ? join(sous, e.name) : e.name;
    if (e.isDirectory()) out.push(...(await lister(racine, chemin)));
    // Les chemins d'un cache sont des URL : sur un disque Windows, `join` rend
    // des antislashs, et `/assets\index.js` n'est pas une URL.
    else out.push(chemin.split(sep).join(posix.sep));
  }
  return out;
}

export function pwa(): Plugin {
  let config: ResolvedConfig;

  return {
    name: "intendance-pwa",
    // Jamais en développement : un worker qui sert son cache pendant qu'on code
    // rend chaque modification invisible, et l'heure perdue à le comprendre est
    // toujours passée à chercher ailleurs. Voir aussi `maj.ts`, qui désinscrit
    // un worker resté d'une prévisualisation sur le même port.
    apply: "build",
    configResolved(c) {
      config = c;
    },
    // `closeBundle` et pas `generateBundle` : à ce moment-là `public/` est copié
    // dans `dist/`, et les polices comme le catalogue font partie de ce qu'on
    // promet hors ligne.
    async closeBundle() {
      const dist = join(config.root, config.build.outDir);
      const fichiers = await lister(dist);

      const empreintes = await Promise.all(
        fichiers.map(async (f) => {
          const octets = await readFile(join(dist, f));
          return [f, createHash("sha256").update(octets).digest("hex")] as const;
        }),
      );

      const precache = aPrecacher(fichiers);
      const version = empreinte(empreintes);

      // Le modèle se lit depuis la racine du projet, et pas par rapport à
      // `import.meta.url` : Vite compile sa configuration dans un fichier
      // temporaire posé à la racine, et c'est là que ce module se croirait.
      const modele = await readFile(join(config.root, "src/pwa/sw.js"), "utf8");
      const source = modele
        .replace('"__VERSION__"', JSON.stringify(version))
        .replace("__PRECACHE__", JSON.stringify(precache, null, 2));

      await writeFile(join(dist, "sw.js"), source);
      config.logger.info(`sw.js — version ${version}, ${precache.length} fichiers précachés`);
    },
  };
}
