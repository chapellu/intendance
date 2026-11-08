// Le mois RÉEL — ce que les relevés disent, rangé comme le budget.
//
// UNE OPÉRATION SE CLASSE PAR SON MOTIF, PAS UNE PAR UNE. Classer « la
// boulangerie » une fois range toutes ses lignes, passées et à venir : c'est ce
// qui rend un import mensuel supportable. Une règle se pose donc sur le motif
// (`motif()` du lecteur), et le mois réel se recalcule depuis les règles à
// chaque rendu — changer d'avis sur un motif reclasse tout l'historique.
//
// QUATRE SORTES, ET LES DEUX DERNIÈRES SONT CELLES QU'ON OUBLIE. Une dépense,
// un revenu — et deux façons pour l'argent de quitter un compte sans être
// dépensé :
//   - l'ÉPARGNE : un versement vers un placement (livret, assurance-vie, PEA).
//     C'est la ligne que tout ce budget sert à faire grossir ; la ranger en
//     dépense ferait croire qu'on dépense ce qu'on met de côté, et la noyer
//     dans les virements internes la rendrait invisible ;
//   - un mouvement ENTRE SES PROPRES COMPTES courants : il sort de l'un et
//     entre dans l'autre, et ne compte ni comme entrée ni comme sortie.

import { NATURES, type Categorie, type MoisType, type Nature } from "./budget";

export type Classement =
  | { sorte: "depense"; categorie: Categorie; nature: Nature }
  | { sorte: "revenu" }
  | { sorte: "epargne" }
  | { sorte: "interne" };

/** Une opération telle qu'elle est gardée en base. */
export interface OperationEnBase {
  /** `${compte}|${jour}|${montant}|${libelle}|${rang}` — voir `db/releves.ts`. */
  cle: string;
  compte: string;
  jour: string;
  libelle: string;
  detail: string[];
  /** Centimes signés. */
  montant: number;
  motif: string;
}

export interface LigneCategorie {
  categorie: Categorie;
  /** Dépensé ce mois-là (positif). */
  reel: number;
  /** Ce que le mois type y prévoit. */
  prevu: number;
}

export interface MoisReel {
  mois: string;
  /** Revenus encaissés. */
  entrees: number;
  /** Dépenses classées. */
  sorties: number;
  /** Mis de côté : versements vers l'épargne, moins les retraits qui en
   *  reviennent. */
  epargne: number;
  /** Les mouvements entre comptes, ni l'un ni l'autre : on les montre, on ne
   *  les compte pas. */
  internes: number;
  /** Ce qui n'a pas encore de règle — débits et crédits. */
  aClasser: OperationEnBase[];
  /** Somme absolue de ce qui reste à classer : tant qu'elle n'est pas nulle,
   *  les totaux sont des minimums. */
  montantAClasser: number;
  categories: LigneCategorie[];
  natures: { nature: Nature; reel: number; prevu: number }[];
  operations: OperationEnBase[];
}

/** Les mois qui ont des opérations, du plus récent au plus ancien. */
export const moisDisponibles = (ops: readonly OperationEnBase[]): string[] =>
  [...new Set(ops.map((o) => o.jour.slice(0, 7)))].sort().reverse();

export function moisReel(
  ops: readonly OperationEnBase[],
  regles: ReadonlyMap<string, Classement>,
  mois: string,
  type: MoisType,
): MoisReel {
  const duMois = ops.filter((o) => o.jour.startsWith(mois)).sort((a, b) => (a.jour < b.jour ? -1 : a.jour > b.jour ? 1 : 0));
  let entrees = 0;
  let sorties = 0;
  let internes = 0;
  let epargne = 0;
  const aClasser: OperationEnBase[] = [];
  const parCategorie = new Map<Categorie, number>();
  const parNature = new Map<Nature, number>();

  for (const o of duMois) {
    const r = regles.get(o.motif);
    if (!r) {
      aClasser.push(o);
      continue;
    }
    if (r.sorte === "interne") internes += Math.abs(o.montant);
    else if (r.sorte === "epargne") epargne -= o.montant;
    else if (r.sorte === "revenu") entrees += o.montant;
    else {
      // UNE DÉPENSE CLASSÉE PEUT ÊTRE UN CRÉDIT : le remboursement d'un achat
      // vient en déduction de sa catégorie, il n'est pas un revenu.
      sorties -= o.montant;
      parCategorie.set(r.categorie, (parCategorie.get(r.categorie) ?? 0) - o.montant);
      parNature.set(r.nature, (parNature.get(r.nature) ?? 0) - o.montant);
    }
  }

  const prevuCategorie = new Map(type.categories.map((c) => [c.categorie, c.total]));
  const toutes = new Set<Categorie>([...parCategorie.keys(), ...prevuCategorie.keys()]);
  const categories = [...toutes]
    .map((c) => ({ categorie: c, reel: parCategorie.get(c) ?? 0, prevu: prevuCategorie.get(c) ?? 0 }))
    .sort((a, b) => b.reel - a.reel || b.prevu - a.prevu);

  return {
    mois,
    entrees,
    sorties,
    epargne,
    internes,
    aClasser,
    montantAClasser: aClasser.reduce((s, o) => s + Math.abs(o.montant), 0),
    categories,
    natures: NATURES.map((n) => ({ nature: n, reel: parNature.get(n) ?? 0, prevu: type.postes[n].total })),
    operations: duMois,
  };
}

/* ───────────────────────────────────────────────────────── la composition */

/**
 * Ce qu'on ouvre pour voir de quoi un total est fait : une catégorie de
 * dépenses, les revenus, l'épargne, les virements entre comptes, ou ce qui
 * reste à classer.
 */
export type Vue =
  | { sorte: "depense"; categorie: Categorie }
  | { sorte: "revenu" }
  | { sorte: "epargne" }
  | { sorte: "interne" }
  | { sorte: "a-classer" };

/** Un motif dans une vue : l'enseigne, l'employeur, l'organisme — et ses
 *  opérations du mois. */
export interface Groupe {
  motif: string;
  /** Un nom lisible, tiré du libellé le plus récent du motif. */
  nom: string;
  /** Dans le sens de la vue : une dépense compte en positif, un remboursement
   *  en négatif ; un revenu en positif. */
  total: number;
  operations: OperationEnBase[];
}

export interface Composition {
  total: number;
  groupes: Groupe[];
}

/**
 * Le nom d'un motif tel qu'on le lit : le libellé sans sa mécanique bancaire
 * (« CARTE 12/09 », « PRLV SEPA », dates, longues références), mais avec sa
 * casse et ses accents — c'est ce que le motif, fait pour comparer, a perdu.
 *
 * C'EST L'ÉQUIVALENT DES SOUS-CATÉGORIES D'AUTRES APPLIS, et en mieux pour un
 * budget de foyer : « Logement » ouvert montre « Prêt », « Électricité »,
 * « Eau », chacun avec son total — sans avoir eu à ranger quoi que ce soit
 * dans un deuxième niveau.
 */
export function nomLisible(libelle: string): string {
  const s = libelle
    .replace(/^(?:CARTE|CB|PRLV(?: SEPA)?|PRELEVEMENT(?: SEPA)?|VIR(?:EMENT)?(?:\.| )?(?:INST|PERMANENT|SEPA|RECU|EMIS)?|CHQ\.?|CHEQUE|RETRAIT(?: DAB)?)\b\.?/i, " ")
    .replace(/\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/g, " ")
    .replace(/\b\d{1,3}(?:[ .]\d{3})*,\d{2}(?:\s*(?:EUR|USD|GBP|CHF)\b)?/gi, " ")
    .replace(/\b[A-Z0-9]*\d[A-Z0-9]{5,}\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return s || libelle.trim();
}

const dansLaVue = (v: Vue, r: Classement | undefined): boolean =>
  v.sorte === "a-classer" ? !r : v.sorte === "depense" ? r?.sorte === "depense" && r.categorie === v.categorie : r?.sorte === v.sorte;

/** Le sens dans lequel une vue compte une opération. */
const dansLeSens = (v: Vue, o: OperationEnBase): number =>
  v.sorte === "revenu" || v.sorte === "a-classer" ? o.montant : v.sorte === "interne" ? Math.abs(o.montant) : -o.montant;

export function composition(
  ops: readonly OperationEnBase[],
  regles: ReadonlyMap<string, Classement>,
  mois: string,
  vue: Vue,
): Composition {
  const parMotif = new Map<string, OperationEnBase[]>();
  for (const o of ops) {
    if (!o.jour.startsWith(mois) || !dansLaVue(vue, regles.get(o.motif))) continue;
    parMotif.set(o.motif, [...(parMotif.get(o.motif) ?? []), o]);
  }
  const groupes: Groupe[] = [...parMotif.entries()].map(([motif, operations]) => {
    const triees = [...operations].sort((a, b) => (a.jour < b.jour ? 1 : a.jour > b.jour ? -1 : 0));
    return {
      motif,
      nom: nomLisible(triees[0]!.libelle),
      total: triees.reduce((s, o) => s + dansLeSens(vue, o), 0),
      operations: triees,
    };
  });
  groupes.sort((a, b) => Math.abs(b.total) - Math.abs(a.total));
  return { total: groupes.reduce((s, g) => s + g.total, 0), groupes };
}

/* ──────────────────────────────────────────────────────── mois par mois */

export interface MoisResume {
  mois: string;
  entrees: number;
  sorties: number;
  epargne: number;
  /** Entrées − dépenses : ce que le mois a laissé, épargné ou non. */
  capacite: number;
  aClasser: number;
}

export interface Historique {
  mois: MoisResume[];
  /** La capacité moyenne des mois montrés. `null` sans mois. */
  moyenne: number | null;
}

/**
 * Les derniers mois importés, du plus récent au plus ancien, et ce qu'ils ont
 * laissé en moyenne. C'est la capacité d'épargne RÉELLE — celle que le mois
 * type promet, vérifiée.
 */
export function historique(
  ops: readonly OperationEnBase[],
  regles: ReadonlyMap<string, Classement>,
  type: MoisType,
  combien = 6,
): Historique {
  const mois = moisDisponibles(ops)
    .slice(0, combien)
    .map((x) => {
      const m = moisReel(ops, regles, x, type);
      return { mois: x, entrees: m.entrees, sorties: m.sorties, epargne: m.epargne, capacite: m.entrees - m.sorties, aClasser: m.aClasser.length };
    });
  return { mois, moyenne: mois.length ? Math.round(mois.reduce((s, m) => s + m.capacite, 0) / mois.length) : null };
}
