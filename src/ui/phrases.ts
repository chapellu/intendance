// Les phrases que plusieurs écrans disent du même objet.
//
// Un manque écrit « manque 400 g de sauce » ici et « il manque 400g sauce »
// ailleurs fait douter des deux : le lecteur se demande si ce sont deux
// choses. Une phrase partagée n'est pas de la factorisation, c'est la
// condition pour qu'on lui fasse confiance.

import type { Manque } from "../model/calcul";
import type { Espace } from "../model/types";
import { JOURS_VISIBLES } from "../nav/jours";
import { fmt } from "./format";

/**
 * Ce qui manque à un créneau, en toutes lettres et sans unité fantôme : une
 * grandeur non chiffrée (« 2 œufs ») n'a pas d'unité, et le trou qu'elle
 * laissait dans la phrase se voyait.
 */
export const phraseManque = (m: Manque): string =>
  ["manque", fmt(m.manque), m.unite, "de", m.acc.type ?? m.acc.kind]
    .filter((x): x is string => !!x)
    .join(" ");

/**
 * Le nom d'un espace de rangement.
 *
 * Le catalogue n'en porte pas — `frigo`, `congelo`, `placard` sont des
 * identifiants, et le proto les traduisait dans deux fichiers à la fois. Trois
 * mots, un seul endroit : « Congélo » écrit ici et « congélateur » ailleurs
 * ferait chercher deux appareils.
 */
export const nomEspace = (e: Espace): string =>
  e === "congelo" ? "Congélo" : e === "placard" ? "Placard" : "Frigo";

/**
 * Le bouton primaire d'une carte jouable.
 *
 * ICI ET PAS DANS `Cartes.tsx`, PARCE QUE LES PARCOURS E2E LE DÉSIGNENT PAR SON
 * NOM. Un libellé écrit dans le composant et recopié dans quatre `.spec.ts` est
 * un libellé qu'on ne peut plus changer : le jour où il change, ce sont les
 * parcours qui rougissent, et on croit à une régression de l'app.
 *
 * SANS LES JOURS, IL NE PEUT PLUS DIRE « CE CRÉNEAU » — il n'y en a plus à
 * l'écran, et nommer une case qu'on ne montre nulle part est la meilleure façon
 * de faire chercher où elle est. Le geste n'a pas changé pour autant : le plat
 * se pose toujours sur le pas courant du fil, en silence. Voir `nav/jours.ts`.
 *
 * « QUAND MÊME » EST LE MOT QUI TIENT LA PROMESSE de T80 : la recherche montre
 * un plat écarté pour qu'on puisse le poser, pas pour qu'on constate qu'on ne
 * peut pas. Le bouton change de nom, jamais d'état.
 */
export const libellePoser = (ecarte: boolean): string =>
  JOURS_VISIBLES
    ? ecarte
      ? "Poser quand même"
      : "Poser sur ce créneau"
    : ecarte
      ? "Je fais ça quand même"
      : "Je fais ça";
