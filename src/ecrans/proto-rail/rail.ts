// PROTOTYPE — à jeter. Workspace#45, « Planning on demand: the rail, its
// horizon, its questions ».
//
// Trois variantes du rail sur une seule route jetable (`#/cuisine/proto-rail`),
// commutées par `?variant=A|B|C`. Ce fichier ne porte que ce que les trois
// partagent : un état EN MÉMOIRE (rien n'entre en base — c'est la règle du
// prototype, et c'est aussi ce qui permet de rejouer une cérémonie dix fois de
// suite sans salir la semaine réelle), et la fabrique des questions.
//
// Ce qui est VRAI ici, et c'est tout l'intérêt : le catalogue, les 86 plats, la
// main de `scoring.main()`, le placard rejoué par `journal.rejouer()`, le
// panier de `calculer()`. Seules les écritures sont simulées.

import type { Evenement, EvtCuisine, Rejeu } from "../../model/journal";
import type { Choix, Jeu } from "../../model/jeu";
import { SAUTE, sePioche } from "../../model/jeu";
import { main, type Carte } from "../../model/scoring";
import type { Catalogue, Plat } from "../../model/types";

export const VARIANTES = ["A", "B", "C"] as const;
export type Variante = (typeof VARIANTES)[number];

export const NOM_VARIANTE: Record<Variante, string> = {
  A: "Le fil — horizon choisi d'avance, un pas à la fois",
  B: "La pioche — pas d'horizon, on distribue jusqu'à « j'arrête »",
  C: "Le plateau — l'horizon est une sélection sur la grille",
};

/* ─────────────────────────────────────────────────────── l'état du rail */

/** Ce qu'un créneau porte, du point de vue du rail. Quatre états, pas trois :
 *  « je ne planifie pas ce repas » n'est ni un vide, ni un saut. */
export type EtatSlot = "vide" | "pose" | "saute" | "hors-plan";

export interface Reponse {
  /** `null` = « je ne sais pas », qui est une réponse et pas une absence. */
  valeur: "oui" | "non" | null;
}

export interface RailEtat {
  choix: Choix[];
  /** Les créneaux explicitement laissés hors du plan. */
  hors: ReadonlySet<number>;
  repioches: number[];
  reponses: Record<string, Reponse>;
  /** Les questions écartées d'un revers de doigt, sans réponse. */
  ecartees: ReadonlySet<string>;
  /** Les créneaux retenus pour cette passe. Vide = « tous ceux qui se
   *  piochent » (A et B) ; C le remplit à la main. */
  retenus: ReadonlySet<number>;
}

export function railNeuf(jeu: Jeu): RailEtat {
  return {
    choix: [...jeu.choix],
    hors: new Set<number>(),
    repioches: jeu.creneaux.map(() => 0),
    reponses: {},
    ecartees: new Set<string>(),
    retenus: new Set<number>(),
  };
}

export function etatDuSlot(st: RailEtat, i: number): EtatSlot {
  if (st.hors.has(i)) return "hors-plan";
  const c = st.choix[i];
  if (c === SAUTE) return "saute";
  if (c) return "pose";
  return "vide";
}

/** Les créneaux où une carte peut se poser — `routine` exclue, comme partout
 *  ailleurs dans l'app. */
export function slotsJouables(jeu: Jeu): number[] {
  return jeu.creneaux.map((c, i) => (sePioche(c.nature) ? i : -1)).filter((i) => i >= 0);
}

/** Les créneaux « choisi » seuls — ceux dont le vide est un vrai trou. Le
 *  dessert est `optionnel` : il se pioche mais ne se réclame pas. */
export function slotsPrincipaux(jeu: Jeu): number[] {
  return jeu.creneaux.map((c, i) => (c.nature === "choisi" ? i : -1)).filter((i) => i >= 0);
}

/** L'itinéraire de la passe : les N premiers créneaux principaux encore
 *  indécis, dans l'ordre chronologique. C'est ce que « je veux N repas »
 *  désigne pour A. */
export function itineraire(jeu: Jeu, st: RailEtat, n: number): number[] {
  return slotsPrincipaux(jeu)
    .filter((i) => etatDuSlot(st, i) === "vide" || st.choix[i] != null)
    .filter((i) => !st.hors.has(i))
    .slice(0, n);
}

/** Le prochain créneau que le rail proposerait, ou `null` s'il n'en reste
 *  aucun. Sert à B, qui n'a pas d'itinéraire : il distribue au fil de l'eau. */
export function prochain(jeu: Jeu, st: RailEtat, apres = -1): number | null {
  for (const i of slotsPrincipaux(jeu)) {
    if (i <= apres) continue;
    if (etatDuSlot(st, i) === "vide") return i;
  }
  return null;
}

/* ────────────────────────────────────────────────────────── la main de cartes */

export interface Reglages {
  /** Lire `equilibre.main.taille` (5) et `cooldown_jours` (10) au lieu du
   *  `taille = 4` en dur de `scoring.main()`. La question est au ticket ; le
   *  bouton la rend testable sur les trois variantes à la fois. */
  configHonoree: boolean;
}

/**
 * La main pour un créneau, sur l'état LOCAL du rail.
 *
 * `main()` lit `jeu.choix`, `jeu.slot` et `jeu.repioches`. On lui passe donc un
 * `Jeu` de surface — même catalogue, mêmes plats, choix du prototype — plutôt
 * que de muter celui du hook, qui appartient à la base.
 *
 * Le cooldown se joue en amont, sur `catalogue.plats` : `offre()` itère cette
 * liste, donc en retirer un plat le sort du paquet sans toucher au scoring.
 */
export function mainDuRail(
  jeu: Jeu,
  st: RailEtat,
  slot: number,
  reglages: Reglages,
  cuisinesRecentes: ReadonlySet<string>,
): Carte[] {
  const cat: Catalogue = reglages.configHonoree
    ? { ...jeu.catalogue, plats: jeu.catalogue.plats.filter((p) => !cuisinesRecentes.has(p.id)) }
    : jeu.catalogue;

  const local: Jeu = {
    ...jeu,
    catalogue: cat,
    choix: st.choix,
    slot,
    repioches: st.repioches,
  };
  return main(local, reglages.configHonoree ? jeu.catalogue.equilibre.main.taille : 4);
}

/* ──────────────────────────────────────────────────────────── les questions */

/**
 * Une question du rail. #42 l'a tranché : elle naît AU MOMENT DE LA
 * PROPOSITION, et toujours sur un ingrédient central — jamais sur un
 * assaisonnement, jamais sur une base (une base ne s'achète pas, elle se
 * cuisine).
 */
export interface Question {
  /** L'ingrédient, alias résolu — c'est aussi la clé de la réponse. */
  cle: string;
  nom: string;
  /** Le plat qui la fait naître : une question sans son plat est un
   *  questionnaire, et #34 en voulait justement pas. */
  depuis: string;
  /** Pourquoi l'app doute, en toutes lettres. */
  doute: string;
  urgence: "inconnu" | "probable";
}

const alias = (catalogue: Catalogue, id: string): string => catalogue.rayons.aliases[id] ?? id;

/** Les ingrédients qui portent le plat : ni assaisonnement, ni base, et pris du
 *  plus gros au plus petit. Deux suffisent — au-delà on interroge la recette. */
function centraux(p: Plat): Plat["ingredients"] {
  return p.ingredients
    .filter((x) => !x.assaisonnement && !x.base)
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 2);
}

const jourFr = (iso: string): string => {
  const [a, m, j] = iso.split("-");
  return a && m && j ? `${j}/${m}` : iso;
};

/**
 * Ce que l'app demanderait, vu cette main.
 *
 * Elle ne demande QUE ce qu'elle ne sait pas : un ingrédient dont le placard est
 * `sur` ne produit rien. Le rejeu du journal fournit la confiance ; sans
 * journal, tout le placard est `sur` par construction et cette liste est vide —
 * ce qui est le comportement honnête, pas une panne.
 */
export function questionsDeLaMain(
  catalogue: Catalogue,
  placard: Rejeu | null,
  cartes: Carte[],
): Question[] {
  if (!placard) return [];
  const vues = new Set<string>();
  const q: Question[] = [];

  for (const c of cartes) {
    for (const ing of centraux(c.plat)) {
      const cle = alias(catalogue, ing.id);
      if (vues.has(cle)) continue;
      const etat = placard.parIngredient.get(cle);
      if (!etat || etat.confiance === "sur") continue;
      vues.add(cle);
      q.push({
        cle,
        nom: ing.nom,
        depuis: c.plat.titre,
        doute: etat.vuLe
          ? `vu le ${jourFr(etat.vuLe)}, ${etat.depuisVu} passage${etat.depuisVu > 1 ? "s" : ""} depuis`
          : "jamais relevé",
        urgence: etat.confiance,
      });
    }
  }
  // L'incertain d'abord : « je ne sais pas s'il y en a » vaut mieux d'être levé
  // que « il en reste sans doute ».
  return q.sort((a, b) => (a.urgence === b.urgence ? 0 : a.urgence === "inconnu" ? -1 : 1));
}

export const questionOuverte = (st: RailEtat, q: Question): boolean =>
  !(q.cle in st.reponses) && !st.ecartees.has(q.cle);

/* ─────────────────────────────────────────────────── le journal de démonstration */

/**
 * UN JOURNAL DE DÉMO, ET IL FAUT SAVOIR POURQUOI IL EXISTE.
 *
 * Sur une base neuve, le journal est vide : `depuisVu = 0` partout, donc
 * `confiance()` répond « sûr » sur tout le placard, donc le rail n'a AUCUNE
 * question à poser — et l'axe le plus disputé du ticket (« une question, c'est
 * quoi, et dans quel budget ») devient invisible à l'écran.
 *
 * Ce n'est pas une panne : c'est exactement ce que #42 a décidé — le doute naît
 * des cuissons non observées. On le fabrique donc, plutôt que d'inventer des
 * questions qui n'auraient pas de source. Six dîners sur les douze derniers
 * jours, sans une seule observation depuis le relevé du 26/08 : les ingrédients
 * qu'ils traversent perdent leur confiance, chacun à la vitesse de sa classe.
 *
 * Effet de bord voulu : le cooldown de `equilibre.main.cooldown_jours` a enfin
 * quelque chose à écarter.
 */
export function journalDemo(catalogue: Catalogue, aujourdhui: Date): Evenement[] {
  const dedans = new Set(
    catalogue.gardeManger.denrees.map((d) => alias(catalogue, d.ingredient)),
  );
  // Les plats qui touchent le plus au garde-manger : ce sont eux dont la
  // cuisson dépense vraiment de la confiance.
  const candidats = catalogue.plats
    .map((p) => ({
      p,
      n: centraux(p).filter((x) => dedans.has(alias(catalogue, x.id))).length,
    }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n || a.p.id.localeCompare(b.p.id))
    .slice(0, 6);

  return candidats.map((x, k): EvtCuisine => {
    const d = new Date(aujourdhui);
    d.setDate(d.getDate() - (k * 2 + 1));
    const jour = d.toISOString().slice(0, 10);
    return {
      sorte: "cuisine",
      jour,
      saisi: jour,
      maj: d.getTime(),
      repas: "diner",
      plat: x.p.id,
      parts: catalogue.foyer.parts,
    };
  });
}

/* ──────────────────────────────────────────── les deux canaux de la fin */

/** #41 : Carrefour est le canal de la RÉSERVE (sec, boîte, congelé, planifié) ;
 *  marché, casier et panier sont le canal du FRAIS (non choisi, hebdomadaire).
 *  Une seule liste fusionnée est la raison pour laquelle la liste se lit mal. */
export const CANAL_FRAIS = new Set(["primeur", "boucherie", "poissonnerie", "crèmerie", "frais"]);

export interface Canal {
  titre: string;
  sous: string;
  rayons: [string, { id: string; nom: string; qty: number; unit: string; n: number }[]][];
}
