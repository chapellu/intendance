// UN PROJET DÉTAILLÉ EN POSTES — un gros projet n'est pas une ligne.
//
// Un projet d'épargne « 12 000 € pour juin » tient en une ligne. Un projet de
// plusieurs centaines de milliers d'euros, non : son total n'est qu'une somme,
// et chaque poste qui la compose a sa vie à lui —
//   - son MONTANT, qui ne se saisit pas toujours tel quel : une quantité par
//     un prix unitaire, ou la part d'un autre poste (des frais qui suivent un
//     prix, une marge pour imprévus qui suit le plus gros poste) ;
//   - son MOMENT : tout ne se paie pas le même mois ;
//   - sa CERTITUDE : estimé, sur devis, payé. Un total fait d'estimations n'est
//     pas le même total qu'un total fait de devis signés, et l'écran le dit.
//
// CE QU'IL FAUT ÉPARGNER N'EST PAS LE TOTAL. C'est le total moins ce que
// d'autres financent : un prêt, la vente d'un bien, un don. Un projet détaillé
// tire de là la cible de son épargne — elle se recalcule à chaque poste qu'on
// précise.

export type Calcul =
  | { sorte: "montant"; montant: number }
  /** `quantite` en unités (des m², des jours, des pièces), `prix` en centimes. */
  | { sorte: "quantite"; quantite: number; prix: number }
  /** `taux` en points de base — 750, c'est 7,5 % — de `de`, l'id d'un autre poste. */
  | { sorte: "part"; taux: number; de: string };

export type Certitude = "estime" | "devis" | "paye";
export const CERTITUDES: readonly Certitude[] = ["estime", "devis", "paye"];
export const NOM_CERTITUDE: Record<Certitude, string> = { estime: "Estimé", devis: "Sur devis", paye: "Payé" };

export interface Poste {
  id: string;
  nom: string;
  /** Le regroupement, en texte libre : les postes d'un même groupe se lisent
   *  ensemble et se totalisent. Vide : « Autres ». */
  groupe: string;
  calcul: Calcul;
  /** Le mois où il se paie, `AAAA-MM` — `null` tant qu'on ne sait pas. */
  quand: string | null;
  certitude: Certitude;
}

export type SorteFinancement = "pret" | "vente" | "don" | "autre";
export const SORTES_FINANCEMENT: readonly SorteFinancement[] = ["pret", "vente", "don", "autre"];
export const NOM_FINANCEMENT: Record<SorteFinancement, string> = { pret: "Prêt", vente: "Vente", don: "Don", autre: "Autre" };

/** Ce qui finance le projet SANS venir de l'épargne. */
export interface Financement {
  id: string;
  nom: string;
  sorte: SorteFinancement;
  montant: number;
}

export interface Detail {
  postes: Poste[];
  financements: Financement[];
}

export const SANS_GROUPE = "Autres";

/* ──────────────────────────────────────────────────────────── les montants */

/**
 * Le montant d'un poste, en centimes. Une part se calcule sur le poste qu'elle
 * vise, lui-même peut-être une part : on suit la chaîne. UNE BOUCLE (A est une
 * part de B, B une part de A) VAUT ZÉRO plutôt que de tourner sans fin — et
 * une part d'un poste disparu aussi.
 */
export function montantDe(p: Poste, tous: readonly Poste[], vus: ReadonlySet<string> = new Set()): number {
  const c = p.calcul;
  if (c.sorte === "montant") return c.montant;
  if (c.sorte === "quantite") return Math.round(c.quantite * c.prix);
  if (vus.has(p.id)) return 0;
  const base = tous.find((x) => x.id === c.de);
  if (!base) return 0;
  return Math.round((montantDe(base, tous, new Set([...vus, p.id])) * c.taux) / 10_000);
}

export interface LignePoste {
  poste: Poste;
  montant: number;
}

export interface Groupe {
  nom: string;
  total: number;
  lignes: LignePoste[];
}

export interface Chiffrage {
  total: number;
  /** Dans l'ordre où chaque groupe apparaît pour la première fois. */
  groupes: Groupe[];
  /** Ce que financent le prêt, la vente, les dons. */
  finance: number;
  /** Le total moins ce qui est financé : la cible de l'épargne. Jamais négatif. */
  aEpargner: number;
  /** Ce qui est financé au-delà du total — un prêt trop grand, par exemple. */
  excedent: number;
  /** La part du total à chaque degré de certitude, en centimes. */
  parCertitude: Record<Certitude, number>;
  /** Ce qui tombe chaque mois, dans l'ordre ; `null` en dernier : sans date. */
  parMois: { mois: string | null; total: number }[];
}

export function chiffrer(d: Detail): Chiffrage {
  const lignes = d.postes.map((poste) => ({ poste, montant: montantDe(poste, d.postes) }));
  const groupes: Groupe[] = [];
  for (const l of lignes) {
    const nom = l.poste.groupe.trim() || SANS_GROUPE;
    let g = groupes.find((x) => x.nom === nom);
    if (!g) groupes.push((g = { nom, total: 0, lignes: [] }));
    g.total += l.montant;
    g.lignes.push(l);
  }
  const total = lignes.reduce((s, l) => s + l.montant, 0);
  const finance = d.financements.reduce((s, f) => s + f.montant, 0);
  const parCertitude: Record<Certitude, number> = { estime: 0, devis: 0, paye: 0 };
  const mois = new Map<string | null, number>();
  for (const l of lignes) {
    parCertitude[l.poste.certitude] += l.montant;
    mois.set(l.poste.quand, (mois.get(l.poste.quand) ?? 0) + l.montant);
  }
  const parMois = [...mois.entries()]
    .map(([m, t]) => ({ mois: m, total: t }))
    .sort((a, b) => (a.mois === null ? 1 : b.mois === null ? -1 : a.mois < b.mois ? -1 : a.mois > b.mois ? 1 : 0));
  return {
    total,
    groupes,
    finance,
    aEpargner: Math.max(0, total - finance),
    excedent: Math.max(0, finance - total),
    parCertitude,
    parMois,
  };
}

/* ──────────────────────────────────────────────────── une liste collée */

export interface Lecture {
  postes: Poste[];
  /** Les lignes qu'on n'a pas comprises, avec leur numéro (à partir de 1). */
  erreurs: { ligne: number; texte: string; raison: string }[];
}

const nombre = (t: string): number | null => {
  const net = t.replace(/[\s  ]/g, "").replace(",", ".");
  return /^\d+(\.\d+)?$/.test(net) ? Number(net) : null;
};

const euros = (t: string): number | null => {
  const n = nombre(t.replace(/€/g, ""));
  return n === null ? null : Math.round(n * 100);
};

/**
 * Une liste de postes, collée depuis des notes — une ligne par poste :
 *
 *     Groupe / Nom : valeur
 *
 * Le groupe est facultatif. La valeur est un montant (« 3 000 »), une
 * quantité par un prix (« 40 × 60 », « 40 m² x 60 »), ou une part d'un
 * autre poste de la liste, désigné par son nom (« 10 % de Sol »).
 *
 * C'est le moyen de ne pas saisir vingt postes au doigt : on les écrit où l'on
 * veut, on les colle ici. Les lignes vides et celles qui commencent par « # »
 * sont ignorées ; une ligne incomprise est rendue avec sa raison, sans
 * empêcher les autres d'entrer.
 */
export function lireListe(texte: string, id: (i: number) => string = (i) => `p${i}`): Lecture {
  const lus: { groupe: string; nom: string; valeur: string; ligne: number; texte: string }[] = [];
  const erreurs: Lecture["erreurs"] = [];
  texte.split(/\r?\n/).forEach((brute, i) => {
    const t = brute.trim();
    if (!t || t.startsWith("#")) return;
    const deuxPoints = t.lastIndexOf(":");
    if (deuxPoints < 0) return void erreurs.push({ ligne: i + 1, texte: t, raison: "il manque « : » avant la valeur" });
    const tete = t.slice(0, deuxPoints).trim();
    const valeur = t.slice(deuxPoints + 1).trim();
    const barre = tete.indexOf("/");
    const groupe = barre >= 0 ? tete.slice(0, barre).trim() : "";
    const nom = (barre >= 0 ? tete.slice(barre + 1) : tete).trim();
    if (!nom) return void erreurs.push({ ligne: i + 1, texte: t, raison: "le poste n’a pas de nom" });
    lus.push({ groupe, nom, valeur, ligne: i + 1, texte: t });
  });

  const ids = lus.map((_, i) => id(i));
  const postes: Poste[] = [];
  lus.forEach((l, i) => {
    const base = { id: ids[i]!, nom: l.nom, groupe: l.groupe, quand: null, certitude: "estime" as const };
    const part = /^(\d+(?:[.,]\d+)?)\s*%\s*(?:de\s+|d[’']\s*)?(.+)$/i.exec(l.valeur);
    if (part) {
      const cible = lus.findIndex((x) => x.nom.toLowerCase() === part[2]!.trim().toLowerCase());
      if (cible < 0) return void erreurs.push({ ligne: l.ligne, texte: l.texte, raison: `aucun poste ne s’appelle « ${part[2]!.trim()} »` });
      postes.push({ ...base, calcul: { sorte: "part", taux: Math.round(nombre(part[1]!)! * 100), de: ids[cible]! } });
      return;
    }
    const fois = /^(.+?)\s*(?:m²|m2)?\s*[x×*]\s*(.+)$/i.exec(l.valeur);
    if (fois) {
      const q = nombre(fois[1]!.replace(/m²|m2/i, ""));
      const p = euros(fois[2]!);
      if (q === null || p === null) return void erreurs.push({ ligne: l.ligne, texte: l.texte, raison: "une quantité par un prix, par exemple 40 × 60" });
      postes.push({ ...base, calcul: { sorte: "quantite", quantite: q, prix: p } });
      return;
    }
    const m = euros(l.valeur);
    if (m === null) return void erreurs.push({ ligne: l.ligne, texte: l.texte, raison: "un montant, une quantité × un prix, ou « 10 % de … »" });
    postes.push({ ...base, calcul: { sorte: "montant", montant: m } });
  });
  return { postes, erreurs };
}
