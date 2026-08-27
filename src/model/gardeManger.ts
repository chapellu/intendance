// Ce que le garde-manger apporte au CHOIX D'UN PLAT.
//
// `stock.vue.ts` montre le garde-manger ; ici on s'en sert. La question n'est
// plus « qu'est-ce qu'il y a dans ce placard » mais « qu'est-ce qui va se
// perdre, et quel plat le mangerait ».
//
// DEUX RÉCOMPENSES DISTINCTES, ET LES CONFONDRE CASSERAIT LES DEUX.
//
// *Utiliser* le placard est déjà payé, et ailleurs : un ingrédient de placard ne
// crée pas de ligne de courses, donc `article_marginal` ne monte pas. Un plat
// bâti sur ce qu'on a gagne déjà, sans que personne ait eu à l'écrire.
//
// *Sauver* le placard est ce qui manquait. Une boîte de maïs tient trois ans ;
// un sachet d'épeautre ouvert rancit en six mois ; quatre kilos de pommes de
// terre au-dessus d'un siphon germent cette semaine. Seules les deux dernières
// méritent qu'on déplace un dîner, et c'est pour elles seules que le score paie.
//
// La conséquence tient en une ligne : **on ne paie que ce qui est à risque.**
// Payer aussi les conserves ferait gagner les plats à longue liste d'épicerie,
// ce qui est exactement l'inverse du service rendu.
//
// ────────────────────────────────────────────────────────────────────────────
// CE QUE CE MODÈLE NE SAIT PAS FAIRE, ET IL FAUT LE SAVOIR EN LE LISANT.
//
// Un aromate n'est pas sauvé parce qu'un plat le cite. Mesuré sur le corpus :
// l'oignon paraît dans 42 % des 86 plats, l'ail dans 19 %. Ces deux-là seront
// mangés de toute façon — ils n'ont besoin d'aucun coup de pouce, et le terme
// qui les signale est presque une constante, donc il ne départage rien. Ce qui
// se perd vraiment chez ce foyer, ce sont les six kilos de pommes de terre, les
// deux farines d'épeautre ouvertes et les quatre fonds de paquets de pâtes.
//
// Distinguer les deux demanderait de comparer CE QU'ON A à CE QU'UN PLAT PREND
// — un oignon sur un filet, contre 800 g de pommes de terre sur deux kilos. Le
// relevé ne porte pas ces quantités pour le frais (`par_unite: null`), et les
// inventer donnerait un classement qui a l'air fin et ne l'est pas.
//
// D'où le partage assumé : le score NUDGE, et `aSauver()` DÉSIGNE. La liste,
// elle, nomme les pommes de terre et l'épeautre sans se laisser noyer par les
// aromates. C'est elle qu'il faut lire pour savoir quoi cuisiner ce soir.
// ────────────────────────────────────────────────────────────────────────────

import type { Catalogue, ConservationDenree, Denree, Plat, Urgence } from "./types";

/** Du plus pressé au moins. Sert à départager deux lots du même ingrédient :
 *  un paquet de pâtes entamé et un neuf sont le même `pates`, et c'est l'entamé
 *  qui commande — c'est lui qui court. */
const RANG: Record<Urgence, number> = { haute: 3, moyenne: 2, basse: 1 };

const plusPresse = (a: Urgence, b: Urgence): Urgence => (RANG[a] >= RANG[b] ? a : b);

/** L'id d'achat, alias résolus. Le garde-manger et les recettes puisent dans le
 *  même vocabulaire, mais rien ne garantit qu'ils aient choisi la même
 *  orthographe — `oignons` d'un côté, `oignon` de l'autre. Sans ce passage, le
 *  rapprochement échoue en silence et le bonus ne tombe jamais. */
const alias = (catalogue: Catalogue, id: string): string => catalogue.rayons.aliases[id] ?? id;

/**
 * Ce que le placard porte, par ingrédient, avec l'urgence qui commande.
 *
 * UNE ENTRÉE PAR INGRÉDIENT, PAS PAR LOT. Le score se pose sur une ligne de
 * recette, qui nomme un ingrédient ; compter quatre fois `pates` parce que
 * quatre fonds de paquet traînent ferait d'un plat de pâtes le meilleur dîner de
 * la semaine, quatre fois de suite.
 */
export function urgences(catalogue: Catalogue): Map<string, Urgence> {
  const par = new Map<string, Urgence>();
  for (const d of catalogue.gardeManger.denrees) {
    const id = alias(catalogue, d.ingredient);
    const vu = par.get(id);
    par.set(id, vu ? plusPresse(vu, d.urgence) : d.urgence);
  }
  return par;
}

export interface BonusPlacard {
  /** Ce que ça vaut au score. Zéro quand le plat ne sauve rien. */
  score: number;
  /** Les ingrédients sauvés, tels qu'on les dira à l'écran. */
  noms: string[];
  /** Y en a-t-il un qui est vraiment pressé ? Décide de la phrase. */
  urgent: boolean;
}

/**
 * Ce qu'un plat rattrape du placard.
 *
 * ON COMPTE DES INGRÉDIENTS DISTINCTS, JAMAIS DES LIGNES. Une recette peut citer
 * l'oignon deux fois — dans la garniture et dans la sauce — et le payer deux
 * fois donnerait un avantage à la façon dont la recette est écrite plutôt qu'à
 * ce qu'elle mange.
 *
 * Les lignes `from_accepts` sont ignorées : elles réclament une base cuisinée
 * (« 250 g de lentilles cuites »), pas une matière première, et le chaînage a
 * déjà ses propres poids pour ça.
 */
export function bonusPlacard(
  catalogue: Catalogue,
  plat: Plat,
  pressees: Map<string, Urgence>,
  poids: Record<string, number>,
): BonusPlacard {
  const vus = new Map<string, Urgence>();
  for (const ing of plat.ingredients) {
    if (ing.base) continue;
    const id = alias(catalogue, ing.id);
    const u = pressees.get(id);
    // `basse` ne paie rien : c'est une conserve, elle attendra.
    if (!u || u === "basse") continue;
    vus.set(id, u);
  }
  const urgent = [...vus.values()].includes("haute");
  // UN SEUL BONUS PAR PLAT, JAMAIS UN PAR INGRÉDIENT.
  //
  // Cumuler mesuré sur le vrai corpus : l'oignon est dans 42 % des 86 plats,
  // l'ail dans 19 %. Un bonus par ligne donnait donc +10 à presque tout ce qui
  // contient un oignon et de l'ail, et faisait gagner les plats à LONGUE LISTE
  // D'INGRÉDIENTS — précisément ce que `article_marginal` a été écrit pour
  // éviter. Le score dit « ce plat aide le placard », pas « il l'aide deux fois
  // plus parce qu'il cite deux aromates ».
  const score = vus.size
    ? (poids[urgent ? "ecoule_placard_urgent" : "ecoule_placard_entame"] ?? 0)
    : 0;
  return {
    score,
    noms: [...vus.keys()].map((id) => id.replace(/-/g, " ")),
    urgent,
  };
}

export interface ASauver {
  ingredient: string;
  nom: string;
  urgence: Urgence;
  /** Où c'est rangé, en toutes lettres — on ne sauve pas ce qu'on ne trouve pas. */
  zone: string;
  /** Pourquoi ça presse, dit en français. */
  raison: string;
  /**
   * L'AUTRE ISSUE : transformer au lieu de cuisiner.
   *
   * Une denrée qui court a deux sorties, et le modèle les connaît toutes les
   * deux depuis le prototype. La première est de la manger ce soir — c'est ce
   * que le score pousse. La seconde est d'arrêter son horloge, et c'est souvent
   * la bonne : on ne mange pas six kilos de pommes de terre parce qu'ils
   * germent.
   */
  conserver: ConservationDenree[];
  /** Ce qu'il faudrait acquérir pour avoir une issue de plus. Le nœud de
   *  compétence, pas une suggestion d'achat — la distinction vient de #29. */
  verrouille: ConservationDenree[];
}

/**
 * Ce qui se perd, du plus pressé au moins.
 *
 * L'ÉCRAN NE PEUT PAS SE CONTENTER DE L'URGENCE. « pommes de terre : haute » ne
 * dit pas quoi faire. On rend la RAISON — frais, entamé, ou abîmé par sa zone —
 * parce que c'est elle qui distingue « mange-les » de « range-les ailleurs ».
 */
export function aSauver(catalogue: Catalogue): ASauver[] {
  const zones = new Map(catalogue.gardeManger.zones.map((z) => [z.id, z]));
  const raison = (d: Denree): string => {
    const z = zones.get(d.zone);
    if (z) {
      if (d.sensible.includes("lumiere") && z.exposition === "jour") return "s’abîme à la lumière";
      if (d.sensible.includes("humidite") && z.hygrometrie === "humide") return "s’abîme à l’humidité";
      if (d.sensible.includes("chaleur") && z.chaleur) return "s’abîme à la chaleur";
    }
    if (d.etat === "frais") return "frais, ne se garde pas";
    return "paquet entamé";
  };
  return catalogue.gardeManger.denrees
    .filter((d) => d.urgence !== "basse")
    .map((d) => ({
      ingredient: d.ingredient,
      nom: d.ingredient.replace(/-/g, " "),
      urgence: d.urgence,
      zone: zones.get(d.zone)?.label ?? d.zone,
      raison: raison(d),
      conserver: d.conservations.filter((c) => c.acquis),
      verrouille: d.conservations.filter((c) => !c.acquis),
    }))
    .sort((a, b) => RANG[b.urgence] - RANG[a.urgence] || a.nom.localeCompare(b.nom, "fr"));
}
