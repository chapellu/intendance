// Ce qui fait un REPAS, par opposition à une brique.
//
// LA REMARQUE QUI A OUVERT CE MODULE, et elle corrige un découpage que j'avais
// mal posé. J'avais séparé « ce n'est pas un plat du tout » (la sauce
// bolognaise, la pâte à pizza) de « c'est un plat, il manque juste un
// accompagnement » (le rôti, l'omelette). L'utilisateur a tranché :
//
//   « C'est le même problème que la bolognaise sans pâtes. Ce sont simplement
//   des briques qu'il faut assembler. Certaines recettes sont complètes seules,
//   d'autres non. »
//
// Il a raison. Une sauce sans pâtes et un rôti sans riz manquent de la même
// chose — un féculent — et ni l'un ni l'autre ne le dit. La différence que je
// voyais était de degré, pas de nature.
//
// CE QUI REND ÇA GRATUIT : LA DONNÉE EST DÉJÀ LÀ. `apports` porte `proteine`,
// `feculent` et `legumes` sur chaque recette, avec `aucune` / `aucun` / `[]`
// quand la recette n'en apporte pas. La complétude se DÉRIVE donc, et n'a pas à
// être saisie sur 86 recettes — ce qui aurait été 86 occasions de se tromper.
//
// Mesuré sur le corpus : 44 des 65 plats jouables au déjeuner ou au dîner sont
// complets, 21 sont des briques.
//
// CE QUE CE MODULE NE FAIT PAS ENCORE : assembler. Il sait dire « il manque un
// féculent », il ne sait pas proposer le riz qui irait avec — le corpus n'a pas
// de brique d'accompagnement, et un créneau ne porte qu'UN plat en base. C'est
// le ticket suivant, et c'est le vrai objectif : composer un repas complet.

import type { Apports, Plat } from "./types";

/** Les trois piliers d'une assiette. L'ordre est celui dans lequel on les dit —
 *  « il manque un féculent » se lit mieux que « il manque des légumes et une
 *  protéine et un féculent ». */
export type Pilier = "proteine" | "feculent" | "legumes";

const LIBELLE: Record<Pilier, string> = {
  proteine: "une protéine",
  feculent: "un féculent",
  legumes: "des légumes",
};

/** `aucune`, `aucun`, `[]` : trois façons pour le catalogue de dire « rien ».
 *  Les traiter séparément partout ferait trois fois la même faute. */
const vide = (v: string | undefined): boolean => !v || v === "aucun" || v === "aucune";

/**
 * Ce qui manque à ce plat pour faire un repas.
 *
 * Vide = il se suffit. Un `emits` n'entre pas en compte : une sauce bolognaise
 * qui produit une base reste une sauce dans l'assiette du soir.
 */
export function manqueAuRepas(a: Apports): Pilier[] {
  const m: Pilier[] = [];
  if (vide(a.proteine)) m.push("proteine");
  if (vide(a.feculent)) m.push("feculent");
  if (!(a.legumes ?? []).length) m.push("legumes");
  return m;
}

export const estUnRepas = (a: Apports): boolean => manqueAuRepas(a).length === 0;

/** « il manque un féculent », « il manque une protéine et un féculent ». */
export function ditLeManque(m: Pilier[]): string {
  if (!m.length) return "";
  const noms = m.map((p) => LIBELLE[p]);
  const fin = noms.length > 1 ? `${noms.slice(0, -1).join(", ")} et ${noms.at(-1)}` : noms[0];
  return `il manque ${fin}`;
}

export interface Incomplet {
  manque: Pilier[];
  /** Ce que ça coûte au score. Zéro quand le plat se suffit. */
  score: number;
  /** La phrase à afficher, vide quand il n'y a rien à dire. */
  dit: string;
}

/**
 * Le prix d'une brique posée seule sur un repas principal.
 *
 * UN PRIX, PAS UN INTERDIT — même règle 7 Wonders que le chaînage et le
 * hors-saison. On a le droit de dîner d'une soupe ; l'app doit seulement cesser
 * de faire comme si c'était un repas complet.
 *
 * LE COÛT CROÎT AVEC CE QUI MANQUE, et c'est ce qui remet les choses dans
 * l'ordre : un rôti sans féculent est presque un dîner, une pâte à pizza nue ne
 * l'est pas du tout. Les compter pareil rendrait le terme aveugle à la
 * différence que l'utilisateur a signalée en premier.
 */
export function incomplet(plat: Plat, poids: Record<string, number>): Incomplet {
  const manque = manqueAuRepas(plat.apports);
  return {
    manque,
    // Le `manque.length ?` n'est pas décoratif : `0 * -3` vaut `-0` en
    // JavaScript, et un `-0` se propagerait dans le score d'un plat qui ne doit
    // rien. Il compare égal à zéro partout sauf là où on le lit.
    score: manque.length ? manque.length * (poids["repas_incomplet"] ?? 0) : 0,
    dit: ditLeManque(manque),
  };
}
