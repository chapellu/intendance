// Les relevés en base — comptes, opérations, règles de classement.
//
// L'IBAN NE S'ÉCRIT NULLE PART. Il sert à reconnaître le compte d'un relevé à
// l'autre ; une empreinte SHA-256 suffit à ça, et c'est tout ce qui est gardé,
// avec quatre chiffres pour que l'écran dise « •••• 1234 ». Le relevé lui-même
// (le PDF) n'est jamais conservé : il est lu en mémoire, puis oublié.
//
// RÉIMPORTER UN RELEVÉ NE DOUBLE RIEN. La clé d'une opération est faite de ce
// qu'elle EST — compte, jour, montant, libellé — et de son rang parmi ses
// jumelles du même relevé (deux cafés le même jour au même prix sont deux
// opérations). Le même relevé relu donne les mêmes clés ; un relevé qui
// chevauche le précédent retombe sur les opérations déjà là.

import { useLiveQuery } from "dexie-react-hooks";
import { accentsIso646, motif, type ReleveLu } from "../model/releveBancaire";
import type { Classement, OperationEnBase } from "../model/reel";
import { base as baseApp, type Base, type Compte } from "./schema";

async function empreinte(texte: string): Promise<string> {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texte));
  return [...new Uint8Array(h)].slice(0, 12).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export interface Import {
  compte: Compte;
  nouvelles: number;
  deja: number;
}

export async function importerReleve(r: ReleveLu, b: Base = baseApp): Promise<Import> {
  // Sans IBAN lisible, le compte se reconnaît à son gabarit : deux comptes
  // sans IBAN dans le même gabarit se confondraient, ce qui n'arrive pas avec
  // les relevés vus jusqu'ici — l'IBAN y est toujours imprimé.
  const id = await empreinte(r.iban ?? `sans-iban|${r.gabarit}`);
  const fin = r.iban ? r.iban.slice(-6, -2) : "";
  const rangs = new Map<string, number>();
  const ops: OperationEnBase[] = r.operations.map((o) => {
    const base = `${id}|${o.jour}|${o.montant}|${o.libelle}`;
    const rang = rangs.get(base) ?? 0;
    rangs.set(base, rang + 1);
    return { cle: `${base}|${rang}`, compte: id, jour: o.jour, libelle: o.libelle, detail: o.detail, montant: o.montant, motif: motif(o.libelle) };
  });

  if (!ops.length) {
    const avant = await b.comptes.get(id);
    const compte: Compte = { id, nom: avant?.nom ?? (fin ? `Compte •••• ${fin}` : "Compte"), fin, jusquau: avant && avant.jusquau > r.fin ? avant.jusquau : r.fin };
    await b.comptes.put(compte);
    return { compte, nouvelles: 0, deja: 0 };
  }
  const jours = ops.map((o) => o.jour).sort();

  return b.transaction("rw", b.operations, b.comptes, b.classements, async () => {
    // LES OPÉRATIONS DÉJÀ LÀ SE RECONNAISSENT À LEUR IDENTITÉ, PAS À LEUR CLÉ.
    // La clé porte le libellé tel qu'il était lu le jour de l'import ; si la
    // lecture s'améliore (des accents rendus), le même relevé réimporté
    // donnerait d'autres clés, et chaque opération en double. L'identité
    // compare ce qui ne bouge pas : compte, jour, montant, et le libellé
    // réduit à ses lettres et chiffres.
    const enBase = await b.operations.where("jour").between(jours[0]!, jours[jours.length - 1]!, true, true).filter((o) => o.compte === id).toArray();
    const parIdentite = new Map<string, OperationEnBase[]>();
    for (const o of enBase.sort((p, q) => (p.cle < q.cle ? -1 : 1))) {
      const k = identite(o);
      parIdentite.set(k, [...(parIdentite.get(k) ?? []), o]);
    }
    const vus = new Map<string, number>();
    let deja = 0;
    for (const o of ops) {
      const k = identite(o);
      const rang = vus.get(k) ?? 0;
      vus.set(k, rang + 1);
      const ancienne = parIdentite.get(k)?.[rang];
      if (!ancienne) continue;
      deja++;
      if (ancienne.cle === o.cle) continue;
      // Une opération relue autrement : la nouvelle lecture la remplace, et
      // la règle de son ancien motif suit, si le nouveau n'en a pas.
      await b.operations.delete(ancienne.cle);
      if (ancienne.motif !== o.motif && !(await b.classements.get(o.motif))) {
        const regle = await b.classements.get(ancienne.motif);
        if (regle) await b.classements.put({ motif: o.motif, classement: regle.classement });
      }
    }
    await b.operations.bulkPut(ops);
    const avant = await b.comptes.get(id);
    const compte: Compte = {
      id,
      nom: avant?.nom ?? (fin ? `Compte •••• ${fin}` : "Compte"),
      fin,
      jusquau: avant && avant.jusquau > r.fin ? avant.jusquau : r.fin,
    };
    await b.comptes.put(compte);
    return { compte, nouvelles: ops.length - deja, deja };
  });
}

/** Ce qui fait qu'une opération est LA MÊME d'une lecture à l'autre : jour,
 *  montant, et le libellé réduit à ses lettres et chiffres — accents de l'ancien
 *  jeu français compris, pour qu'un « Pr{l}vement » lu hier reconnaisse le
 *  « Prélèvement » lu aujourd'hui. */
export const identite = (o: Pick<OperationEnBase, "jour" | "montant" | "libelle">): string =>
  `${o.jour}|${o.montant}|${accentsIso646(o.libelle)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")}`;

export async function classer(motifDe: string, c: Classement | null, b: Base = baseApp): Promise<void> {
  if (c) await b.classements.put({ motif: motifDe, classement: c });
  else await b.classements.delete(motifDe);
}

export async function renommerCompte(id: string, nom: string, b: Base = baseApp): Promise<void> {
  await b.comptes.update(id, { nom });
}

/** TOUT oublier des relevés : opérations, comptes, règles. Le budget écrit
 *  (échéances, enveloppes, revenus) ne bouge pas. */
export async function oublierLesReleves(b: Base = baseApp): Promise<void> {
  await b.transaction("rw", b.operations, b.comptes, b.classements, async () => {
    await Promise.all([b.operations.clear(), b.comptes.clear(), b.classements.clear()]);
  });
}

export interface DonneesReleves {
  comptes: Compte[];
  operations: OperationEnBase[];
  regles: Map<string, Classement>;
}

/**
 * Tout ce que les relevés ont laissé, prêt pour l'écran.
 *
 * LE MOTIF SE RECALCULE ICI, DEPUIS LE LIBELLÉ : c'est une déduction, et la
 * façon de le déduire s'améliore (une devise ignorée, un accent rendu). Le
 * motif gardé en base est celui du jour de l'import ; s'il diffère, la règle
 * posée sous l'ancien vaut pour le nouveau tant que le nouveau n'a pas la
 * sienne — on ne perd aucun classement en changeant `motif()`.
 */
export async function lireReleves(b: Base = baseApp): Promise<DonneesReleves> {
  const [comptes, enBase, rangees] = await Promise.all([b.comptes.toArray(), b.operations.toArray(), b.classements.toArray()]);
  const regles = new Map(rangees.map((r) => [r.motif, r.classement]));
  const operations = enBase.map((o) => {
    const m = motif(o.libelle);
    if (m === o.motif) return o;
    const ancienne = regles.get(o.motif);
    if (ancienne && !regles.has(m)) regles.set(m, ancienne);
    return { ...o, motif: m };
  });
  return { comptes, operations, regles };
}

export const useReleves = (): DonneesReleves | undefined => useLiveQuery(() => lireReleves(), []);
