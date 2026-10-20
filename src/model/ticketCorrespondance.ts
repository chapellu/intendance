// Du libellé de caisse à l'ingrédient du catalogue — T138.
//
// LE VRAI TRAVAIL D'UN LECTEUR DE TICKET EST ICI, pas dans l'OCR : le papier
// n'a ni EAN ni code (sauf le PLU du boucher), et Grand Frais coupe ses
// libellés à 22 caractères — `MELANGE VITALITE + 500`. Rien ne devine sûrement
// ce que c'est. Donc on ne devine pas : la première fois, on PROPOSE trois
// ingrédients et le doigt choisit ; ensuite la table apprise reconnaît.
//
// LA CLÉ EST COMPOSITE — (enseigne, vendeur, libellé) — parce qu'un même
// libellé tronqué ne veut pas dire la même chose chez deux commerçants, et que
// la liste des vendeurs d'un ticket Grand Frais change d'un papier à l'autre.

import type { Catalogue, Quantite } from "./types";
import { formatDe, type Enseigne, type LigneLue } from "./ticket";

export interface Candidat {
  id: string;
  nom: string;
}

/** Ce que la table apprise sait d'une clé : un id, ou `null` = « pas pour la
 *  cuisine » (papier toilette, lessive) — appris lui aussi, pour ne plus
 *  jamais le redemander. */
export interface Appris {
  cle: string;
  ingredient: string | null;
  maj: number;
}

export const cleDuLibelle = (enseigne: Enseigne | string, vendeur: string, libelle: string): string =>
  `${enseigne}|${vendeur.trim().toUpperCase()}|${libelle.trim().toUpperCase()}`;

/** Les ingrédients qu'on peut rentrer : ceux des plats, du placard et du fond.
 *  Le nom retenu est le plus court vu — « poivrons », pas une parenthèse. */
export function candidatsDu(catalogue: Catalogue): Candidat[] {
  const noms = new Map<string, string>();
  const vu = (id: string, nom?: string) => {
    // Un nom de recette peut être une phrase (« poires pas trop grosses,
    // mûres… ») : coupé à la première incise, et l'id s'il reste trop long —
    // une puce de revue doit tenir sur une ligne de téléphone.
    const court = nom?.split(/\s+[—(–]|,/)[0]?.trim();
    const n = court && court.length <= 24 ? court : id.replace(/-/g, " ");
    const avant = noms.get(id);
    if (!avant || n.length < avant.length) noms.set(id, n);
  };
  for (const p of catalogue.plats) for (const i of p.ingredients) vu(i.id, i.nom);
  for (const d of catalogue.gardeManger.denrees) vu(d.ingredient);
  for (const d of catalogue.fond.denrees) vu(d.ingredient);
  return [...noms].map(([id, nom]) => ({ id, nom })).sort((a, b) => a.nom.localeCompare(b.nom, "fr"));
}

/* ════════════════════════════════════════════════════════ ressemblance */

const VIDES = new Set([
  "de", "du", "des", "la", "le", "les", "a", "au", "aux", "en", "et", "ou", "d", "l", "sur",
  "bio", "vrac", "kg", "g", "gr", "cl", "ml", "btl", "bte", "bqte", "botte", "filet", "sachet",
  "france", "pa", "pp", "x", "s", "os", "sans", "avec", "pur", "frais", "fraiche", "fraiches",
]);

function mots(s: string): string[] {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/œ/g, "oe")
    .split(/[^a-z]+/)
    .filter((m) => m.length > 1 && !VIDES.has(m))
    .map((m) => (m.length > 3 ? m.replace(/[sx]$/, "") : m));
}

function distance(a: string, b: string): number {
  const d = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i += 1) {
    let diag = d[0]!;
    d[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const t = d[j]!;
      d[j] = Math.min(d[j]! + 1, d[j - 1]! + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = t;
    }
  }
  return d[b.length]!;
}

/** Deux mots se ressemblent : égaux, l'un tronqué de l'autre, ou une faute. */
function proche(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length >= 3 && b.startsWith(a)) return 0.9; // libellé coupé : « COTELEE » / « CAB »
  if (b.length >= 4 && a.startsWith(b)) return 0.8;
  if (Math.min(a.length, b.length) >= 5 && distance(a, b) <= 1) return 0.8;
  return 0;
}

function score(libelle: string[], c: Candidat): number {
  const ids = mots(c.id.replace(/-/g, " "));
  const noms = mots(c.nom).slice(0, 6);
  let total = 0;
  const idsTouches = new Set<number>();
  let premier = 0;
  libelle.forEach((a, rang) => {
    let meilleur = 0;
    ids.forEach((b, k) => {
      const s = proche(a, b);
      if (s > 0) idsTouches.add(k);
      meilleur = Math.max(meilleur, s);
    });
    for (const b of noms) meilleur = Math.max(meilleur, proche(a, b) * 0.85);
    // Le premier mot d'un libellé est presque toujours le produit : « MELON
    // CHARENTAIS JAUNE » n'est pas des jeunes pousses parce que jaune ≈ jeune.
    if (rang === 0) premier = meilleur;
    total += rang === 0 ? meilleur * 1.5 : meilleur;
  });
  if (total === 0) return 0;
  const manques = ids.length - idsTouches.size;
  return (total / (libelle.length + 0.5 + 0.6 * manques)) * (premier > 0 ? 1 : 0.4);
}

/** Les `n` ingrédients qui ressemblent le plus au libellé, du meilleur au moins bon. */
export function suggerer(libelle: string, candidats: readonly Candidat[], n = 3): Candidat[] {
  const l = mots(libelle);
  if (!l.length) return [];
  return candidats
    .map((c) => [c, score(l, c)] as const)
    .filter(([, s]) => s > 0.2)
    .sort((a, b) => b[1] - a[1] || a[0].id.length - b[0].id.length)
    .slice(0, n)
    .map(([c]) => c);
}

/* ════════════════════════════════════════════════════════ proposition */

export interface Proposition {
  cle: string;
  /** L'id retenu, `null` = pas pour la cuisine, `undefined` = à choisir. */
  ingredient: string | null | undefined;
  /** Vrai quand c'est la table apprise qui a répondu. */
  reconnu: boolean;
  suggestions: Candidat[];
}

export function proposer(
  enseigne: Enseigne,
  ligne: LigneLue,
  appris: ReadonlyMap<string, Appris>,
  candidats: readonly Candidat[],
): Proposition {
  const cle = cleDuLibelle(enseigne, ligne.vendeur, ligne.libelle);
  const a = appris.get(cle);
  const suggestions = suggerer(ligne.libelle, candidats);
  if (a) return { cle, ingredient: a.ingredient, reconnu: true, suggestions };
  return { cle, ingredient: undefined, reconnu: false, suggestions };
}

/**
 * Ce qui rentre au stock pour une ligne : le poids pesé (kg → g), sinon le
 * nombre × le format — lu dans le libellé (« OIGNON FILET 1,5KG ») ou dans
 * l'unité du fond (« sachet de 500 g ») —, sinon le nombre seul, non chiffré.
 */
export function quantiteDe(
  ligne: Pick<LigneLue, "libelle" | "poidsKg" | "quantite">,
  ingredient: string,
  catalogue: Catalogue,
): { unites: number; parUnite: Quantite | null } {
  if (ligne.poidsKg) return { unites: 1, parUnite: { amount: Math.round(ligne.poidsKg * 1000), unit: "g" } };
  const fond = catalogue.fond.denrees.find((d) => d.ingredient === ingredient);
  const format = formatDe(ligne.libelle) ?? (fond ? formatDe(fond.unite) : null);
  return { unites: Math.max(1, ligne.quantite), parUnite: format };
}
