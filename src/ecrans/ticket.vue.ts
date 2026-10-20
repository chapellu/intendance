// L'écran de revue d'un ticket — T138.
//
// PROPOSÉ, JAMAIS CRU. Ce que l'OCR a lu et ce que la table apprise reconnaît
// arrivent ici comme une proposition : une rangée par ligne, qu'on corrige ou
// qu'on ignore, et un seul « Tout rentrer ». Le chiffre qui prouve la lecture
// — la somme des lignes contre le total du papier — est dit en clair.

import type { LigneDuTicket } from "../db/tickets";
import type { TicketLu } from "../model/ticket";
import {
  proposer,
  quantiteDe,
  type Appris,
  type Candidat,
} from "../model/ticketCorrespondance";
import type { Catalogue, Quantite } from "../model/types";

export interface Rangee {
  rang: number;
  cle: string;
  libelle: string;
  vendeur: string;
  net: number;
  douteux: boolean;
  opaque: boolean;
  reconnu: boolean;
  /** id, `null` = pas pour la cuisine, `undefined` = pas encore choisi. */
  ingredient: string | null | undefined;
  suggestions: Candidat[];
  unites: number;
  parUnite: Quantite | null;
  ignoree: boolean;
}

export function rangeesDu(
  lu: TicketLu,
  appris: ReadonlyMap<string, Appris>,
  candidats: readonly Candidat[],
  catalogue: Catalogue,
): Rangee[] {
  return lu.lignes.map((l) => {
    const p = proposer(lu.enseigne, l, appris, candidats);
    const q = p.ingredient ? quantiteDe(l, p.ingredient, catalogue) : { unites: Math.max(1, l.quantite), parUnite: null };
    return {
      rang: l.rang,
      cle: p.cle,
      libelle: l.libelle,
      vendeur: l.vendeur,
      net: l.net,
      douteux: l.douteux,
      opaque: l.opaque,
      reconnu: p.reconnu,
      ingredient: p.ingredient,
      suggestions: p.suggestions,
      ...q,
      // Une ligne de comptoir n'a pas d'article : on ne la rentre pas à
      // l'aveugle. « pas pour la cuisine » appris : ignorée d'office.
      ignoree: l.opaque || p.ingredient === null,
    };
  });
}

/** Le doigt a choisi : la quantité se recalcule pour CET ingrédient (format
 *  du fond), et la rangée n'est plus « reconnue » mais choisie. */
export function choisir(
  r: Rangee,
  ingredient: string | null,
  lu: TicketLu,
  catalogue: Catalogue,
): Rangee {
  const ligne = lu.lignes[r.rang]!;
  const q = ingredient ? quantiteDe(ligne, ingredient, catalogue) : { unites: r.unites, parUnite: r.parUnite };
  return { ...r, ingredient, reconnu: false, ...q, ignoree: ingredient === null };
}

/** Ce qui part en base : les rangées décidées. Une rangée ignorée sans choix
 *  n'apprend rien — l'ignorer une fois n'est pas dire « jamais ». */
export function aRentrer(rangees: readonly Rangee[]): LigneDuTicket[] {
  return rangees
    .filter((r) => r.ingredient !== undefined && (r.ingredient === null || !r.ignoree))
    .map((r) => ({ cle: r.cle, ingredient: r.ingredient ?? null, unites: r.unites, parUnite: r.parUnite, prixTTC: r.net }));
}

export const nbAuStock = (rangees: readonly Rangee[]): number =>
  rangees.filter((r) => typeof r.ingredient === "string" && !r.ignoree).length;

export const nbSansChoix = (rangees: readonly Rangee[]): number =>
  rangees.filter((r) => r.ingredient === undefined && !r.ignoree).length;

export const euros = (x: number): string => `${x.toFixed(2).replace(".", ",")} €`;

/** « 1 060 g », « 2 × 500 g », « 1 » — ce qui rentrera. */
export function quantiteLisible(r: Pick<Rangee, "unites" | "parUnite">): string {
  if (!r.parUnite) return `${r.unites}`;
  const p = `${r.parUnite.amount.toLocaleString("fr-FR")} ${r.parUnite.unit}`;
  return r.unites === 1 ? p : `${r.unites} × ${p}`;
}

/** La phrase qui dit si la lecture tient : somme des lignes contre le papier. */
export function phraseDuTotal(lu: TicketLu): { texte: string; ok: boolean } {
  if (lu.totalImprime === null)
    return { texte: `Les lignes font ${euros(lu.sommeNets)} — le total n’a pas été lu.`, ok: false };
  if (lu.concorde) return { texte: `Les lignes font ${euros(lu.sommeNets)}, comme le ticket.`, ok: true };
  return {
    texte: `Les lignes font ${euros(lu.sommeNets)}, le ticket dit ${euros(lu.totalImprime)} : une ligne a été mal lue ou manque.`,
    ok: false,
  };
}

/** Les articles de la liste en cours, par ingrédient — pour les cocher. */
export function listeParIngredient(articles: readonly { ligne: { id: string; unit: string } }[]): Map<string, string[]> {
  const m = new Map<string, string[]>();
  for (const a of articles) m.set(a.ligne.id, [...(m.get(a.ligne.id) ?? []), a.ligne.unit]);
  return m;
}
