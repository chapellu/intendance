// Les saisons et la garde — deux lectures du catalogue, sans aucun score.
//
// CE FICHIER NE DÉCIDE RIEN, ET C'EST SA PROMESSE. L'utilisateur a redemandé le
// 2026-10-18 d'« encourager les légumes de saison » ; le moteur de suggestion
// qui les pèsera est un autre chantier. Ici on ne fait que RÉPONDRE : ce plat
// est-il de saison ce mois-ci, et pourquoi ; cette denrée, comment la ranger.
// Un poids glissé dans une fonction de lecture serait le réglage caché que ce
// dépôt passe son temps à débusquer.

import type { Catalogue, FamilleDeGarde, Plat } from "./types";

/**
 * Un calendrier de douze mois n'est pas une saison, c'est une garde.
 *
 * Oignons, ail, pommes de terre et carottes se mangent toute l'année depuis le
 * cellier : `saisons.yaml` les liste sur douze mois, et les compter comme un
 * signal ferait d'un plat aux oignons un plat « de saison » en janvier.
 */
const TOUTE_L_ANNEE = 12;

/** `true` / `false` quand l'ingrédient a une vraie saison, `null` sinon —
 *  pas de calendrier, ou un calendrier de douze mois. Le `null` compte : un
 *  ingrédient sans saison n'est ni pour ni contre le plat. */
export function deSaison(catalogue: Catalogue, ingredient: string, mois: number): boolean | null {
  const id = catalogue.rayons.aliases[ingredient] ?? ingredient;
  const m = (catalogue.saisons?.mois ?? {})[id];
  if (!m || new Set(m).size >= TOUTE_L_ANNEE) return null;
  return m.includes(mois);
}

export interface SaisonDuPlat {
  /** Les ingrédients à vraie saison qui SONT de saison ce mois-ci. */
  deSaison: string[];
  /** Ceux qui ne le sont pas — ce qui, au marché, coûte cher ou vient de loin. */
  horsSaison: string[];
}

/**
 * Ce qui, dans un plat, parle de la saison — et rien d'autre.
 *
 * DEUX LISTES ET PAS UN BOOLÉEN. Un plat aux courgettes et aux oignons est
 * « de saison » en juillet ; un plat sans aucun légume de saison n'est ni l'un
 * ni l'autre (deux listes vides), et c'est le cas des dîners du fond — ce qui
 * est exact : ils se font toute l'année. Les accompagnements comptent avec le
 * plat, puisqu'ils s'achètent avec lui.
 */
export function saisonDuPlat(catalogue: Catalogue, plat: Plat, mois: number): SaisonDuPlat {
  const ids = new Set(
    [...plat.ingredients.filter((i) => !i.base), ...plat.avec].map(
      (i) => catalogue.rayons.aliases[i.id] ?? i.id,
    ),
  );
  const out: SaisonDuPlat = { deSaison: [], horsSaison: [] };
  for (const id of [...ids].sort()) {
    const s = deSaison(catalogue, id, mois);
    if (s === true) out.deSaison.push(id);
    else if (s === false) out.horsSaison.push(id);
  }
  return out;
}

/**
 * La famille de garde d'une denrée — sa fenêtre et le geste qui la fait tenir.
 * `null` quand aucune famille ne la nomme : l'écran se tait plutôt que de
 * deviner.
 */
export function familleDe(catalogue: Catalogue, ingredient: string): FamilleDeGarde | null {
  const id = catalogue.rayons.aliases[ingredient] ?? ingredient;
  return (catalogue.garde ?? []).find((f) => f.ids.includes(id)) ?? null;
}
