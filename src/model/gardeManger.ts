// Ce que le garde-manger apporte au CHOIX D'UN PLAT.
//
// `stock.vue.ts` montre le garde-manger ; ici on s'en sert. La question n'est
// plus « qu'est-ce qu'il y a dans ce placard » mais « qu'est-ce qui va se
// perdre, et quel plat le mangerait ».
//
// DEUX RÉCOMPENSES DISTINCTES, ET LES CONFONDRE CASSERAIT LES DEUX.
//
// *Utiliser* le placard est déjà payé, et ailleurs : un ingrédient du
// garde-manger ne crée pas de ligne de courses, donc `article_marginal` ne monte
// pas. Un plat bâti sur ce qu'on a gagne déjà, sans que personne ait eu à
// l'écrire.
//
// CETTE PHRASE A ÉTÉ FAUSSE ENTRE T22 ET T24, ce qui vaut d'être noté parce
// qu'elle servait à justifier tout le reste. Elle n'était vraie que de
// `rayons.placard` — le sel, l'huile. Les 45 ingrédients du garde-manger, eux,
// étaient rangés dans `rayons.épicerie` : `provenance()` les disait `courses`,
// ils produisaient une ligne d'achat, et un plat qui puisait dans le stock était
// donc PÉNALISÉ de 0,4 au lieu d'être neutre. La conclusion tenait, la raison
// était fausse. T24 a branché `provenance()` sur le relevé, et la phrase est
// redevenue vraie.
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

import { fractionDe, marque } from "./axe";
import type { Catalogue, ConservationDenree, Denree, Etat, Plat, Urgence } from "./types";

/** Du plus pressé au moins. Ne sert plus qu'à ORDONNER la liste « à sauver » :
 *  le score, lui, est passé sur l'axe 0–1 de `axe.ts` — deux échelles pour deux
 *  usages seraient deux occasions de diverger, mais celle-ci ne classe que des
 *  lignes d'écran et n'entre dans aucun calcul. */
const RANG: Record<Urgence, number> = { haute: 3, moyenne: 2, basse: 1 };

/** L'id d'achat, alias résolus. Le garde-manger et les recettes puisent dans le
 *  même vocabulaire, mais rien ne garantit qu'ils aient choisi la même
 *  orthographe — `oignons` d'un côté, `oignon` de l'autre. Sans ce passage, le
 *  rapprochement échoue en silence et le bonus ne tombe jamais. */
const alias = (catalogue: Catalogue, id: string): string => catalogue.rayons.aliases[id] ?? id;

/**
 * CE QUE LE SCORE PAIE, PAR ÉTAT DE LA DENRÉE — T60.
 *
 * Une seule ligne, et c'est la règle entière : **le score ne paie que la
 * barrière rompue.** Un paquet ouvert a une horloge que cuisiner arrête, et
 * c'est la seule chose vraie que le relevé sache dire — `urgence()` le dit déjà
 * mot pour mot côté Python : « le paquet entamé : la barrière est rompue,
 * l'horloge tourne ».
 *
 * CE QUE ÇA ÉCARTE, ET POURQUOI CE N'EST PAS LE CHEMIN QUE LE TICKET AVAIT PRÉVU.
 * T60 demandait d'écarter l'artefact du sous-évier en retirant du score les
 * denrées que leur ZONE abîme. Mesuré, ce geste-là ne fait rien : les quatre
 * légumes sous l'évier sont `etat: frais`, et `urgence()` rend `haute` sur le
 * frais AVANT même de regarder la zone. Ils seraient tout aussi `haute` dans une
 * cave sèche. Le seul `haute` purement dû à sa zone est le sachet de pignons —
 * qui n'est dans aucun plat, donc n'a jamais rien payé. Retirer « la cause
 * zone » aurait laissé le +5 sur l'oignon intact et le ticket clos à tort.
 *
 * CE QUI EST VRAI, ET QUE CE FICHIER ÉCRIVAIT DÉJÀ EN TÊTE : l'oignon est dans
 * 42 % des 86 plats, l'ail dans 19 %. Ces quatre-là seront mangés de toute
 * façon ; le terme qui les signale est presque une constante, donc il ne
 * départage rien — il déplace juste tout le classement vers les plats qui
 * contiennent un aromate. Le frais du primeur n'est d'ailleurs pas une denrée de
 * placard qu'on sauve : c'est la classe que T46 avait déjà dû clôturer pour les
 * planchers, sur exactement les mêmes quatre ids (ail, échalote, oignon, pomme
 * de terre).
 *
 * L'APP N'ARRÊTE PAS DE LE DIRE POUR AUTANT, ELLE ARRÊTE DE LE PAYER. Le frais
 * reste dans « À manger en premier », qui est faite pour être lue ; le mauvais
 * rangement reste un geste (« pomme de terre, oignon… — dans un endroit humide
 * (sous-évier) »), qui existe depuis T31. C'est le partage que ce fichier
 * annonce en tête : le score NUDGE, `aSauver()` DÉSIGNE.
 *
 * ⚠ CE QUE ÇA NE FERME PAS. Le vrai axe n'est pas l'état, c'est l'ubiquité — un
 * terme qui tire sur 42 % du corpus ne départage rien, quel que soit son motif.
 * Le mesurer demanderait de comparer CE QU'ON A à CE QU'UN PLAT PREND, et le
 * relevé ne porte pas les quantités du frais (`par_unite: null`). L'état est le
 * meilleur proxy disponible ; il coûte une courgette fraîche qui, elle, mériterait
 * peut-être d'être payée. On la perdra sans le voir jusqu'à ce que les quantités
 * existent.
 */
const ECOULEMENT: Partial<Record<Etat, Urgence>> = { entame: "moyenne" };

/**
 * Ce que le placard offre à écouler, par ingrédient, sur l'axe 0–1 de T57.
 *
 * UNE ENTRÉE PAR INGRÉDIENT, PAS PAR LOT. Le score se pose sur une ligne de
 * recette, qui nomme un ingrédient ; compter quatre fois `pates` parce que
 * quatre fonds de paquet traînent ferait d'un plat de pâtes le meilleur dîner de
 * la semaine, quatre fois de suite.
 *
 * ON PROJETTE L'ÉTAT, PAS L'URGENCE ENREGISTRÉE. Un paquet entamé rangé dans une
 * mauvaise zone sort `haute` de l'export ; il vaut quand même 0,4 ici, parce que
 * ce que cuisiner rattrape est l'ouverture du paquet, pas l'humidité de
 * l'étagère. La différence ne se voit pas sur le relevé du 26/08 — aucune denrée
 * entamée n'est mal rangée — et c'est justement pourquoi elle est écrite.
 *
 * UNE DENRÉE QUE NUL PLAT NE CONSOMME N'Y ARRIVE JAMAIS, sans qu'on ait à la
 * filtrer : `bonusPlacard` part des lignes du PLAT et cherche dedans, jamais
 * l'inverse. Les quatre `moyenne` hors recette du relevé — cracotte, krisprolls,
 * blé-lentilles, farine d'épeautre — ne peuvent donc rien bruiter, et le volet
 * (a) de T60 était déjà tenu par la forme de la boucle. Un test le tient
 * maintenant explicitement, parce qu'une propriété vraie par accident se perd au
 * premier refactor.
 */
export function aEcouler(catalogue: Catalogue): Map<string, number> {
  const par = new Map<string, number>();
  for (const d of catalogue.gardeManger.denrees) {
    const u = ECOULEMENT[d.etat];
    if (!u) continue;
    const f = fractionDe(u);
    if (f == null) continue;
    const id = alias(catalogue, d.ingredient);
    par.set(id, Math.max(par.get(id) ?? 0, f));
  }
  return par;
}

/** Au-delà, le plat ne gagne plus rien — T59. Trois articles sauvés valent trois
 *  fois un article ; le quatrième ne dit plus rien de neuf sur ce plat-là, il
 *  dit qu'il a une longue liste d'ingrédients, ce que `article_marginal` fait
 *  déjà payer. Le plafond n'est PAS une dégressivité : les trois premiers
 *  comptent plein, ce qui était la demande explicite du ticket. */
export const PLAFOND_ARTICLES = 3;

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
  pressees: ReadonlyMap<string, number>,
  poids: Record<string, number>,
): BonusPlacard {
  const vus = new Map<string, number>();
  for (const ing of plat.ingredients) {
    if (ing.base) continue;
    const id = alias(catalogue, ing.id);
    const f = pressees.get(id);
    // Absent de l'axe = rien à écouler ici : une conserve scellée attendra, un
    // légume frais se règle par le rangement et par la liste. Voir `ECOULEMENT`.
    if (f == null) continue;
    vus.set(id, f);
  }

  // LE SCORE CUMULE ENFIN, ET C'EST L'ABANDON D'UNE RÈGLE ÉCRITE ICI — T59.
  //
  // La version d'avant payait un forfait par plat, jamais par ingrédient, parce
  // que cumuler donnait +10 à presque tout ce qui contient un oignon et de l'ail
  // et faisait gagner les plats à LONGUE LISTE D'INGRÉDIENTS. L'argument était
  // juste, le remède visait à côté : ce qui bruitait n'était pas le cumul, c'était
  // que le frais ubiquitaire soit payé du tout. T60 le retire à la source, et le
  // cumul redevient ce qu'il aurait toujours dû être — un plat qui sauve trois
  // choses vaut mieux qu'un plat qui en sauve une.
  //
  // L'OBJECTION D'ÉQUILIBRAGE A ÉTÉ SOULEVÉE ET ÉCARTÉE, et elle vaut d'être
  // relue avant d'être ressortie : un plafond à +15 dépasse `proteine_manquante:
  // 6`. Trois raisons. Le levier de correction est le nombre `ecoule` lui-même et
  // non un mécanisme de plus (`equilibre.yaml` : « valeur posée à vue, à régler à
  // l'usage »). Le mode d'échec redouté — la répétition — est déjà défendu trois
  // fois : `repetition_profil: -4`, `repetition_feculent: -3`, `cooldown_jours:
  // 10` depuis T52. Et surtout LA DOMINATION EST LE CAHIER DES CHARGES :
  // Workspace#41 demande d'encourager « au maximum » l'utilisation des stocks,
  // donc l'écoulement qui passe devant la protéine manquante n'est pas un
  // déséquilibre, c'est l'app qui fait son travail.
  //
  // LES PLUS PRESSÉS D'ABORD, quand il y en a plus de trois : le plafond doit
  // couper la queue de la liste, pas un article au hasard de l'ordre des lignes
  // de la recette. À égalité on tranche par nom, pour que deux rendus de la même
  // semaine donnent le même score.
  const classes = [...vus].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "fr"));
  const payes = classes.slice(0, PLAFOND_ARTICLES);
  const score = (poids["ecoule"] ?? 0) * payes.reduce((s, [, f]) => s + f, 0);

  return {
    // Arrondi au dixième comme le score entier : 5 × 0,4 doit donner 2 et non
    // 2,0000000000000004, sans quoi un test de non-régression du placard
    // deviendrait un test de virgule flottante.
    score: Math.round(score * 10) / 10,
    // TOUS LES SAUVÉS SONT NOMMÉS, MÊME AU-DELÀ DU PLAFOND. La phrase dit ce que
    // le plat sauve, le score dit ce que ça vaut ; n'en nommer que trois ferait
    // mentir la première pour justifier le second.
    noms: classes.map(([id]) => id.replace(/-/g, " ")),
    // La même échelle décide du chiffre ET du mot : `urgent` est vrai quand le
    // plus pressé des articles a franchi le seuil haut de T57. Sur le relevé du
    // 26/08 il ne l'est jamais — le placard n'offre plus que des paquets entamés,
    // à 0,4 — et la phrase urgente attend le dépôt, que T47 branchera ici.
    urgent: marque(classes[0]?.[1] ?? null) === "urgent",
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
