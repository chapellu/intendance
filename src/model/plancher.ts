// Le plancher — T34 à T38 du backlog, tranchés par Workspace#43.
//
// LE MOT EST `plancher`, ET CE N'EST PAS UN DÉTAIL. « Réserve » est déjà pris
// dans ce foyer : `docs/cuisine/stock.md` appelle ainsi le PAQUET scellé
// derrière le bocal distributeur — un objet physique, pas une cible.
// `equilibre.yaml` emploie `plancher` dans exactement le sens d'ici, et depuis
// le prototype : l'ordre permanent de RimWorld, « cuisiner jusqu'à en avoir N ».
//
// ────────────────────────────────────────────────────────────────────────────
// LE PLANCHER SE POSE SUR CE QU'UN PLAT PRODUIT, JAMAIS SUR LA RECETTE (T34).
//
// Le dépôt est indexé sur les TYPES ÉMIS, et la correspondance est
// plusieurs-à-plusieurs. Mesuré sur le corpus (`npm run planchers`) : 78 emits
// pour 74 types distincts, dont quatre sortent de deux recettes chacun —
// `reste-roti`, `carcasse-volaille`, `jus-pois-chiches`, `parures-legumes`. Un
// plancher sur la recette voudrait dire qu'un poulet en cocotte ne recharge pas
// le même `reste-roti` qu'un rôti roulé aux herbes, ce qui est absurde : c'est
// le même bocal, dans le même tiroir.
//
// Le plat producteur est donc DÉRIVÉ — « qu'est-ce qui recharge ce type » — et
// quand plusieurs le rechargent, ils touchent TOUS le bonus. « Partager » ne
// veut pas dire diviser : ce sont deux bonnes réponses à la même question, et
// en fractionner la valeur ferait qu'un type facile à refaire vaudrait moins
// qu'un type qu'une seule recette sait produire, ce qui est l'inverse du vrai.
//
// ────────────────────────────────────────────────────────────────────────────
// CE QUE LA MESURE A CONTREDIT, ET IL FAUT LE LIRE AVANT DE CROIRE LE TICKET.
//
// Workspace#43 s'appuyait sur trois faits de corpus qui ne tiennent plus :
//
//  — « `pain-rassis` est émis par 5 recettes » : il est émis par ZÉRO. Trois
//    types sont `accepts` par des recettes sans que rien ne les produise —
//    `pain-rassis`, `kasha-cuit`, `pois-chiches-cuits`. Le modèle en sort
//    indemne, et c'est justement la preuve que dériver le producteur était la
//    bonne idée : un type sans producteur n'a aucun plat à encourager, donc
//    aucun plancher n'est proposable dessus, sans qu'une seule ligne ait eu à
//    prévoir le cas.
//  — « les 13 `kind: base` sont exactement les 13 types que quoi que ce soit
//    `accepts` » : il y a 12 types `base` et 14 types acceptés, et
//    l'intersection en fait 9. Cinq types acceptés ne sont pas des bases, trois
//    bases ne sont acceptées nulle part.
//  — les tailles ont bougé : 78 emits (et non 69), 50 congelables (et non 46).
//
// Rien de tout ça ne change le contrat ; tout le change de PREUVE. C'est noté
// ici parce qu'un jour quelqu'un relira #43 et croira ces trois phrases.
//
// ────────────────────────────────────────────────────────────────────────────
// CE QUI N'EST PAS ICI. L'écoulement a reçu son dénominateur (T47) et vit dans
// `ecoulement.ts` ; la saison (T42), la fenêtre de fermeture (T43) et le retrait
// d'un plancher démenti (T44) sont des tickets à part. Ce fichier ne sait dire
// qu'une chose : ce qui manque au congélateur, et quel plat le remonterait.
//
// LES DEUX SE CROISENT MAINTENANT DANS LE SCORE, et c'est voulu : reconstituer
// est un forfait, écouler est une rampe, et l'un passe devant l'autre quand le
// lot qu'on remplacerait a consommé 0,80 de sa vie. Voir `ecoulement.ts`.

import { bandRepas, type LigneDepot } from "./depot";
import type { Evenement } from "./journal";
import type { Catalogue, EmitKind, Plat } from "./types";

/* ══════════════════════════════════════════════════════ les deux populations */

/**
 * DEUX POPULATIONS, PARCE QU'UN POT-AU-FEU MET TROIS CHOSES EN STOCK D'UN SEUL
 * SOIR (T35) : `bouillon-pot-au-feu` (une `base` — elle ne fait pas un dîner,
 * elle en accélère un), `viande-pot-au-feu` (un dîner) et
 * `legumes-pot-au-feu` (`congelo: false`, il reste au frigo).
 *
 * « Un pot-au-feu d'avance » n'est donc pas une phrase que le modèle peut
 * tenir. « Toujours de quoi accélérer » et « toujours un dîner d'avance » en
 * sont deux, et elles n'achètent pas la même chose : la première sauve quarante
 * minutes un soir où l'on cuisine, la seconde sauve le soir où l'on ne cuisine
 * pas.
 *
 * La population se lit sur le `kind`, jamais sur une étiquette : c'est déjà la
 * discipline de `categorie()`.
 */
export type Population = "apport" | "diner";

export const populationDe = (kind: EmitKind): Population => (kind === "base" ? "apport" : "diner");

/** Un type émis, dit en français. Le catalogue n'a pas de libellé lisible pour
 *  ce qu'un plat produit — c'est noté au backlog depuis T15. */
export const nomDuType = (type: string): string => type.replace(/-/g, " ");

/* ═══════════════════════════════════════════════════════════════ le plancher */

export interface Plancher {
  /** UN TYPE ÉMIS, JAMAIS UN PLAT — c'est tout T34. */
  type: string;
  /** En portions : l'unité du budget de rangement, celle que `band` compte. */
  niveau: number;
}

/**
 * Qui recharge quoi. DÉRIVÉ, JAMAIS SAISI.
 *
 * Rendu pour tous les types, congelables ou non : c'est la table « qu'est-ce
 * qui produit ça », et elle sert aussi à dire pourquoi un type n'est pas
 * proposable. Un type absent de cette table n'a aucun producteur, ce qui est le
 * cas de trois des quatorze types acceptés du corpus.
 */
export function producteurs(catalogue: Catalogue): Map<string, string[]> {
  const par = new Map<string, string[]>();
  for (const p of catalogue.plats)
    for (const e of p.emits) {
      const l = par.get(e.type) ?? [];
      if (!l.includes(p.id)) l.push(p.id);
      par.set(e.type, l);
    }
  return par;
}

/**
 * Les types sur lesquels un plancher peut exister, et leur population.
 *
 * SEULEMENT CE QUI SE CONGÈLE, ET C'EST UNE RESTRICTION ASSUMÉE. Un plancher
 * compte des portions au congélateur ; le poser sur un reste qui tient trois
 * jours au frigo fabriquerait une cible impossible à tenir, qui réclamerait de
 * cuisiner tous les trois jours pour rien. C'est le même arbitrage que T46 rend
 * côté garde-manger — un plancher n'existe que là où l'app sait compter.
 *
 * ⚠ LA CONDITION DE RÉOUVERTURE EST REMPLIE, ET PERSONNE N'A ENCORE DÉCIDÉ.
 * Cette phrase disait « il se rouvrira le jour où Workspace#50 aura donné une
 * horloge au frigo » : c'est fait depuis T54, chaque type porte sa fenêtre. Le
 * frigo est donc devenu comptable, et la restriction ci-dessus n'est plus
 * défendue par une impossibilité mais par un choix que rien n'a réexaminé. Noté
 * au backlog plutôt que tranché ici.
 *
 * Mesuré : 50 des 78 emits se congèlent, sur 46 des 86 plats.
 */
export function planchables(catalogue: Catalogue): Map<string, Population> {
  const par = new Map<string, Population>();
  for (const p of catalogue.plats)
    for (const e of p.emits) if (e.congelo) par.set(e.type, populationDe(e.kind));
  return par;
}

/* ══════════════════════════════════════════════════ ce que le catalogue dit */

/**
 * Les quatre nombres du congélateur, lus au catalogue.
 *
 * LES DÉFAUTS SONT UN FILET, PAS UNE SOURCE. `equilibre.congelateur` est parsé
 * en `Record<string, number | boolean>`, donc rien dans les types n'oblige le
 * fichier à porter ces clés. Un test épingle qu'il les porte VRAIMENT : c'est
 * la leçon de T48, où cinq réglages étaient lus, typés, et sans effet — et où
 * l'un d'eux donnait par hasard la bonne réponse, ce qui l'a gardé mort deux
 * tickets de plus.
 */
export interface ReglagesCongelo {
  /** Le plancher de secours mutualisé, en portions (T36). */
  secours: number;
  /** Sur combien de types distincts ces portions doivent se répartir. */
  diversite: number;
  /** Un plafond par population, contre les places du congélateur (T35). */
  plafonds: Record<Population, number>;
  /** La capacité physique : trois tiroirs de six (#29). */
  limite: number;
}

const nombre = (o: Record<string, number | boolean>, cle: string, defaut: number): number => {
  const v = o[cle];
  return typeof v === "number" ? v : defaut;
};

export function reglagesDuCongelo(catalogue: Catalogue): ReglagesCongelo {
  const c = catalogue.equilibre.congelateur;
  return {
    secours: nombre(c, "plancher", 4),
    diversite: nombre(c, "diversite_min", 3),
    plafonds: {
      apport: nombre(c, "plafond_apports", 6),
      diner: nombre(c, "plafond_diners", 12),
    },
    limite: catalogue.foyer.espaces.congelo.limite,
  };
}

/* ═════════════════════════════════════════════════════ l'état du congélateur */

export interface EtatCongelo {
  /** Portions par type, congélateur seul. */
  portions: ReadonlyMap<string, number>;
  parPopulation: Readonly<Record<Population, number>>;
  total: number;
  reglages: ReglagesCongelo;
  /** Plus une place : le bonus de reconstitution ne paie plus rien (T38). */
  plein: boolean;
  /** Cette population a mangé sa part des tiroirs, les autres respirent encore. */
  sature: Readonly<Record<Population, boolean>>;
  /** Le type le plus représenté — celui qu'on NOMME quand ça bloque (T38). */
  dominant: { type: string; portions: number } | null;
  /**
   * Le plancher de secours mutualisé (T36).
   *
   * DEUX CONDITIONS, PAS UNE. « Quatre portions » sans diversité, c'est quatre
   * bolognaises — l'utilisateur l'a dit, ce n'est pas une réserve, c'est un
   * stock d'un plat. « Trois types » sans volume, c'est trois fonds de bocal.
   * L'objection tuait le compteur SANS diversité, pas le compteur.
   */
  secours: { portions: number; types: number; sous: boolean };
}

/**
 * Ce que le congélateur porte, lu une fois par proposition.
 *
 * `espace` ET NON `location`, et la distinction est celle que `depot.ts` pose
 * en tête : `espace` dit OÙ ÇA SE RANGE — c'est lui que le budget de rangement
 * compte —, `location` dit COMMENT ÇA VIEILLIT. Un bocal cuisiné lundi refroidit
 * au frigo (`location: "frigo"`) et ira au congélateur : il occupe déjà une
 * place, donc il compte déjà pour son plancher.
 *
 * Les lots épuisés ne comptent pas : la semaine les a mangés, la place est
 * rendue. C'est la même règle que `bilanStockage`, et la faire autrement ferait
 * dire au plancher qu'il est tenu par un bocal qui n'existera plus vendredi.
 */
export function etatDuCongelo(
  catalogue: Catalogue,
  lignes: readonly LigneDepot[],
): EtatCongelo {
  const reglages = reglagesDuCongelo(catalogue);
  const portions = new Map<string, number>();
  const parPopulation: Record<Population, number> = { apport: 0, diner: 0 };

  for (const l of lignes) {
    if (l.epuise || l.espace !== "congelo") continue;
    const n = bandRepas(l.band);
    portions.set(l.type, (portions.get(l.type) ?? 0) + n);
    parPopulation[populationDe(l.kind)] += n;
  }

  const total = parPopulation.apport + parPopulation.diner;
  const plein = total >= reglages.limite;
  let dominant: EtatCongelo["dominant"] = null;
  for (const [type, n] of portions)
    if (!dominant || n > dominant.portions) dominant = { type, portions: n };

  return {
    portions,
    parPopulation,
    total,
    reglages,
    plein,
    sature: {
      apport: plein || parPopulation.apport >= reglages.plafonds.apport,
      diner: plein || parPopulation.diner >= reglages.plafonds.diner,
    },
    dominant,
    secours: {
      portions: total,
      types: portions.size,
      sous: total < reglages.secours || portions.size < reglages.diversite,
    },
  };
}

/* ═══════════════════════════════════════════════════════════════ le bonus */

export interface BonusPlancher {
  /** Ce que ça vaut au score. Zéro quand le plat ne remonte rien, et zéro aussi
   *  quand le congélateur est plein — voir T38. */
  score: number;
  /** Les types que ce plat remonterait, tels qu'on les dira à l'écran. */
  types: string[];
  /** Pourquoi, en français. Une phrase par mécanique, jamais une par type. */
  raisons: string[];
}

const VIDE: BonusPlancher = { score: 0, types: [], raisons: [] };

/**
 * Ce qu'un plat vaut au titre des planchers.
 *
 * DEUX MÉCANIQUES À DEUX MÉTIERS, ET AUCUNE NE REMPLACE L'AUTRE (T36). Le
 * plancher PAR TYPE dit « reconstitue celui-là » — la dernière bolognaise vient
 * de partir. Le plancher de SECOURS dit « il n'y a plus de soir qu'on sauve »,
 * quel que soit le plat. Le pur par-type ne tient pas l'arithmétique tout seul :
 * 48 des 74 types se congèlent, et 48 planchers à une seule portion
 * réclameraient 48 places pour les 18 qui existent.
 *
 * UN BONUS PAR MÉCANIQUE, JAMAIS UN PAR TYPE. Cumuler par type ferait gagner les
 * recettes à longue liste d'emits (un rôti en produit trois) plutôt que celles
 * qui rendent service, ce qui est exactement ce que `article_marginal` existe
 * pour éviter.
 *
 * ⚠ L'ÉCOULEMENT A PRIS LE CHEMIN INVERSE (T59), ET CE N'EST PAS UNE
 * INCOHÉRENCE. `ecoulement()` cumule article par article, plafonné à trois ; ce
 * fichier paie un forfait. La différence est dans ce que chacun désigne : le
 * plancher paie une MÉCANIQUE — « le tiroir est sous son seuil » — qui est vraie
 * une fois, quel que soit le nombre de types qui la rendent vraie. L'axe, lui,
 * paie des OBJETS, et deux bocaux qui courent sont deux problèmes. Ce fichier a
 * donc raison de ne pas cumuler pour la raison même qui donne raison à l'autre
 * de le faire.
 *
 * LE PLAFOND ÉTEINT LE BONUS, IL N'INVENTE PAS DE MALUS (T38). Au-dessus de son
 * plancher, un type ne coûte rien : un plancher est un SEUIL, pas une bande. En
 * dessous d'un congélateur plein, il ne rapporte rien non plus — et l'app dit
 * alors ce qui prend la place, parce que « ça ne paie pas » sans raison est un
 * silence, pas une explication.
 */
export function bonusPlancher(
  plat: Plat,
  etat: EtatCongelo,
  planchers: readonly Plancher[],
  poids: Record<string, number>,
): BonusPlancher {
  const emits = plat.emits.filter((e) => e.congelo);
  if (!emits.length) return VIDE;

  const niveaux = new Map(planchers.map((p) => [p.type, p.niveau]));
  const dessous: { type: string; a: number; niveau: number; paye: boolean }[] = [];
  for (const e of new Map(emits.map((e) => [e.type, e])).values()) {
    const niveau = niveaux.get(e.type);
    if (niveau == null) continue;
    const a = etat.portions.get(e.type) ?? 0;
    if (a >= niveau) continue;
    dessous.push({ type: e.type, a, niveau, paye: !etat.sature[populationDe(e.kind)] });
  }

  const payes = dessous.filter((d) => d.paye);
  const secours = etat.secours.sous;
  let score = 0;
  const raisons: string[] = [];

  if (payes.length) {
    score += poids["plancher_type"] ?? 0;
    raisons.push(
      "reconstitue " +
        payes.map((d) => `${nomDuType(d.type)} (${d.a} sur ${d.niveau})`).join(", "),
    );
  }
  if (secours && !etat.plein) {
    score += poids["plancher_congelo"] ?? 0;
    raisons.push(
      `remonte le stock d'urgence (${etat.secours.portions} portions sur ` +
        `${etat.reglages.secours}, ${etat.secours.types} type${etat.secours.types > 1 ? "s" : ""} sur ` +
        `${etat.reglages.diversite})`,
    );
  }

  // CE QUI EST ÉTEINT SE DIT, une fois, et seulement quand rien n'a été payé.
  // Le dire à côté d'un bonus qui tombe quand même serait une phrase qui
  // contredit la carte sur laquelle elle est écrite.
  if (!score && (dessous.length || secours) && etat.dominant)
    raisons.push(
      `le congélateur est plein — ${etat.dominant.portions} portions de ` +
        `${nomDuType(etat.dominant.type)} sur ${etat.reglages.limite}`,
    );

  return { score, types: payes.map((d) => nomDuType(d.type)), raisons };
}

/* ═══════════════════════════════════════════════ propose-puis-valide (T37) */

/**
 * Combien de fois chaque type planchable est sorti d'une casserole.
 *
 * COMPTÉ SUR LE TYPE, PAS SUR LE PLAT, et c'est la conséquence directe de T34 :
 * deux recettes différentes qui produisent chacune un `reste-roti` ont produit
 * deux `reste-roti`. Un décompte par plat dirait « une fois chacune » et
 * n'atteindrait jamais le seuil, alors que le tiroir, lui, en a bien vu deux.
 */
export function cuissonsParType(
  catalogue: Catalogue,
  evenements: readonly Evenement[],
): Map<string, number> {
  const plats = new Map(catalogue.plats.map((p) => [p.id, p]));
  const par = new Map<string, number>();
  for (const e of evenements) {
    if (e.sorte !== "cuisine") continue;
    const p = plats.get(e.plat);
    if (!p) continue;
    for (const type of new Set(p.emits.filter((x) => x.congelo).map((x) => x.type)))
      par.set(type, (par.get(type) ?? 0) + 1);
  }
  return par;
}

/** À la deuxième cuisson, pas à la première. Une fois est un essai ; deux fois
 *  commence à ressembler à une habitude, et un plancher est une HYPOTHÈSE SUR
 *  DES HABITUDES. Posé à vue, comme le 4 de `congelateur.plancher` avant lui. */
export const CUISSONS_AVANT_PROPOSITION = 2;

export interface Proposition {
  type: string;
  /** Toujours 1 : le plus petit plancher qui veuille dire quelque chose. Sur 18
   *  places, proposer davantage d'office remplirait le congélateur d'hypothèses. */
  niveau: number;
  cuissons: number;
  /** Ce qui le recharge — dérivé (T34), et c'est ce que la proposition MONTRE :
   *  accepter un plancher, c'est accepter de revoir ces plats-là. */
  plats: string[];
}

/**
 * Les planchers que l'app propose, et qu'elle ne pose pas toute seule.
 *
 * SUR 48 TYPES, UN RÉGLAGE À LA MAIN NE SERA JAMAIS FAIT — et `equilibre.yaml`
 * dit de son propre 4 : « valeur posée à vue, à régler à l'usage ». D'où la même
 * discipline que les `apports` de #41 : l'app propose, l'utilisateur confirme,
 * change, ou refuse pour de bon.
 *
 * DÉMARRAGE À FROID : ZÉRO PLANCHER, donc zéro bonus inventé en semaine 1. Ce
 * n'est pas une précaution, c'est la seule position honnête — un journal vide
 * ne dit rien des habitudes de personne.
 */
export function propositions(
  catalogue: Catalogue,
  evenements: readonly Evenement[],
  decides: ReadonlySet<string>,
): Proposition[] {
  const cuissons = cuissonsParType(catalogue, evenements);
  const qui = producteurs(catalogue);
  const out: Proposition[] = [];
  for (const [type, n] of cuissons) {
    if (n < CUISSONS_AVANT_PROPOSITION || decides.has(type)) continue;
    out.push({ type, niveau: 1, cuissons: n, plats: qui.get(type) ?? [] });
  }
  return out.sort((a, b) => b.cuissons - a.cuissons || a.type.localeCompare(b.type, "fr"));
}
