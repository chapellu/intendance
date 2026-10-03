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
import { faitUnRepas, ROLES } from "../model/jeu";
import type { Jeu } from "../model/jeu";
import { vueDeLaSemaine, type VueSlot } from "./semaine.vue";

export interface LignePosee {
  slot: VueSlot;
  /** Le jour, en toutes lettres — n'est affiché que si les jours sont rallumés. */
  jour: string;
}

export interface VuePoses {
  lignes: LignePosee[];
  /**
   * Combien de plats posés ont été CUISINÉS et ont donc quitté la liste — T100.
   *
   * RENDU, ET PAS SEULEMENT SOUSTRAIT. Une ligne qui disparaît sans un mot est
   * exactement la perte silencieuse que T94 vient de réparer à l'autre bout ;
   * le compte permet à l'écran de dire « il en est sorti deux » plutôt que de
   * laisser croire à un oubli.
   */
  cuisines: number;
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
export function vueDesPoses(jeu: Jeu, calc: Calcul, cuits: ReadonlySet<string>): VuePoses {
  const jours = vueDeLaSemaine(jeu, calc);

  const lignes: LignePosee[] = [];
  let cuisines = 0;
  for (const j of jours)
    for (const s of j.slots)
      // LE PLAT, ET PAS LA DÉCISION. Un créneau sauté est une décision prise —
      // et elle a sa place dans la grille, qui montre des cases. Ici on liste
      // des RECETTES : « on ne mange pas là » n'en est pas une, et l'aligner
      // sous « Posés » ferait compter quatre choix là où il y en a trois.
      //
      // ET PAS NON PLUS CE QUI EST DÉJÀ CUISINÉ — T100. « Enlever la recette de
      // la liste des choses à faire » (24/09) : une ratatouille faite hier soir
      // restait ici, indistinguable des deux plats qu'on n'a pas encore
      // touchés. `db/report.ts` le savait déjà — « cuisiner EST le “j'ai fini”
      // du plat, dit par le geste » — mais il ne regardait que les événements
      // EN AMONT de la fenêtre, donc la ligne ne s'effaçait qu'une fois le jour
      // sorti par le bas. Cet écran-ci lit le journal de la fenêtre, et la
      // liste se ferme le soir même.
      if (s.plat && cuits.has(s.id)) cuisines += 1;
      else if (s.plat) lignes.push({ slot: s, jour: `${j.nom} ${j.date.getDate()}/${j.date.getMonth() + 1}` });

  // CE QUI COMPTE POUR UN REPAS, ET CE QUI COMPTE À CÔTÉ — deux raisons de ne
  // pas compter, désormais, et elles ne se recouvrent pas.
  //
  // LA PREMIÈRE EST LE CRÉNEAU (#33, le 21/09) : un dessert posé sur la case
  // « dessert » n'est pas un dîner de plus. LA SECONDE EST LE RÔLE : un tian
  // posé sur un dîner n'en est pas un non plus, et il est POSÉ SUR un créneau
  // de repas, donc la nature du créneau ne peut rien en dire. La plainte
  // d'origine — « j'ai sélectionné 3 recettes, l'une était un dessert et pas
  // un plat » — vaut mot pour mot du jour où l'on posera un accompagnement.
  //
  // On ne propose plus d'accompagnement pour un dîner (`comptoir`, écart
  // `role`), mais on peut toujours en CHERCHER un et le poser : le compte doit
  // tenir dans ce cas-là, qui est justement celui où l'on doute de ce qu'on a
  // fait.
  const estUnRepas = (l: LignePosee): boolean =>
    l.slot.nature === "choisi" && (!l.slot.plat || faitUnRepas(l.slot.plat));
  const repas = lignes.filter(estUnRepas).length;

  const parLabel = new Map<string, number>();
  for (const l of lignes)
    if (!estUnRepas(l)) {
      // Le créneau nomme l'à-côté quand c'est lui qui le fait (« dessert ») ;
      // sinon c'est le rôle du plat (« accompagnement »).
      const quoi =
        l.slot.nature === "choisi" && l.slot.plat
          ? ROLES[l.slot.plat.role].nom
          : l.slot.label;
      parLabel.set(quoi, (parLabel.get(quoi) ?? 0) + 1);
    }

  const restent = jeu.creneaux.filter((c, i) => c.nature === "choisi" && jeu.choix[i] == null).length;

  return {
    lignes,
    cuisines,
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
  // DEUX FAÇONS D'ÊTRE VIDE, ET ELLES N'APPELLENT PAS LE MÊME GESTE — T100.
  // « Rien de posé » invite à poser ; « tout est cuisiné » ferme une journée.
  // Les confondre ferait dire à l'écran qu'on n'a rien décidé le soir où l'on
  // a tout fait.
  if (!v.lignes.length)
    return v.cuisines ? "Rien à faire — tout est cuisiné." : "Rien de posé pour l’instant.";
  const bouts = [`${v.repas} repas`];
  for (const e of v.extras) bouts.push(`${e.n} ${e.label}${e.n > 1 ? "s" : ""}`);
  return bouts.join(" · ");
}
