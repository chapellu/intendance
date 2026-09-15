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

import type { Choix, Jeu } from "../model/jeu";
import { comptoir, type Carte, type Ecart, type Savoir } from "../model/scoring";
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

  e.push({
    etat: c.marginal === 0 ? "trouvé" : "à acheter",
    texte:
      c.marginal === 0
        ? "rien de plus à acheter"
        : `${c.marginal} article${c.marginal > 1 ? "s" : ""} de plus au panier`,
  });

  return e;
}

/**
 * Ce que la carte produit — ce qu'elle laissera derrière elle.
 *
 * Les quantités s'écrivent « par lot » et NON à l'échelle du créneau : à ce
 * moment-là le plat n'est pas encore posé, et les parts peuvent encore changer.
 * Annoncer 1 400 g pour en livrer 700 serait une promesse qu'on ne tient pas.
 */
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

/* ──────────────────────────────── chercher un plat qu'on a déjà dans la tête */

/**
 * Un plat qu'on a nommé, noté pour ce créneau — T80.
 *
 * LA MAIN RÉPOND À « QU'EST-CE QU'ON MANGE » ; ELLE NE RÉPOND PAS À « JE VEUX
 * FAIRE ÇA ». Quatre cartes sur cent trente-huit plats, tirées par le score :
 * quelqu'un qui sait déjà ce qu'il veut n'a aucun chemin, sinon repiocher
 * jusqu'à ce que son plat tombe — et il peut ne jamais tomber, puisque le score
 * l'écarte peut-être exprès.
 */
export interface Trouvaille {
  carte: Carte;
  /** Pourquoi la proposition ne l'a pas montré. Vide = elle aurait pu. */
  ecarts: Ecart[];
}

export interface Recherche {
  trouvailles: Trouvaille[];
  /** Combien de plats portent ce nom EN TOUT — `trouvailles` est plafonné. */
  total: number;
}

/**
 * Deux caractères avant de chercher, et c'est mesuré : sur les 138 titres du
 * corpus, « a » en ramène 83 et « e » 34. Une lettre ne cherche rien, elle
 * feuillette — et un écran qui répond 83 cartes à une frappe a répondu qu'il
 * n'avait pas compris.
 */
export const REQUETE_MIN = 2;

/**
 * Huit cartes au plus. Les requêtes réelles du corpus en ramènent entre 1 et 11
 * (« salade » 11, « poulet » 7, « gratin » 3, « gnocchi » 1) : le plafond ne
 * coupe presque jamais, et quand il coupe, l'écran dit combien il a laissé
 * derrière plutôt que de faire semblant d'avoir tout montré.
 */
export const TROUVAILLES_MAX = 8;

/**
 * La forme comparable d'un titre : sans accent, sans casse, sans ponctuation.
 *
 * INDISPENSABLE EN FRANÇAIS, et pas une politesse. « Gnocchis poêlés », « Pâtes
 * à la bolognaise », « Salade César (ou presque) » : chercher « poeles »,
 * « pates » ou « cesar » doit marcher, parce que c'est ce qu'on tape d'un pouce
 * sur un téléphone — personne ne compose un circonflexe pour retrouver un plat.
 */
export function normaliser(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Les plats dont le titre porte tous les mots tapés.
 *
 * ON CHERCHE PAR DÉBUT DE MOT, PAS PAR SOUS-CHAÎNE. « ri » doit ramener le riz
 * et les rillettes, pas le curry ni la purée : une sous-chaîne fait remonter
 * des plats dont l'utilisateur ne voit pas ce qu'ils font là, et une liste
 * qu'on ne s'explique pas est une liste qu'on cesse de lire.
 *
 * L'ORDRE NE DÉPEND PAS DU SCORE, ET C'ÉTAIT LA VRAIE DÉCISION. Trier les
 * trouvailles par note aurait donné deux réponses différentes à la même
 * question sur deux créneaux — l'inverse exact de ce qu'on attend d'une
 * recherche. On trie donc par ce que la FRAPPE dit (le titre commence par ce
 * qu'on a tapé, puis le premier mot, puis le reste) et on départage par ordre
 * alphabétique. Ce que le plat vaut ICI reste écrit sur sa carte, où il a
 * toujours été.
 *
 * ON NE CHERCHE QUE DANS LES TITRES. Chercher dans les ingrédients répondrait à
 * « qu'est-ce que je peux faire avec ce qui me reste », qui est une autre
 * question — et à laquelle la proposition répond déjà mieux, en notant
 * l'écoulement du placard.
 */
export function trouver(plats: readonly Plat[], requete: string): Plat[] {
  const q = normaliser(requete);
  if (q.length < REQUETE_MIN) return [];
  const termes = q.split(" ");

  const rang = (p: Plat): number | null => {
    const titre = normaliser(p.titre);
    const mots = titre.split(" ");
    if (!termes.every((t) => mots.some((m) => m.startsWith(t)))) return null;
    if (titre.startsWith(q)) return 0;
    return mots[0]?.startsWith(termes[0]!) ? 1 : 2;
  };

  return plats
    .flatMap((p) => {
      const r = rang(p);
      return r === null ? [] : [{ p, r }];
    })
    .sort((a, b) => a.r - b.r || a.p.titre.localeCompare(b.p.titre, "fr"))
    .map((x) => x.p);
}

/**
 * Ce que l'écran montre pour une frappe : des cartes entières, écart compris.
 *
 * ON MONTRE LE PLAT ÉCARTÉ, ET ON DIT POURQUOI. C'est la règle de T78 appliquée
 * à la recherche : on ne retire pas ce que quelqu'un vient de nommer. Le taire
 * laisserait croire que le plat n'existe pas, alors qu'il existe et qu'on a une
 * bonne raison de ne pas l'avoir proposé — raison qui, dite, se répare (aller
 * relever le placard) ou s'assume (poser quand même).
 *
 * LE COOLDOWN EST AJOUTÉ ICI ET PAS AU COMPTOIR, parce qu'il n'écarte pas de
 * l'OFFRE mais de la MAIN : `offre` garde le plat cuisiné mardi, c'est `main`
 * qui ne le tire pas. Le mettre dans `comptoir.ecarts` aurait cassé la promesse
 * « aucun écart ⟺ dans l'offre » — et l'utilisateur, lui, cherche parce que la
 * MAIN ne lui a rien montré : ne pas le dire serait taire la vraie raison.
 */
export function chercher(
  jeu: Jeu,
  choix: Choix[],
  slot: number,
  requete: string,
  savoir?: Savoir,
): Recherche {
  const trouves = trouver(jeu.catalogue.plats, requete);
  const c = comptoir(jeu, choix, slot, savoir);
  if (!c) return { trouvailles: [], total: 0 };

  return {
    total: trouves.length,
    trouvailles: trouves.slice(0, TROUVAILLES_MAX).map((p) => {
      const ecarts = c.ecarts(p);
      if (savoir?.cuisinesRecemment.has(p.id))
        ecarts.push({
          cle: "recent",
          texte: `cuisiné il y a moins de ${jeu.catalogue.equilibre.main.cooldown_jours} jours`,
        });
      return { carte: c.noter(p), ecarts };
    }),
  };
}
