// Le budget en base — ce qu'un doigt a saisi, et rien de ce qui s'en déduit.
//
// PERSISTÉ : les échéances, les enveloppes, les revenus, le solde relevé du
// compte des provisions (avec le jour du relevé), les projets d'épargne et le
// solde du compte courant. RECALCULÉ : la prochaine
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
import type { Projet } from "../model/epargne";
import { base as baseApp, type Base } from "./schema";

export const CLE_REVENUS = "budget|revenus";
export const CLE_SOLDE = "budget|solde-provisions";
/** Le jour où l'on a commencé à provisionner — `AAAA-MM-JJ`. Rien n'est exigé
 *  pour avant lui (voir `trajectoire` dans `model/budget.ts`). */
export const CLE_DEPART = "budget|depart-provisions";

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

/**
 * Relever le solde du compte des provisions. LE PREMIER RELEVÉ POSE LE DÉPART :
 * c'est le jour où l'on commence vraiment, même à zéro euro — avant lui, il
 * n'y avait pas de livret à remplir, et l'app n'a rien à exiger.
 */
export async function releverSolde(r: Releve, b: Base = baseApp): Promise<void> {
  await b.transaction("rw", b.reglages, async () => {
    await b.reglages.put({ cle: CLE_SOLDE, valeur: r, maj: Date.now() });
    if (!(await b.reglages.get(CLE_DEPART))) await b.reglages.put({ cle: CLE_DEPART, valeur: r.jour, maj: Date.now() });
  });
}

/**
 * OÙ DORMENT LES PROVISIONS. Retour du 9/11 : « et si l'argent reste sur le
 * compte courant ? quel intérêt d'introduire encore un nouveau compte ? » —
 * aucun, s'il n'en veut pas. Deux façons de faire, et l'app suit les deux :
 *   - « livret » : un compte à part, qu'un virement mensuel remplit ; le
 *     solde relevé EST le compte des provisions ;
 *   - « courant » : l'argent reste sur le compte courant ; le solde relevé est
 *     celui du compte, et l'app y marque la part RÉSERVÉE aux factures à
 *     venir — le reste est ce qui est vraiment disponible.
 */
export type Lieu = "livret" | "courant";
export const CLE_LIEU = "budget|lieu-provisions";

export async function poserLieu(lieu: Lieu, b: Base = baseApp): Promise<void> {
  await b.reglages.put({ cle: CLE_LIEU, valeur: lieu, maj: Date.now() });
}

/** Corriger le départ — on provisionnait déjà avant d'utiliser l'app. */
export async function poserDepart(jour: string, b: Base = baseApp): Promise<void> {
  await b.reglages.put({ cle: CLE_DEPART, valeur: jour, maj: Date.now() });
}

/* ────────────────────────────────────────────────────────────── l'épargne */

/** Les projets, DANS L'ORDRE : le rang est la priorité, et c'est la seule
 *  chose que l'ordre du tableau dit. */
export const CLE_PROJETS = "budget|projets";
/** Le solde du compte courant, quand les provisions dorment AILLEURS. Quand
 *  elles y dorment, c'est le même compte, et le même relevé (`CLE_SOLDE`) :
 *  le saisir deux fois, ce serait pouvoir le saisir faux une fois. */
export const CLE_COURANT = "budget|solde-courant";

export async function poserProjets(p: readonly Projet[], b: Base = baseApp): Promise<void> {
  if (p.length) await b.reglages.put({ cle: CLE_PROJETS, valeur: [...p], maj: Date.now() });
  else await b.reglages.delete(CLE_PROJETS);
}

/** Relever le compte courant — par le relevé des provisions s'il le porte. */
export async function releverCourant(r: Releve, lieu: Lieu | null, b: Base = baseApp): Promise<void> {
  if (lieu === "courant") await releverSolde(r, b);
  else await b.reglages.put({ cle: CLE_COURANT, valeur: r, maj: Date.now() });
}

/* ──────────────────────────────────────────────────────────────── lectures */

export interface DonneesBudget {
  echeances: Echeance[];
  enveloppes: Enveloppe[];
  revenus: Revenu[];
  solde: Releve | null;
  /** Le départ des provisions, posé au premier relevé. */
  depart: string | null;
  /** Où dorment les provisions — `null` tant qu'on n'a pas choisi. */
  lieu: Lieu | null;
  projets: Projet[];
  /** Le compte courant relevé à part — `null` quand les provisions y dorment
   *  (c'est alors `solde`), ou tant qu'on ne l'a pas relevé. */
  courant: Releve | null;
}

export async function lireBudget(b: Base = baseApp): Promise<DonneesBudget> {
  const [echeances, enveloppes, revenus, solde, depart, lieu, projets, courant] = await Promise.all([
    b.echeances.toArray(),
    b.enveloppes.toArray(),
    b.reglages.get(CLE_REVENUS),
    b.reglages.get(CLE_SOLDE),
    b.reglages.get(CLE_DEPART),
    b.reglages.get(CLE_LIEU),
    b.reglages.get(CLE_PROJETS),
    b.reglages.get(CLE_COURANT),
  ]);
  return {
    echeances,
    enveloppes,
    revenus: (revenus?.valeur as Revenu[] | undefined) ?? [],
    solde: (solde?.valeur as Releve | undefined) ?? null,
    depart: (depart?.valeur as string | undefined) ?? null,
    lieu: (lieu?.valeur as Lieu | undefined) ?? null,
    projets: (projets?.valeur as Projet[] | undefined) ?? [],
    courant: (courant?.valeur as Releve | undefined) ?? null,
  };
}

/** Tout le budget, vivant. `undefined` tant que la base n'a pas répondu — un
 *  écran qui afficherait « capacité : 0 € » le temps d'un rendu dirait une
 *  chose fausse, et c'est la seule ligne qu'on lit. */
export const useBudget = (): DonneesBudget | undefined => useLiveQuery(() => lireBudget(), []);
