// Ce que « La semaine » montre — sans savoir le montrer.
//
// L'écran est une grille de quatorze cases ; ce fichier dit ce qu'il y a dans
// chacune. Le séparer du JSX n'est pas un réflexe d'architecte : c'est ce qui
// rend la règle testable. « Une journée est lourde au-delà d'une heure et
// demie », « un créneau est lié quand il reçoit ou quand il donne » sont des
// décisions de produit, et elles se vérifient sans monter un DOM.
//
// Port de `apps/proto-shell/comptoir.js` (`ecranSemaine`, `slotCarte`,
// `chiffres`).

import { cleCreneau, jourISO } from "../db";
import { articles, minutesParJour, type Calcul, type LigneChaine } from "../model/calcul";
import { joue, SAUTE, sePioche, type Jeu } from "../model/jeu";
import type { Emit, Plat } from "../model/types";
import type { CleCreneau, Route } from "../nav/routes";
import { duree } from "../ui/format";
import { phraseManque } from "../ui/phrases";

/** Au-delà, la journée se signale. Une heure et demie aux fourneaux un mardi ne
 *  se découvre pas le mardi : c'est tout l'objet de cette vue. */
export const JOURNEE_LOURDE = 90;

export interface VueSlot {
  /** L'index dans le modèle — pour les écritures, jamais pour l'identité. */
  i: number;
  /** L'identité du créneau : (jour, repas). C'est elle qui survit à minuit. */
  id: string;
  creneau: CleCreneau;
  label: string;
  /** Ce repas part en gamelle. */
  emporte: boolean;
  saute: boolean;
  plat: Plat | null;
  /**
   * CE QUE LA CASE DIT — et `null` quand elle ne dit rien. T51.
   *
   * Elle disait « à poser » sur tout créneau vide, et c'est **là** qu'était le
   * trou que Workspace#45 a d'abord cherché dans le modèle : pas dans les
   * données, dans cette phrase. Un créneau vide n'est pas un manque, c'est une
   * décision pas encore prise — et depuis que l'horizon du fil met hors du plan
   * tout ce qu'il ne couvre pas, réclamer quatorze fois par semaine est devenu
   * faux autant que bruyant.
   *
   * `SAUTE` garde son sens exact : « on ne mange pas là » est une décision, et
   * elle se dit. C'est l'ABSENCE de décision qui se tait.
   */
  nom: string | null;
  /** Ni posé ni sauté : le fil a le droit d'atterrir ici, et la case n'a rien
   *  à annoncer. Porté jusqu'au DOM, parce qu'un état muet reste un état et
   *  qu'un sélecteur doit pouvoir le nommer autrement que par son texte. */
  libre: boolean;
  parts: number;
  /** Les parts ne s'affichent que si elles ont été RÉGLÉES : répéter la taille
   *  du foyer quatorze fois n'apprend rien. */
  partsRegle: boolean;
  minutes: number;
  /** Le point sauge : ce créneau tient à un autre jour, dans un sens ou dans
   *  l'autre. */
  lie: boolean;
  recoit: LigneChaine[];
  donne: Emit[];
  souci: string;
}

export interface VueJour {
  nom: string;
  date: Date;
  /** `AAAA-MM-JJ`, local. */
  jour: string;
  minutes: number;
  lourde: boolean;
  slots: VueSlot[];
  /** Les créneaux de routine, qui ne se choisissent pas et ne se comptent pas. */
  routines: string[];
}

/** La semaine, journée par journée. */
export function vueDeLaSemaine(jeu: Jeu, calc: Calcul): VueJour[] {
  const minutes = minutesParJour(jeu, jeu.choix);
  return jeu.jours.map((j, ij) => {
    const duJour = jeu.creneaux.map((c, i) => ({ c, i })).filter((x) => x.c.jour === ij);
    const m = minutes[ij] ?? 0;
    return {
      nom: j.nom,
      date: j.date,
      jour: jourISO(j.date),
      minutes: m,
      lourde: m > JOURNEE_LOURDE,
      slots: duJour
        .filter((x) => sePioche(x.c.nature))
        .map((x) => slot(jeu, calc, x.i, jourISO(j.date))),
      routines: duJour.filter((x) => x.c.nature === "routine").map((x) => x.c.label),
    };
  });
}

function slot(jeu: Jeu, calc: Calcul, i: number, jour: string): VueSlot {
  const c = jeu.creneaux[i]!;
  const rid = jeu.choix[i] ?? null;
  const plat = joue(rid) ? jeu.plats[rid] ?? null : null;

  // CE QU'UN CRÉNEAU DOIT AUX AUTRES JOURS, dans les deux sens : ce qu'il
  // reçoit d'un plat déjà cuisiné, ce qu'il laissera aux suivants. Le point
  // sauge dit qu'il y a un lien ; le doigt dit lequel.
  const recoit = calc.chaine.filter((x) => x.creneau === i);
  const donne = plat ? plat.emits : [];

  return {
    i,
    id: cleCreneau(jour, c.repas),
    creneau: { jour, repas: c.repas },
    label: c.label,
    emporte: c.emporte,
    saute: rid === SAUTE,
    plat,
    nom: rid === SAUTE ? "on ne mange pas là" : (plat?.titre ?? null),
    libre: rid == null,
    parts: jeu.parts[i] ?? jeu.catalogue.foyer.parts,
    partsRegle: (jeu.parts[i] ?? jeu.catalogue.foyer.parts) !== jeu.catalogue.foyer.parts,
    minutes: plat ? plat.minutes : 0,
    lie: recoit.length > 0 || donne.length > 0,
    recoit,
    donne,
    souci: calc.manques
      .filter((m) => m.i === i)
      .map(phraseManque)
      .join(" · "),
  };
}

/**
 * Les routines que TOUTES les journées partagent.
 *
 * Le proto répétait « petit-déj — routine, non comptée » sous chacun des sept
 * jours. Sept fois la même phrase n'informe pas : elle apprend à sauter la
 * ligne, et l'exception — le goûter du mercredi — se noie dedans. On dit le
 * fond une fois, et chaque jour ne montre plus que ce qu'il a en plus.
 */
export function routinesDeFond(jours: VueJour[]): string[] {
  const [premier, ...reste] = jours;
  if (!premier) return [];
  return premier.routines.filter((r) => reste.every((j) => j.routines.includes(r)));
}

export interface Chiffre {
  cle: string;
  valeur: string;
  /** Là où le chiffre mène, quand il mène quelque part. Seuls les lots ont un
   *  ailleurs : les articles et les minutes sont des conséquences de la
   *  semaine, le stock est une chose qu'on va voir. */
  vers?: Route;
}

/**
 * Les trois chiffres épinglés en haut de la semaine.
 *
 * Le canevas en montrait un quatrième — 63 € — qui n'a pas de source : il n'y a
 * pas un prix dans `cuisine-data.json`. On garde la forme du cadran et on
 * compte ce qui existe.
 *
 * LES CHIFFRES SONT NOMMÉS, contrairement au proto qui alignait trois nombres
 * nus. « 23 · 4 h 15 · 6 » demande au lecteur de deviner l'unité de chacun, et
 * il devinera faux au moins une fois.
 */
export function chiffresDeLaSemaine(jeu: Jeu, calc: Calcul): Chiffre[] {
  const arts = articles(calc.panier).length;
  const minutes = minutesParJour(jeu, jeu.choix).reduce((a, b) => a + b, 0);
  const lots = calc.depot.lignes.filter((l) => !l.epuise).length;
  return [
    { cle: arts > 1 ? "articles" : "article", valeur: String(arts) },
    { cle: "de cuisine", valeur: duree(minutes) },
    { cle: lots > 1 ? "lots" : "lot", valeur: String(lots), vers: { ecran: "stock" } },
  ];
}

/**
 * Le prochain créneau qu'aucun doigt n'a touché, ou `null` si la semaine est
 * posée. C'est la cible du bouton du bas : « Poser un plat » doit savoir OÙ,
 * sinon il rouvre le même créneau qu'on vient de remplir.
 *
 * Un repas sauté compte comme décidé : « on ne mange pas là » est une réponse.
 */
export function prochainVide(jeu: Jeu): CleCreneau | null {
  for (const [i, c] of jeu.creneaux.entries()) {
    if (c.nature !== "choisi") continue;
    if (jeu.choix[i] != null) continue;
    const j = jeu.jours[c.jour];
    if (!j) continue;
    return { jour: jourISO(j.date), repas: c.repas };
  }
  return null;
}
