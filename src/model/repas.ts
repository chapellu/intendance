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
// CE QUI A CHANGÉ EN T28 : ON ASSEMBLE. Ce module ne jugeait qu'un plat isolé,
// faute de pouvoir en juger deux — un créneau n'en portait qu'un. Il juge
// maintenant l'ASSIETTE : un rôti manque d'un féculent, le même rôti avec du riz
// n'en manque plus, et aucune de ces deux phrases ne se lit sur un plat seul.
//
// LE PILIER EST COUVERT DÈS QU'UN SEUL PLAT L'APPORTE, jamais par addition. Deux
// féculents ne font pas deux fois un féculent — mettre du pain à côté des pâtes
// ne rend pas le repas plus complet, seulement plus lourd.

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

/**
 * Ce qui manque à une ASSIETTE — le plat principal et ce qu'on a mis à côté.
 *
 * Un pilier ne manque que si AUCUN plat de l'assiette ne l'apporte. C'est la
 * seule règle de composition, et elle est volontairement grossière : elle sait
 * dire qu'un rôti avec du riz tient debout, elle ne sait pas dire si les
 * quantités vont ensemble. Une assiette vide ne manque de rien — un créneau
 * qu'on n'a pas rempli n'est pas un repas raté, c'est une décision à prendre.
 */
export function manqueALAssiette(plats: readonly Plat[]): Pilier[] {
  if (!plats.length) return [];
  const restants = new Set<Pilier>(manqueAuRepas(plats[0]!.apports));
  for (const p of plats.slice(1)) for (const c of comble(p.apports)) restants.delete(c);
  return (["proteine", "feculent", "legumes"] as const).filter((p) => restants.has(p));
}

/** Les piliers qu'un plat APPORTE — l'exact complément de `manqueAuRepas`, dit
 *  dans l'autre sens parce que c'est celui-là qu'on lit sur une brique : le riz
 *  « comble un féculent ». */
export const comble = (a: Apports): Pilier[] => {
  const tous: Pilier[] = ["proteine", "feculent", "legumes"];
  const manque = new Set(manqueAuRepas(a));
  return tous.filter((p) => !manque.has(p));
};

const enumere = (m: Pilier[]): string => {
  const noms = m.map((p) => LIBELLE[p]);
  return noms.length > 1 ? `${noms.slice(0, -1).join(", ")} et ${noms.at(-1)}` : (noms[0] ?? "");
};

/** « il manque un féculent », « il manque une protéine et un féculent ». */
export const ditLeManque = (m: Pilier[]): string =>
  m.length ? `il manque ${enumere(m)}` : "";

/** Ce qu'une brique APPORTE à l'assiette où on la pose : « apporte un
 *  féculent ». La phrase symétrique de la précédente, parce que c'est celle-là
 *  qu'on lit sur un accompagnement qu'on hésite à ajouter. */
export const ditLApport = (m: Pilier[]): string =>
  m.length ? `apporte ${enumere(m)}` : "";

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
export function incomplet(
  assiette: readonly Plat[],
  poids: Record<string, number>,
): Incomplet {
  const manque = manqueALAssiette(assiette);
  return {
    manque,
    // Le `manque.length ?` n'est pas décoratif : `0 * -3` vaut `-0` en
    // JavaScript, et un `-0` se propagerait dans le score d'un plat qui ne doit
    // rien. Il compare égal à zéro partout sauf là où on le lit.
    score: manque.length ? manque.length * (poids["repas_incomplet"] ?? 0) : 0,
    dit: ditLeManque(manque),
  };
}
