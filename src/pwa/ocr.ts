// Les fichiers de l'OCR, servis par l'app elle-même — T138.
//
// AUCUN SERVEUR, AUCUN CDN. tesseract.js va chercher par défaut son worker, son
// cœur WebAssembly et ses données de langue sur jsdelivr : ce serait un tiers
// qui voit passer chaque scan, et rien hors ligne. On les copie donc depuis
// `node_modules` dans `dist/ocr/`, sur la même origine que l'app.
//
// ILS NE SONT PAS PRÉCACHÉS. Trois cœurs de ~3,9 Mo (le navigateur n'en prend
// qu'un, selon SIMD), le worker et 0,7 Mo de français : les mettre dans le
// précache ferait télécharger ~12 Mo à chaque version de l'app, à un foyer qui
// scanne un ticket par semaine. `sw.js` les met en cache AU PREMIER SCAN, dans
// un cache à part qui survit aux versions — ensuite le scan marche hors ligne.

import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import type { Plugin } from "vite";

export const DOSSIER_OCR = "ocr";

/** Ce que l'app publie sous `/ocr/` : chemin publié → chemin dans node_modules. */
export function fichiersOcr(racine: string): Record<string, string> {
  const req = createRequire(join(racine, "package.json"));
  const tess = dirname(req.resolve("tesseract.js/package.json"));
  const coeur = dirname(req.resolve("tesseract.js-core/package.json"));
  const fra = dirname(req.resolve("@tesseract.js-data/fra/package.json"));
  const out: Record<string, string> = {
    "worker.min.js": join(tess, "dist/worker.min.js"),
    // `best_int` : le modèle LSTM seul, 0,7 Mo au lieu de 6,3 — le cœur
    // `-lstm` n'a pas besoin du reste.
    "lang/fra.traineddata.gz": join(fra, "4.0.0_best_int/fra.traineddata.gz"),
  };
  for (const v of ["lstm", "simd-lstm", "relaxedsimd-lstm"]) {
    out[`core/tesseract-core-${v}.wasm.js`] = join(coeur, `tesseract-core-${v}.wasm.js`);
  }
  return out;
}

export function ocr(): Plugin {
  let racine = process.cwd();
  return {
    name: "intendance-ocr",
    configResolved(c) {
      racine = c.root;
    },
    async generateBundle() {
      for (const [publie, source] of Object.entries(fichiersOcr(racine))) {
        this.emitFile({ type: "asset", fileName: `${DOSSIER_OCR}/${publie}`, source: await readFile(source) });
      }
    },
    // En développement, les mêmes chemins, servis depuis node_modules.
    configureServer(server) {
      const fichiers = fichiersOcr(racine);
      server.middlewares.use(`/${DOSSIER_OCR}/`, (req, res, next) => {
        const source = fichiers[(req.url ?? "").replace(/^\//, "").split("?")[0]!];
        if (!source) return next();
        readFile(source).then((o) => res.end(o), next);
      });
    },
  };
}
