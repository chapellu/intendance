// La saisonnalité, et la seule décision qu'elle prend.
//
//     ON PÉNALISE LE HORS-SAISON AVÉRÉ, ON NE RÉCOMPENSE JAMAIS L'EN-SAISON.
//
// Ce n'est pas de la prudence, c'est une conséquence de la donnée. Le calendrier
// du CIVAM / DRAAF Auvergne-Rhône-Alpes est un calendrier de POTAGER : il couvre
// 27 ingrédients sur les 57 du rayon primeur que les recettes utilisent, ne
// porte AUCUN fruit, et ignore la courgette.
//
// Récompenser l'en-saison ferait donc gagner la tomate d'août contre la
// courgette d'août — non parce que l'une est plus de saison que l'autre, mais
// parce qu'on connaît l'une et pas l'autre. Le classement refléterait les trous
// de sa source, ce qui est la manière la plus discrète de mentir.
//
// La pénalité n'a pas ce défaut : elle ne se déclenche que là où on SAIT, et ce
// qu'on sait alors est vrai. Une tomate en janvier n'est pas de saison, quel que
// soit ce qu'on ignore par ailleurs. Un ingrédient absent du fichier n'est
// jamais pénalisé — neutre, ce qui est exactement ce qu'on sait de lui.
//
// Et c'est la moitié utile. Personne n'a besoin qu'on lui vante la tomate en
// août ; ce qu'une app peut apporter, c'est de ne pas la proposer en février.

import type { Catalogue, Plat } from "./types";

/** `true` de saison, `false` hors saison, `null` quand on ne sait pas.
 *
 *  LES TROIS ÉTATS SONT NÉCESSAIRES, et c'est `null` qui porte le poids.
 *  Réduire à un booléen ferait de « je ne sais pas » un « ce n'est pas de
 *  saison », donc une pénalité sur trente ingrédients dont la courgette et
 *  toutes les fraises. */
export function deSaison(catalogue: Catalogue, id: string, mois: number): boolean | null {
  const cid = catalogue.rayons.aliases[id] ?? id;
  const m = catalogue.saisons.recoltes[cid];
  return m ? m.includes(mois) : null;
}

/** Survit-il à sa récolte ? Alors le score ne lui reproche rien.
 *
 *  RÉCOLTE N'EST PAS DISPONIBILITÉ, et c'est la faute que ce module a failli
 *  commettre. L'oignon se récolte de mai à août et se mange toute l'année ; le
 *  punir en février punissait 56 plats sur 64, dont les lentilles paysannes et
 *  le curry de pois chiches. Une app qui déconseille l'oignon en hiver n'est pas
 *  rigoureuse, elle est inutilisable.
 *
 *  Ne se paie donc que ce qui disparaît vraiment — tomate, courgette, salade,
 *  concombre, aubergine, poivron : ceux dont un achat en février veut dire
 *  serre chauffée ou avion. */
const seGarde = (catalogue: Catalogue, cid: string): boolean =>
  catalogue.saisons.seGarde.includes(cid);

export interface HorsSaison {
  /** Les ingrédients dont on SAIT qu'ils ne sont pas de saison, lisibles. */
  noms: string[];
  /** Ce que ça coûte au score. Zéro quand rien n'est avéré hors saison. */
  score: number;
}

/**
 * Ce qu'un plat demande à contretemps.
 *
 * UN SEUL COÛT PAR PLAT, comme pour le garde-manger et pour la même raison :
 * un plat n'est pas deux fois plus hors-saison parce qu'il cite deux légumes
 * d'été en janvier. Cumuler donnerait un avantage aux recettes courtes, ce que
 * rien ne justifie.
 *
 * Les lignes de base sont ignorées — elles réclament une chose cuisinée, pas un
 * produit du marché.
 */
export function horsSaison(
  catalogue: Catalogue,
  plat: Plat,
  mois: number,
  poids: Record<string, number>,
): HorsSaison {
  const vus = new Set<string>();
  for (const ing of plat.ingredients) {
    if (ing.base) continue;
    const cid = catalogue.rayons.aliases[ing.id] ?? ing.id;
    if (seGarde(catalogue, cid)) continue;
    if (deSaison(catalogue, cid, mois) === false) vus.add(cid);
  }
  return {
    noms: [...vus].map((c) => c.replace(/-/g, " ")),
    score: vus.size ? (poids["hors_saison"] ?? 0) : 0,
  };
}

/** Ce qui est de saison ce mois-ci, pour l'écran. Trié, lisible, et distinct de
 *  ce dont on ne sait rien : la liste ne prétend jamais être exhaustive. */
export function deSaisonCeMois(catalogue: Catalogue, mois: number): string[] {
  return Object.entries(catalogue.saisons.recoltes)
    .filter(([, m]) => m.includes(mois))
    .map(([id]) => id.replace(/-/g, " "))
    .sort((a, b) => a.localeCompare(b, "fr"));
}
