// LE FRIGO ET LE CONGÉLATEUR POUR CE QUI S'ACHÈTE CRU — T187.
//
// « J'ai le sentiment que dans le stock on ne gère aucun poisson ni aucune
// viande » (12/11). Ils entraient, mais par la petite porte : « Rangé où ? » ne
// proposait que les placards du relevé, la porte se devinait au rayon (un colin
// SURGELÉ finissait au frigo), et un poulet s'affichait « 1 » sans dire qu'il
// avait deux jours devant lui.
//
// DEUX ZONES DE PLUS, PAS UN SECOND STOCK. `frigo` et `congelo` sont des
// valeurs de `LotPlacard.zone` comme les autres : le rejeu, les cuissons, les
// observations et `deplacer` les traitent sans le savoir. Ce module ne dit que
// trois choses : la porte par défaut d'un achat, sa date limite, et s'il se
// congèle.

import type { Rejeu } from "./journal";
import type { Catalogue, FamilleDeGarde } from "./types";

export const FRIGO = "frigo";
export const CONGELO = "congelo";

/** Les deux zones du froid, dans l'ordre où on les propose. */
export const ZONES_FROID: readonly { id: string; label: string }[] = [
  { id: FRIGO, label: "Frigo" },
  { id: CONGELO, label: "Congélateur" },
];

export const estFroid = (zone: string | null | undefined): zone is "frigo" | "congelo" =>
  zone === FRIGO || zone === CONGELO;

const PORTE_DU_RAYON: Record<string, "frigo" | "congelo"> = {
  crèmerie: FRIGO,
  frais: FRIGO,
  boucherie: FRIGO,
  poissonnerie: FRIGO,
  surgelés: CONGELO,
};

/** Le rayon d'un ingrédient (alias résolu), `null` hors du vocabulaire. */
export function rayonDe(catalogue: Catalogue, id: string): string | null {
  const alias = (x: string) => catalogue.rayons.aliases[x] ?? x;
  const cible = alias(id);
  for (const [r, ids] of Object.entries(catalogue.rayons.rayons)) if (ids.some((x) => alias(x) === cible)) return r;
  return null;
}

/** La porte du froid qu'un achat prend d'office : son rayon la dit. `null`
 *  pour tout ce qui va au placard ou à la corbeille à fruits. */
export const porteDuRayon = (catalogue: Catalogue, id: string): "frigo" | "congelo" | null =>
  PORTE_DU_RAYON[rayonDe(catalogue, id) ?? ""] ?? null;

/** La famille de garde d'un ingrédient (`conservation.yaml:familles`). */
export function familleDe(catalogue: Catalogue, id: string): FamilleDeGarde | null {
  const alias = (x: string) => catalogue.rayons.aliases[x] ?? x;
  const cible = alias(id);
  return (catalogue.garde ?? []).find((f) => f.ids.some((x) => alias(x) === cible)) ?? null;
}

/** Se congèle-t-il, cru, tel qu'acheté ? La famille le dit (`methode`). */
export const seCongele = (catalogue: Catalogue, id: string): boolean => familleDe(catalogue, id)?.methode === "congeler";

export interface Limite {
  /** `AAAA-MM-JJ`. */
  le: string;
  /** Jours d'ici là ; négatif quand elle est passée. */
  jours: number;
}

const plus = (iso: string, jours: number): string => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + Math.round(jours));
  return d.toISOString().slice(0, 10);
};
const ecart = (de: string, a: string): number =>
  Math.round((Date.parse(`${a}T12:00:00Z`) - Date.parse(`${de}T12:00:00Z`)) / 86_400_000);

/**
 * Jusqu'à quand ce qui est derrière cette porte se garde.
 *
 * AU FRIGO : la fenêtre de sa famille, quand c'est une famille du frigo
 * (viande et poisson frais : deux jours), depuis le jour où il est rentré.
 * AU CONGÉLATEUR : congelé ici, la fenêtre de la congélation (`congeler`, trois
 * mois) depuis le jour du geste ; acheté surgelé, celle de sa famille.
 *
 * DES ORDRES DE GRANDEUR, PAS DES DLC — `conservation.yaml` le dit en tête :
 * l'étiquette fait foi. La limite sert à faire passer devant ce qui presse et
 * à dire « regardez l'étiquette », jamais à jeter.
 */
export function limiteAuFroid(
  catalogue: Catalogue,
  rejeu: Rejeu,
  id: string,
  porte: string,
  aujourdhui: string,
): Limite | null {
  const f = familleDe(catalogue, id);
  let depuis: string | undefined;
  let fenetre: number | null = null;
  if (porte === FRIGO) {
    if (!f || f.espace !== "frigo") return null;
    depuis = rejeu.rentres.get(id);
    fenetre = f.fenetreJours;
  } else if (porte === CONGELO) {
    const congele = rejeu.congeleLe?.get(id);
    if (congele && f?.methode === "congeler") {
      depuis = congele;
      fenetre = catalogue.conservation.find((c) => c.id === "congeler")?.fenetreJours ?? null;
    } else if (f?.espace === "congelo") {
      depuis = rejeu.rentres.get(id);
      fenetre = f.fenetreJours;
    }
  }
  if (!depuis || fenetre == null) return null;
  const le = plus(depuis, fenetre);
  return { le, jours: ecart(aujourdhui, le) };
}

const JOURS = ["dim.", "lun.", "mar.", "mer.", "jeu.", "ven.", "sam."];

/** « à manger aujourd'hui », « à manger d'ici ven. 14/11 », « à consommer
 *  avant le 12/02 » — la phrase sous la ligne. */
export function phraseDeLimite(l: Limite): string {
  if (l.jours < 0) return "date passée · vérifier l'étiquette";
  if (l.jours === 0) return "à manger aujourd'hui";
  if (l.jours === 1) return "à manger d'ici demain";
  const d = new Date(`${l.le}T12:00:00Z`);
  if (l.jours <= 14) return `à manger d'ici ${JOURS[d.getUTCDay()]} ${l.le.slice(8, 10)}/${l.le.slice(5, 7)}`;
  return `à consommer avant le ${l.le.slice(8, 10)}/${l.le.slice(5, 7)}`;
}
