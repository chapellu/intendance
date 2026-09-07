// Ce que le fil montre — T49 et T50.
//
// LES POINTS DE PROGRESSION SONT DES BOUTONS, PAS UNE JAUGE. #45 est explicite :
// « on retourne à *jeudi déjeuner*, on ne recule pas d'un ». D'où l'absence de
// bouton « précédent » — reculer d'un pas suppose que les pas se ressemblent,
// alors qu'ils portent chacun un repas nommé. Une destination se choisit, elle
// ne se décompte pas.
//
// ET UNE QUESTION EST UN PAS — T50. Elle prend l'écran, porte son propre point,
// et la main attend derrière elle. Ce n'est pas une décoration de l'attente :
// c'est ce qui distingue le fil des variantes B et C, qui affichaient les
// cartes pendant qu'elles demandaient et montraient donc une main qu'elles
// savaient fausse.
//
// POURQUOI LES QUESTIONS N'APPARAISSENT QU'AU PAS COURANT. Une question naît de
// la proposition, et la proposition d'un créneau dépend de ce qui a été posé
// avant lui. Les questions des pas suivants ne sont donc pas connues — et les
// deviner reviendrait à afficher une file qu'on sait fausse, ce qui est
// exactement l'erreur qu'on vient d'éviter sur les cartes.

import type { Question } from "../model/questions";
import type { CleCreneau } from "../nav/routes";

export type EtatPoint = "fait" | "courant" | "a-venir";

export interface PointFil {
  cle: string;
  /** Ce qu'on lit dessus. Court : ils tiennent sur une ligne de 390 px. */
  label: string;
  etat: EtatPoint;
  /** Où il mène. `null` pour une question : elle est là où on est, et un point
   *  de question sur lequel on peut cliquer promettrait d'y revenir alors
   *  qu'elle aura disparu dès qu'on aura répondu. */
  creneau: CleCreneau | null;
  question: boolean;
}

/** « jeudi » → « jeu. » — les points tiennent sur une ligne, pas sur deux. */
const abrege = (jour: string): string => (jour.length > 4 ? `${jour.slice(0, 3)}.` : jour);

export interface EntreePoints {
  /** L'itinéraire, dans l'ordre chronologique. */
  creneaux: CleCreneau[];
  /** Comment nommer un créneau — le modèle sait les dates, pas les mots. */
  nommer: (c: CleCreneau) => { jour: string; repas: string };
  decides: ReadonlySet<string>;
  courant: CleCreneau | null;
  /** Les questions du pas courant, dans l'ordre où elles se posent. */
  questions: readonly Question[];
}

/**
 * La file des pas, questions comprises.
 *
 * Les questions du pas courant s'insèrent AVANT lui : elles le précèdent
 * vraiment, puisque la main ne s'affiche qu'une fois qu'elles sont épuisées.
 */
export function pointsDuFil({
  creneaux,
  nommer,
  decides,
  courant,
  questions,
}: EntreePoints): PointFil[] {
  const cle = (c: CleCreneau) => `${c.jour}|${c.repas}`;
  const points: PointFil[] = [];
  const surUneQuestion = questions.length > 0;

  for (const c of creneaux) {
    const k = cle(c);
    const ici = courant != null && cle(courant) === k;

    if (ici)
      for (const q of questions)
        points.push({
          cle: `q|${k}|${q.ingredient}`,
          label: q.nom,
          // La première question EST le pas courant ; les suivantes attendent.
          etat: q === questions[0] ? "courant" : "a-venir",
          creneau: null,
          question: true,
        });

    const n = nommer(c);
    points.push({
      cle: k,
      label: `${abrege(n.jour)} ${n.repas}`,
      // Un créneau réglé est fait, même si on y est revenu. UN CRÉNEAU « PASSÉ »
      // NE SE MARQUE PAS : rien n'y a été décidé, et lui donner un état à
      // l'écran inventerait la donnée que T51 refuse d'écrire en base.
      etat: decides.has(k) ? "fait" : ici && !surUneQuestion ? "courant" : "a-venir",
      creneau: c,
      question: false,
    });
  }

  return points;
}

/** Où en est la passe, en clair. Le fil ne tient pas de compteur : il compte
 *  ce qui est réglé, ce qui est la seule mesure qui ne mente pas. */
export function avancement(total: number, faits: number): string {
  if (total === 0) return "rien à poser";
  if (faits >= total) return total === 1 ? "le repas est posé" : `les ${total} repas sont posés`;
  return `${faits} sur ${total}`;
}

/** La phrase du choix d'horizon. « repas » et non « jours » : le fil pose des
 *  créneaux, et trois repas ne font pas trois jours. */
export const libelleCran = (n: number): string => (n === 1 ? "1 repas" : `${n} repas`);

/**
 * Ce que l'ouverture propose quand la semaine est déjà pleine.
 *
 * Un cran plus grand que ce qui reste n'est pas une erreur : `itineraire` rend
 * ce qu'il trouve, et demander 14 sur une semaine où il reste 2 créneaux donne
 * une passe de 2. On le DIT plutôt que de griser des boutons — un bouton grisé
 * n'explique jamais pourquoi.
 */
export function resteAPoser(n: number, horizon: number): string | null {
  if (n === 0) return "Tout est posé ou sauté sur les sept jours.";
  return n < horizon ? `Il ne reste que ${libelleCran(n)} à poser d’ici dimanche.` : null;
}
