// Ce qu'une question montre — T33.
//
// TROIS ÉTATS, ET LE TROISIÈME EST CELUI QUI GAGNE SA PLACE. « Oui / il en reste
// peu / non » est le vocabulaire de signalement déjà retenu par #34, et « peu »
// n'est pas une politesse entre les deux autres : c'est le seul état qui
// n'interdit pas le dahl tout en interdisant d'y compter dessus deux fois dans
// la même passe.
//
// LA QUANTITÉ EST OPTIONNELLE, ET ELLE DOIT LE RESTER. Une quantité par défaut
// obligerait à peser pour répondre, donc on ne répondrait pas, donc l'app
// cesserait de demander — et une app qui ne demande plus parie sur tout en
// silence, ce qui est exactement l'état dont T33 sort.
//
// LA QUESTION SE MONTRE SEULE, SANS LES CARTES. Répondre change la main qui
// suit ; afficher un bandeau de question au-dessus des cartes reviendrait à
// montrer une main qu'on sait fausse. C'est ce qui a fait perdre les variantes B
// et C du rail (Workspace#45), et ça vaut ici avant que le rail existe.

import type { Question, Reste } from "../model/questions";

export interface ChoixReponse {
  reste: Reste;
  libelle: string;
  /** Ce que la réponse fait, dit en clair — l'app ne cache pas sa mécanique. */
  effet: string;
}

/** Le vocabulaire fermé des réponses. Trois, jamais quatre : un quatrième état
 *  ne se retiendrait pas, et il n'y a rien entre « il y en a » et « il n'y en
 *  a plus » que « il en reste peu » ne dise déjà. */
export const REPONSES: readonly ChoixReponse[] = [
  { reste: "oui", libelle: "Oui", effet: "on compte dessus" },
  { reste: "peu", libelle: "Il en reste peu", effet: "une fois, pas deux" },
  { reste: "non", libelle: "Non", effet: "les plats qui en veulent sortent" },
];

/**
 * Pourquoi cette question arrive maintenant.
 *
 * ELLE DOIT SE JUSTIFIER, parce que c'est ce qui la rend réfutable : une
 * question dont on voit la raison est une question qu'on peut trouver mauvaise,
 * et le gouvernail de T33 n'est pas un compteur mais la qualité des
 * propositions. « Jamais relevé » est la raison la plus fréquente au démarrage,
 * et elle est honnête : la viande et le poisson ne sont dans aucun relevé de
 * placard.
 */
export function raison(q: Question): string {
  if (q.vuLe === null) return "jamais relevé";
  const [a, m, j] = q.vuLe.split("-");
  const vu = j && m && a ? `${j}/${m}` : q.vuLe;
  return q.confiance === "inconnu" ? `pas vu depuis le ${vu}` : `vu le ${vu}, et servi depuis`;
}

/** Ce que la réponse débloque, en français. On dit ce que ça RAPPORTE, pas ce
 *  qu'on ignore : c'est aussi le critère qui a mis cette question en tête. */
export function enjeu(q: Question): string {
  const n = q.plats.length;
  const ici = n === 1 ? "un plat proposé l’attend" : `${n} plats proposés l’attendent`;
  // `debloque` porte le vivier entier et il est toujours ≥ `plats.length`. Ne
  // l'annoncer que s'il dit quelque chose de PLUS évite la phrase « 1 plat
  // proposé l'attend, 1 en tout », qui a l'air d'un bug.
  return q.debloque > n ? `${ici} · ${q.debloque} en tout` : ici;
}

/** Le titre de la question. L'ingrédient d'abord, parce que c'est le seul mot
 *  que l'œil doit trouver pour aller ouvrir le placard. */
export const titre = (q: Question): string => `Des ${q.nom} ?`;

/**
 * Ce qu'une réponse écrit dans le journal.
 *
 * `null` N'EST PAS UN TROU, c'est une information : « il y en a, je n'ai pas
 * compté » restaure la confiance sur l'existence sans prétendre à un chiffre.
 * Seul « non » porte un nombre, et c'est le seul cas où on en connaît un —
 * zéro. Une quantité tapée à la main l'emporte, pour qui veut être précis.
 */
export function constatDe(reste: Reste, saisie: number | null): { unites: number | null; reste: Reste } {
  if (saisie != null && Number.isFinite(saisie)) return { unites: Math.max(0, saisie), reste };
  return { unites: reste === "non" ? 0 : null, reste };
}
