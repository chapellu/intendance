// Le journal, et le niveau qui s'en déduit — T25, T28 à T31.
//
// ────────────────────────────────────────────────────────────────────────────
// CE FICHIER NE STOCKE AUCUN NIVEAU, ET C'EST TOUT SON PROPOS.
//
// `db/schema.ts` s'était écrit la règle : survit ce qu'un DOIGT a décidé, se
// recalcule ce qu'un calcul déduit — « persister un résultat de calcul, c'est
// se garantir qu'il divergera un jour de ses entrées, et que personne ne saura
// laquelle des deux valeurs est la vraie ». Le garde-manger était le seul
// endroit où cette règle n'était pas appliquée, faute d'entrées à dériver.
//
// Les entrées, ce sont TROIS SORTES D'ÉVÉNEMENTS — cuisiné, observation,
// entrée. Le niveau du placard n'est plus une donnée : c'est le rejeu.
//
// Ça répond à l'objection que `garde-manger.yaml` s'était faite à lui-même —
// « un chiffre qu'on croirait tenu à jour alors que rien ne le tient est
// exactement la faute que ce dépôt passe son temps à réparer » — non pas en
// rendant le chiffre plus juste, mais en le DATANT. Trois choses tombent alors
// gratuitement : contredire l'estimation devient un événement ordinaire,
// annuler un « fait » touché par erreur devient possible, et « je n'ai rien vu
// depuis » devient calculable.
//
// ────────────────────────────────────────────────────────────────────────────
// CE QUI SE REJOUE ICI, ET CE QUI NE S'Y REJOUE PAS.
//
// Le GARDE-MANGER se rejoue : personne n'observe une boîte de maïs qui descend,
// donc son niveau est une déduction, et une déduction se date.
//
// Le DÉPÔT ne se rejoue pas, il se constate. Un bocal au congélateur est un
// FAIT — on l'a vu, on l'a posé là — et la table `stock` est déjà le magasin de
// ce que des doigts ont constaté. L'événement cuisiné y écrit ses effets dans
// la même transaction qu'il s'écrit lui-même (voir `db/journal.ts`), pour que
// le journal reste l'histoire complète sans que le dépôt devienne une dérivée
// de plus. Confondre les deux ferait rejouer six mois de cuisine pour savoir
// s'il reste de la bolognaise, alors qu'il suffit d'ouvrir le tiroir.

import type {
  Catalogue, Denree, Espace, Etat, Plat, Quantite, RepasId,
} from "./types";

/* ══════════════════════════════════════════════════════ les trois événements */

export type SorteEvenement = "cuisine" | "observation" | "entree";

interface Commun {
  id?: number;
  /**
   * Le jour du FAIT, en local `AAAA-MM-JJ`.
   *
   * Il vient gratuitement de `DecisionCreneau.jour` pour une cuisson : aucune
   * saisie, et c'est ce qui rend l'événement gratuit à produire.
   */
  jour: string;
  /**
   * Le jour de la SAISIE.
   *
   * DEUX DATES, PARCE QU'ELLES RÉPONDENT À DEUX QUESTIONS. `jour` dit quand
   * c'est arrivé — c'est lui qui ordonne le rejeu. `saisi` est le seul qui
   * puisse dire « je n'ai rien vu depuis » : relever le placard un dimanche
   * pour un mardi oublié restaure la confiance au dimanche, pas au mardi.
   */
  saisi: string;
  maj: number;
}

/**
 * Une cuisson. NE SE DÉCLENCHE QUE SUR UN CRÉNEAU POSÉ — voir T26 et le
 * commentaire de `effetsCuisine`.
 */
export interface EvtCuisine extends Commun {
  sorte: "cuisine";
  repas: RepasId;
  plat: string;
  /**
   * Les parts FIGÉES au moment de cuisiner.
   *
   * `DecisionCreneau.parts: null` veut dire « les parts du foyer, quelles
   * qu'elles soient au moment du calcul » — ce qui est juste pour une semaine à
   * venir et faux pour une semaine passée. Un foyer qui grandit ne doit pas
   * changer rétroactivement ce qui a été mangé.
   */
  parts: number;
}

/**
 * Ce qu'un œil a constaté sur UN ingrédient.
 *
 * `unites: null` est une information et pas un trou : « il y en a, je n'ai pas
 * compté » restaure la confiance sur l'existence sans prétendre à un chiffre.
 */
export interface Constat {
  ingredient: string;
  unites: number | null;
  /** Le signalement à trois états : « des lentilles : oui / il en reste peu /
   *  non ». Une quantité par défaut obligerait à peser pour répondre, donc on
   *  ne répondrait pas, donc l'app cesserait de demander. */
  reste?: "oui" | "peu" | "non";
}

/**
 * Une observation — le seul événement qui RESTAURE la confiance.
 *
 * DEUX PORTÉES, ET LA SECONDE EST CELLE QUI PAIE. Une correction porte sur un
 * ingrédient : c'est ce qu'un doigt fait en passant. Un relevé porte sur une
 * ZONE ENTIÈRE et il est **exhaustif** : ce qui n'y est pas n'y est plus —
 * zéro, pas silence. C'est le seul geste capable de dire « il n'y en a plus »
 * sans énumérer les absents, et c'est ce qui empêche les fantômes de pourrir
 * indéfiniment dans le modèle, c'est-à-dire exactement la façon dont le relevé
 * du 26/08 vieillit.
 *
 * LA ZONE EST LA CLÔTURE — le garde-manger en porte déjà six — donc aucun
 * bouton « terminé » n'est nécessaire : choisir la zone, c'est déclarer la
 * frontière. Et un relevé restaure la confiance sur TOUTE la zone, pas
 * seulement sur les lignes qu'il mentionne : un quart d'heure achète des
 * semaines de silence.
 */
export interface EvtObservation extends Commun {
  sorte: "observation";
  portee: "ingredient" | "zone";
  /** L'id de zone quand `portee === "zone"`, `null` sinon. */
  zone: string | null;
  constats: Constat[];
}

/** Une ligne rentrée. Le poids est celui que LE CANAL a donné — voir T27. */
export interface LigneEntree {
  ingredient: string;
  unites: number;
  /** `null` quand le canal ne pèse pas : trois des quatre canaux du foyer
   *  livrent du non choisi et non pesé. */
  parUnite: Quantite | null;
  zone: string | null;
  etat: Etat;
}

export interface EvtEntree extends Commun {
  sorte: "entree";
  lignes: LigneEntree[];
}

export type Evenement = EvtCuisine | EvtObservation | EvtEntree;

/* ═══════════════════════════════════════════════════════════ l'état dérivé */

/**
 * Les cinq classes de #34, plus celle qui manquait.
 *
 * ELLES SE DÉRIVENT, ELLES NE SE SAISISSENT PAS — la discipline que
 * `garde_manger.py` employait déjà pour `urgence`, et pour la même raison : ce
 * qu'un relevé sait vraiment, c'est le CONDITIONNEMENT et l'ENDROIT, et tous
 * deux se vérifient de l'œil. Une classe saisie serait un jugement de plus à
 * tenir à jour.
 *
 * `non-suivi` est la classe honnête : 23 des 175 ids des recettes n'ont aucun
 * rayon. Leur inventer une classe serait se tromper là où ça coûte le plus,
 * puisque la classe commande la précision.
 */
export type Classe =
  | "fond-de-placard"
  | "congelateur"
  | "fruits-legumes"
  | "frais-court"
  | "epicerie"
  | "non-suivi";

/**
 * Trois états, jamais un score.
 *
 * Un score numérique serait précisément le chiffre qu'on croirait parce qu'il a
 * été calculé. Trois états se lisent, et le chiffre avec sa date restent
 * lisibles dessous.
 */
export type Confiance = "sur" | "probable" | "inconnu";

/** Un lot du placard, tel que le rejeu le voit. */
export interface LotPlacard {
  ingredient: string;
  zone: string;
  /** Unités d'achat entières encore scellées. */
  unites: number;
  /** Le poids d'une unité. `null` = constaté sans être pesé. */
  parUnite: Quantite | null;
  etat: Etat;
  /**
   * Grammes restants dans l'unité EN SERVICE. `null` quand rien n'est chiffré.
   *
   * C'est ce qui distingue le distributeur de la réserve : `farine` porte les
   * deux, un bocal entamé et un paquet de 4 kg scellé, et le bocal se sert en
   * premier (voir `ordreDeService`).
   */
  entame: number | null;
  /** Né d'un reste d'unité scellée (T29) : il court, donc il presse. */
  court: boolean;
}

export interface EtatIngredient {
  ingredient: string;
  lots: LotPlacard[];
  classe: Classe;
  confiance: Confiance;
  /** Le jour de la dernière observation. `null` = jamais vu. */
  vuLe: string | null;
  /** Décréments encaissés depuis cette observation. */
  depuisVu: number;
  /**
   * La dérive APPRISE, en unités par jour. Zéro au démarrage à froid.
   *
   * Elle n'entre nulle part dans le niveau — voir `doute`. Elle ne fait que
   * dépenser la confiance plus vite.
   */
  derive: number;
  /** Total en grammes quand tout est chiffré, `null` dès qu'un lot ne l'est pas. */
  grammes: number | null;
  unites: number;
}

/** Ce qu'un décrément a réellement fait — pour que l'app puisse le DIRE. */
export interface Retrait {
  ingredient: string;
  /**
   * `grammes` : des grammes sont partis d'un lot chiffré.
   * `unite`   : une unité scellée est partie en entier (T29).
   * `etat`    : un lot non chiffré a avancé son `etat`, sans un gramme inventé.
   * `aucun`   : rien ne correspondait. **Un no-op DIT, pas silencieux.**
   */
  effet: "grammes" | "unite" | "etat" | "aucun";
  grammes: number | null;
  /** Le reste d'unité scellée devenu un lot court, quand il y en a un. */
  restePose: number | null;
}

export interface Rejeu {
  parIngredient: Map<string, EtatIngredient>;
  /** Tous les retraits, dans l'ordre — la matière du « je suis 3 des 11 ». */
  retraits: Retrait[];
}

/* ══════════════════════════════════════════════════════════ les constantes */

/**
 * Au-delà de cette fraction de l'unité, le reste vaut d'être gardé.
 *
 * UNE FRACTION, PAS UN PLANCHER ABSOLU : 100 g de crème et 100 g de concentré
 * de tomate ne sont pas la même quantité de cuisine. 85 g de maïs sur 285, non ;
 * 600 g de crème sur 800, oui.
 *
 * Et ça se tranche TOUT SEUL, jamais en demandant : #34 interdit la
 * confirmation par repas — « ce serait de la comptabilité déguisée ».
 */
export const SEUIL_RESTE = 1 / 3;

/**
 * Combien de décréments une classe encaisse avant que la confiance tombe.
 *
 * Ce sont les tolérances d'erreur par classe de #34, inchangées. Elles disent
 * la même chose que le fichier : le fond de placard est quasi-infini, l'épicerie
 * se compte à ±1 unité d'achat, le frais court ne se parie jamais sans l'avoir
 * vu, et les fruits & légumes ne s'estiment pas du tout.
 *
 * ZÉRO N'EST PAS UNE ERREUR. Pour le primeur et le non-suivi, toute déduction
 * non observée est déjà de trop : dès qu'un décrément passe, on ne sait plus.
 */
const TOLERANCE: Record<Classe, number> = {
  "fond-de-placard": Number.POSITIVE_INFINITY,
  congelateur: 6,
  epicerie: 4,
  "frais-court": 1,
  "fruits-legumes": 0,
  "non-suivi": 0,
};

/** Les rayons dont rien ne se parie sans l'avoir vu. */
const RAYONS_FRAIS = new Set(["crèmerie", "boucherie", "poissonnerie", "frais"]);

/* ═════════════════════════════════════════════════════════════ le contexte */

/**
 * Ce que le rejeu doit savoir du catalogue, résolu une fois.
 *
 * Traverser 45 denrées et 175 ids pour chaque ligne de chaque plat referait les
 * mêmes tables des centaines de fois. Elles sont construites ici, à l'entrée.
 */
export interface Contexte {
  alias: (id: string) => string;
  rayonDe: (id: string) => string | null;
  espaceDe: (zone: string) => Espace;
  placard: ReadonlySet<string>;
  /** Le jour du relevé d'amorce — la première observation du journal. */
  releve: string | null;
}

export function contexte(catalogue: Catalogue): Contexte {
  const aliases = catalogue.rayons.aliases;
  const parIngredient = new Map<string, string>();
  for (const [rayon, ids] of Object.entries(catalogue.rayons.rayons))
    for (const id of ids) parIngredient.set(id, rayon);
  const zones = new Map(catalogue.gardeManger.zones.map((z) => [z.id, z.espace]));
  const alias = (id: string): string => aliases[id] ?? id;
  return {
    alias,
    rayonDe: (id) => parIngredient.get(alias(id)) ?? null,
    espaceDe: (zone) => zones.get(zone) ?? "placard",
    placard: new Set(catalogue.rayons.placard),
    releve: catalogue.gardeManger.releve,
  };
}

/* ═══════════════════════════════════════════════════════════ les classes */

/**
 * La classe d'un ingrédient, dérivée de son rayon, de ses lots et de leur zone.
 *
 * L'ORDRE DES TESTS EST LA RÈGLE. Ce qu'on a TOUJOURS (`placard`) l'emporte sur
 * ce qu'on a EN CE MOMENT : le jour où un paquet de sel entre au relevé,
 * « fond de placard » reste la bonne réponse, parce que « combien m'en
 * reste-t-il » ne se pose pas pour lui. C'est déjà l'arbitrage que
 * `calcul.provenance()` rend entre `placard` et `garde-manger`.
 */
export function classeDe(ctx: Contexte, ingredient: string, lots: readonly LotPlacard[]): Classe {
  const id = ctx.alias(ingredient);
  if (ctx.placard.has(id)) return "fond-de-placard";
  const rayon = ctx.rayonDe(id);
  // AUCUN RAYON, AUCUNE PRÉTENTION. Ces ids ne décrémentent rien et l'app le
  // dit ; ils remontent d'eux-mêmes dans le « je suis 3 des 11 » des cartes.
  if (rayon === null) return "non-suivi";
  if (lots.some((l) => ctx.espaceDe(l.zone) === "congelo")) return "congelateur";
  if (rayon === "primeur") return "fruits-legumes";
  if (lots.some((l) => l.court || l.etat === "frais")) return "frais-court";
  if (RAYONS_FRAIS.has(rayon)) return "frais-court";
  return "epicerie";
}

/* ══════════════════════════════════════════════════════════ la confiance */

const joursEntre = (a: string, b: string): number =>
  Math.max(0, Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000));

/**
 * Le doute accumulé depuis la dernière observation.
 *
 * L'ASYMÉTRIE QUI COMMANDE TOUT : une observation POSE l'estimation et RESTAURE
 * la confiance ; un décrément DÉPLACE l'estimation et la DÉPENSE. Cuisiner
 * n'est pas une observation — ça éloigne le chiffre de la dernière chose vue de
 * ses propres yeux.
 *
 * LA DÉRIVE ÉLARGIT LE DOUTE, ELLE NE BOUGE PAS LE CHIFFRE. Un niveau qui
 * descend sans que rien de constaté ait été mangé est de la consommation
 * inventée. Elle entre donc ici, dans le doute, et nulle part ailleurs.
 */
export function doute(depuisVu: number, derive: number, jours: number): number {
  return depuisVu + derive * jours;
}

export function confiance(classe: Classe, d: number): Confiance {
  if (d <= 1e-9) return "sur";
  return d < TOLERANCE[classe] ? "probable" : "inconnu";
}

/* ══════════════════════════════════════════════════ l'ordre de service */

/**
 * Dans quel ordre les lots d'un même ingrédient se servent.
 *
 * L'ENTAMÉ AVANT LE SCELLÉ — tranché par `garde-manger.yaml` lui-même : « LE
 * BOCAL EST UN DISTRIBUTEUR, pas une réserve ». Donc le distributeur avant la
 * réserve. `farine` et `concentre-tomate` portent déjà les deux, et servir la
 * réserve d'abord laisserait un fond de bocal traîner indéfiniment.
 *
 * Les restes courts (T29) passent devant tout : ils ont une horloge.
 */
const rangEtat = (l: LotPlacard): number => {
  if (l.court) return 0;
  if (l.entame != null || l.etat === "entame") return 1;
  if (l.etat === "frais") return 2;
  return 3;
};

export const ordreDeService = (lots: readonly LotPlacard[]): LotPlacard[] =>
  [...lots].sort((a, b) => rangEtat(a) - rangEtat(b));

/* ═════════════════════════════════════════════════════════ le décrément */

const EN_GRAMMES = new Set(["g", "ml"]);

/** Le poids d'une unité, quand il est exploitable comme une masse. */
const poidsUnite = (l: LotPlacard): number | null =>
  l.parUnite && EN_GRAMMES.has(l.parUnite.unit) ? l.parUnite.amount : null;

/**
 * Retire `besoin` grammes d'un ingrédient, en mutant ses lots.
 *
 * DEUX MODES, CHOISIS PAR LE LOT — et le second n'est pas un pis-aller.
 *
 *  — un lot CHIFFRÉ perd des grammes ;
 *  — un lot NON CHIFFRÉ avance son `etat` (`sec` → `entame`), sans qu'un seul
 *    gramme soit inventé. `etat: entame` porte déjà l'information utile dans
 *    les mots du modèle — « la barrière est rompue, l'horloge tourne » — et
 *    `garde_manger.py` la lit DÉJÀ pour faire monter `urgence` à `moyenne`.
 *    Cuisiner des pâtes rend donc le paquet plus pressant, ce qui remonte au
 *    score par `bonusPlacard`, sans un chiffre faux.
 *
 * Le mode non chiffré est PERMANENT, pas transitoire : trois des quatre canaux
 * du foyer livrent du non pesé, et le vrac (« le bocal EST le stock ») ne le
 * sera jamais.
 *
 * JAMAIS SOUS ZÉRO, JAMAIS UN LOT QU'ON N'A PAS CONSTATÉ. Une ligne qui ne
 * trouve rien rend `aucun` — un no-op DIT, que la carte du plat compte et
 * montre. C'est ce qui empêche de croire le placard au-delà de ce qu'il couvre,
 * et ce qui rend visible que le relever davantage sert à quelque chose.
 */
export function retirer(
  lots: LotPlacard[],
  ingredient: string,
  besoin: number | null,
): Retrait {
  const servis = ordreDeService(lots);
  let reste = besoin;
  let pris = 0;
  let effet: Retrait["effet"] | null = null;
  let restePose: number | null = null;

  for (const lot of servis) {
    if (reste != null && reste <= 1e-9) break;
    const pu = poidsUnite(lot);

    // ── mode non chiffré : on avance l'état, on n'invente rien ──────────────
    if (pu == null) {
      if (lot.unites <= 0) continue;
      if (lot.etat === "sec" || lot.etat === "conserve" || lot.etat === "bocal") {
        lot.etat = "entame";
        effet ??= "etat";
      } else {
        effet ??= "etat";
      }
      // Un lot non chiffré ne peut pas dire combien il a donné : la demande est
      // considérée servie, et le doute qui en résulte est exactement ce que la
      // confiance est là pour porter.
      reste = 0;
      break;
    }

    // ── mode chiffré ───────────────────────────────────────────────────────
    if (lot.entame != null && lot.entame > 1e-9) {
      const pu2 = Math.min(reste ?? lot.entame, lot.entame);
      lot.entame -= pu2;
      pris += pu2;
      if (reste != null) reste -= pu2;
      effet ??= "grammes";
      if (lot.entame <= 1e-9) lot.entame = null;
      continue;
    }

    if (lot.unites <= 0) continue;

    // T29 — OUVRIR UNE UNITÉ SCELLÉE LA CONSOMME EN ENTIER.
    //
    // C'est le comportement réel : on vide la boîte pour ne pas garder 85 g
    // impossibles à passer. Ça ne vaut QUE pour ce qui est scellé et se vide
    // d'un coup — une conserve, un bocal. Un paquet de pâtes s'entame.
    const scelle = lot.etat === "conserve" || lot.etat === "bocal";
    lot.unites -= 1;

    if (scelle) {
      const consomme = Math.min(reste ?? pu, pu);
      pris += consomme;
      if (reste != null) reste -= consomme;
      effet ??= "unite";
      const laisse = pu - consomme;
      if (laisse > pu * SEUIL_RESTE) {
        // Le reste vaut d'être gardé : il devient un lot COURT, donc pressé,
        // donc le score va chercher un plat qui le mange.
        lots.push({
          ingredient,
          zone: lot.zone,
          unites: 1,
          parUnite: { amount: laisse, unit: lot.parUnite!.unit },
          etat: "frais",
          entame: laisse,
          court: true,
        });
        restePose = laisse;
      }
      continue;
    }

    // Paquet sec : il s'entame, et son reste se compte.
    const consomme = Math.min(reste ?? pu, pu);
    pris += consomme;
    if (reste != null) reste -= consomme;
    effet ??= "grammes";
    const laisse = pu - consomme;
    lot.etat = "entame";
    lot.entame = laisse > 1e-9 ? laisse : null;
    if (laisse <= 1e-9) lot.etat = "sec";
  }

  // Les lots vidés s'en vont : un lot à zéro unité et sans entame n'existe plus.
  for (let i = lots.length - 1; i >= 0; i -= 1) {
    const l = lots[i]!;
    if (l.unites <= 0 && (l.entame == null || l.entame <= 1e-9)) lots.splice(i, 1);
  }

  return {
    ingredient,
    effet: effet ?? "aucun",
    grammes: pris > 0 ? pris : null,
    restePose,
  };
}

/* ═══════════════════════════════════════════════════ les effets d'une cuisson */

/** Ce qu'une ligne de recette réclame du placard, mise à l'échelle. */
export interface Demande {
  ingredient: string;
  /** `null` quand l'unité n'est pas une masse — « 2 gousses » ne se soustrait
   *  pas d'un poids, et prétendre le contraire fabriquerait un faux chiffre. */
  grammes: number | null;
}

/**
 * Les lignes d'un plat qui touchent le PLACARD, à l'échelle des parts.
 *
 * Deux familles sont écartées, chacune pour sa raison :
 *  — `assaisonnement` ne compte jamais. `rayons.yaml` dit déjà pourquoi : « une
 *    liste qui dit "acheter du sel" toutes les semaines se fait ignorer ».
 *  — `base` va au DÉPÔT, pas au placard : « 250 g de lentilles cuites » n'est
 *    pas une matière première, et le chaînage a déjà ses propres poids.
 */
export function demandes(plat: Plat, facteur: number): Demande[] {
  const out: Demande[] = [];
  for (const ing of plat.ingredients) {
    if (ing.base || ing.assaisonnement) continue;
    out.push({
      ingredient: ing.id,
      grammes: EN_GRAMMES.has(ing.unit) ? ing.qty * facteur : null,
    });
  }
  return out;
}

/* ═══════════════════════════════════════════════════════════════ le rejeu */

const cloner = (l: LotPlacard): LotPlacard => ({ ...l, parUnite: l.parUnite ? { ...l.parUnite } : null });

/** L'amorce : le relevé du catalogue, lu comme la première observation. */
function amorce(ctx: Contexte, denrees: readonly Denree[]): Map<string, LotPlacard[]> {
  const par = new Map<string, LotPlacard[]>();
  for (const d of denrees) {
    const id = ctx.alias(d.ingredient);
    const lots = par.get(id) ?? [];
    lots.push({
      ingredient: id,
      zone: d.zone,
      unites: d.unites,
      parUnite: d.parUnite,
      etat: d.etat,
      // Un lot déjà entamé au relevé n'a pas de reste chiffré : on a vu qu'il
      // était ouvert, on n'a pas pesé ce qu'il restait dedans.
      entame: null,
      court: false,
    });
    par.set(id, lots);
  }
  return par;
}

interface Suivi {
  vuLe: string | null;
  depuisVu: number;
  /** Les dérives mesurées, une par intervalle entre deux observations. */
  derives: number[];
  /** Les unités prédites au moment de la dernière observation. */
  predit: number | null;
}

/**
 * Rejoue le journal et rend l'état du placard.
 *
 * L'ORDRE EST CELUI DES FAITS (`jour`), PAS CELUI DES SAISIES. Relever un
 * placard dimanche pour un mardi oublié doit corriger le mardi, pas s'empiler
 * derrière lui. Deux événements du même jour se départagent par `maj`, qui est
 * un ordre d'écriture et donc stable.
 */
export function rejouer(
  catalogue: Catalogue,
  evenements: readonly Evenement[],
  ctx: Contexte = contexte(catalogue),
  aujourdhui: string,
): Rejeu {
  const lots = amorce(ctx, catalogue.gardeManger.denrees);
  const suivi = new Map<string, Suivi>();
  const retraits: Retrait[] = [];

  // L'amorce est une observation, datée du relevé. Sans date, elle ne restaure
  // rien : un stock d'origine inconnue ne vaut pas mieux qu'une estimation.
  for (const id of lots.keys())
    suivi.set(id, { vuLe: ctx.releve, depuisVu: 0, derives: [], predit: null });

  const suiviDe = (id: string): Suivi => {
    const s = suivi.get(id) ?? { vuLe: null, depuisVu: 0, derives: [], predit: null };
    suivi.set(id, s);
    return s;
  };
  const unitesDe = (id: string): number =>
    (lots.get(id) ?? []).reduce((n, l) => n + l.unites + (l.entame != null ? 1 : 0), 0);

  const ordonnes = [...evenements].sort(
    (a, b) => a.jour.localeCompare(b.jour) || a.maj - b.maj,
  );

  for (const e of ordonnes) {
    if (e.sorte === "cuisine") {
      const plat = catalogue.plats.find((p) => p.id === e.plat);
      if (!plat) continue;
      const f = plat.portions > 0 ? e.parts / plat.portions : 1;
      for (const d of demandes(plat, f)) {
        const id = ctx.alias(d.ingredient);
        const l = lots.get(id);
        if (!l || l.length === 0) {
          retraits.push({ ingredient: id, effet: "aucun", grammes: null, restePose: null });
          continue;
        }
        retraits.push(retirer(l, id, d.grammes));
        suiviDe(id).depuisVu += 1;
      }
      continue;
    }

    if (e.sorte === "entree") {
      for (const ligne of e.lignes) {
        const id = ctx.alias(ligne.ingredient);
        const l = lots.get(id) ?? [];
        l.push({
          ingredient: id,
          zone: ligne.zone ?? "placard-haut",
          unites: ligne.unites,
          parUnite: ligne.parUnite,
          etat: ligne.etat,
          entame: null,
          court: false,
        });
        lots.set(id, l);
        // RENTRER N'EST PAS OBSERVER LE PLACARD. On sait ce qu'on vient d'y
        // poser ; on ne sait pas mieux ce qui s'y trouvait déjà. La confiance
        // ne se restaure donc pas ici — seule une observation le fait.
      }
      continue;
    }

    // ── observation ────────────────────────────────────────────────────────
    const vus = new Set(e.constats.map((c) => ctx.alias(c.ingredient)));

    if (e.portee === "zone" && e.zone) {
      // EXHAUSTIF SUR SA ZONE : ce qui n'y est pas n'y est plus. C'est le seul
      // geste qui puisse dire « il n'y en a plus » sans énumérer les absents.
      for (const [id, l] of lots) {
        const restants = l.filter((x) => x.zone !== e.zone || vus.has(id));
        if (restants.length === 0) lots.delete(id);
        else lots.set(id, restants);
      }
    }

    for (const c of e.constats) {
      const id = ctx.alias(c.ingredient);
      const s = suiviDe(id);
      const avant = unitesDe(id);

      // LA DÉRIVE SE MESURE ICI, ET NULLE PART AILLEURS : entre deux
      // observations, ce que les décréments connus n'expliquent pas.
      // DÉMARRAGE À FROID À ZÉRO — le terme n'existe qu'à partir de la seconde
      // observation, donc le premier jour se comporte comme s'il n'y avait pas
      // de dérive du tout. Rien n'est jamais saisi.
      if (s.vuLe && c.unites != null) {
        const jours = joursEntre(s.vuLe, e.jour);
        const inexplique = avant - c.unites;
        if (jours > 0 && inexplique > 0) s.derives.push(inexplique / jours);
      }

      if (c.unites != null) {
        const l = lots.get(id) ?? [];
        // La réconciliation suit l'ordre de service : l'ENTAMÉ absorbe l'écart
        // avant le scellé. Une correction porte sur un INGRÉDIENT, jamais sur
        // un lot — c'est ce qu'un œil voit en ouvrant un placard : on compte
        // des boîtes de maïs, pas « le lot n°17 ».
        ajusterUnites(l, id, c.unites, e.zone);
        if (l.length === 0) lots.delete(id);
        else lots.set(id, l);
      }

      s.vuLe = e.jour;
      s.depuisVu = 0;
      s.predit = avant;
    }

    // Un relevé restaure la confiance sur TOUTE la zone, pas seulement sur les
    // lignes qu'il mentionne : un quart d'heure achète des semaines de silence.
    if (e.portee === "zone" && e.zone)
      for (const [id, l] of lots)
        if (l.some((x) => x.zone === e.zone)) {
          const s = suiviDe(id);
          s.vuLe = e.jour;
          s.depuisVu = 0;
        }
  }

  const parIngredient = new Map<string, EtatIngredient>();
  for (const [id, l] of lots) {
    const s = suiviDe(id);
    const classe = classeDe(ctx, id, l);
    const derive = s.derives.length
      ? s.derives.reduce((a, b) => a + b, 0) / s.derives.length
      : 0;
    const jours = s.vuLe ? joursEntre(s.vuLe, aujourdhui) : 0;
    const d = s.vuLe === null ? Number.POSITIVE_INFINITY : doute(s.depuisVu, derive, jours);
    const chiffre = l.every((x) => poidsUnite(x) != null);
    parIngredient.set(id, {
      ingredient: id,
      lots: l.map(cloner),
      classe,
      confiance: confiance(classe, d),
      vuLe: s.vuLe,
      depuisVu: s.depuisVu,
      derive,
      grammes: chiffre
        ? l.reduce((g, x) => g + (x.entame ?? 0) + x.unites * (poidsUnite(x) ?? 0), 0)
        : null,
      unites: l.reduce((n, x) => n + x.unites + (x.entame != null ? 1 : 0), 0),
    });
  }
  return { parIngredient, retraits };
}

/**
 * Amène les lots d'un ingrédient à un nombre d'unités constaté.
 *
 * En baisse, l'entamé part le premier (ordre de service). En hausse, on ajoute
 * un lot au conditionnement le plus courant de l'ingrédient — parce qu'un œil
 * qui compte quatre boîtes ne dit pas ce qu'elles pèsent, et que le dernier
 * poids vu pour cet id est la meilleure réponse dont on dispose sans rien
 * demander.
 */
function ajusterUnites(lots: LotPlacard[], ingredient: string, cible: number, zone: string | null): void {
  let courant = lots.reduce((n, l) => n + l.unites + (l.entame != null ? 1 : 0), 0);
  if (courant === cible) return;

  if (courant > cible) {
    for (const lot of ordreDeService(lots)) {
      while (courant > cible && (lot.unites > 0 || lot.entame != null)) {
        if (lot.entame != null) lot.entame = null;
        else lot.unites -= 1;
        courant -= 1;
      }
    }
    for (let i = lots.length - 1; i >= 0; i -= 1) {
      const l = lots[i]!;
      if (l.unites <= 0 && l.entame == null) lots.splice(i, 1);
    }
    return;
  }

  const modele = lots.find((l) => l.parUnite != null) ?? lots[0];
  lots.push({
    ingredient,
    zone: zone ?? modele?.zone ?? "placard-haut",
    unites: cible - courant,
    parUnite: modele?.parUnite ? { ...modele.parUnite } : null,
    etat: modele?.etat ?? "sec",
    entame: null,
    court: false,
  });
}
