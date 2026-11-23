// Ce que l'app croit, face à ce qui est — semaine après semaine.
//
// usage : npx vite-node sim/croyance.ts <OUT d'une année> [--json]
//
// `annee.mjs` exporte chaque dimanche le journal de l'app et la cuisine réelle
// (`OUT/journal/<jour>.json`). On rejoue ici le journal AVEC LE CODE DE L'APP
// (`rejouer`), puis on compare, denrée du fond par denrée du fond, en unités
// d'achat : l'app tient-elle ce que le placard tient ?
//
// Deux écarts comptent, parce qu'ils se voient à l'écran :
//   — « croit à tort » : l'app tient la denrée au-dessus de son plancher, la
//     cuisine n'en a plus — la liste ne la redemande pas, « Ce soir » dit
//     « rien à acheter » ;
//   — « oublie » : l'app la croit sous son plancher (ou absente), la cuisine en
//     a encore une unité au moins — la liste rachète ce qui est là.
import { readdirSync, readFileSync } from "node:fs";
import { lireCatalogue } from "../src/model/catalogue";
import { contexte, rejouer } from "../src/model/journal";
import { unitesReelles } from "../src/model/plancherGardeManger";

const OUT = process.argv[2];
const JSON_OUT = process.argv.includes("--json");
const cat = lireCatalogue(JSON.parse(readFileSync("public/cuisine-data.json", "utf8")));
const brut = JSON.parse(readFileSync("public/cuisine-data.json", "utf8"));
const alias = (id: string) => cat.rayons.aliases[id] ?? id;

// Une unité d'achat en unités de recette — la même règle que `annee.mjs:parUniteDuFond`.
const uniteRecette = new Map<string, string>(), qteRecette = new Map<string, number>();
for (const p of brut.plats) for (const i of p.ingredients) {
  if (i.base || i.assaisonnement) continue;
  const id = alias(i.id);
  if (!uniteRecette.has(id)) uniteRecette.set(id, i.unit);
  qteRecette.set(id, Math.max(qteRecette.get(id) ?? 0, i.qty ?? 0));
}
function parUnite(id: string, u: string): number {
  const typ = qteRecette.get(id) || 1;
  const enMasse = /^(g|ml)$/.test(uniteRecette.get(id) ?? "");
  const g = /(\d+(?:[.,]\d+)?)\s*(kg|g)\b/.exec(u);
  if (g) { const gr = parseFloat(g[1]!.replace(",", ".")) * (g[2] === "kg" ? 1000 : 1); return enMasse ? gr : Math.max(1, Math.round(gr / 150)); }
  const n = /de (\d+)\b/.exec(u); if (n) return +n[1]!;
  return /bo[iî]te|brique|bocal|tube/.test(u) ? typ : 2 * typ;
}

const fond = cat.fond?.denrees ?? [];
const fichiers = readdirSync(`${OUT}/journal`).filter((f) => f.endsWith(".json")).sort();
const parId = new Map<string, { croitATort: number; oublie: number; semaines: number; exemple?: string }>();
const semaines: { jour: string; croitATort: string[]; oublie: string[] }[] = [];
for (const f of fichiers) {
  const { jour, evts, reel, reelFond } = JSON.parse(readFileSync(`${OUT}/journal/${f}`, "utf8"));
  const r = rejouer(cat, evts, contexte(cat), jour);
  const s = { jour, croitATort: [] as string[], oublie: [] as string[] };
  for (const d of fond) {
    const id = alias(d.ingredient);
    const e = r.parIngredient.get(id) ?? r.vus.get(id) ?? null;
    const app = unitesReelles(e);
    const vrai = reelFond?.[id] ?? (reel[id] ?? 0) / parUnite(id, d.unite ?? "");
    const x = parId.get(id) ?? { croitATort: 0, oublie: 0, semaines: 0 };
    x.semaines++;
    if (app >= d.minimum - 1e-9 && vrai < 0.05) { x.croitATort++; s.croitATort.push(id); x.exemple ??= `${jour} : app ${app.toFixed(1)}, cuisine ${vrai.toFixed(1)}`; }
    if (app < d.minimum - 1e-9 && vrai >= d.minimum) { x.oublie++; s.oublie.push(id); }
    parId.set(id, x);
  }
  semaines.push(s);
}
const lignes = [...parId].filter(([, x]) => x.croitATort || x.oublie).sort((a, b) => b[1].croitATort - a[1].croitATort || b[1].oublie - a[1].oublie);
if (JSON_OUT) {
  console.log(JSON.stringify({ semaines: fichiers.length, parId: Object.fromEntries(lignes), parSemaine: semaines }, null, 1));
} else {
  const tot = (k: "croitATort" | "oublie") => lignes.reduce((n, [, x]) => n + x[k], 0);
  console.log(`${fichiers.length} semaines · ${fond.length} denrées du fond · croit à tort ${tot("croitATort")} · oublie ${tot("oublie")} (denrée × semaine)`);
  for (const [id, x] of lignes) console.log(`  ${id.padEnd(26)} croit à tort ${String(x.croitATort).padStart(3)}  oublie ${String(x.oublie).padStart(3)}  ${x.exemple ?? ""}`);
}
