// Ce qui est ici — et donc ce qu'il manque pour lancer un plat maintenant
// (T127, Workspace#67).
//
// ────────────────────────────────────────────────────────────────────────────
// LA QUESTION QUE PERSONNE NE POSAIT : « QU'EST-CE QUE JE PEUX FAIRE AVEC CE QUI
// EST ICI ? »
//
// L'année du foyer simulé (Workspace#71, deuxième passage) l'a mesuré : 1 026
// des 1 035 cartes refusées l'étaient pour « 4 à 8 articles à acheter un jour
// sans courses ». Avec le fond complet, une bonne vingtaine de dîners ne
// demandent rien ou un seul article — et l'app ne les montrait jamais en
// premier, parce que rien ne savait compter « à acheter » contre ce qui est
// dans la cuisine. `Carte.marginal` compte ce que le plat ajoute au PANIER DE LA
// SEMAINE, ce qui n'est pas la même question : un article déjà réclamé par un
// autre posé y vaut zéro, qu'il soit dans le placard ou non.
//
// ────────────────────────────────────────────────────────────────────────────
// CE FICHIER NE TOUCHE NI À LA LISTE DE COURSES NI À `Jeu.gardeManger`.
//
// `Jeu.gardeManger` est une INTERSECTION — le relevé du 26/08 filtré par le
// rejeu (PR #32, voir `db/gardeManger.ts`) — et elle commande la liste : un id
// qui y entre sort de « à acheter » pour « vous en avez ». L'élargir aux achats
// rentrés ferait disparaître une ligne sous le doigt de qui range ses courses,
// exactement le bug que l'intersection existe pour empêcher.
//
// Ici on répond à une AUTRE question, pour le classement seulement : « si je
// lance ce plat maintenant, qu'est-ce qui me manque ? ». Elle a le droit de
// lire tout ce que le rejeu sait — la crème rentrée hier, le fond de roulement
// rentré samedi — parce qu'elle ne retire rien à personne : elle ordonne des
// cartes.

import { commeIngredient } from "./calcul";
import { contexte, type Classe, type EtatIngredient, type Rejeu } from "./journal";
import type { Catalogue, Ingredient, Plat } from "./types";

/* ═════════════════════════════════════════════ ce qui est ici, maintenant */

/**
 * Les classes qui ne se gardent que quelques jours.
 *
 * `de-garde` N'EN EST PAS, ET C'EST TOUT LE FOND DE ROULEMENT. L'oignon, l'ail,
 * la pomme de terre, les carottes et les œufs « se gardent des semaines »
 * (18/10) : leur famille de garde les sort du frais court (`journal.classeDe`),
 * et un filet d'oignons rentré il y a dix jours est encore là ce soir.
 */
const COURTES: ReadonlySet<Classe> = new Set<Classe>(["frais-court", "fruits-legumes"]);

const JOUR_MS = 86_400_000;
const joursEntre = (a: string, b: string): number =>
  Math.max(0, Math.round((Date.parse(b) - Date.parse(a)) / JOUR_MS));

/**
 * Cet ingrédient est-il dans la cuisine ce soir, d'après le rejeu ?
 *
 * DES LOTS, ET POUR LE FRAIS COURT UNE VIE. Un lot de crème rentré il y a dix
 * jours est encore au rejeu — rien ne l'en a fait sortir — mais personne ne
 * lancera une quiche dessus. La vie est celle de T111 (`rentreEnVie`, la
 * fenêtre du frigo), élargie à ce qu'un œil a VU dans cette fenêtre : « j'ai
 * regardé, il y a de la crème » vaut un achat d'hier.
 *
 * LA FENÊTRE NE SERT QU'À CLASSER, JAMAIS À DIRE « À JETER ». Les fenêtres de
 * garde sont des ordres de grandeur ; une crème de six jours n'est pas
 * nécessairement perdue, elle est seulement trop incertaine pour être la
 * raison d'un dîner « sans rien acheter ».
 */
export function estLa(catalogue: Catalogue, e: EtatIngredient, aujourdhui: string): boolean {
  if (e.lots.length === 0 && e.unites <= 0) return false;
  if (!COURTES.has(e.classe)) return true;
  if (e.rentreEnVie) return true;
  const fenetre = catalogue.foyer?.fenetreFrigo ?? 4;
  return e.vuLe !== null && joursEntre(e.vuLe, aujourdhui) <= fenetre;
}

/**
 * Tout ce qui est ici — en ids d'achat, alias résolus.
 *
 * TROIS SOURCES, ET AUCUNE N'EN REMPLACE UNE AUTRE :
 *   — le placard « toujours là » (`rayons.placard`) : le sel, l'huile, la
 *     farine. Une appartenance, pas un stock ;
 *   — `Jeu.gardeManger` : le relevé, filtré par ce qu'il en reste ;
 *   — le rejeu entier : ce qui est entré depuis (courses rentrées, relevés),
 *     fond de roulement compris.
 *
 * UNE RÉUNION ICI, ET C'EST SANS DANGER POUR LA LISTE : voir l'en-tête. Le jour
 * où l'on voudra que la liste lise la même chose, il faudra trancher la
 * question de #32 (« une ligne qui s'efface sous le doigt »), pas recopier cet
 * ensemble dans `calculer`.
 */
export function ceQuiEstIci(
  catalogue: Catalogue,
  gardeManger: readonly string[],
  rejeu: Rejeu,
  aujourdhui: string,
): Set<string> {
  const ctx = contexte(catalogue);
  const ici = new Set<string>(catalogue.rayons.placard.map(ctx.alias));
  for (const id of gardeManger) ici.add(id);
  for (const e of rejeu.parIngredient.values())
    if (estLa(catalogue, e, aujourdhui)) ici.add(ctx.alias(e.ingredient));
  return ici;
}

/* ══════════════════════════════════════════════════════ ce qu'il manque */

export interface Article {
  id: string;
  nom: string;
}

export interface CeQuiManque {
  /** Les ingrédients du plat qu'il faut acheter pour le lancer. */
  ingredients: Article[];
  /** Ce qui va À CÔTÉ (T92) et qui n'est pas là — dit, jamais compté. */
  aCote: Article[];
}

/**
 * Ce qu'il faudrait acheter pour lancer ce plat maintenant.
 *
 * TROIS SORTES DE LIGNES NE MANQUENT JAMAIS :
 *   — une BASE (`250 g de lentilles cuites`) : elle ne s'achète nulle part. Ou
 *     le dépôt la porte, ou le plat ne se fait pas — c'est `Carte.manque`, et
 *     la proposition l'écarte avant d'arriver ici ;
 *   — un ASSAISONNEMENT : le cumin, le paprika, la muscade. Le fond les dit
 *     « toujours là » et `rayons.placard` n'en nomme qu'une partie ; on ne
 *     renonce pas à un dîner pour une pincée. DÉCISION À FAIRE CONFIRMER,
 *     notée au backlog ;
 *   — ce qui EST ICI (`ceQuiEstIci`).
 *
 * L'ACCOMPAGNEMENT SE DIT ET NE SE COMPTE PAS. Le riz et la salade des
 * escalopes font le repas (T92), mais on remplace une salade verte par ce qui
 * est dans le bac sans changer de dîner ; compter la salade ferait passer les
 * escalopes de « rien à acheter » à « il manque : salade verte » pour un
 * article que personne n'irait chercher à 15 h.
 *
 * `plein` : le plat n'a pas trouvé le reste qu'il attendait et se fait « sans
 * reste » (`Plat.sansReste`) — ses lignes de remplacement comptent alors.
 */
export function ceQuiManque(
  catalogue: Catalogue,
  plat: Plat,
  ici: ReadonlySet<string>,
  plein = false,
): CeQuiManque {
  const alias = (id: string): string => catalogue.rayons.aliases[id] ?? id;
  const manquants = (lignes: readonly Ingredient[]): Article[] => {
    const vus = new Map<string, Article>();
    for (const ing of lignes) {
      if (ing.base || ing.assaisonnement) continue;
      const id = alias(ing.id);
      if (ici.has(id) || vus.has(id)) continue;
      vus.set(id, { id, nom: ing.nom });
    }
    return [...vus.values()];
  };
  const lignes = [...plat.ingredients, ...(plein && plat.sansReste ? plat.sansReste.ingredients : [])];
  const ingredients = manquants(lignes);
  const dejaDits = new Set(ingredients.map((a) => a.id));
  return {
    ingredients,
    aCote: manquants(plat.avec.map(commeIngredient)).filter((a) => !dejaDits.has(a.id)),
  };
}

/**
 * Ce que la carte dit « ici » pour ce plat — tout ce qu'elle ne réclame pas.
 *
 * LE COMPLÉMENT EXACT DE `ceQuiManque`, sur les mêmes lignes : les ingrédients
 * (et ceux du « sans reste » quand le plat s'y résout), l'accompagnement, moins
 * les bases (le dépôt les porte, pas les courses), moins ce qui manque et ce qui
 * va à côté sans y être. L'assaisonnement y est : la carte le tient pour là, la
 * liste ne doit pas le réclamer à sa place.
 *
 * C'est l'instantané que « Je lance ça » écrit sur le créneau
 * (`DecisionCreneau.ici`), pour que la liste ne demande que ce que la carte a
 * dit manquer.
 */
export function ceQueLaCarteDitIci(catalogue: Catalogue, plat: Plat, manque: CeQuiManque, plein = false): string[] {
  const alias = (id: string): string => catalogue.rayons.aliases[id] ?? id;
  const exclus = new Set([...manque.ingredients, ...manque.aCote].map((a) => a.id));
  const lignes = [
    ...plat.ingredients,
    ...(plein && plat.sansReste ? plat.sansReste.ingredients : []),
    ...plat.avec.map(commeIngredient),
  ];
  const ids = new Set<string>();
  for (const ing of lignes) {
    if (ing.base) continue;
    const id = alias(ing.id);
    if (!exclus.has(id)) ids.add(id);
  }
  return [...ids].sort();
}
