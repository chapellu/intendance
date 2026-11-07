// Le budget en base — ce qu'un doigt a saisi, et rien de ce qui s'en déduit.
//
// PERSISTÉ : les échéances, les enveloppes, les revenus, et le solde relevé du
// compte des provisions (avec le jour du relevé). RECALCULÉ : la prochaine
// date, ce qui devrait être de côté, le virement conseillé, la capacité
// d'épargne — tout `model/budget.ts`.
//
// RIEN NE QUITTE LE TÉLÉPHONE. Le dépôt est public et le site n'a pas de
// connexion : c'est parce que la base vit dans le navigateur, et seulement là,
// que des chiffres de foyer peuvent y être saisis. Le jour où ils devront être
// partagés ou sauvegardés ailleurs, c'est une décision à prendre, pas un
// glissement.

import { useLiveQuery } from "dexie-react-hooks";
import type { Echeance, Enveloppe, Revenu } from "../model/budget";
import { base as baseApp, type Base } from "./schema";

export const CLE_REVENUS = "budget|revenus";
export const CLE_SOLDE = "budget|solde-provisions";

/** Le solde du compte des provisions, tel qu'on l'a lu sur l'appli de la banque.
 *  LE JOUR DU RELEVÉ VA AVEC : un solde vieux de deux mois n'est plus une
 *  information, et l'écran doit pouvoir le dire. */
export interface Releve {
  montant: number;
  jour: string;
}

export const nouvelId = (): string =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

/* ─────────────────────────────────────────────────────────────── écritures */

export async function poserEcheance(e: Echeance, b: Base = baseApp): Promise<void> {
  await b.echeances.put(e);
}

export async function retirerEcheance(id: string, b: Base = baseApp): Promise<void> {
  await b.echeances.delete(id);
}

export async function poserEnveloppe(e: Enveloppe, b: Base = baseApp): Promise<void> {
  await b.enveloppes.put(e);
}

export async function retirerEnveloppe(id: string, b: Base = baseApp): Promise<void> {
  await b.enveloppes.delete(id);
}

export async function poserRevenus(r: readonly Revenu[], b: Base = baseApp): Promise<void> {
  if (r.length) await b.reglages.put({ cle: CLE_REVENUS, valeur: [...r], maj: Date.now() });
  else await b.reglages.delete(CLE_REVENUS);
}

export async function releverSolde(r: Releve, b: Base = baseApp): Promise<void> {
  await b.reglages.put({ cle: CLE_SOLDE, valeur: r, maj: Date.now() });
}

/* ──────────────────────────────────────────────────────────────── lectures */

export interface DonneesBudget {
  echeances: Echeance[];
  enveloppes: Enveloppe[];
  revenus: Revenu[];
  solde: Releve | null;
}

export async function lireBudget(b: Base = baseApp): Promise<DonneesBudget> {
  const [echeances, enveloppes, revenus, solde] = await Promise.all([
    b.echeances.toArray(),
    b.enveloppes.toArray(),
    b.reglages.get(CLE_REVENUS),
    b.reglages.get(CLE_SOLDE),
  ]);
  return {
    echeances,
    enveloppes,
    revenus: (revenus?.valeur as Revenu[] | undefined) ?? [],
    solde: (solde?.valeur as Releve | undefined) ?? null,
  };
}

/** Tout le budget, vivant. `undefined` tant que la base n'a pas répondu — un
 *  écran qui afficherait « capacité : 0 € » le temps d'un rendu dirait une
 *  chose fausse, et c'est la seule ligne qu'on lit. */
export const useBudget = (): DonneesBudget | undefined => useLiveQuery(() => lireBudget(), []);
