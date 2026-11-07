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
import { motif, type ReleveLu } from "../model/releveBancaire";
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

  return b.transaction("rw", b.operations, b.comptes, async () => {
    const existantes = await b.operations.bulkGet(ops.map((o) => o.cle));
    const deja = existantes.filter(Boolean).length;
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

export async function lireReleves(b: Base = baseApp): Promise<DonneesReleves> {
  const [comptes, operations, regles] = await Promise.all([b.comptes.toArray(), b.operations.toArray(), b.classements.toArray()]);
  return { comptes, operations, regles: new Map(regles.map((r) => [r.motif, r.classement])) };
}

export const useReleves = (): DonneesReleves | undefined => useLiveQuery(() => lireReleves(), []);
