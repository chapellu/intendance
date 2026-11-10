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
 *
 * SAUF CE QUI NE S'ACHÈTE PAS (T178, `potager`) : une cébette absente ne se
 * réclame pas chaque semaine à un étal qui n'en a pas ; c'est le premier
 * remplaçant — l'oignon — qui s'achète.
 */
export function retenir(
  ing: Pick<Ingredient, "id" | "remplacants" | "potager">,
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
  const r = autres.find((x) => estLa(alias(x.id))) ?? (ing.potager ? autres[0] : undefined);
  return r ? { id: r.id, ratio: r.ratio, remplacant: r } : original;
}

/** Les options d'une ligne, l'original en tête — ce que la fiche fait choisir. */
export const options = (ing: Pick<Ingredient, "id" | "nom" | "remplacants">): { id: string; nom: string }[] => [
  { id: ing.id, nom: ing.nom },
  ...(ing.remplacants ?? []).map((r) => ({ id: r.id, nom: r.nom })),
];

/** Une part d'une ligne répartie : quel ingrédient, et combien de lui. */
export interface Part extends Retenu {
  /** Dans l'unité de la recette, AU RATIO de cette option. */
  qty: number;
}

/**
 * T167 — UN FOND QUI NE SUFFIT PAS SE COMPLÈTE. « Il me reste plus beaucoup
 * d'épeautre » : 200 g d'épeautre et 180 g de T110 font le pain, et c'est ce
 * qu'on fait vraiment devant le placard. La ligne se répartit donc sur ses
 * options, dans l'ordre de `retenir` (le choix, puis ce qui est là).
 *
 * NE RÉPARTIT QUE CE QUI SE PÈSE ET SE SAIT. Il faut une recette en grammes et
 * un stock CHIFFRÉ qui ne suffit pas : un sac « entamé » sans poids n'est pas
 * un manque mesuré, et l'inventer couperait la farine en deux sur une
 * supposition. Et il faut une autre option PRÉSENTE — sinon la ligne reste
 * entière sur la première, et la fiche dit « reste ~200 g ».
 *
 * `stock(id)` : les grammes connus, `null` présent sans poids, `0` absent.
 */
export function repartir(
  ing: Pick<Ingredient, "id" | "remplacants" | "unit" | "potager">,
  besoin: number,
  stock: (id: string) => number | null,
  alias: (id: string) => string = (id) => id,
  choisi?: string | null,
): Part[] {
  const est = (id: string) => stock(alias(id)) !== 0;
  const premier = retenir(ing, est, alias, choisi);
  const entier: Part[] = [{ ...premier, qty: besoin * premier.ratio }];
  if (ing.unit !== "g" || !ing.remplacants?.length) return entier;
  const toutes: Retenu[] = [
    { id: ing.id, ratio: 1, remplacant: null },
    ...ing.remplacants.map((r) => ({ id: r.id, ratio: r.ratio, remplacant: r })),
  ];
  const suite = [premier, ...toutes.filter((o) => alias(o.id) !== alias(premier.id) && est(o.id))];
  if (suite.length < 2) return entier;
  const parts: Part[] = [];
  let reste = besoin; // en unités de l'original
  for (const [n, o] of suite.entries()) {
    if (reste <= 1e-9) break;
    const g = stock(alias(o.id));
    const dernier = n === suite.length - 1;
    if (!dernier && g != null && g < reste * o.ratio - 0.5) {
      if (g > 0.5) parts.push({ ...o, qty: g });
      reste -= g / o.ratio;
      continue;
    }
    parts.push({ ...o, qty: reste * o.ratio });
    reste = 0;
  }
  return parts.length ? parts : entier;
}
