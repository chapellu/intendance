// Le plancher du garde-manger — T39, T40, T41 et T46, tranchés par Workspace#43.
//
// C'EST LE MÊME MOT QUE `plancher.ts`, ET CE N'EST PAS LE MÊME OBJET. Là-bas un
// plancher compte des PORTIONS au congélateur et se recharge en CUISINANT ; ici
// il compte des UNITÉS D'ACHAT dans un placard et se recharge en ACHETANT. Deux
// fichiers plutôt qu'un paramètre, parce que tout diffère : la clé, l'unité, le
// canal, et le fait que celui-ci ne touche pas au score.
//
// ────────────────────────────────────────────────────────────────────────────
// LE PLANCHER PORTE SUR L'INGRÉDIENT, JAMAIS SUR LE LOT (T39).
//
// C'est déjà la discipline de T32 — « une correction porte sur un INGRÉDIENT,
// jamais sur un lot : c'est ce qu'un œil voit en ouvrant un placard, on compte
// des boîtes de maïs, pas le lot n°17 ». Un plancher par lot voudrait dire
// « toujours une boîte de 285 g ET une de 465 g », ce que personne ne pense en
// ouvrant un placard, et ce que le premier réassort rendrait faux.
//
// L'unité est donc celle du relevé : `EtatIngredient.unites`, c'est-à-dire les
// unités scellées plus l'entamé s'il y en a un. « Trois boîtes de maïs » est une
// phrase qu'un œil vérifie ; « 855 g de maïs » n'en est pas une.
//
// ────────────────────────────────────────────────────────────────────────────
// AUCUN ARBITRAGE CUISINER/ACHETER : L'OBJET DICTE LE CANAL (T41).
//
// Ce plancher-ci ne rapporte RIEN au score, et c'est le ticket entier. Un type
// du dépôt ne se recharge que par la cuisine, donc son plancher pousse un plat ;
// une denrée du garde-manger ne se recharge que par l'achat, donc son plancher
// pousse une ligne de courses. La bolognaise n'a l'air ambiguë que parce que les
// deux existent, et le catalogue les distingue DÉJÀ : `sauce-bolognaise` (base
// cuisinée, congélo) et `sauce-bolognaise-bocal` (bocal acheté, 300 g,
// garde-manger) sont deux ids.
//
// D'où l'absence, ici, de tout ce qui ressemble à un poids ou à un bonus. Ce
// fichier ne rend que des lignes de courses. **Ce qui est sous son plancher EST
// la liste Carrefour.**
//
// ────────────────────────────────────────────────────────────────────────────
// UN PLANCHER N'EXISTE QUE SUR CE QUE L'APP SAIT COMPTER (T46).
//
// La barrière est la CLASSE de T30, pas une liste d'ids : elle se dérive du
// rayon et des lots, elle suit donc le corpus au lieu de vieillir à côté de lui.
// Sur primeur, T30 dit que les fruits & légumes ne s'estiment pas DU TOUT
// (tolérance 0) ; sur frais court, qu'on ne parie jamais sans avoir vu ; sur les
// ids sans rayon, qu'il n'y a aucune prétention à avoir. « Toujours 3 oignons »
// serait donc une cible que l'app est structurellement incapable d'évaluer — et
// le premier endroit où elle réclamerait des courses à tort.
//
// POSITION DE DÉPART, PAS FRONTIÈRE ACQUISE : « ok pour le moment on verra à
// l'usage ». Elle se rouvrira côté frais le jour où Workspace#50 aura donné une
// horloge au frigo, exactement comme la restriction jumelle de `plancher.ts`.
//
// ────────────────────────────────────────────────────────────────────────────
// CE QUE LA MESURE A DIT, ET QUI CORRIGE LES TICKETS.
//
//  — T46 annonçait la barrière comme mordant « sur primeur, frais court et les
//    23 ids sans rayon ». Sur le vrai relevé elle ne mord QUE sur le primeur :
//    45 ingrédients distincts au garde-manger, dont 40 `epicerie`, 1
//    `fond-de-placard` (`farine`) et 4 `fruits-legumes` — ail, échalote, oignon,
//    pomme de terre. Zéro `frais-court`, zéro `non-suivi` : les 23 ids sans
//    rayon sont des ids de RECETTES, et aucun d'eux n'est dans un placard. La
//    barrière attrape donc précisément, et seulement, les quatre denrées que la
//    prose de T46 nommait — l'oignon en tête.
//  — 28 des 45 ingrédients du garde-manger ne sont cités par AUCUNE des 86
//    recettes. Plus de la moitié du placard est invisible au scoring, et le
//    restera : c'est ce trou-là que le canal d'achat referme, et l'apéro n'en
//    est que le cas nommé.

import type { Classe, EtatIngredient, Rejeu } from "./journal";
import type { Catalogue, Usage } from "./types";

/* ════════════════════════════════════════════ ce que l'app sait compter (T46) */

/**
 * Les trois classes où un plancher veut dire quelque chose.
 *
 * DÉFINI PAR LA LISTE DES OUI, PAS PAR CELLE DES NON. Une classe qui s'ajouterait
 * demain — le frigo daté de Workspace#50 — serait interdite par défaut, ce qui
 * est le bon sens de sécurité : on n'autorise pas une cible sur une grandeur
 * dont personne n'a encore dit qu'elle se compte.
 */
export const COMPTABLES: ReadonlySet<Classe> = new Set<Classe>([
  "fond-de-placard",
  "epicerie",
  "congelateur",
]);

export const comptable = (classe: Classe): boolean => COMPTABLES.has(classe);

/**
 * Pourquoi cette classe ne peut pas porter de plancher, en français.
 *
 * DIT, JAMAIS MASQUÉ. Une denrée qui n'offre pas le geste sans expliquer
 * pourquoi laisse croire à une panne ; et la raison est la partie intéressante,
 * puisqu'elle vient d'une décision (T30) et non d'une limite technique.
 */
export function pourquoiPasDePlancher(classe: Classe): string {
  switch (classe) {
    case "fruits-legumes":
      return "les fruits et légumes ne s’estiment pas : il faut les voir";
    case "frais-court":
      return "le frais ne se parie jamais sans l’avoir vu";
    case "non-suivi":
      return "aucun rayon ne le suit, l’app n’en sait rien";
    default:
      return "";
  }
}

/* ═══════════════════════════════════════════════════════════════ le plancher */

export interface PlancherDenree {
  /** UN INGRÉDIENT, ALIAS RÉSOLU — c'est tout T39. */
  ingredient: string;
  /** En unités d'achat : ce qu'un œil compte en ouvrant le placard. */
  niveau: number;
}

/** Une denrée dite en français. Le vocabulaire des rayons est en ids tiretés, et
 *  le catalogue ne porte pas de libellé lisible — même trou que pour les types
 *  émis, noté au backlog depuis T15. */
export const nomDeLaDenree = (id: string): string => id.replace(/-/g, " ");

/**
 * L'unité d'une ligne de courses née d'un plancher.
 *
 * ICI ET PAS DANS UN ÉCRAN, PARCE QUE DEUX COUCHES LA LISENT. La vue des courses
 * s'en sert pour fabriquer la clé `id|unité` ; `db/courses.ts` s'en sert pour
 * savoir qu'une telle ligne compte des unités d'achat et non des grammes. Deux
 * constantes finiraient par ne plus dire la même chose — c'est l'argument que
 * `garde_manger.py` fait déjà à propos des alertes de rangement.
 *
 * MESURÉ : aucune des 744 lignes d'ingrédients du corpus n'emploie ce mot (30
 * unités distinctes : `g`, `pièce`, `c. à s.`, `pincée`…). La clé de course ne
 * peut donc pas entrer en collision avec une demande de la semaine, ce qui
 * compte puisque c'est elle qui porte l'état coché/rentré.
 */
export const UNITE_PLANCHER = "unité";

/**
 * À quoi sert chaque denrée du relevé, quand ce n'est pas à cuisiner — T40.
 *
 * LU AU CATALOGUE, PAS AUX LOTS. « Ces graines de courge sont pour l'apéro » est
 * une phrase sur la denrée, pas sur le bocal du moment : elle doit rester vraie
 * le jour où le bocal est vide, sinon le plancher perdrait sa raison d'être
 * exactement quand il devient utile.
 */
export function usages(catalogue: Catalogue): Map<string, Usage> {
  const aliases = catalogue.rayons.aliases;
  const par = new Map<string, Usage>();
  for (const d of catalogue.gardeManger.denrees)
    if (d.usage) par.set(aliases[d.ingredient] ?? d.ingredient, d.usage);
  return par;
}

/* ═════════════════════════════════════════════ sur quoi un plancher se pose */

export interface Posable {
  ingredient: string;
  nom: string;
  classe: Classe;
  /** L'app sait-elle compter ça ? (T46) */
  comptable: boolean;
  /** Pourquoi pas, quand ce n'est pas comptable. Vide sinon. */
  raison: string;
  /** Ce qu'il y en a en ce moment, en unités d'achat. */
  a: number;
  usage: Usage | null;
}

/**
 * Tout ce dont le placard a des nouvelles, avec le droit d'y poser un plancher.
 *
 * LES DEUX CARTES DU REJEU, PARCE QUE CE SONT DEUX CONNAISSANCES. `parIngredient`
 * dit ce qui EST LÀ ; `vus` dit ce dont on a des nouvelles sans qu'il en reste —
 * « j'ai regardé, il n'y a plus de maïs ». Or c'est précisément sur celui-là
 * qu'un plancher a le plus de sens : il est à zéro, il est sous son seuil, il
 * doit entrer dans la liste. N'offrir le geste que sur ce qui reste en stock le
 * rendrait indisponible au moment exact où il sert.
 *
 * LES NON-COMPTABLES SONT RENDUS AUSSI, avec leur raison. C'est ce qui permet à
 * l'écran de dire « pas sur l'oignon, et voilà pourquoi » plutôt que de laisser
 * un trou dans une liste.
 */
export function posables(catalogue: Catalogue, rejeu: Rejeu): Posable[] {
  const par = usages(catalogue);
  const vu = (e: EtatIngredient): Posable => ({
    ingredient: e.ingredient,
    nom: nomDeLaDenree(e.ingredient),
    classe: e.classe,
    comptable: comptable(e.classe),
    raison: pourquoiPasDePlancher(e.classe),
    a: e.unites,
    usage: par.get(e.ingredient) ?? null,
  });

  const out = new Map<string, Posable>();
  for (const e of rejeu.parIngredient.values()) out.set(e.ingredient, vu(e));
  for (const e of rejeu.vus.values()) if (!out.has(e.ingredient)) out.set(e.ingredient, vu(e));
  return [...out.values()].sort((a, b) => a.nom.localeCompare(b.nom, "fr"));
}

/* ═══════════════════════════════════════════════ ce qui part au magasin (T41) */

export interface LignePlancher {
  ingredient: string;
  nom: string;
  niveau: number;
  /** Ce qu'il y en a, en unités d'achat. */
  a: number;
  /** Combien il en manque pour tenir le plancher. Toujours ≥ 1. */
  manque: number;
  /**
   * Peut-on croire le chiffre ?
   *
   * PORTÉE JUSQU'À LA LISTE, ET C'EST LE POINT. T46 garantit que l'app SAIT
   * compter cette classe-là ; il ne garantit pas qu'elle a regardé récemment.
   * « Il en manque 2 » et « il en manque 2, à vérifier » n'appellent pas le même
   * geste dans un rayon, et fondre les deux ferait rentrer du maïs en trop.
   */
  confiance: EtatIngredient["confiance"];
  /** Le jour de la dernière observation, `null` si jamais vu. */
  vuLe: string | null;
  /** T40 : dire pourquoi cette ligne existe alors qu'aucun plat ne la demande. */
  usage: Usage | null;
}

/**
 * Ce qui est sous son plancher, et qu'il faut donc acheter.
 *
 * ZÉRO N'EST PAS UNE ABSENCE DE RÉPONSE, C'EST LA RÉPONSE. Un ingrédient qui a
 * un plancher et plus aucun lot manque de tout son plancher — c'est le cas
 * ordinaire d'un placard qui se vide, pas un cas limite. Le lire comme « on ne
 * sait pas » ferait disparaître de la liste exactement ce qu'on n'a plus.
 *
 * AUCUN SCORE N'EST RENDU, ET C'EST DÉLIBÉRÉ (T41). Cette fonction ne connaît ni
 * les plats ni les poids ; il n'y a rien à brancher au scoring, et c'est ce qui
 * rend la promesse « le plancher du garde-manger ne bouge aucune carte »
 * vérifiable en lisant la signature.
 */
export function sousLeurPlancher(
  catalogue: Catalogue,
  rejeu: Rejeu,
  planchers: readonly PlancherDenree[],
): LignePlancher[] {
  const par = usages(catalogue);
  const lignes: LignePlancher[] = [];

  for (const p of planchers) {
    const e = rejeu.parIngredient.get(p.ingredient) ?? rejeu.vus.get(p.ingredient) ?? null;
    const a = e?.unites ?? 0;
    if (a >= p.niveau) continue;
    lignes.push({
      ingredient: p.ingredient,
      nom: nomDeLaDenree(p.ingredient),
      niveau: p.niveau,
      a,
      manque: p.niveau - a,
      // JAMAIS VU DU TOUT = INCONNU, et pas « sûr » par défaut. Un plancher peut
      // survivre à la denrée sur laquelle il a été posé — le relevé d'une zone
      // efface les lots, pas les décisions — et prétendre être sûr d'un placard
      // dont l'app n'a aucune nouvelle est la faute que T30 existe pour éviter.
      confiance: e?.confiance ?? "inconnu",
      vuLe: e?.vuLe ?? null,
      usage: par.get(p.ingredient) ?? null,
    });
  }

  // CE QUI MANQUE LE PLUS EN TÊTE. Une liste de courses se lit en marchant, et
  // le rayon la réordonnera de toute façon ; cet ordre-ci est celui qui survit
  // quand on n'en montre que les trois premières lignes.
  return lignes.sort((a, b) => b.manque - a.manque || a.nom.localeCompare(b.nom, "fr"));
}
