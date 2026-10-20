// Les chemins vers un écran éteint, comptés — T110.
//
// « RIEN NE COMPTE LES CHEMINS » : T90 l'écrivait des deux trous de T88, T94
// en ajoutait un troisième, et l'année simulée a trouvé le quatrième (la tâche
// « Une offre attend une réponse », menant à « À prévoir »). Les quatre se sont
// vus à l'usage. Ce test les compte à sa place : toute route LITTÉRALE vers un
// écran des jours doit être soit dans un fichier qui n'est lui-même atteignable
// que les jours allumés, soit sur une ligne qui lit `JOURS_VISIBLES`.
//
// CE QU'IL NE VOIT PAS : une route construite autrement qu'en littéral. C'est
// pour ça que `eteint()` existe, et que les tâches du cockpit sont testées par
// lui (`cockpit.vue.test.ts`).

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { ECRANS_DES_JOURS } from "./routes";

/** Les fichiers qui ne s'ouvrent QUE par un écran des jours, ou qui ne font que
 *  nommer les routes. Chaque entrée dit pourquoi elle est là. */
const ATTEINTS_PAR_LES_JOURS: Record<string, string> = {
  "nav/routes.ts": "la table des routes elle-même",
  "ecrans/Aujourdhui.tsx": "écran éteint : ses liens ne partent que de lui",
  "ecrans/Semaine.tsx": "écran éteint : ses liens ne partent que de lui",
  "ecrans/Prevoir.tsx": "écran éteint : ses liens ne partent que de lui",
  "ui/Coquille.tsx": "SOUS_NAV_JOURS, choisie par `JOURS_VISIBLES` deux lignes plus bas",
};

function fichiers(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return fichiers(p);
    return /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f) ? [p] : [];
  });
}

describe("aucun chemin ne mène à un écran éteint sans le dire", () => {
  const motif = new RegExp(`ecran: "(${[...ECRANS_DES_JOURS].join("|")})"`);

  test("chaque route littérale vers un écran des jours est gardée ou justifiée", () => {
    const fautes: string[] = [];
    for (const p of fichiers("src")) {
      const rel = p.replace(/^src\//, "");
      if (rel in ATTEINTS_PAR_LES_JOURS) continue;
      readFileSync(p, "utf8")
        .split("\n")
        .forEach((ligne, n) => {
          if (motif.test(ligne) && !ligne.includes("JOURS_VISIBLES") && !ligne.trimStart().startsWith("//") && !ligne.trimStart().startsWith("*") && !ligne.trimStart().startsWith("|"))
            fautes.push(`${rel}:${n + 1}  ${ligne.trim()}`);
        });
    }
    expect(fautes).toEqual([]);
  });
});
