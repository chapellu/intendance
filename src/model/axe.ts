// UN AXE, DEUX MOTS — T57.
//
// Tout stock a une horloge, et toutes les horloges se lisent ici. Le dépôt en
// donne une fraction mesurée (`Vie.fraction` : l'âge sur la fenêtre, plafonnée
// à 1) ; le garde-manger n'a aucune date et donne un rang, qu'on projette. Les
// deux arrivent sur le même 0–1, et c'est tout l'intérêt : sans dénominateur
// commun, « un bocal de quatre mois » et « un paquet de pâtes ouvert » ne se
// comparent que par l'endroit où ils sont rangés, et l'endroit est un proxy
// grossier de l'urgence.
//
// LES SEUILS VIENNENT DE DON'T STARVE, ET ON A JETÉ SA JAUGE. Le jeu marque un
// aliment *Stale* à 50 % de vie restante et *Spoiled* à 20 % — soit 0,5 et 0,8
// de vie CONSOMMÉE. On reprend les seuils et pas la barre : le dénominateur de
// Don't Starve est une constante de jeu, le nôtre est deviné (`gardeFrigo` posé
// à vue, forfait congélateur de 90 j, urgences sans aucune date). Une jauge
// afficherait une précision qu'on n'a pas ; trois points en donnent juste
// assez.
//
// L'ABSENCE DE MARQUE EST L'ÉTAT FRAIS, comme *Fresh* n'a pas de préfixe dans
// le jeu. Un troisième mot pour dire « tout va bien » serait affiché sur la
// quasi-totalité des lots en permanence, et un mot qui est toujours là ne se
// remarque plus le jour où il change — c'est la leçon de « dégager une
// étagère » en T15.
//
// SEUL LE FRANCHISSEMENT COMPTE, et c'est pour ça qu'il n'y a que deux mots.
// Sur les 90 jours du congélateur les seuils tombent à six semaines puis à deux
// mois et demi, ce qui se dit. Sur une carcasse de volaille à 2 jours ils
// tombent à J+1 et J+1,6 : afficher « 60 % » là-dessus donnerait un chiffre
// faux avec deux décimales. On ne dit donc pas où on en est, on dit qu'on vient
// de passer une ligne.

import type { Urgence } from "./types";

/** À partir d'où on le dit. En vie CONSOMMÉE, l'inverse de Don't Starve, parce
 *  que c'est ce que `Vie.fraction` mesure : 0 le jour de la naissance. */
export const SEUIL_A_MANGER = 0.5;
export const SEUIL_URGENT = 0.8;

/** Les deux mots, plus le silence. `""` n'est pas une absence de réponse : c'est
 *  la réponse « rien à signaler », et elle est majoritaire. */
export type Marque = "" | "à manger" | "urgent";

export function marque(fraction: number | null): Marque {
  if (fraction == null) return "";
  if (fraction >= SEUIL_URGENT) return "urgent";
  return fraction >= SEUIL_A_MANGER ? "à manger" : "";
}

/**
 * Le garde-manger sur l'axe du dépôt.
 *
 * CES TROIS VALEURS NE SONT PAS INVENTÉES, ELLES SONT RÉTRO-CALCULÉES. Avec
 * `ecoule: 5`, 1,0 rend exactement l'ancien `ecoule_placard_urgent: 5` et 0,4
 * l'ancien `ecoule_placard_entame: 2`. Le placard vaut donc après ce qu'il
 * valait avant, au point près : ce ticket lui donne une échelle, il ne lui
 * donne pas de poids. Changer ce que le placard pèse est une décision de
 * modèle, elle se prendrait dans `equilibre.yaml` et pas ici.
 *
 * `basse` EST HORS ÉCHELLE, PAS À ZÉRO. Une conserve scellée n'est pas « au
 * début de sa vie », elle n'a pas d'horloge du tout : elle tient trois ans et
 * personne ne la surveille. Zéro l'aurait fait entrer dans les sommes de T59
 * comme un terme nul — vrai par accident, faux dès qu'on aurait voulu compter
 * les articles sauvés. `null` la fait sortir, et le typage oblige chaque
 * lecteur à dire ce qu'il en fait.
 */
const PROJECTION: Record<Urgence, number | null> = {
  haute: 1,
  moyenne: 0.4,
  basse: null,
};

export const fractionDe = (u: Urgence): number | null => PROJECTION[u];
