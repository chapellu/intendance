// Ce qui est POSÉ — la liste des décisions prises, sans le calendrier.
//
// DEMANDÉ LE 21/09/2026, TROISIÈME JOURNÉE D'USAGE RÉEL :
//
//   « I've selected 3 recipes but I have nowhere to check them. I would also
//     like to add another one as one of them was a dessert and not a main
//     course. »
//
// LES DEUX MOITIÉS DE LA PHRASE SONT LA MÊME PANNE. T88 a éteint l'agenda à la
// demande de la même personne, et l'agenda était le SEUL endroit qui nommait
// les plats posés. Restaient des comptes — « 2/14 répondus » au cockpit, « 12
// repas à poser » au fil — qui disent combien sans jamais dire quoi. Le dessert
// était d'ailleurs au bon créneau : `convient()` interdit de le poser sur un
// déjeuner, et il était bien sur `DESSERT`. Ce n'est pas le rangement qui a
// échoué, c'est la LECTURE — et faute de pouvoir lire, on doute du rangement.
//
// CE N'EST PAS « LA SEMAINE » AVEC UN AUTRE NOM, et c'est tout le parti de cet
// écran. La grille montre QUATORZE CASES dont douze sont vides ; ce qu'on
// demande ici est la courte liste de ce qu'on a choisi. Rallumer la grille
// reviendrait sur la décision de T88 — « ça ne me sert à rien actuellement et
// ça me complique plus les choses » — pour un besoin qu'elle ne couvre qu'en
// passant. On filtre donc le vide, et il ne reste que des décisions.
//
// LES JOURS NE SONT PAS RÉINTRODUITS PAR LA PETITE PORTE. L'ordre des lignes
// est chronologique, ce qui suffit à les lire ; la date ne s'écrit que si
// `JOURS_VISIBLES` la rallume. Voir `nav/jours.ts` : un interrupteur, pas une
// amputation.

import type { Calcul } from "../model/calcul";
import type { Jeu } from "../model/jeu";
import { vueDeLaSemaine, type VueSlot } from "./semaine.vue";

export interface LignePosee {
  slot: VueSlot;
  /** Le jour, en toutes lettres — n'est affiché que si les jours sont rallumés. */
  jour: string;
}

export interface VuePoses {
  lignes: LignePosee[];
  /** Les repas au sens du modèle : `nature === "choisi"`. */
  repas: number;
  /** Ce qui est posé SANS être un repas, par label. Aujourd'hui : le dessert. */
  extras: { label: string; n: number }[];
  /** Le total des minutes de ce qui est posé. */
  minutes: number;
  /** Combien de repas attendent encore une décision. */
  restent: number;
}

/**
 * Ce qui est posé, dans l'ordre où ça se mangera.
 *
 * ON DÉRIVE DE `vueDeLaSemaine`, ON NE RECALCULE RIEN. Le chaînage, les soucis,
 * les parts réglées, le « à réchauffer » d'un plat à zéro minute : tout ça est
 * déjà décidé là-bas, et une seconde implémentation finirait par diverger
 * exactement sur les cas rares qui font douter d'un écran.
 */
export function vueDesPoses(jeu: Jeu, calc: Calcul): VuePoses {
  const jours = vueDeLaSemaine(jeu, calc);

  const lignes: LignePosee[] = [];
  for (const j of jours)
    for (const s of j.slots)
      // LE PLAT, ET PAS LA DÉCISION. Un créneau sauté est une décision prise —
      // et elle a sa place dans la grille, qui montre des cases. Ici on liste
      // des RECETTES : « on ne mange pas là » n'en est pas une, et l'aligner
      // sous « Posés » ferait compter quatre choix là où il y en a trois.
      if (s.plat) lignes.push({ slot: s, jour: `${j.nom} ${j.date.getDate()}/${j.date.getMonth() + 1}` });

  const repas = lignes.filter((l) => l.slot.nature === "choisi").length;

  const parLabel = new Map<string, number>();
  for (const l of lignes)
    if (l.slot.nature !== "choisi") parLabel.set(l.slot.label, (parLabel.get(l.slot.label) ?? 0) + 1);

  const restent = jeu.creneaux.filter((c, i) => c.nature === "choisi" && jeu.choix[i] == null).length;

  return {
    lignes,
    repas,
    extras: [...parLabel].map(([label, n]) => ({ label, n })),
    minutes: lignes.reduce((m, l) => m + l.slot.minutes, 0),
    restent,
  };
}

/**
 * Le compte, en français — « 2 repas · 1 dessert ».
 *
 * C'EST LA PHRASE QUI RÉPOND À LA SECONDE MOITIÉ DE LA DEMANDE. Trois recettes
 * posées ne font pas trois dîners si l'une est un dessert, et rien ne le disait :
 * le cockpit affichait « 2/14 répondus » en excluant le dessert sans un mot, ce
 * qui se lit comme une erreur de compte plutôt que comme une distinction.
 *
 * « REPAS » EST INVARIABLE, et ce n'est pas un détail de grammairien : une
 * liste qui affiche « 2 repass » a l'air cassée, et un écran qui a l'air cassé
 * ne se croit plus. C'est déjà l'argument de `quantiteDeLArticle` sur
 * « 2 unité ». Les labels, eux, s'accordent — « 2 desserts ».
 */
export function phraseDesPoses(v: VuePoses): string {
  if (!v.lignes.length) return "Rien de posé pour l’instant.";
  const bouts = [`${v.repas} repas`];
  for (const e of v.extras) bouts.push(`${e.n} ${e.label}${e.n > 1 ? "s" : ""}`);
  return bouts.join(" · ");
}
