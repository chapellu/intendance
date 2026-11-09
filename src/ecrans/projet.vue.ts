// Ce que l'écran d'un projet détaillé DIT. `Projet.tsx` le dessine.

import { euros, pourcentages } from "../model/budget";
import { chiffrer, NOM_CERTITUDE, type Certitude, type Chiffrage, type Detail, type Poste } from "../model/postes";
import { moisEtAnnee } from "./epargne.vue";

export const DETAIL_VIDE: Detail = { postes: [], financements: [] };

/** Un nombre avec ses décimales à la française : « 7,5 », « 85 ». */
const nombre = (n: number): string => n.toLocaleString("fr-FR", { maximumFractionDigits: 2 });

/** Comment un poste est chiffré, en quelques mots — ce qu'on relit pour le
 *  vérifier sans ouvrir sa fiche. */
export function ditCalcul(p: Poste, tous: readonly Poste[]): string {
  const c = p.calcul;
  if (c.sorte === "montant") return "";
  if (c.sorte === "quantite") return `${nombre(c.quantite)} × ${euros(c.prix)}`;
  const base = tous.find((x) => x.id === c.de);
  return base ? `${nombre(c.taux / 100)} % de « ${base.nom} »` : `${nombre(c.taux / 100)} % d’un poste retiré`;
}

/** La ligne sous le nom d'un poste : son calcul, son mois, sa certitude. */
export function sousLigne(p: Poste, tous: readonly Poste[]): string {
  return [ditCalcul(p, tous), p.quand ? moisEtAnnee(p.quand) : null, NOM_CERTITUDE[p.certitude].toLowerCase()]
    .filter(Boolean)
    .join(" · ");
}

export interface VueProjet {
  ch: Chiffrage;
  /** Les parts payée, sur devis, estimée du total, en % entiers qui font 100 —
   *  `null` sans total. */
  certitude: Record<Certitude, number> | null;
  phrase: string;
}

export function vueDuProjet(d: Detail): VueProjet {
  const ch = chiffrer(d);
  const parts = pourcentages([ch.parCertitude.paye, ch.parCertitude.devis, ch.parCertitude.estime]);
  const certitude = parts ? { paye: parts[0]!, devis: parts[1]!, estime: parts[2]! } : null;
  let phrase: string;
  if (!d.postes.length)
    phrase = "Un poste par dépense : son montant, son mois, et s’il est estimé, sur devis ou payé. Le total s’en déduit.";
  else if (ch.excedent > 0)
    phrase = `Les financements dépassent le total de ${euros(ch.excedent)} : rien à épargner pour ce projet.`;
  else if (ch.finance > 0)
    phrase = `${euros(ch.total)} au total, dont ${euros(ch.finance)} financés autrement : ${euros(ch.aEpargner)} à réunir par l’épargne — c’est la cible du projet.`;
  else phrase = `${euros(ch.total)} au total, tout par l’épargne pour l’instant : un prêt, une vente ou un don se déduisent dans « Financement ».`;
  return { ch, certitude, phrase };
}
