// Ce que l'écran de l'épargne DIT — les chiffres et les phrases prêts à poser.
// `Epargne.tsx` les dessine, et ne calcule rien.

import { euros, moisType } from "../model/budget";
import { dormant, MOIS_DE_PRECAUTION, projetEffectif, repartir, type Dormant, type LigneProjet, type Repartition, type Rythme } from "../model/epargne";
import { classerTout, historique, type OperationEnBase, type Classement } from "../model/reel";
import type { DonneesBudget, Releve } from "../db/budget";
import { provisionsDe, vueDuReleve, type VueReleve } from "./budget.vue";

/** Ce qu'il faut des relevés pour en tirer une moyenne : un mois seul peut
 *  être celui des impôts, ou celui d'une prime. */
export const MOIS_POUR_MESURER = 2;

export interface Capacite {
  /** Le mois type : revenus − tout ce qu'on a écrit, provisions comprises. */
  ecrite: number;
  /** La moyenne des derniers mois COMPLETS importés — `null` sans assez de
   *  relevés. */
  mesuree: number | null;
  /** Sur combien de mois. */
  surMois: number;
  /** Ce qu'on en a réellement mis de côté, en moyenne (versements classés
   *  « épargne »). */
  epargnee: number | null;
  /** Celle sur laquelle on planifie : la plus prudente des deux. */
  retenue: number;
}

export interface VueEpargne {
  capacite: Capacite;
  /** Le compte courant, relevé — d'où l'on tire ce qui dort. */
  releve: VueReleve;
  /** `null` tant que le compte courant n'a pas été relevé. */
  dormant: Dormant | null;
  rep: Repartition;
  /** La réserve de précaution conseillée, pour la proposer. */
  precaution: number;
  /** Les provisions dorment-elles sur le compte courant ? L'écran le dit. */
  provisionsSurLeCourant: boolean;
}

export interface Reel {
  operations: readonly OperationEnBase[];
  regles: ReadonlyMap<string, Classement>;
  exceptions: ReadonlyMap<string, Classement>;
}

/**
 * La capacité d'épargne — ÉCRITE et MESURÉE, et l'on planifie sur la plus
 * prudente. Un budget écrit est souvent optimiste (une enveloppe de courses
 * qu'on dépasse) ; un trimestre mesuré peut être flatteur (une prime). Prendre
 * la plus basse, c'est accepter de finir un projet en avance plutôt que de
 * découvrir qu'il manque.
 *
 * LE MOIS EN COURS NE SE MESURE PAS : ses relevés ne sont pas encore tous là,
 * et un mois à moitié importé ferait une moyenne fausse dans un sens ou l'autre.
 */
export function capaciteDe(d: DonneesBudget, reel: Reel | null, aujourdhui: string): Capacite {
  const type = moisType(d.revenus, d.echeances, d.enveloppes);
  const ecrite = type.capacite;
  let mesuree: number | null = null;
  let epargnee: number | null = null;
  let surMois = 0;
  if (reel) {
    const debutDuMois = `${aujourdhui.slice(0, 7)}-01`;
    const passes = reel.operations.filter((o) => o.jour < debutDuMois);
    const eff = classerTout(passes, reel.regles, reel.exceptions);
    const h = historique(passes, eff.classes, type);
    if (h.mois.length >= MOIS_POUR_MESURER) {
      surMois = h.mois.length;
      mesuree = h.moyenne;
      epargnee = Math.round(h.mois.reduce((s, m) => s + m.epargne, 0) / h.mois.length);
    }
  }
  const retenue = Math.max(0, mesuree === null ? ecrite : Math.min(ecrite, mesuree));
  return { ecrite, mesuree, surMois, epargnee, retenue };
}

/** Le compte courant relevé : celui des provisions quand elles y dorment. */
export const releveDuCourant = (d: Pick<DonneesBudget, "lieu" | "solde" | "courant">): Releve | null =>
  d.lieu === "courant" ? d.solde : d.courant;

export function vueDeLEpargne(d: DonneesBudget, reel: Reel | null, aujourdhui: string): VueEpargne {
  const type = moisType(d.revenus, d.echeances, d.enveloppes);
  const capacite = capaciteDe(d, reel, aujourdhui);
  const r = releveDuCourant(d);
  const provisionsSurLeCourant = d.lieu === "courant";
  // UN MOIS DE DÉPENSES COURANTES : les charges mensuelles et les enveloppes.
  // Les provisions n'y sont pas — elles ont leur réservé à elles.
  const matelas = Object.values(type.postes).reduce((s, p) => s + p.fixes + p.enveloppes, 0);
  const reserve = provisionsSurLeCourant ? provisionsDe(d, aujourdhui).requis : 0;
  const dort = r ? dormant(r.montant, reserve, matelas) : null;
  const rep = repartir(d.projets.map(projetEffectif), dort?.aPlacer ?? 0, capacite.retenue, aujourdhui.slice(0, 7));
  const precaution = MOIS_DE_PRECAUTION * (type.postes.obligatoire.total + type.postes.essentiel.total);
  return { capacite, releve: vueDuReleve(r, aujourdhui), dormant: dort, rep, precaution, provisionsSurLeCourant };
}

/* ─────────────────────────────────────────────────────────── les phrases */

const MOIS_LONGS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

/** `AAAA-MM` → « juin 2030 » — l'année toujours : un projet se compte en années. */
export const moisEtAnnee = (mois: string): string => `${MOIS_LONGS[Number(mois.slice(5, 7)) - 1]} ${mois.slice(0, 4)}`;

/** Ce que la capacité mesurée dit de l'argent qui dort : ce qui a été laissé
 *  chaque mois sans être mis de côté est resté sur le compte. */
export function phraseDuFlux(c: Capacite): string {
  if (c.mesuree === null)
    return `Mesurée dès que ${MOIS_POUR_MESURER} mois complets de relevés sont importés ; d’ici là, on planifie sur le mois type.`;
  const reste = c.mesuree - (c.epargnee ?? 0);
  const base = `Sur les ${c.surMois} derniers mois de relevés : ${euros(Math.max(0, c.mesuree))} laissés par mois`;
  if (c.mesuree <= 0) return `Sur les ${c.surMois} derniers mois de relevés, les dépenses ont dépassé les revenus.`;
  if (reste > 0)
    return `${base}, dont ${euros(c.epargnee ?? 0)} mis de côté : ${euros(reste)} sont restés sur le compte courant chaque mois, sans destination.`;
  return `${base}, tous mis de côté.`;
}

/** Arrondi à l'euro supérieur : un virement permanent se règle en euros ronds. */
export const eurosRonds = (c: number): string => euros(Math.ceil(c / 100) * 100);
/** Arrondi à l'euro INFÉRIEUR : ce qui reste après des virements arrondis au-dessus. */
export const eurosBas = (c: number): string => euros(Math.floor(c / 100) * 100);

/** Ce que dit un projet : son état, en un mot, et ce qu'il reçoit. */
export function ditLigne(l: LigneProjet): { etat: string; detail: string } {
  const r = l.projet.rythme;
  const maintenant = l.uneFois > 0 ? `+${euros(l.uneFois)} maintenant · ` : "";
  const parMois = l.ceMois > 0 ? `${eurosRonds(l.ceMois)}/mois` : "rien ce mois-ci";
  // ATTEINT GRÂCE À CE QUI DORT, CE N'EST PAS ENCORE ATTEINT : il reste le
  // virement à faire. Le mot le dit, jusqu'à ce que « déjà de côté » suive.
  if (l.etat === "atteint")
    return l.uneFois > 0
      ? { etat: "Avec ce qui dort", detail: `+${euros(l.uneFois)} maintenant, et ${r.sorte === "vite" ? "la réserve est pleine" : "le montant est réuni"}` }
      : { etat: "Atteint", detail: r.sorte === "vite" ? "la réserve est pleine" : "le montant est réuni" };
  if (r.sorte === "mensuel")
    return l.etat === "tenu"
      ? { etat: "Tenu", detail: parMois }
      : { etat: "Trop court", detail: `${parMois} sur ${eurosRonds(r.mensuel)} — les projets d’avant prennent le reste` };
  if (r.sorte === "vite")
    return l.etat === "tenu"
      ? { etat: "En route", detail: `${maintenant}${parMois} · plein en ${moisEtAnnee(l.atteint!)}` }
      : { etat: "Trop court", detail: `${maintenant}${parMois} — les projets d’avant prennent tout` };
  return l.etat === "tenu"
    ? { etat: "Dans les temps", detail: `${maintenant}${parMois} · réuni pour ${moisEtAnnee(r.pour)}` }
    : {
        etat: "Trop court",
        detail: `${maintenant}${parMois}${l.besoin ? ` (il en faudrait ${eurosRonds(l.besoin)})` : ""} · ${euros(l.aLaDate ?? 0)} en ${moisEtAnnee(r.pour)}`,
      };
}

/** Le rythme d'un projet, en quelques mots. */
export function ditRythme(r: Rythme): string {
  if (r.sorte === "date") return `${euros(r.cible)} pour ${moisEtAnnee(r.pour)}`;
  if (r.sorte === "vite") return `${euros(r.cible)}, dès que possible`;
  return `${euros(r.mensuel)} chaque mois`;
}

/** Ce que dit le compte courant. */
export function phraseDuDormant(v: Pick<VueEpargne, "dormant" | "provisionsSurLeCourant" | "releve">): string {
  const d = v.dormant;
  if (!d) return "Relève le solde de ton compte courant : l’app compte ce qu’il doit garder, et ce qui dort au-delà.";
  const garde = v.provisionsSurLeCourant
    ? `${euros(d.reserve)} réservés aux factures à venir et ${euros(d.matelas)} pour le mois`
    : `${euros(d.matelas)} pour le mois — les charges et les enveloppes`;
  const perime = v.releve.perime ? " Le relevé date : mets-le à jour avant de placer quoi que ce soit." : "";
  if (d.aPlacer > 0) return `Le compte doit garder ${garde}. Au-delà, ${euros(d.aPlacer)} dorment sans travail.${perime}`;
  return `Rien ne dort : le compte garde ${garde}, pas plus.${perime}`;
}
