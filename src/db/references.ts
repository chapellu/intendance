// T179 — Les références du magasin, côté téléphone.
//
// LE FICHIER EST SERVI SOUS `/prive/`, DERRIÈRE UNE CLÉ. La passerelle du
// cluster (`k8s/securitypolicy.yaml`, `apiKeyAuth`) refuse toute requête sans
// l'en-tête `x-intendance-cle` : le site reste public, ce fichier non. Une clé
// plutôt qu'une connexion Google, parce qu'une app installée sur l'écran
// d'accueil d'un iPhone a ses propres cookies et ne suit pas une redirection
// de connexion : un en-tête, lui, part de la même façon partout.
//
// LA CLÉ ET LA COPIE VIVENT DANS `reglages`, comme le reste de ce que le foyer
// saisit. La copie fait marcher la liste hors ligne, dans un rayon sans réseau ;
// elle se rafraîchit à l'ouverture des courses quand le réseau répond, et
// garde l'ancienne quand il ne répond pas.

import { useLiveQuery } from "dexie-react-hooks";
import { lireReferences, type References } from "../model/references";
import { base as baseApp, type Base } from "./schema";

export const CLE_CLE = "magasin|cle";
export const CLE_REFERENCES = "magasin|references";
export const URL_REFERENCES = "/prive/references.json";
export const ENTETE = "x-intendance-cle";

export interface Copie {
  refs: References;
  /** Quand la copie a été reçue, en ms. */
  recu: number;
}

export type Issue =
  | { sorte: "recu"; copie: Copie }
  | { sorte: "sans-cle" }
  | { sorte: "refusee" }
  | { sorte: "absent" }
  | { sorte: "hors-ligne" }
  | { sorte: "illisible"; raison: string };

export async function poserCle(cle: string, b: Base = baseApp): Promise<void> {
  const c = cle.trim();
  if (c) await b.reglages.put({ cle: CLE_CLE, valeur: c, maj: Date.now() });
  else await b.reglages.delete(CLE_CLE);
}

/**
 * Va chercher le fichier, et ne remplace la copie QUE par un fichier lu en
 * entier. Une clé refusée, un réseau absent, un fichier illisible laissent la
 * copie d'avant en place : un rayon n'est pas l'endroit où perdre ses prix.
 */
export async function rafraichirReferences(b: Base = baseApp, f: typeof fetch = fetch): Promise<Issue> {
  const cle = (await b.reglages.get(CLE_CLE))?.valeur;
  if (typeof cle !== "string" || !cle) return { sorte: "sans-cle" };
  let r: Response;
  try {
    r = await f(URL_REFERENCES, { headers: { [ENTETE]: cle }, cache: "no-store" });
  } catch {
    return { sorte: "hors-ligne" };
  }
  if (r.status === 401 || r.status === 403) return { sorte: "refusee" };
  if (r.status === 404) return { sorte: "absent" };
  if (!r.ok) return { sorte: "hors-ligne" };
  let refs: References;
  try {
    refs = lireReferences(await r.json());
  } catch (e) {
    return { sorte: "illisible", raison: e instanceof Error ? e.message : String(e) };
  }
  const copie: Copie = { refs, recu: Date.now() };
  await b.reglages.put({ cle: CLE_REFERENCES, valeur: copie, maj: copie.recu });
  return { sorte: "recu", copie };
}

export async function lireCopie(b: Base = baseApp): Promise<{ copie: Copie | null; aUneCle: boolean }> {
  const [c, k] = await Promise.all([b.reglages.get(CLE_REFERENCES), b.reglages.get(CLE_CLE)]);
  let copie: Copie | null = null;
  // La copie est relue à travers le même contrôle : une forme qui a changé
  // entre deux versions de l'app ne doit pas passer pour une référence.
  if (c && typeof c.valeur === "object" && c.valeur) {
    try {
      const v = c.valeur as Copie;
      copie = { refs: lireReferences(v.refs), recu: v.recu };
    } catch {
      copie = null;
    }
  }
  return { copie, aUneCle: typeof k?.valeur === "string" && !!k.valeur };
}

export const useReferences = () => useLiveQuery(() => lireCopie(), []);

/** Ce que l'écran dit d'une issue, en une phrase. */
export function phraseDIssue(i: Issue): string {
  switch (i.sorte) {
    case "recu":
      return `${Object.keys(i.copie.refs.articles).length} références reçues.`;
    case "sans-cle":
      return "Pas de clé : collez-la pour recevoir les références.";
    case "refusee":
      return "Clé refusée.";
    case "absent":
      return "Le serveur n’a pas de références à servir.";
    case "hors-ligne":
      return "Pas de réseau : la copie d’avant reste.";
    case "illisible":
      return `Fichier refusé — ${i.raison}`;
  }
}
