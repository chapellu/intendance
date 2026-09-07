// Le fil — la passe de planification. T49, tranché par Workspace#45.
//
// C'EST UN RAIL, PAS UN SOLVEUR. Workspace#41 range explicitement hors périmètre
// le « plan-la-semaine-en-un-coup » : le fil rejoue `main()` créneau par
// créneau, dans l'ordre chronologique, et c'est tout. Ce qui le rend utile n'est
// pas de l'intelligence en plus, c'est de ne plus obliger un doigt à retrouver
// lui-même le prochain créneau à poser.
//
// L'HORIZON EST UN NOMBRE CHOISI AVANT DE COMMENCER, en crans et non en champ
// libre : « combien de repas » se répond du pouce, un champ libre demande un
// clavier et une décision de trop. Les crans sont posés à vue — #45 le dit —
// et seul l'usage les réglera.
//
// CE QUI A ÉTÉ ÉCARTÉ COMPTE AUTANT. La variante B distribuait sans horizon
// jusqu'à « j'arrête » ; la C faisait de l'horizon une sélection sur la grille
// des vingt-et-un créneaux. Les deux montraient la main PENDANT qu'elles
// posaient une question — un bandeau, un tiroir — et c'est ce qui les a
// perdues : répondre change la main qui suit, donc les cartes affichées à ce
// moment-là sont des cartes qu'on sait fausses.
//
// D'OÙ LE THÉORÈME DE CE FICHIER : une question est un PAS, au même titre qu'un
// créneau. Une seule file, jamais deux.

import { jourISO } from "../db/schema";
import type { Jeu } from "./jeu";
import type { CleCreneau } from "../nav/routes";

/**
 * Les crans de l'horizon.
 *
 * POSÉS À VUE, comme le `4` de `congelateur.plancher` avant eux, et #45 le note
 * en toutes lettres : « seul l'usage les réglera ». 14 est le plafond parce que
 * `creneaux.yaml` en porte vingt-et-un et que personne n'a jamais planifié
 * trois semaines d'avance ; 1 existe parce que « juste ce soir » est le cas le
 * plus fréquent d'une app qu'on ouvre à 18 h.
 */
export const CRANS = [1, 3, 5, 7, 14] as const;

/**
 * Une passe en cours.
 *
 * POURQUOI L'ITINÉRAIRE SE PERSISTE alors que le modèle dit « recalculé, jamais
 * stocké ». Parce qu'il n'est pas dérivable après coup : « les N premiers
 * créneaux indécis » change de sens à chaque plat posé, donc le recalculer
 * ferait glisser le rail sous le doigt — poser le premier ferait du deuxième le
 * premier, et les points de progression se renuméroteraient à chaque pas. Ce
 * qu'on garde est donc bien une DÉCISION et non un calcul : la liste que
 * choisir l'horizon a arrêtée, à l'instant où on l'a choisi.
 */
export interface Fil {
  horizon: number;
  creneaux: CleCreneau[];
}

/** La clé du fil en cours. Une seule à la fois : deux passes concurrentes
 *  seraient deux rails sur la même semaine, et rien ne dirait laquelle gagne. */
export const CLE_FIL = "fil";

/**
 * L'itinéraire : les N premiers créneaux `choisi` encore indécis.
 *
 * `choisi` SEUL, et pas `sePioche`. Un créneau `optionnel` — le dessert —
 * existe sans être un manque quand il est vide : l'y faire atterrir d'office
 * ferait poser un dessert tous les soirs, ce que `creneaux.yaml` a inventé
 * `optionnel` pour éviter. C'est le même arbitrage que `prochainVide`, et il
 * doit rester le même.
 *
 * Un repas sauté compte comme décidé : « on ne mange pas là » est une réponse.
 */
export function itineraire(jeu: Jeu, horizon: number): CleCreneau[] {
  const out: CleCreneau[] = [];
  for (const [i, c] of jeu.creneaux.entries()) {
    if (out.length >= horizon) break;
    if (c.nature !== "choisi" || jeu.choix[i] != null) continue;
    const j = jeu.jours[c.jour];
    if (j) out.push({ jour: jourISO(j.date), repas: c.repas });
  }
  return out;
}

export const cleDuPas = (c: CleCreneau): string => `${c.jour}|${c.repas}`;

/**
 * Le pas suivant, en sautant ce qui est déjà réglé.
 *
 * `passes` PORTE CE QU'ON A ÉCARTÉ SANS RIEN DÉCIDER — le bouton « je ne
 * planifie pas celui-là ». Il n'écrit rien, donc il ne survit pas au
 * rechargement, et c'est exact : rien n'a été décidé, il n'y a rien à
 * retrouver. C'est de la navigation, pas un troisième état du modèle (T51).
 */
export function pasSuivant(
  fil: Fil,
  decides: ReadonlySet<string>,
  passes: ReadonlySet<string>,
  depuis: CleCreneau | null,
): CleCreneau | null {
  const debut = depuis ? fil.creneaux.findIndex((c) => cleDuPas(c) === cleDuPas(depuis)) + 1 : 0;
  for (let n = Math.max(0, debut); n < fil.creneaux.length; n += 1) {
    const c = fil.creneaux[n]!;
    const cle = cleDuPas(c);
    if (!decides.has(cle) && !passes.has(cle)) return c;
  }
  return null;
}

/** Le premier pas encore à faire, où qu'on en soit. Sert à reprendre une passe
 *  rouverte : on ne redemande pas l'horizon d'un fil déjà commencé. */
export const premierPas = (
  fil: Fil,
  decides: ReadonlySet<string>,
  passes: ReadonlySet<string>,
): CleCreneau | null => pasSuivant(fil, decides, passes, null);

/** Les créneaux du fil qu'un doigt a réglés — posés ou sautés. C'est la seule
 *  mesure d'avancement : le fil ne tient aucun compteur à lui. */
export function decidesDuFil(jeu: Jeu, fil: Fil): Set<string> {
  const out = new Set<string>();
  for (const [i, c] of jeu.creneaux.entries()) {
    if (jeu.choix[i] == null) continue;
    const j = jeu.jours[c.jour];
    if (!j) continue;
    const cle = cleDuPas({ jour: jourISO(j.date), repas: c.repas });
    if (fil.creneaux.some((x) => cleDuPas(x) === cle)) out.add(cle);
  }
  return out;
}
