// L'ÉPARGNE — où va ce que le budget laisse.
//
// Le mois type dit COMBIEN il reste ; rien, jusqu'ici, ne disait OÙ ça va. Ce
// qui n'a pas de destination ne part pas : il s'accumule sur le compte
// courant, où il ne rapporte rien et où il finit par être dépensé. Ce module
// donne une destination à chaque euro qui reste.
//
// DEUX QUANTITÉS, ET ELLES N'ONT PAS LA MÊME UNITÉ :
//   - le STOCK — ce qui dort aujourd'hui sur le compte courant au-delà de ce
//     qu'il doit garder (le réservé des provisions, un mois de dépenses). Il
//     se place UNE FOIS ;
//   - le FLUX — la capacité d'épargne, CHAQUE MOIS. Elle se place par des
//     virements permanents.
// Les deux vont aux PROJETS, dans l'ordre où on les a rangés : le premier est
// servi d'abord, et c'est tout ce que « priorité » veut dire ici.
//
// TROIS FAÇONS DE FINANCER UN PROJET, parce qu'on ne pense pas tous ses
// projets de la même façon :
//   - « un montant pour une date » : réunir X d'ici tel mois — l'effort se
//     répartit également sur les mois qui restent ;
//   - « un montant, dès que possible » : une réserve à remplir, qui prend tout
//     ce qu'elle peut tant qu'elle n'est pas pleine — la précaution, typiquement ;
//   - « une somme chaque mois » : un versement fixe, sans montant à atteindre —
//     ce qu'on met de côté pour quelqu'un, mois après mois.
//
// L'APP NE DIT PAS SUR QUOI PLACER. Elle dit combien, pour quoi, et à quel
// rythme ; le support (livret, plan, contrat) se choisit selon l'horizon et
// reste l'affaire du foyer.

import { ajouterMois, moisEntre } from "./budget";
import { chiffrer, type Detail } from "./postes";

export type Rythme =
  | { sorte: "date"; cible: number; /** `AAAA-MM` */ pour: string }
  | { sorte: "vite"; cible: number }
  | { sorte: "mensuel"; mensuel: number };

export interface Projet {
  id: string;
  nom: string;
  rythme: Rythme;
  /** Ce qui est déjà de côté pour lui, en centimes — relevé à la main. */
  deja: number;
  /** Un projet DÉTAILLÉ EN POSTES : sa cible ne se saisit plus, elle se
   *  calcule — le total des postes moins ce que d'autres financent (voir
   *  `model/postes.ts`). Sans objet pour une somme mensuelle. */
  detail?: Detail;
}

/** Le projet tel que la répartition le voit : un projet détaillé prend pour
 *  cible ce qu'il reste à épargner une fois les postes chiffrés et les
 *  financements déduits. La cible saisie, elle, reste en base : elle revient
 *  si l'on retire le détail. */
export function projetEffectif(p: Projet): Projet {
  // SANS POSTE, PAS DE DÉTAIL : un projet dont on a retiré tous les postes
  // retrouve sa cible saisie, au lieu de se croire atteint à zéro euro.
  if (!p.detail?.postes.length || p.rythme.sorte === "mensuel") return p;
  return { ...p, rythme: { ...p.rythme, cible: chiffrer(p.detail).aEpargner } };
}

export type EtatProjet = "atteint" | "tenu" | "court";

export interface LigneProjet {
  projet: Projet;
  /** Pris sur ce qui dort, une fois. */
  uneFois: number;
  /** Le versement de CE mois-ci — celui du virement permanent à mettre en place. */
  ceMois: number;
  /**
   * Ce qu'il faudrait chaque mois pour tenir, une fois le stock placé :
   *   - un montant pour une date : le manque réparti sur les mois qui restent ;
   *   - une somme chaque mois : cette somme ;
   *   - dès que possible : `null` — il prend ce qu'il y a.
   */
  besoin: number | null;
  /** Le mois (`AAAA-MM`) où la cible est réunie, à ce rythme. `null` sans
   *  cible, ou au-delà de l'horizon. */
  atteint: string | null;
  /** Un montant pour une date : ce qu'il y aura à la date, à ce rythme. */
  aLaDate: number | null;
  etat: EtatProjet;
}

export interface Repartition {
  lignes: LigneProjet[];
  /** Ce qui dort encore une fois les projets servis : aucun n'en veut plus. */
  stockLibre: number;
  /** Ce qui reste ce mois-ci une fois les projets servis — sans destination. */
  fluxLibre: number;
}

/** Cinquante ans : au-delà, « atteint » ne veut plus rien dire. */
const HORIZON = 600;

/** `AAAA-MM` + n mois. */
export const moisPlus = (mois: string, n: number): string => ajouterMois(`${mois}-01`, n).slice(0, 7);

const cibleDe = (r: Rythme): number | null => (r.sorte === "mensuel" ? null : r.cible);

/**
 * Le stock puis le flux, aux projets, dans l'ordre.
 *
 * LE FLUX SE SIMULE MOIS PAR MOIS, et c'est ce qui rend l'ordre honnête : une
 * réserve « dès que possible » prend tout pendant trois mois, puis se tait — et
 * le projet suivant, qui n'avait rien reçu, voit son effort recalculé sur les
 * mois qui lui restent. Une répartition du seul premier mois l'aurait déclaré
 * perdu pour toujours.
 *
 * La capacité est supposée constante : c'est une projection, pas une promesse,
 * et elle se refait chaque fois que le budget change.
 */
export function repartir(projets: readonly Projet[], stock: number, capacite: number, mois: string): Repartition {
  const solde = projets.map((p) => p.deja);

  // 1. LE STOCK, UNE FOIS — aux projets qui ont un montant à réunir. Une somme
  //    mensuelle n'a pas de plafond : lui donner le stock, ce serait le lui
  //    donner tout entier.
  let reste = Math.max(0, stock);
  const uneFois = projets.map((p, i) => {
    const cible = cibleDe(p.rythme);
    if (cible === null) return 0;
    const pris = Math.min(Math.max(0, cible - solde[i]!), reste);
    reste -= pris;
    solde[i]! += pris;
    return pris;
  });
  const apresStock = [...solde];

  // 2. LE FLUX, MOIS PAR MOIS.
  const ceMois = projets.map(() => 0);
  const atteint: (string | null)[] = projets.map((p, i) => {
    const cible = cibleDe(p.rythme);
    return cible !== null && solde[i]! >= cible ? mois : null;
  });
  const aLaDate: (number | null)[] = projets.map((p, i) =>
    p.rythme.sorte === "date" && p.rythme.pour <= mois ? solde[i]! : null,
  );
  let fluxLibre = Math.max(0, capacite);

  for (let m = 0; m < HORIZON; m++) {
    const courant = moisPlus(mois, m);
    let dispo = Math.max(0, capacite);
    projets.forEach((p, i) => {
      const r = p.rythme;
      // LA DATE ARRIVE AVANT LE VERSEMENT DU MOIS : ce qui est là au début du
      // mois visé est ce qu'on aura.
      if (r.sorte === "date" && courant === r.pour) aLaDate[i] = solde[i]!;
      let besoin: number;
      if (r.sorte === "mensuel") besoin = r.mensuel;
      else {
        const manque = Math.max(0, r.cible - solde[i]!);
        if (r.sorte === "vite") besoin = manque;
        else {
          const restant = moisEntre(courant, r.pour);
          besoin = restant > 0 ? Math.ceil(manque / restant) : 0;
        }
      }
      const verse = Math.min(besoin, dispo);
      dispo -= verse;
      solde[i]! += verse;
      if (m === 0) ceMois[i] = verse;
      const cible = cibleDe(r);
      if (cible !== null && atteint[i] === null && solde[i]! >= cible) atteint[i] = courant;
    });
    if (m === 0) fluxLibre = dispo;
  }

  const lignes = projets.map((projet, i): LigneProjet => {
    const r = projet.rythme;
    let besoin: number | null = null;
    if (r.sorte === "mensuel") besoin = r.mensuel;
    else if (r.sorte === "date") {
      const restant = moisEntre(mois, r.pour);
      const manque = Math.max(0, r.cible - apresStock[i]!);
      besoin = manque === 0 ? 0 : restant > 0 ? Math.ceil(manque / restant) : manque;
    }

    let etat: EtatProjet;
    if (r.sorte === "mensuel") etat = ceMois[i]! >= r.mensuel ? "tenu" : "court";
    else if (apresStock[i]! >= r.cible) etat = "atteint";
    else if (r.sorte === "date") etat = (aLaDate[i] ?? 0) >= r.cible ? "tenu" : "court";
    else etat = atteint[i] !== null ? "tenu" : "court";

    return {
      projet,
      uneFois: uneFois[i]!,
      ceMois: ceMois[i]!,
      besoin,
      atteint: atteint[i]!,
      aLaDate: aLaDate[i]!,
      etat,
    };
  });

  return { lignes, stockLibre: reste, fluxLibre };
}

/* ─────────────────────────────────────────────────────────── ce qui dort */

export interface Dormant {
  /** Le solde du compte courant, relevé. */
  solde: number;
  /** La part des factures à venir, quand les provisions dorment sur ce compte. */
  reserve: number;
  /** Un mois de dépenses courantes : de quoi passer le mois sans découvert. */
  matelas: number;
  /** Ce qui dépasse : à placer. Jamais négatif. */
  aPlacer: number;
}

/**
 * Ce qui dort sur le compte courant. Le compte doit garder deux choses : ce
 * qui est réservé aux factures à venir (si les provisions y dorment) et un
 * mois de dépenses courantes — les charges mensuelles et les enveloppes, de
 * quoi aller d'une paie à l'autre sans découvert. Au-delà, l'argent n'a pas
 * de travail.
 *
 * UN MOIS ENTIER, MÊME RELEVÉ LA VEILLE DE LA PAIE. C'est prudent à dessein :
 * l'app ne sait pas où l'on en est du mois, et se tromper dans ce sens laisse
 * un peu trop sur le compte, pas un découvert.
 */
export function dormant(solde: number, reserve: number, matelas: number): Dormant {
  return { solde, reserve, matelas, aPlacer: Math.max(0, solde - reserve - matelas) };
}

/** La réserve de précaution conseillée : trois mois des dépenses qui ne se
 *  négocient pas (obligatoires et essentielles). C'est le bas de la
 *  fourchette habituelle (trois à six mois) ; on la corrige à la main. */
export const MOIS_DE_PRECAUTION = 3;
