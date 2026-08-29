// Ce qu'une carte jouable montre.
//
// LE GESTE CENTRAL DE LA DIRECTION : le coût pendant qu'on choisit, pas après.
// Une carte dit ce qu'elle CONSOMME et ce qu'elle PRODUIT — d'un côté ce
// qu'elle prend au dépôt et ce qu'elle ajoute au panier, de l'autre ce qu'elle
// laissera aux jours suivants. C'est la seule vue de l'app où les deux se
// lisent ensemble, et c'est ce qui permet de choisir autrement qu'à l'envie.
//
// Les quatre états sont un VOCABULAIRE FERMÉ, et c'est délibéré : « trouvé »,
// « pas assez », « absent », « à acheter » se retiennent en une semaine
// d'usage. Une phrase par cas ne se retiendrait jamais.
//
// Port de `apps/proto-shell/comptoir.js` (`carteJouable`).

import { assiette, type Jeu } from "../model/jeu";
import { ditLeManque, manqueALAssiette } from "../model/repas";
import type { Carte, Complement } from "../model/scoring";
import type { Plat } from "../model/types";
import { fmt } from "../ui/format";
import { iconeEspace, type NomIcone } from "../ui/icones";

export type EtatEntree = "trouvé" | "pas assez" | "absent" | "à acheter";

export interface Entree {
  etat: EtatEntree;
  texte: string;
}

export interface Sortie {
  icone: NomIcone;
  texte: string;
}

/** La classe CSS d'un état. Deux couleurs seulement : le sauge pour ce qui est
 *  là, le terracotta pour ce qui manque. « À acheter » n'est ni l'un ni
 *  l'autre — ce n'est pas un problème, c'est une ligne de plus sur la liste. */
export const classeEtat = (e: EtatEntree): string =>
  e === "trouvé" ? "trouve" : e === "pas assez" ? "court" : "";

/** Ce que la carte consomme. La dernière ligne est toujours le coût au panier :
 *  c'est celle qu'on cherche, donc elle est toujours au même endroit. */
export function entreesDeLaCarte(c: Carte): Entree[] {
  const p = c.plat;
  const e: Entree[] = [];

  if (c.chaine)
    e.push({
      etat: c.partiel ? "pas assez" : "trouvé",
      texte: c.recit || "base déjà cuite",
    });

  // « Ça ne s'achète pas » n'est pas une formule : un `accepts` sans
  // équivalent au magasin ne se répare qu'en cuisinant le plat amont.
  if (c.manque)
    e.push({
      etat: "absent",
      texte: `demande ${p.accepts.map((a) => a.type ?? `un ${a.kind}`).join(", ")} — ça ne s’achète pas`,
    });

  if (c.plein && p.sansReste)
    e.push({
      etat: "pas assez",
      texte: `sans le reste : +${p.sansReste.minutes} min et ${p.sansReste.ingredients
        .map((x) => x.nom)
        .join(", ")}`,
    });

  // TROIS CAS, PAS DEUX — et le troisième s'écrivait « -2 article de plus au
  // panier ». Une carte proposée sur un créneau DÉJÀ POSÉ remplace le plat qui
  // s'y trouve : elle peut donc RENDRE des articles. Le cas existait depuis
  // toujours ; T28 l'a mis sous les yeux en rangeant ces cartes-là sous
  // « changer le plat », et une phrase qui se contredit se remarque.
  e.push({
    etat: c.marginal > 0 ? "à acheter" : "trouvé",
    texte:
      c.marginal === 0
        ? "rien de plus à acheter"
        : `${Math.abs(c.marginal)} article${Math.abs(c.marginal) > 1 ? "s" : ""} ` +
          `de ${c.marginal > 0 ? "plus" : "moins"} au panier`,
  });

  return e;
}

/** Le compteur de la carte : `+2 art.`, `−2 art.`, `0 art.` Le signe est porté
 *  par le texte et non par un `+` collé devant le nombre — « +-2 » n'est pas une
 *  quantité. */
export const marqueMarginal = (n: number): string =>
  `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n)} art.`;

/**
 * Ce que la carte produit — ce qu'elle laissera derrière elle.
 *
 * Les quantités s'écrivent « par lot » et NON à l'échelle du créneau : à ce
 * moment-là le plat n'est pas encore posé, et les parts peuvent encore changer.
 * Annoncer 1 400 g pour en livrer 700 serait une promesse qu'on ne tient pas.
 */
/* ─────────────────────────────────────────────────────────────── l'assiette */

export interface VueAssiette {
  /** Le plat qui décide du repas, puis les briques, dans cet ordre. */
  plats: { id: string; titre: string; principal: boolean; minutes: number }[];
  /** « il manque un féculent », vide quand l'assiette se suffit. */
  dit: string;
  complete: boolean;
  /** Rien n'est encore posé : il n'y a pas d'assiette à juger. */
  vide: boolean;
}

/**
 * L'ASSIETTE D'UN CRÉNEAU, telle que l'écran la montre.
 *
 * Le calcul tient en trois lignes ; ce qui vaut d'être ici, c'est la décision
 * qu'elles portent. Un créneau vide n'affiche AUCUN manque — « il manque une
 * protéine, un féculent et des légumes » sur une case qu'on n'a pas encore
 * remplie est une réponse vraie et inutile, qui apprend à ignorer la ligne.
 */
export function vueDeLAssiette(jeu: Jeu, i: number): VueAssiette {
  const plats = assiette(jeu, i);
  const manque = manqueALAssiette(plats);
  return {
    plats: plats.map((p, n) => ({
      id: p.id, titre: p.titre, principal: n === 0, minutes: p.minutes,
    })),
    dit: ditLeManque(manque),
    complete: plats.length > 0 && manque.length === 0,
    vide: plats.length === 0,
  };
}

export interface VueComplement {
  id: string;
  titre: string;
  minutes: number;
  /** « apporte un féculent · rien à acheter en plus ». */
  pourquoi: string;
  /** Ce qui manquera ENCORE : une soupe réclame parfois deux briques, et
   *  laisser croire qu'une suffit serait la même faute qu'avant, en plus petit. */
  restera: string;
  horsSaison: string[];
}

/** Les briques proposées, coupées court. Neuf accompagnements existent ; en
 *  afficher neuf sous un plat déjà choisi transformerait une complétion en
 *  second choix de plat. */
export function vueDesComplements(liste: Complement[], max = 3): VueComplement[] {
  return liste.slice(0, max).map((c) => ({
    id: c.plat.id,
    titre: c.plat.titre,
    minutes: c.plat.minutes,
    pourquoi: c.pourquoi.join(" · "),
    restera: ditLeManque(c.restera),
    horsSaison: c.horsSaison,
  }));
}

export function sortiesDeLaCarte(p: Plat): Sortie[] {
  const s: Sortie[] = p.emits.map((e) => ({
    // Un reste de plat va au frigo, quoi qu'il arrive : on ne congèle pas une
    // assiette de la veille sans le décider.
    icone: iconeEspace(e.kind === "reste-plat" ? "frigo" : e.congelo ? "congelo" : "frigo"),
    texte: `${e.type}${e.qty?.amount != null ? ` · ${fmt(e.qty.amount)} ${e.qty.unit} par lot` : ""}`,
  }));
  if (p.bebe) s.push({ icone: "bebe", texte: `portion bébé — ${p.bebe}` });
  return s;
}
