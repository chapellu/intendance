// Les planchers validés — T37.
//
// UN PLANCHER EST UNE DÉCISION, DONC IL SE PERSISTE. La règle de tête de
// `db/schema.ts` : survit ce qu'un DOIGT a décidé, se recalcule ce qu'un calcul
// dérive. Le niveau du congélateur se recalcule — c'est `etatDuCongelo`, lu du
// dépôt à chaque rendu. Le plancher, lui, est un choix : l'app le propose,
// personne d'autre ne peut le poser.
//
// DANS `reglages`, ET PAS DANS UNE TABLE À ELLE. La table clé-valeur existe
// exactement pour ça — « un tableau typé par réglage obligerait une migration à
// chaque nouveau bouton ». Une table `planchers` aurait coûté une version de
// schéma pour deux champs, dont l'un est le nom de la clé.
//
// LE REFUS SE PERSISTE AUSSI, ET C'EST LA MOITIÉ QUI COMPTE. Sans lui, un type
// cuisiné deux fois reproposerait son plancher à chaque ouverture de l'écran,
// indéfiniment, sur exactement les plats qu'on a déjà dit ne pas vouloir
// suivre — et une proposition qu'on ne peut pas faire taire finit par
// discréditer les autres. `niveau: null` est donc une décision pleine : « pas
// celui-là, et ne redemande pas ».

import type { Plancher } from "../model/plancher";
import type { Base } from "./schema";

/** La clé porte le TYPE ÉMIS, jamais le plat : c'est T34, jusque dans la base.
 *  Un plancher sur `sauce-bolognaise` vaut pour toutes les recettes qui en
 *  produisent, et il n'y a rien à recoller quand une deuxième arrive. */
export const clePlancher = (type: string): string => `plancher|${type}`;

const PREFIXE = "plancher|";

/** Ce qu'un doigt a décidé d'un type. `niveau: null` = refusé pour de bon. */
export interface DecisionPlancher {
  niveau: number | null;
}

/**
 * Toutes les décisions prises, par type.
 *
 * Une seule requête à préfixe : `cle` est la clé primaire de `reglages`, donc
 * `startsWith` est un parcours d'index et non un balayage de la table.
 */
export async function lireDecisions(base: Base): Promise<Map<string, number | null>> {
  const lignes = await base.reglages.where("cle").startsWith(PREFIXE).toArray();
  const par = new Map<string, number | null>();
  for (const l of lignes) {
    const v = l.valeur as DecisionPlancher | null;
    par.set(l.cle.slice(PREFIXE.length), typeof v?.niveau === "number" ? v.niveau : null);
  }
  return par;
}

/** Les planchers qui valent quelque chose — les refus n'en sont pas. C'est ce
 *  que le score reçoit ; il n'a aucune raison de connaître les refus. */
export const validesParmi = (decisions: ReadonlyMap<string, number | null>): Plancher[] =>
  [...decisions]
    .filter((d): d is [string, number] => d[1] !== null)
    .map(([type, niveau]) => ({ type, niveau }));

/**
 * Poser un plancher, ou le refuser (`niveau: null`).
 *
 * PAS DE SUPPRESSION ICI, ET C'EST VOLONTAIRE. `poserReglage` efface la clé
 * quand la valeur est `null` ou `false` ; ce serait exactement le mauvais
 * comportement — effacer un refus le transforme en « jamais demandé », donc en
 * proposition qui revient. Retirer un plancher est un troisième geste, et c'est
 * T44 qui le tranchera.
 */
export async function poserPlancher(
  base: Base,
  type: string,
  niveau: number | null,
): Promise<void> {
  await base.reglages.put({
    cle: clePlancher(type),
    valeur: { niveau } satisfies DecisionPlancher,
    maj: Date.now(),
  });
}
