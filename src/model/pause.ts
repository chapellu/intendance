// Ce soir, à la pause de 15 h — T128 (Workspace#66).
//
// ────────────────────────────────────────────────────────────────────────────
// UNE QUESTION, PAS UNE SEMAINE.
//
// Le foyer ne planifie pas et ne planifiera pas : « l'app doit s'adapter à moi,
// pas l'inverse » (16/10). Les petits mangent à 18 h, donc le dîner ne se décide
// pas à 18 h ; il se décide ET SE LANCE à la pause de l'après-midi, en
// télétravail, une casserole sur le feu ou un plat au four. La seule question
// qui compte à ce moment-là est « qu'est-ce que je lance, avec ce qui est là ? »
// — et le fil (« Combien de repas ? ») y répondait par une passe de
// planification.
//
// Ce fichier rend trois ou quatre plats pour CE SOIR, sans passe, sans créneau
// à choisir, sans question préalable. Le créneau existe toujours sous le capot
// — c'est l'index du modèle (`nav/jours.ts`) — et choisir un plat le pose en
// silence sur le dîner de ce soir, exactement comme le fil le fait.
//
// ────────────────────────────────────────────────────────────────────────────
// LE CLASSEMENT EST UN ORDRE, PAS UNE SOMME — et c'est la décision qui commande
// les autres.
//
//   1. CE QUI DOIT ÊTRE MANGÉ : un reste au frigo, un lot qui a passé la moitié
//      de sa vie (`axe.ts`), un paquet du placard qui se perd ;
//   2. RIEN À ACHETER ;
//   3. UN SEUL ARTICLE à acheter — et on le nomme : « il manque : crème » ;
//   4. CE QUI TIENT CE SOIR : prêt à 18 h si on le lance maintenant ;
//   5. PUIS, À ÉGALITÉ SEULEMENT : la variété (pas mangé ces trois derniers
//      jours), les légumineuses et les légumes, la saison, le format familier,
//      le peu de temps devant le feu.
//
// UNE SOMME POUVAIT TOUT RACHETER, ET C'EST CE QUI A NOURRI LES PÂTES. Le score
// de `comptoir()` additionne protéine manquante, familles de légumes, chaînage,
// écoulement et `article_marginal` : un plat à six articles s'y rachète par
// trois bons termes. L'année simulée l'a payé 210 soirs de pâtes sur 323 —
// chaque carte proposée réclamait des courses un jour sans courses, le foyer la
// refusait, et il ne restait que le paquet du placard. Un ordre ne se rachète
// pas : un plat à zéro article passe devant un plat à un article, quels que
// soient leurs mérites respectifs, parce que l'autre ne se fait pas ce soir.
//
// CE QUI DEMANDE PLUSIEURS ACHATS NE SORT QU'UN JOUR DE COURSES (mercredi et
// samedi pour ce foyer), ou derrière « voir plus ». On ne le retire pas — la
// règle du dépôt : on n'enlève pas une proposition pour une lacune, on
// l'annonce —, on le range là où il ne coûte pas un refus.

import { dejeunerDuStock, fourneeAProposer, fruitsMurs, midiDeDemain, type DejeunerDuStock, type Fournee, type MidiDeDemain } from "./repas";
import { marque, SEUIL_A_MANGER } from "./axe";
import { calculer } from "./calcul";
import type { LigneDepot, LotInitial } from "./depot";
import { ceQuiEstIci, ceQuiManque, ceQueLaCarteDitIci, type Article } from "./ici";
import { HEURE } from "./heures";
import type { Jeu } from "./jeu";
import { deSaison, saisonDuPlat } from "./saisons";
import { comptoir, type Carte, type Savoir } from "./scoring";
import type { Catalogue, Etape, Plat } from "./types";

/* ═══════════════════════════════════════════════════════════ les réglages */

/**
 * Les jours où le foyer fait les courses — 18/10, « mercredi et samedi ».
 *
 * UNE CONSTANTE, PAS UN CHAMP DU FOYER : `household.yaml` ne le porte pas et ce
 * ticket ne touche pas au catalogue (une autre branche y travaille). Même
 * statut que `heures.ts` : une hypothèse assumée, à un seul endroit.
 */
export const JOURS_DE_COURSES: readonly string[] = ["mercredi", "samedi"];

/** Combien de cartes la proposition montre d'emblée. La quatrième place est
 *  réservée — voir `proposerCeSoir`. */
export const TAILLE = 3;

/** « Pas mangé ces derniers jours » — Workspace#71 : le foyer simulé refusait un
 *  plat mangé dans les trois jours. Ce n'est PAS le cooldown de la main (dix
 *  jours, `equilibre.main`) : ce foyer mange souvent la même chose, et c'est la
 *  routine sur laquelle bâtir (16/10). */
export const JOURS_DE_VARIETE = 3;

/**
 * Ce que pèse chaque préférence À ÉGALITÉ DE RANG — et seulement là.
 *
 * DES POIDS DOUX, PARCE QUE CE SONT DES PRÉFÉRENCES. Aucun ne fait passer un
 * plat devant un autre d'un rang meilleur ; ils départagent deux plats qui
 * coûtent la même chose ce soir.
 */
export const POIDS = {
  /** Mangé il y a moins de trois jours. Un malus, pas un filtre : le foyer
   *  répète ses plats, et un plat d'avant-hier vaut mieux que pas de dîner. */
  recent: -6,
  /** Mange un lot qui attend sans presser — le congélo, un bocal jeune. */
  attend: 3,
  /** Légumineuses (#70) : un pas doux, pas une conversion. */
  legumineuse: 2,
  /** Par famille de légumes, plafonné à trois. */
  legume: 0.5,
  /** Peu de temps devant le feu : la pause dure dix à quinze minutes. */
  actifCourt: 2,
  actifMoyen: 1,
  actifLong: -1,
  /** Un jour de courses, chaque article redevient un simple coût. */
  articleUnJourDeCourses: -1.5,
  /** Par légume de saison (deux au plus) et par légume hors saison. */
  saison: 1,
  horsSaison: 0.5,
  /** Quiche, soupe, gratin. */
  format: 2,
  /** T135 — PAR FOIS mangé ces `JOURS_DE_ROTATION` jours. S'ajoute à `recent` :
   *  le foyer répète ses plats préférés, mais pas 41 fois l'an. Trois fois en
   *  deux semaines coûtent autant qu'avant-hier. */
  repetition: -2,
  /** T135 — par soir des `JOURS_DE_FORMAT` derniers où ce FORMAT a été mangé :
   *  pas trois soupes de suite. Plus doux que la répétition d'un plat. */
  memeFormat: -1.5,
  /** T135 — pas mangé depuis plus de `JOURS_D_OUBLI` jours, et faisable ce
   *  soir : un petit rappel, pas une conversion. */
  oublie: 1.5,
} as const;

/** T135 — la mémoire longue de la rotation. */
export const JOURS_DE_ROTATION = 14;
export const JOURS_DE_FORMAT = 2;
export const JOURS_D_OUBLI = 30;

/* ═══════════════════════════════════════════════════════════════ l'horaire */

export interface Horaire {
  /** Du premier geste au plat servi, attentes comprises, sans les étapes qui
   *  se font PENDANT une autre (`enParallele`). */
  total: number;
  /** Ce qui demande quelqu'un devant le feu (`surveille`). */
  actif: number;
  /** Le même total quand chaque attente qui a un repli le prend (`rattrapage`). */
  rattrape: number;
}

/**
 * Combien de temps ce plat prend, lu dans SES ÉTAPES.
 *
 * PAS `plat.minutes`, ET C'EST LA RÈGLE DU RÉPERTOIRE (T81). Le temps de la
 * carte diffère de la somme des étapes sur 110 plats sur 138 ; la proposition
 * dit le temps de la fiche qu'elle ouvre, sinon on lirait « prêt à 17 h 40 » et
 * la mise en place annoncerait vingt minutes de plus.
 *
 * L'EXPORT PORTE `avanceMin` ET `minutesSurPlace`, que le chargeur jette. Les
 * charger aurait voulu dire toucher `model/catalogue.ts`, que la branche de
 * catalogue est en train de modifier ; les étapes disent la même chose pour
 * l'usage qu'on en fait ici. Un plat sans étapes (15 plats du foyer) retombe
 * sur ses champs : `minutes`, et `actifMin` quand il est saisi.
 */
export function horaire(plat: Plat): Horaire {
  const steps: Etape[] = plat.steps;
  if (!steps.length) {
    const total = plat.minutes;
    return { total, actif: plat.actifMin ?? total, rattrape: total };
  }
  let total = 0;
  let actif = 0;
  let gain = 0;
  for (const s of steps) {
    if (!s.enParallele) total += s.minutes;
    if (s.surveille) actif += s.minutes;
    if (s.attente) {
      total += s.attente;
      if (s.rattrapage) gain += Math.max(0, s.attente - s.rattrapage.coutMin);
    }
  }
  return { total, actif, rattrape: total - gain };
}

/** Minutes depuis minuit. */
export const minuteDuJour = (d: Date): number => d.getHours() * 60 + d.getMinutes();

/** L'heure du dîner de ce foyer, en minutes depuis minuit — `heures.ts`. */
export const heureDuDiner = (): number => HEURE["diner"] ?? 18 * 60;

/* ══════════════════════════════════════════════════ la décongélation */

/**
 * Les formats dont une portion congelée va DIRECTEMENT dans la casserole.
 *
 * TROIS HEURES NE DÉCONGÈLENT PAS UN BLOC. La proposition comptait toute
 * portion du congélateur comme cuisinable le soir même (« à sortir
 * maintenant ») — vrai pour une soupe, une sauce, un mijoté, qui se
 * réchauffent à feu doux depuis le bloc ; faux pour un gratin, une quiche, un
 * poulet cuit, qu'on ne sert pas à 18 h s'ils sortent à 15 h.
 *
 * AUCUNE DONNÉE PAR PLAT NE LE DIT. Le catalogue porte une chaîne de repli du
 * FOYER (`rules.yaml`, `decongeler` : micro-ondes une demi-heure, sinon une
 * nuit au frigo), que l'export ne transporte pas et qui ne distingue pas un
 * velouté d'un gratin ; les sorties (`emits`) ne portent ni geste de
 * réchauffage ni durée de décongélation. D'où la règle par défaut, dite par
 * l'utilisateur le 19/10 : sauces, soupes et mijotés vont du congélo au feu ;
 * le reste demande la veille.
 */
export const FORMATS_DIRECT_AU_FEU: ReadonlySet<string> = new Set(["soupe", "mijote"]);

/** Ce que le NOM d'une sortie suffit à dire — une sauce, un bouillon, un
 *  velouté se réchauffent depuis le bloc, quel que soit le plat qui les a
 *  faits (la carcasse, elle, est une base de bouillon et pas un bouillon) ; des
 *  légumineuses ou une céréale cuites passent du sachet à la poêle. */
const NOMS_DIRECT_AU_FEU = /^(?:sauce|bouillon|soupe|veloute|potage|jus|bolognaise)-|^(?:lentilles|pois-chiches|haricots|cereale)-.*cuite?s?$/;

/**
 * Une portion congelée de ce type peut-elle aller du congélo à la casserole
 * ce soir ? Sinon, elle demande une nuit au frigo.
 *
 * LU SUR LES PLATS QUI LA PRODUISENT : un type émis par une soupe ou un mijoté
 * (`format`) se réchauffe depuis le bloc ; un type que seuls des gratins, des
 * quiches ou des pièces produisent, non. Un type que rien ne produit au
 * catalogue retombe sur la prudence — la veille.
 */
export function directAuFeu(catalogue: Catalogue, type: string): boolean {
  if (NOMS_DIRECT_AU_FEU.test(type)) return true;
  return catalogue.plats.some(
    (p) => p.format !== null && FORMATS_DIRECT_AU_FEU.has(p.format) && p.emits.some((e) => e.type === type),
  );
}

/** Un lot du congélateur qui ne se cuisine pas ce soir : il se sort ce soir,
 *  au frigo, pour demain. */
export const aDecongelerLaVeille = (catalogue: Catalogue, l: Pick<LotInitial, "type" | "location">): boolean =>
  l.location === "congelo" && !directAuFeu(catalogue, l.type);

/* ═══════════════════════════════════════════ la saison et le format */

/**
 * Ce que la saison vaut pour un plat ce mois-ci — à rang égal seulement.
 *
 * DEMANDÉ LE 18/10 ET REDEMANDÉ LE 19 : « encourager les légumes de saison ».
 * `saisonDuPlat` (branche de catalogue) dit lesquels de ses légumes sont de
 * saison et lesquels ne le sont pas ; on paie les premiers, on fait payer un
 * peu les seconds, et un plat sans légume à vraie saison — les dîners du fond,
 * l'oignon et la carotte qui sont de garde — vaut zéro. Plafonné : deux légumes
 * de saison disent déjà tout ce que la saison a à dire.
 *
 * `Source.saison` RESTE UN NO-OP DÉCLARÉ (voir `types.ts`) : c'est la saison du
 * LIVRE, pas celle du marché.
 */
export function scoreSaison(catalogue: Catalogue, plat: Plat, mois: number): number {
  const s = saisonDuPlat(catalogue, plat, mois);
  return (
    Math.min(2, s.deSaison.length) * POIDS.saison -
    Math.min(2, s.horsSaison.length) * POIDS.horsSaison
  );
}

/** Les formats que le foyer cuisine déjà sans y penser — 18/10. */
export const FORMATS_FAMILIERS: ReadonlySet<string> = new Set(["quiche", "soupe", "gratin"]);

/**
 * Ce que le format vaut — « passer par ce qu'on sait déjà cuisiner : quiche,
 * soupe, gratin ». Le chemin vers les légumes passe par des gestes connus ; une
 * soupe de pois cassés n'est pas un plat exotique, c'est une soupe.
 */
export const scoreFormat = (plat: Plat): number =>
  plat.format && FORMATS_FAMILIERS.has(plat.format) ? POIDS.format : 0;

/* ═══════════════════════════════════════════════════════ la proposition */

/** Un lot du dépôt que la carte mangerait, dit avec ce qu'il faut pour le
 *  nommer — la phrase est l'affaire de l'écran (`ceSoir.vue.ts`). */
export interface LotMange {
  type: string;
  kind: LigneDepot["kind"];
  location: LigneDepot["location"];
  band: string;
  /** Jours avant la fin de sa fenêtre ; 0 = aujourd'hui. */
  joursRestants: number;
}

export interface CarteDuSoir {
  plat: Plat;
  /** La carte du comptoir, pour ce qu'elle sait déjà dire (chaînage, récit,
   *  paris). Son `score` n'est PAS celui du classement ici. */
  carte: Carte;
  /** Ce qu'il faut acheter pour la lancer. */
  manque: Article[];
  /**
   * Ceux de `manque` qui sont HORS SAISON ce mois-ci — des orties en octobre.
   *
   * ILS NE S'ACHÈTENT PAS, ET LA CARTE NE SE FAIT DONC PAS CE SOIR. Vu le 19/10 :
   * « Velouté d'ortie » sortait deuxième, « il manque : pointes d'orties »,
   * compté comme un seul article à prendre en passant. Un article qu'on ne
   * trouvera nulle part n'est pas un article à acheter : la carte passe sous
   * tout ce qui se fait (`ordre`) et sort de la main (`proposerCeSoir`).
   */
  horsSaison: Article[];
  /** L'accompagnement absent — dit, pas compté (voir `fond.ceQuiManque`). */
  aCote: Article[];
  /** Ce que la carte tient pour là — l'instantané que « Je lance ça » écrit
   *  sur le créneau (`DecisionCreneau.ici`), pour que la liste de courses ne
   *  demande que `manque` (et `aCote`, qu'elle dit). */
  ici: string[];
  /** Ce que ce plat sauve, quand il sauve quelque chose : rang 1. */
  presse: LotMange | { placard: string } | null;
  /** Le lot qui attend sans presser et que ce plat mangerait. */
  attend: LotMange | null;
  horaire: Horaire;
  /** Prêt à 18 h si on le lance maintenant. */
  tient: boolean;
  /** …à condition de prendre le repli d'une attente (trempage rattrapé). */
  parRattrapage: boolean;
  /** À quelle minute du jour il est prêt si on le lance maintenant. */
  pret: number;
  /** Mangé ces trois derniers jours. */
  recent: boolean;
  /** Le départage, à rang égal. */
  score: number;
  /** T142 — ce que demain midi peut prendre à ce plat, boîtes comprises. */
  midi: MidiDeDemain;
}

/** Un lot à sortir ce soir pour demain, et le plat qui le mangerait. */
export interface ASortir {
  lot: LotMange;
  /** Le plat qui le finit le mieux demain — `null` quand aucun ne le prend
   *  expressément (un reste se réchauffe alors tel quel). */
  plat: Plat | null;
}

export interface PropositionDuSoir {
  /** L'index du dîner de ce soir dans `jeu.creneaux`, -1 s'il n'existe pas. */
  soir: number;
  jourDeCourses: boolean;
  /** Trois ou quatre plats, dans l'ordre. */
  cartes: CarteDuSoir[];
  /** Le reste, dans le même ordre — « voir plus ». */
  plus: CarteDuSoir[];
  /** Ce qui attend dans le dépôt, du plus pressé au moins — pour le cockpit. */
  attend: LotMange[];
  /**
   * Ce qui ne se décongèle pas d'ici 18 h et se sort donc CE SOIR, au frigo,
   * pour demain — le plus pressé d'abord. Ces lots ne font aucune carte du
   * soir ; ils font le geste du jour quand aucun plat posé n'en appelle un.
   */
  aSortir: ASortir[];
  /**
   * T142 — la fournée du goûter, quand le congélateur s'en vide ou que des
   * fruits passent. Une seule recette, et seulement à la pause : c'est le
   * moment où l'on décide de ce qui cuit. `null` sinon.
   */
  fournee: Fournee | null;
  /**
   * T142 — le déjeuner de Chioca pour aujourd'hui, au cas où le dîner d'hier
   * n'a rien laissé (« Même au boulot » d'abord, le moins d'achats). `null`
   * quand le catalogue n'en a aucun.
   */
  dejeuner: DejeunerDuStock | null;
}

export interface EntreeDuSoir {
  jeu: Jeu;
  savoir: Savoir;
  /** Les plats cuisinés ces `JOURS_DE_VARIETE` derniers jours. */
  recents: ReadonlySet<string>;
  maintenant: Date;
  /** Pour les tests ; par défaut, `JOURS_DE_COURSES`. */
  joursDeCourses?: readonly string[];
  /**
   * Les types SORTIS DU CONGÉLATEUR HIER SOIR — le « Fait » du geste du jour
   * de la veille (`cleGeste`). Ils ont passé la nuit au frigo : ce soir, ils
   * se cuisinent comme un lot du frigo. Sans eux, le geste ne fermerait
   * jamais la boucle — le gratin sorti hier resterait « à sortir » demain.
   */
  sortis?: ReadonlySet<string>;
  /**
   * T135 — CE QUI A ÉTÉ MANGÉ, DATÉ : les cuissons du journal. La mémoire
   * longue de la rotation (`POIDS.repetition`, `memeFormat`, `oublie`) ; sans
   * elle, seul `recents` départage, et le rang 2-3 tourne sur quatre plats.
   */
  mange?: readonly { plat: string; jour: string }[];
  /**
   * T142 — les boîtes propres, après ce que le dépôt occupe
   * (`sortie.vue.contenantsLibres`). Absent : toutes celles du foyer.
   */
  libres?: ReadonlyMap<string, number>;
}

/** Jours entiers de `de` à `a`, deux `AAAA-MM-JJ`. */
const ecart = (de: string, a: string): number =>
  Math.round((Date.parse(`${a}T12:00:00Z`) - Date.parse(`${de}T12:00:00Z`)) / 86_400_000);

/**
 * La rotation d'un plat ce soir — T135. Trois termes, tous dans le départage :
 * aucun ne franchit un rang de `ordre`.
 */
export function scoreRotation(
  catalogue: Catalogue,
  plat: Plat,
  mange: readonly { plat: string; jour: string }[],
  aujourdhui: string,
  faisable: boolean,
): number {
  let fois = 0;
  let dernier = Number.POSITIVE_INFINITY;
  const soirsDuFormat = new Set<string>();
  for (const m of mange) {
    const d = ecart(m.jour, aujourdhui);
    if (d <= 0) continue;
    if (m.plat === plat.id) {
      dernier = Math.min(dernier, d);
      if (d <= JOURS_DE_ROTATION) fois += 1;
    }
    if (plat.format && d <= JOURS_DE_FORMAT) {
      const f = catalogue.plats.find((p) => p.id === m.plat)?.format;
      if (f === plat.format) soirsDuFormat.add(m.jour);
    }
  }
  return (
    fois * POIDS.repetition +
    soirsDuFormat.size * POIDS.memeFormat +
    (faisable && mange.length > 0 && dernier > JOURS_D_OUBLI ? POIDS.oublie : 0)
  );
}

/** Le dîner de ce soir — le premier jour de la fenêtre glissante. */
export const soirDe = (jeu: Jeu): number =>
  jeu.creneaux.findIndex((c) => c.jour === 0 && c.repas === "diner");

/**
 * Un plat qui ne fait que finir un reste — « Reste réchauffé ».
 *
 * IL EST DÉCLARÉ POUR LE DÉJEUNER SEUL (`creneaux: [dejeuner]`), ET LE SOIR EN
 * A BESOIN. Le chaînage de la semaine le gardait au midi parce qu'il y
 * fabriquait la gamelle ; mais « le reste de lentilles est à finir demain » est
 * une réponse au dîner de ce soir aussi, et c'est même la meilleure quand il
 * presse. L'écart de créneau est donc levé pour lui, ici seulement — la
 * recherche et le fil gardent leur règle.
 */
export const finitUnReste = (p: Plat): boolean =>
  p.accepts.length > 0 && p.accepts.every((a) => a.kind === "reste-plat" && a.type === null);

function lotMange(depot: ReturnType<typeof calculer>["depot"], l: LigneDepot, date: Date): LotMange {
  const v = depot.vie(l, date);
  return {
    type: l.type,
    kind: l.kind,
    location: l.location,
    band: l.band,
    joursRestants: v ? Math.max(0, Math.floor(v.fenetre - v.age)) : 0,
  };
}

/**
 * Ce qui presse dans le dépôt, et ce qui attend : un reste au frigo presse
 * toujours (il a une horloge de quelques jours et il est déjà cuisiné) ; un lot
 * qui a franchi la moitié de sa vie presse ; le reste attend.
 */
function presseLeLot(depot: ReturnType<typeof calculer>["depot"], l: LigneDepot, date: Date): boolean {
  if (l.location === "congelo") return marque(depot.vie(l, date)?.fraction ?? null) !== "";
  if (l.kind === "reste-plat") return true;
  return (depot.vie(l, date)?.fraction ?? 0) >= SEUIL_A_MANGER;
}

/**
 * La proposition de ce soir.
 *
 * `comptoir()` NOTE ET ÉCARTE, ET ON NE REFAIT NI L'UN NI L'AUTRE. Les écarts
 * (déjà posé, rôle, central dit absent) sont ceux de toute l'app ; la carte
 * porte déjà le chaînage, le récit et les paris. Ce qui est neuf ici, c'est le
 * RANG : ce qu'il manque contre ce qui est là, ce qui presse, l'heure.
 *
 * LE DÎNER DE CE SOIR EST VIDÉ POUR LE CALCUL. S'il porte déjà un plat, on
 * propose quand même — c'est « Changer » — et le plat posé ne doit ni se
 * déclarer « déjà posé » ni avoir mangé le reste que les autres cartes
 * convoitent.
 */
export function proposerCeSoir(e: EntreeDuSoir): PropositionDuSoir {
  const { jeu, savoir, recents, maintenant } = e;
  const catalogue = jeu.catalogue;
  const soir = soirDe(jeu);
  const jour0 = jeu.jours[0];
  const jourDeCourses = !!jour0 && (e.joursDeCourses ?? JOURS_DE_COURSES).includes(jour0.nom);
  if (soir < 0 || !jour0) return { soir, jourDeCourses, cartes: [], plus: [], attend: [], aSortir: [], fournee: null, dejeuner: null };

  const choix = [...jeu.choix];
  choix[soir] = null;
  // CE SOIR, LE CONGÉLATEUR NE DONNE QUE CE QUI VA DIRECTEMENT AU FEU. Un
  // gratin congelé n'est pas là pour 18 h : le comptoir le voit absent, et le
  // plat qui l'exige s'écarte comme s'il manquait (`carte.manque`). Le dépôt
  // ENTIER sert encore à dire ce qui attend, et ce qu'il faut sortir.
  const sortis = e.sortis ?? new Set<string>();
  const bloque = (l: Pick<LotInitial, "type" | "location">): boolean =>
    aDecongelerLaVeille(catalogue, l) && !sortis.has(l.type);
  const ceSoir: Jeu = { ...jeu, stock: jeu.stock.filter((l) => !bloque(l)) };
  const comp = comptoir(ceSoir, choix, soir, savoir);
  if (!comp) return { soir, jourDeCourses, cartes: [], plus: [], attend: [], aSortir: [], fournee: null, dejeuner: null };

  const base = calculer(jeu, choix);
  const date = jour0.date;
  const iso = isoLocal(maintenant);
  const ici = ceQuiEstIci(catalogue, jeu.gardeManger, savoir.rejeu, iso);
  const fenetre = heureDuDiner() - minuteDuJour(maintenant);
  const mois = maintenant.getMonth() + 1;

  // CE QUI ATTEND, pour le cockpit : le dépôt tel qu'il est AVANT ce soir,
  // vivant, du plus pressé au moins. Un lot périmé ne s'y dit pas — c'est la
  // tâche « à jeter » de T103 qui le porte.
  const vivants = base.depot.lignes.filter((l) => !l.epuise && !base.depot.perime(l, date));
  const attend = vivants
    .filter((l) => l.kind === "reste-plat" || l.kind === "base")
    .map((l) => ({ l, presse: presseLeLot(base.depot, l, date), f: base.depot.vie(l, date)?.fraction ?? 0 }))
    .sort((a, b) => Number(b.presse) - Number(a.presse) || b.f - a.f)
    .map((x) => lotMange(base.depot, x.l, date));

  const lotDe = (type: string): LigneDepot | null => vivants.find((l) => l.type === type) ?? null;

  // À SORTIR CE SOIR POUR DEMAIN : chaque bloc du congélateur qui ne se
  // décongèle pas d'ici 18 h, nommé avec le plat qui le prend expressément —
  // celui qui demande le moins d'achats. Un reste sans plat dédié se réchauffe
  // tel quel, et la phrase le dit sans plat.
  const vusASortir = new Set<string>();
  const aSortir: ASortir[] = [];
  for (const x of attend) {
    if (!bloque(x) || vusASortir.has(x.type)) continue;
    vusASortir.add(x.type);
    const preneurs = catalogue.plats
      .filter((p) => p.creneaux.includes("diner") && p.accepts.some((a) => a.type === x.type))
      .map((p) => ({ p, n: ceQuiManque(catalogue, p, ici).ingredients.length }))
      .sort((a, b) => a.n - b.n || a.p.titre.localeCompare(b.p.titre, "fr"));
    aSortir.push({ lot: x, plat: preneurs[0]?.p ?? null });
  }

  const cartes: CarteDuSoir[] = [];
  for (const p of catalogue.plats) {
    const ecarts = comp.ecarts(p);
    const leve = ecarts.every((x) => x.cle === "creneau") && finitUnReste(p);
    if (ecarts.length && !leve) continue;

    const carte = comp.noter(p);
    // UN PLAT QUI EXIGE UN RESTE QU'ON N'A PAS NE SE FAIT PAS CE SOIR. Il
    // faudrait cuisiner la base avant — c'est une journée, pas une pause.
    if (carte.manque) continue;

    const { ingredients: manque, aCote } = ceQuiManque(catalogue, p, ici, carte.plein);
    const horsSaison = manque.filter((a) => deSaison(catalogue, a.id, mois) === false);

    let presse: CarteDuSoir["presse"] = null;
    let attendIci: LotMange | null = null;
    for (const a of carte.ecoule) {
      if (a.ou === "placard") {
        if (!presse && marque(a.fraction) === "urgent") presse = { placard: a.id };
        continue;
      }
      const l = lotDe(a.id);
      if (!l) continue;
      if (!presse && presseLeLot(base.depot, l, date)) presse = lotMange(base.depot, l, date);
      else if (!attendIci) attendIci = lotMange(base.depot, l, date);
    }

    const h = horaire(p);
    const tientNet = h.total <= fenetre;
    const parRattrapage = !tientNet && h.rattrape < h.total && h.rattrape <= fenetre;
    const duree = parRattrapage ? h.rattrape : h.total;
    const recent = recents.has(p.id);

    let score = 0;
    if (recent) score += POIDS.recent;
    if (attendIci && !presse) score += POIDS.attend;
    if (p.apports.proteine === "legumineuse" || p.apports.feculent === "legumineuse")
      score += POIDS.legumineuse;
    score += Math.min(3, p.apports.legumes.length) * POIDS.legume;
    score += h.actif <= 15 ? POIDS.actifCourt : h.actif <= 25 ? POIDS.actifMoyen : h.actif > 40 ? POIDS.actifLong : 0;
    // UN JOUR DE COURSES, LE LÉGUME DE SAISON À ACHETER NE COÛTE RIEN : c'est
    // précisément ce qu'on est venu chercher au marché (19/10).
    if (jourDeCourses)
      score +=
        POIDS.articleUnJourDeCourses *
        manque.filter((a) => deSaison(catalogue, a.id, mois) !== true).length;
    score += scoreSaison(catalogue, p, mois);
    score += scoreFormat(p);
    if (e.mange)
      score += scoreRotation(
        catalogue, p, e.mange, isoLocal(maintenant),
        horsSaison.length === 0 && (jourDeCourses || manque.length === 0),
      );

    cartes.push({
      plat: p,
      carte,
      manque,
      horsSaison,
      aCote,
      ici: ceQueLaCarteDitIci(catalogue, p, { ingredients: manque, aCote }, carte.plein),
      presse,
      attend: attendIci,
      horaire: h,
      tient: tientNet || parRattrapage,
      parRattrapage,
      pret: minuteDuJour(maintenant) + duree,
      recent,
      score: Math.round(score * 10) / 10,
      midi: midiDeDemain(jeu, p, e.libres),
    });
  }

  cartes.sort(ordre(jourDeCourses));

  // LA MAIN : les trois premiers que l'on peut faire ce soir. Un jour sans
  // courses, « faire ce soir » exclut ce qui demande deux achats ou plus ; et
  // aucun jour ne fait ce qui attend un légume hors saison — le marché du
  // samedi n'a pas d'orties en octobre.
  const faisable = (c: CarteDuSoir): boolean =>
    c.horsSaison.length === 0 && (jourDeCourses || c.manque.length <= 1);
  const main = cartes.filter(faisable).slice(0, TAILLE);

  // LA QUATRIÈME PLACE EST AUX LÉGUMINEUSES, et seulement quand aucune des
  // trois n'en est (#70). Un pas doux : on ne déloge personne, on ajoute une
  // carte, et seulement si elle se fait ce soir aux mêmes conditions.
  const legumineuse = (c: CarteDuSoir): boolean =>
    c.plat.apports.proteine === "legumineuse" || c.plat.apports.feculent === "legumineuse";
  if (main.length === TAILLE && !main.some(legumineuse)) {
    const l = cartes.find((c) => faisable(c) && legumineuse(c) && !main.includes(c));
    if (l) main.push(l);
  }

  const dans = new Set(main.map((c) => c.plat.id));
  const fournee = fourneeAProposer(catalogue, jeu.stock, fruitsMurs(catalogue, savoir.rejeu, iso), ici);
  return { soir, jourDeCourses, cartes: main, plus: cartes.filter((c) => !dans.has(c.plat.id)), attend, aSortir, fournee,
    dejeuner: dejeunerDuStock(catalogue, ici, mois) };
}

/**
 * L'ordre du classement — l'en-tête du fichier, en code.
 *
 * UN JOUR DE COURSES, LE COMPTE D'ARTICLES CESSE D'ÊTRE UN RANG : on peut les
 * acheter, ils redeviennent un coût (`POIDS.articleUnJourDeCourses`) et la
 * variété, les légumes, la saison peuvent l'emporter. Les autres jours, zéro
 * article passe devant un, un devant plusieurs, sans appel.
 */
export const ordre =
  (jourDeCourses: boolean) =>
  (a: CarteDuSoir, b: CarteDuSoir): number => {
    // AVANT TOUT, CE QUI NE SE FAIT PAS : un article hors saison ne s'achète ni
    // ce soir ni un jour de courses. Même un plat qui sauverait un reste passe
    // sous les autres — il ne le sauvera pas, faute du légume.
    const introuvable = Number(a.horsSaison.length > 0) - Number(b.horsSaison.length > 0);
    if (introuvable) return introuvable;
    const presse = Number(b.presse !== null) - Number(a.presse !== null);
    if (presse) return presse;
    if (!jourDeCourses) {
      const achats = Math.min(a.manque.length, 2) - Math.min(b.manque.length, 2);
      if (achats) return achats;
    }
    const tient = Number(b.tient) - Number(a.tient);
    if (tient) return tient;
    return b.score - a.score || a.plat.titre.localeCompare(b.plat.titre, "fr");
  };

/** `AAAA-MM-JJ` local — le même jour que `db/schema.jourISO`, sans dépendre de
 *  la base depuis le modèle. */
function isoLocal(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const jj = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${jj}`;
}
