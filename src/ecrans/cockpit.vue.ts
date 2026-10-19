// Ce que le cockpit montre — la journée d'abord, les facettes ensuite.
//
// LA THÈSE DE L'ÉCRAN : le cockpit n'est pas un tableau de bord de la cuisine,
// c'est la porte de la maison. Il répond à une seule question — « qu'est-ce qui
// m'attend aujourd'hui ? » — et tout ce qui n'y répond pas descend d'un cran,
// dans les cartes de facette.
//
// ────────────────────────────────────────────────────────────────────────────
// LE JARDIN NE PRODUIT AUCUNE TÂCHE, ET C'EST LE PRINCIPAL ÉCART AU PROTO.
//
// `apps/proto-shell/comptoir.js` en tirait trois : « semer la mâche »,
// « observer le bac 2 », « récolter le basilic ». Elles viennent de `data.js`,
// écrites à la main pour le canevas — aucun modèle ne les calcule, aucune base
// ne les porte, et rien dans cette app ne saurait dire qu'elles sont faites.
// Un cockpit qui réclame de semer la mâche tous les jours de l'année apprend à
// ne plus lire le cockpit. Deux lignes vraies valent mieux que cinq dont trois
// sont un décor : la facette jardin garde sa carte, sans chiffre, et le dira
// quand elle aura un modèle.
// ────────────────────────────────────────────────────────────────────────────
//
// Port de `apps/proto-shell/comptoir.js` (`ecranCockpit`).

import { jourISO, type EtatCourse } from "../db";
import { cleGeste } from "../db/reglages";
import { minutesParJour, type Calcul } from "../model/calcul";
import { SAUTE, type Jeu } from "../model/jeu";
import { JOURS_VISIBLES } from "../nav/jours";
import type { Route } from "../nav/routes";
import { duree } from "../ui/format";
import { detailDuGeste, detailDuGesteSansJours, gesteDuJour, titreDuGeste } from "./aujourdhui.vue";
import { vueDesCourses } from "./courses.vue";
import { vueAPrevoir } from "./prevoir.vue";
import { restesPerimes } from "./stock.vue";

export interface Tache {
  cle: string;
  /** La facette d'où vient la tâche — c'est la pastille de la ligne. */
  facette: "Cuisine" | "Jardin";
  titre: string;
  detail: string;
  /** Où l'on répond. Une tâche qui n'ouvre rien est une plainte. */
  route: Route;
  /**
   * Les clés de base que « c'est jeté » retire, quand la tâche se règle sur
   * place — T103. Absent partout ailleurs.
   *
   * LA SEULE TÂCHE QUI SE RÈGLE SANS ALLER NULLE PART, et c'est voulu : il n'y
   * a rien à décider sur un reste passé, seulement à le dire jeté. L'envoyer
   * sur l'inventaire pour taper « Je n'en ai plus » N fois — 36 fois, pendant
   * la panne de frigo de l'année simulée — serait faire payer au doigt
   * l'oubli du modèle.
   */
  jeter?: string[];
  /**
   * La clé du drapeau que « Fait » pose, quand le geste du jour se coche sur
   * place — sans les jours seulement. Avec, il se coche sur « Aujourd'hui »,
   * où la tâche envoie.
   *
   * SANS CE BOUTON, LE GESTE RALLUMÉ SERAIT UNE TÂCHE QU'ON NE PEUT PAS FINIR :
   * le seul « Fait » de l'app vit sur un écran éteint, et la fiche du plat ne
   * le connaît pas. Une ligne qui reste toute la soirée après qu'on a sorti le
   * bocal apprend à ne plus lire le cockpit (T16).
   */
  cocher?: string;
}

export interface CarteFacette {
  /** Le mot court en haut à droite : l'état de la facette, pas un compte. */
  etat: string;
  resume: string;
  chiffres: string[];
}

export interface VueCockpit {
  taches: Tache[];
  /** La phrase sous la date. Elle compte les tâches, et rien d'autre. */
  entree: string;
  cuisine: CarteFacette;
}

export interface EtatDuJour {
  /** L'état des courses, tel que la base le porte. */
  courses: Map<string, EtatCourse>;
  /** Le geste du jour a été coché. Voir `cleGeste` : la clé porte le jour. */
  gesteFait: boolean;
}

export function vueDuCockpit(jeu: Jeu, calc: Calcul, etat: EtatDuJour): VueCockpit {
  const courses = vueDesCourses(jeu.catalogue, calc.panier, etat.courses);
  // SANS LES JOURS, AUCUNE OFFRE N'ATTEND — T110. « À prévoir » est éteint
  // (T88), donc une offre comptée ici est une offre à laquelle on ne peut pas
  // répondre : l'année simulée l'a vue en tête du cockpit 65 jours sur 365,
  // menant à un écran qu'aucun onglet n'ouvre. Le chiffre de la carte et sa
  // phrase tombent avec, pour la même raison que la pastille de la coquille.
  const enAttente = JOURS_VISIBLES ? vueAPrevoir(jeu, calc).enAttente : 0;
  // LE DERNIER JOUR DE LA FENÊTRE, pas « dimanche » : la semaine part
  // d'aujourd'hui. Aucune valeur de repli ici — un nom de jour inventé serait
  // exactement le bug du proto, en plus discret.
  const dernier = jeu.jours.at(-1)!.nom;

  const minutes = minutesParJour(jeu, jeu.choix).reduce((a, b) => a + b, 0);

  const choisis = jeu.creneaux.map((c, i) => ({ c, i })).filter((x) => x.c.nature === "choisi");
  // UN CRÉNEAU RÉPONDU, ce n'est pas un créneau qui porte un plat : « on ne
  // mange pas là » est une réponse, et elle ne réclame plus rien.
  const repondus = choisis.filter((x) => jeu.choix[x.i] != null).length;
  const aPoser = choisis.length - repondus;
  const poses = jeu.choix.filter((c) => c != null && c !== SAUTE).length;

  const taches: Tache[] = [];

  // 1. CE SOIR. C'est la seule chose de la liste dont l'échéance est ce soir :
  // elle passe donc devant, y compris devant les courses.
  //
  // ELLE SURVIT AUX JOURS CACHÉS, ET C'EST JUSTIFIÉ (balayage de T110). « Ce
  // soir » n'est pas une case de l'agenda, c'est le dîner qui va avoir lieu ;
  // et « Poser » n'est pas éteint — « Posés › Changer » l'ouvre, et il rend la
  // main à « Posés » sans les jours (`Poser.tsx`).
  const soir = jeu.creneaux.findIndex((c) => c.jour === 0 && c.repas === "diner");
  const jour0 = jeu.jours[0];
  if (soir >= 0 && jour0 && jeu.choix[soir] == null)
    taches.push({
      cle: "ce-soir",
      facette: "Cuisine",
      titre: "Poser le dîner de ce soir",
      detail: "Rien n'est posé — « Poser un plat » en propose quatre.",
      route: {
        ecran: "poser",
        creneau: { jour: jourISO(jour0.date), repas: jeu.creneaux[soir]!.repas },
      },
    });

  // 2. LE GESTE DU JOUR. Il concerne demain, mais il se fait ce soir : un lot
  // sorti demain matin est encore un bloc à 19 h.
  const geste = gesteDuJour(jeu, calc);
  //
  // SANS LES JOURS, IL ENVOIE AU PLAT. T110 l'avait éteint avec les jours,
  // parce qu'il menait à « Aujourd'hui » ; mais ce qu'il réclame n'est pas une
  // case de l'agenda, c'est un bocal à sortir pour un plat POSÉ — et un bloc de
  // sauce à 19 h est le même, qu'on montre le jour ou non. Il ouvre donc la
  // fiche du plat (celle que « Posés » ouvre), nomme le plat et pas « demain »,
  // et se coche sur place.
  if (geste && !etat.gesteFait)
    taches.push({
      cle: `geste|${geste.type}`,
      facette: "Cuisine",
      titre: titreDuGeste(geste),
      detail: JOURS_VISIBLES ? detailDuGeste(geste) : detailDuGesteSansJours(geste),
      route: JOURS_VISIBLES ? { ecran: "aujourdhui" } : { ecran: "cuisiner", creneau: geste.creneau },
      ...(!JOURS_VISIBLES && jour0 ? { cocher: cleGeste(jourISO(jour0.date), geste.type) } : {}),
    });

  // 3. CE QUI EST PASSÉ AU FRIGO — T103. Après le geste du jour parce que c'est
  // le même voyage, au frigo, et avant les courses parce qu'il libère la place
  // où elles vont. La tâche ne paraît que s'il y a quelque chose à jeter : un
  // « 0 reste passé » permanent apprendrait à ne plus lire le cockpit.
  const perimes = jour0 ? restesPerimes(calc.depot, jour0.date) : [];
  if (perimes.length)
    taches.push({
      cle: "perimes",
      facette: "Cuisine",
      titre:
        perimes.length > 1
          ? `${perimes.length} restes ont passé leur date`
          : "Un reste a passé sa date",
      detail: `${nomsCourts(perimes.map((l) => l.type))} — plus proposé, à jeter.`,
      route: { ecran: "stock" },
      jeter: perimes.map((l) => l.ref!),
    });

  // 4. LES COURSES. Le proto écrivait « rien de rentré au stock » quel que soit
  // le nombre d'articles rentrés — il lisait les cochés et concluait sur les
  // rentrés. Une ligne qui contredit l'écran qu'elle ouvre ne se rattrape pas.
  if (courses.articles.length && courses.rentres < courses.articles.length)
    taches.push({
      cle: "courses",
      facette: "Cuisine",
      titre: "Les courses",
      detail: detailDesCourses(courses.articles.length, courses.coches, courses.rentres),
      route: { ecran: "courses" },
    });

  // 5. CE QUI ATTEND UNE RÉPONSE. Le compte vient de « À prévoir », comme la
  // pastille de la sous-navigation : un seul endroit sait compter les offres.
  if (enAttente)
    taches.push({
      cle: "prevoir",
      facette: "Cuisine",
      titre: enAttente > 1 ? `${enAttente} offres attendent une réponse` : "Une offre attend une réponse",
      detail: "Agrandir un lot d'avance, ou prévoir une gamelle pour un midi.",
      route: { ecran: "prevoir" }, // enAttente vaut 0 sans JOURS_VISIBLES
    });

  return {
    taches,
    entree: entree(taches.length),
    cuisine: {
      // Le proto affichait « 14 créneaux » — le nombre de créneaux
      // CHOISISSABLES de la semaine, qui ne bouge jamais. Un chiffre constant
      // déguisé en état ; ce qui bouge, c'est ce à quoi on a répondu.
      //
      // SANS LES JOURS, NI CRÉNEAU NI JOUR — T110. « 14 créneaux restent à
      // poser d'ici jeudi » nommait deux choses que T88 a cachées. Ce qui reste
      // lisible, ce sont les plats posés : c'est ce que « Posés » montre.
      etat: JOURS_VISIBLES ? `${repondus}/${choisis.length} répondus` : poses > 1 ? `${poses} posés` : `${poses} posé`,
      resume: JOURS_VISIBLES ? resumeCuisine(aPoser, dernier, enAttente) : resumeSansJours(poses),
      // UN ZÉRO N'EST PAS UN CHIFFRE À AFFICHER. Vu au navigateur sur une
      // semaine vide : « 0 article » et « 0 min de cuisine » en pastilles, ce
      // qui donne trois choses à lire pour n'en dire aucune. Le proto ne
      // pouvait pas le voir, sa semaine était pré-remplie au démarrage.
      chiffres: [
        ...(courses.articles.length
          ? [`${courses.articles.length} ${courses.articles.length > 1 ? "articles" : "article"}`]
          : []),
        ...(minutes ? [`${duree(minutes)} de cuisine`] : []),
        ...(enAttente ? [enAttente > 1 ? `${enAttente} offres ouvertes` : "1 offre ouverte"] : []),
      ],
    },
  };
}

/** Trois noms au plus, puis le compte du reste : la ligne du cockpit tient sur
 *  un téléphone, et la liste entière est dans l'inventaire. Les doublons se
 *  disent une fois — deux boîtes de lentilles sont « lentilles » à la poubelle. */
export function nomsCourts(types: readonly string[]): string {
  const uniques = [...new Set(types)];
  const dits = uniques.slice(0, 3).join(", ");
  const reste = uniques.length - 3;
  return reste > 0 ? `${dits} et ${reste} autre${reste > 1 ? "s" : ""}` : dits;
}

/** Où en est la liste, dit dans l'ordre où on la vit : on coche au magasin,
 *  puis on range à la maison. */
export function detailDesCourses(total: number, coches: number, rentres: number): string {
  if (rentres) return `${rentres} sur ${total} rentrés au stock`;
  if (coches) return `${coches} sur ${total} cochés`;
  return `${total} ${total > 1 ? "articles à cocher" : "article à cocher"}`;
}

const entree = (n: number): string =>
  n === 0
    ? "Rien ne vous attend aujourd'hui."
    : n === 1
      ? "Une chose vous attend aujourd'hui."
      : `${n} choses vous attendent aujourd'hui.`;

/**
 * L'état de la semaine, en une phrase.
 *
 * Le proto écrivait « La semaine est posée jusqu'à dimanche » en dur, quoi
 * qu'elle porte — la phrase était fausse dès le premier créneau vide, et son
 * « dimanche » l'était dès qu'on ouvrait l'app un mardi : la fenêtre part
 * d'aujourd'hui et finit sept jours plus tard, pas au bout du calendrier.
 */
export function resumeCuisine(aPoser: number, dernier: string, enAttente: number): string {
  const semaine =
    aPoser === 0
      ? `La semaine est répondue jusqu'à ${dernier}.`
      : aPoser === 1
        ? `Un créneau reste à poser d'ici ${dernier}.`
        : `${aPoser} créneaux restent à poser d'ici ${dernier}.`;
  const offres =
    enAttente === 0 ? "" : enAttente > 1 ? ` ${enAttente} offres attendent votre réponse.` : " Une offre attend votre réponse.";
  return semaine + offres;
}

/** L'état de la cuisine quand les jours sont cachés : ce qui est décidé, et
 *  rien qui compte des cases qu'on ne voit pas. */
export function resumeSansJours(poses: number): string {
  if (poses === 0) return "Rien n'est posé — « Proposer » tire une main sur ce que vous avez.";
  return poses === 1 ? "Un plat posé, à cuisiner quand vous voulez." : `${poses} plats posés, à cuisiner quand vous voulez.`;
}

/** Ce qui compte pour la pastille du cockpit : la liste elle-même. Un compte
 *  refait ailleurs finirait par annoncer un autre nombre que l'écran qu'il
 *  ouvre — c'est la leçon de T10, et elle vaut pour la barre du bas. */
export const aFaire = (v: VueCockpit): number => v.taches.length;
