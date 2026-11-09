// Ce que les écrans du budget DISENT — les phrases et les chiffres prêts à
// poser. `Budget.tsx` les dessine, et ne calcule rien.

import {
  calendrier,
  euros,
  joursEntre,
  moisType,
  NATURES,
  pourcentages,
  provisions,
  type EtatProvision,
  type MoisAVenir,
  type MoisType,
  type Nature,
  type Provisions,
} from "../model/budget";
import type { DonneesBudget, Releve } from "../db/budget";

const MOIS_COURTS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
const MOIS_LONGS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

/** « 15 janv. », et l'année seulement quand ce n'est pas celle d'aujourd'hui. */
export function dateCourte(jour: string, aujourdhui: string): string {
  const [a, m, j] = jour.split("-").map(Number);
  const meme = jour.slice(0, 4) === aujourdhui.slice(0, 4);
  return `${j} ${MOIS_COURTS[m! - 1]}${meme ? "" : ` ${a}`}`;
}

/** `AAAA-MM` → « janvier », ou « janvier 2027 » hors de l'année en cours. */
export function nomDuMois(mois: string, aujourdhui: string): string {
  const [a, m] = mois.split("-").map(Number);
  return `${MOIS_LONGS[m! - 1]}${mois.slice(0, 4) === aujourdhui.slice(0, 4) ? "" : ` ${a}`}`;
}

/** « aujourd'hui », « demain », « dans 12 jours », « dans 3 mois ». Au-delà de
 *  deux mois, les jours ne se lisent plus : 143 jours ne dit rien, « dans 5
 *  mois » dit quelque chose. */
export function dans(jours: number): string {
  if (jours <= 0) return "aujourd’hui";
  if (jours === 1) return "demain";
  if (jours < 60) return `dans ${jours} jours`;
  return `dans ${Math.round(jours / 30.44)} mois`;
}

/** Ce que dit l'état d'une provision — DU LIVRET, pas de la facture : la
 *  facture se paie comme toujours. */
export const MOT_ETAT: Record<EtatProvision, string> = {
  prete: "Prête",
  "a-jour": "Dans les temps",
  "a-rattraper": "À rattraper",
};

/**
 * Le départ EFFECTIF des provisions.
 *
 *   - posé : c'est lui ;
 *   - pas de relevé du tout : on n'a pas commencé — on calcule comme si l'on
 *     commençait aujourd'hui, pour montrer le virement à mettre en place, et
 *     rien n'est « à rattraper » ;
 *   - un relevé d'avant que le départ existe : celui-là fait foi, faute de
 *     mieux, jusqu'au prochain relevé qui posera le départ.
 */
export const departEffectif = (d: Pick<DonneesBudget, "depart" | "solde">, aujourdhui: string): string =>
  d.depart ?? d.solde?.jour ?? aujourdhui;

/**
 * Les provisions telles que le foyer les tient.
 *
 * SUR UN LIVRET, le solde relevé est tout entier aux provisions : le surplus
 * est de l'avance. SUR LE COMPTE COURANT, il porte aussi le salaire et les
 * courses : on n'en compte que ce qui devrait être réservé, jamais plus — sans
 * quoi un compte un lendemain de paie déclarerait toutes les factures de
 * l'année « prêtes ».
 */
export function provisionsDe(d: DonneesBudget, aujourdhui: string): Provisions {
  const depart = departEffectif(d, aujourdhui);
  const solde = d.solde?.montant ?? 0;
  if (d.lieu !== "courant") return provisions(d.echeances, solde, aujourdhui, depart);
  const reserve = provisions(d.echeances, 0, aujourdhui, depart).requis;
  return provisions(d.echeances, Math.min(solde, reserve), aujourdhui, depart);
}

/* ───────────────────────────────────────────────────────────── le relevé */

/** Au-delà d'un mois, le solde relevé ne dit plus où l'on en est : les
 *  virements et les prélèvements d'entre-temps n'y sont pas. */
export const RELEVE_PERIME_JOURS = 35;

export interface VueReleve {
  /** Le solde tel que relevé ; 0 tant qu'on n'a rien relevé. */
  montant: number;
  /** « relevé aujourd'hui », « relevé il y a 12 jours », ou `null` si jamais. */
  quand: string | null;
  perime: boolean;
}

export function vueDuReleve(r: Releve | null, aujourdhui: string): VueReleve {
  if (!r) return { montant: 0, quand: null, perime: false };
  const age = joursEntre(r.jour, aujourdhui);
  const quand = age <= 0 ? "relevé aujourd’hui" : age === 1 ? "relevé hier" : `relevé il y a ${age} jours`;
  return { montant: r.montant, quand, perime: age > RELEVE_PERIME_JOURS };
}

/* ──────────────────────────────────────────────────────────── le mois type */

export interface PartNature {
  nature: Nature;
  total: number;
  /** Part des revenus, en %, arrondie. `null` sans revenus saisis : un
   *  pourcentage de zéro n'a pas de sens. */
  pct: number | null;
  /** Part des DÉPENSES, en % — les trois natures font 100. `null` sans
   *  dépense écrite. */
  pctDepenses: number | null;
}

export interface VueMois {
  /** Rien de saisi du tout : l'écran explique par où commencer. */
  vide: boolean;
  mois: MoisType;
  parts: PartNature[];
  /** La part des revenus qui reste pour épargner, en %. */
  pctCapacite: number | null;
  prov: Provisions;
  /**
   * Ce qui reste VRAIMENT ce mois-ci : la capacité du mois type, moins le
   * rattrapage des provisions s'il y en a un. Un compte de provisions en retard
   * mange l'épargne du mois, et c'est ce qu'il faut voir avant de la placer.
   */
  ceMois: number;
  rattrapage: number;
  phrase: string;
}

const pct = (v: number, sur: number): number | null => (sur > 0 ? Math.round((v * 100) / sur) : null);

export function vueDuMois(d: DonneesBudget, aujourdhui: string): VueMois {
  const mois = moisType(d.revenus, d.echeances, d.enveloppes);
  const prov = provisionsDe(d, aujourdhui);
  const rattrapage = Math.max(0, prov.conseille - prov.regime);
  const ceMois = mois.capacite - rattrapage;
  const partsDepenses = pourcentages(NATURES.map((n) => mois.postes[n].total));
  const vide = !d.revenus.length && !d.echeances.length && !d.enveloppes.length;

  let phrase: string;
  if (vide) phrase = "Commence par ce qui rentre, puis ce que tu sais devoir payer.";
  else if (!d.revenus.length) phrase = "Ajoute tes revenus pour voir ce qui reste à épargner.";
  else if (mois.capacite < 0) phrase = `Le budget écrit dépasse les revenus de ${euros(-mois.capacite)} par mois.`;
  else if (rattrapage > 0)
    phrase = `${euros(mois.capacite)} à épargner par mois en régime — ${euros(Math.max(0, ceMois))} ce mois-ci, le temps de remettre les provisions à niveau.`;
  else phrase = `${euros(mois.capacite)} à épargner chaque mois, une fois tout payé et tout provisionné.`;

  return {
    vide,
    mois,
    parts: NATURES.map((n, i) => ({
      nature: n,
      total: mois.postes[n].total,
      pct: pct(mois.postes[n].total, mois.revenus),
      pctDepenses: partsDepenses?.[i] ?? null,
    })),
    pctCapacite: pct(mois.capacite, mois.revenus),
    prov,
    ceMois,
    rattrapage,
    phrase,
  };
}

/* ─────────────────────────────────────────────────────────── les provisions */

export interface VueProvisions {
  prov: Provisions;
  lieu: "livret" | "courant";
  /** Sur le compte courant : le solde relevé moins le réservé. `null` sur un
   *  livret, ou sans relevé. */
  disponible: number | null;
  releve: VueReleve;
  calendrier: MoisAVenir[];
  /** Le mois le plus lourd des douze, s'il y a au moins une provision. */
  plusLourd: MoisAVenir | null;
  phrase: string;
}

export function vueDesProvisions(d: DonneesBudget, aujourdhui: string): VueProvisions {
  const releve = vueDuReleve(d.solde, aujourdhui);
  const prov = provisionsDe(d, aujourdhui);
  const lieu = d.lieu ?? "livret";
  const disponible = lieu === "courant" && d.solde ? d.solde.montant - prov.requis : null;
  const cal = calendrier(d.echeances, aujourdhui);
  const plusLourd = cal.reduce<MoisAVenir | null>((m, x) => (x.total > (m?.total ?? 0) ? x : m), null);

  let phrase: string;
  if (!prov.lignes.length) phrase = "Aucune échéance non mensuelle pour l’instant.";
  else if (!d.solde) phrase = "Les provisions n’ont pas commencé : rien n’est en retard, il n’y a encore rien à rattraper.";
  else if (lieu === "courant")
    phrase =
      disponible! >= 0
        ? `Sur ${euros(d.solde.montant)}, ${euros(prov.requis)} sont réservés aux factures à venir : ${euros(disponible!)} vraiment disponibles.`
        : `Le compte est ${euros(-disponible!)} sous le réservé : une partie de l’argent des factures à venir a été dépensée.`;
  else if (prov.ecart >= 0) phrase = `Le livret est dans les temps${prov.ecart > 0 ? `, avec ${euros(prov.ecart)} d’avance` : ""}.`;
  else phrase = `Il manque ${euros(-prov.ecart)} sur le livret pour suivre le rythme — le virement du mois le rattrape.`;

  return { prov, lieu, disponible, releve, calendrier: cal, plusLourd, phrase };
}
