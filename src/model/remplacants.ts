// T167 — Les ingrédients de remplacement.
//
// « Farine T110 de blé ou de grand épeautre » : 41 lignes du corpus disent dans
// leur nom ce qui fait aussi bien, et le modèle n'en lisait rien. La fiche
// écrivait « à acheter » devant une farine d'épeautre au placard, la liste la
// rachetait, et « Ce soir » comptait le pain comme incomplet.
//
// UNE SEULE RÈGLE, LUE PARTOUT. La fiche, la liste de courses, « Ce soir » et
// le rejeu du journal se demandent tous la même chose — « quelle farine, au
// juste ? » —, et s'ils répondaient chacun à sa façon, la fiche dirait
// l'épeautre pendant que le stock décompterait la T110. D'où cette fonction.

import type { Ingredient, Remplacant } from "./types";

export interface Retenu {
  /** L'id d'achat retenu — l'original ou un remplaçant. */
  id: string;
  /** Combien en mettre pour un de l'original. 1 pour l'original. */
  ratio: number;
  /** Le remplaçant retenu, `null` quand c'est l'original. */
  remplacant: Remplacant | null;
}

/**
 * Ce que la ligne prend vraiment.
 *
 * L'ORDRE EST LA RÈGLE : ce qu'un doigt a choisi, puis l'original s'il est là,
 * puis le premier remplaçant qui l'est, puis l'original — qu'il faudra acheter.
 * Un remplaçant ne s'achète jamais à la place : la recette nomme d'abord ce
 * qu'elle préfère, et c'est ce que la liste doit demander.
 */
export function retenir(
  ing: Pick<Ingredient, "id" | "remplacants">,
  estLa: (id: string) => boolean,
  alias: (id: string) => string = (id) => id,
  choisi?: string | null,
): Retenu {
  const original: Retenu = { id: ing.id, ratio: 1, remplacant: null };
  const autres = ing.remplacants ?? [];
  if (choisi) {
    if (alias(choisi) === alias(ing.id)) return original;
    const r = autres.find((x) => alias(x.id) === alias(choisi));
    if (r) return { id: r.id, ratio: r.ratio, remplacant: r };
  }
  if (!autres.length || estLa(alias(ing.id))) return original;
  const r = autres.find((x) => estLa(alias(x.id)));
  return r ? { id: r.id, ratio: r.ratio, remplacant: r } : original;
}

/** Les options d'une ligne, l'original en tête — ce que la fiche fait choisir. */
export const options = (ing: Pick<Ingredient, "id" | "nom" | "remplacants">): { id: string; nom: string }[] => [
  { id: ing.id, nom: ing.nom },
  ...(ing.remplacants ?? []).map((r) => ({ id: r.id, nom: r.nom })),
];
