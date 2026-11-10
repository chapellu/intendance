// T179 — Les références du magasin : pour chaque ingrédient, le produit qu'on
// y achète, son code EAN, son conditionnement et son prix relevé.
//
// CE FICHIER NE CONTIENT AUCUNE RÉFÉRENCE. Le dépôt est public, et le magasin
// où un foyer fait son stock, ce qu'il y prend et à quel prix, n'ont rien à y
// faire. Les données vivent dans un Secret du cluster, chiffré dans git, servi
// sous `/prive/` derrière une clé (voir `k8s/` et `db/references.ts`). Ici, il
// n'y a que leur FORME, et le contrôle qui refuse un fichier qui ne l'a pas.
//
// UNE RÉFÉRENCE DIT TROIS CHOSES DIFFÉRENTES, d'où `statut` :
//   - `ok` : le produit est celui que la recette demande ;
//   - `approx` : le magasin n'a qu'un cousin (surgelé pour frais, conserve
//     pour sec) — la `note` dit lequel ;
//   - `absent` : le magasin ne l'a pas. Ce n'est pas une erreur : le frais et
//     la boucherie s'achètent ailleurs.

export type Statut = "ok" | "approx" | "absent";

export interface Reference {
  statut: Statut;
  produit?: string;
  ean?: string;
  conditionnement?: string;
  /** Le prix relevé, en euros, hors promotion. */
  prix?: number;
  note?: string;
}

export interface References {
  /** Le jour du relevé, `AAAA-MM-JJ` : un prix vieux de six mois se dit. */
  releve: string;
  /** Un nom court pour l'écran (« le drive »), jamais une adresse. */
  magasin: string;
  /** Par id d'ingrédient du catalogue. */
  articles: Readonly<Record<string, Reference>>;
}

const STATUTS: readonly Statut[] = ["ok", "approx", "absent"];
const JOUR = /^\d{4}-\d{2}-\d{2}$/;
const EAN = /^\d{8,14}$/;

const estObjet = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);

/**
 * Lit le fichier, ou lève avec la raison. UN FICHIER À MOITIÉ BON EST REFUSÉ
 * EN ENTIER : il vient d'une main qui l'a édité puis chiffré, et un prix lu de
 * travers sur une ligne dit que les autres peuvent l'être aussi.
 */
export function lireReferences(brut: unknown): References {
  if (!estObjet(brut)) throw new Error("références : un objet est attendu");
  const { releve, magasin, articles } = brut;
  if (typeof releve !== "string" || !JOUR.test(releve)) throw new Error("références : `releve` doit être un jour AAAA-MM-JJ");
  if (typeof magasin !== "string" || !magasin.trim()) throw new Error("références : `magasin` est vide");
  if (!estObjet(articles)) throw new Error("références : `articles` doit être un objet par ingrédient");
  const out: Record<string, Reference> = {};
  for (const [id, a] of Object.entries(articles)) {
    const ou = `références : « ${id} »`;
    if (!estObjet(a)) throw new Error(`${ou} n'est pas un objet`);
    if (!STATUTS.includes(a["statut"] as Statut)) throw new Error(`${ou} : statut « ${String(a["statut"])} » inconnu`);
    const r: Reference = { statut: a["statut"] as Statut };
    for (const champ of ["produit", "conditionnement", "note"] as const) {
      const v = a[champ];
      if (v === undefined || v === "") continue;
      if (typeof v !== "string") throw new Error(`${ou} : \`${champ}\` doit être un texte`);
      r[champ] = v;
    }
    if (a["ean"] !== undefined && a["ean"] !== "") {
      if (typeof a["ean"] !== "string" || !EAN.test(a["ean"])) throw new Error(`${ou} : EAN « ${String(a["ean"])} » illisible`);
      r.ean = a["ean"];
    }
    if (a["prix"] !== undefined && a["prix"] !== null) {
      if (typeof a["prix"] !== "number" || !(a["prix"] > 0)) throw new Error(`${ou} : prix invalide`);
      r.prix = a["prix"];
    }
    // Une référence trouvée sans produit ne dit rien à qui est devant le rayon.
    if (r.statut !== "absent" && !r.produit) throw new Error(`${ou} : statut « ${r.statut} » sans produit`);
    out[id] = r;
  }
  return { releve, magasin: magasin.trim(), articles: out };
}

/** La référence d'un ingrédient — par son id d'achat, alias résolu par l'appelant. */
export const referenceDe = (refs: References | null | undefined, id: string): Reference | null =>
  refs?.articles[id] ?? null;

/** « 1,79 € » — le prix comme on le lit sur l'étiquette. */
export const prixLisible = (p: number): string => `${p.toFixed(2).replace(".", ",")} €`;

/** Ce que la ligne de courses dit du magasin, ou rien. */
export function phraseDeReference(r: Reference | null, magasin: string): string | null {
  if (!r) return null;
  if (r.statut === "absent") return `pas au ${magasin}${r.note ? ` — ${r.note}` : ""}`;
  const morceaux = [r.produit, r.conditionnement, r.prix != null ? prixLisible(r.prix) : null].filter(Boolean);
  return `${r.statut === "approx" ? "≈ " : ""}${morceaux.join(" · ")}`;
}

/** Combien de jours depuis le relevé — l'écran dit un prix ancien. */
export function ageDuReleve(refs: References, aujourdhui: string): number {
  const j = (s: string) => Date.UTC(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10)));
  return Math.round((j(aujourdhui) - j(refs.releve)) / 86_400_000);
}
