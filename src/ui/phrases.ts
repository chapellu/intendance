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

/**
 * Le bouton d'une carte du soir — T128.
 *
 * « JE LANCE ÇA », ET PAS « JE FAIS ÇA » : la carte du fil POSE un plat pour
 * plus tard, celle-ci le pose ET ouvre sa mise en place, maintenant. Deux
 * gestes, deux mots — et le parcours e2e de la pause le désigne par celui-ci.
 */
export const LIBELLE_LANCER = "Je lance ça";

/**
 * Depuis quand un lot est là, en jours — « aujourd'hui », « hier », « il y a
 * 3 j » — T104.
 *
 * EN JOURS DU CALENDRIER — voir `joursDepuis` dans `stock.vue.ts`, qui dit
 * pourquoi ce n'est pas l'âge de `Depot.vie`. Un âge négatif — une naissance
 * dans le futur, qu'aucun geste ne produit — se lit « aujourd'hui » plutôt que
 * « dans 2 j ».
 */
export const depuis = (age: number): string =>
  age <= 0 ? "aujourd’hui" : age === 1 ? "hier" : `il y a ${age} j`;

/**
 * Une bande de rangement en mots — « 2 repas », « une gamelle » — T104.
 *
 * LA MÊME UNITÉ QUE LA SORTIE (T99), qui écrit « 2 repas » : un lot rangé sous
 * un nom et relu sous un autre ferait chercher deux boîtes. `lunchbox` est le
 * déjeuner qui voyage — l'app l'appelle « gamelle » partout ailleurs (« prévoir
 * une gamelle pour un midi »). Une bande illisible retombe sur la règle de
 * `bandRepas` : un repas, jamais l'identifiant brut à l'écran.
 */
export const bandeEnMots = (band: string | null | undefined): string => {
  if (band === "lunchbox") return "une gamelle";
  const n = Number.parseInt(String(band ?? ""), 10);
  return `${n > 0 ? n : 1} repas`;
};
