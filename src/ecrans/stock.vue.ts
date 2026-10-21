// Ce que « L'inventaire » montre — et d'où vient chaque chiffre.
//
// C'EST LE SEUL ÉCRAN QUI PARLE DU DÉPÔT LUI-MÊME. Partout ailleurs le dépôt
// est un moyen : il dit à « La semaine » ce qui se chaîne, à « Courses » ce
// qu'on n'a pas besoin d'acheter, à « Poser un plat » ce qu'une carte
// trouverait. Ici il est le sujet, et la question devient : à quel point
// peut-on croire ces chiffres ?
//
// LA FIABILITÉ N'EST PAS UNE ÉTIQUETTE POSÉE À LA MAIN. Le canevas Claude
// Design en inventait cinq catégories ; le modèle porte la même idée sous une
// forme qu'on peut dériver — une ligne chiffrée (on l'a pesée à l'export), une
// ligne déduite d'un plat cuisiné cette semaine (on l'a calculée), une ligne
// qui n'a qu'une bande de repas (on sait seulement qu'elle existe). Trois
// états, tous vérifiables, aucun décoratif.
//
// Port de `apps/proto-shell/comptoir.js` (`ecranStock`, `fiabilite`).

import { marque, type Marque } from "../model/axe";
import type { BilanEspace, Calcul } from "../model/calcul";
import type { Depot, LigneDepot } from "../model/depot";
import { idsDuReleve, type Jeu } from "../model/jeu";
import { aSauver } from "../model/gardeManger";
import { mesurer, type Evenement, type LotPlacard, type Rejeu } from "../model/journal";
import {
  etatDuCongelo,
  nomDuType,
  posablesAuDepot,
  producteurs,
  propositions,
  type Population,
} from "../model/plancher";
import {
  nomDeLaDenree,
  posables,
  type PlancherDenree,
  type Posable,
} from "../model/plancherGardeManger";
import type {
  Catalogue, Denree, Espace, GardeManger, PlanCuisine, RangementDuPlan, Urgence, Zone,
} from "../model/types";
import { fmt } from "../ui/format";
import { bandeEnMots, depuis, nomEspace } from "../ui/phrases";

/** L'ordre des espaces, du plus consulté au moins. Le même partout : une
 *  cuisine ne se relit pas dans un ordre différent d'un écran à l'autre. */
export const ESPACES: readonly Espace[] = ["frigo", "congelo", "placard"];

/** À quel point on croit un chiffre. Trois niveaux, parce qu'il y a exactement
 *  trois façons pour le dépôt de connaître une quantité. */
export type Niveau = "haute" | "moyenne" | "basse";

export interface Fiabilite {
  /** Ce qu'on en dit à l'écran. */
  label: string;
  /** La classe CSS qui le colore. Vide pour « en bloc » : rien à mettre en
   *  avant dans une quantité qu'on ne connaît pas. */
  classe: string;
  niveau: Niveau;
}

/**
 * D'où vient le chiffre d'une ligne — et dans cet ordre, qui n'est pas
 * arbitraire : un lot produit par la semaine est TOUJOURS estimé, même quand il
 * porte une quantité, parce que cette quantité est le produit d'un facteur
 * d'échelle et d'une recette, pas d'une balance. Tester `qty` d'abord dirait
 * « compté » d'un lot que personne n'a jamais vu.
 */
export function fiabilite(l: LigneDepot): Fiabilite {
  if (l.from) return { label: "estimé", classe: "estime", niveau: "moyenne" };
  if (l.qty?.amount != null) return { label: "compté", classe: "compte", niveau: "haute" };
  return { label: "en bloc", classe: "", niveau: "basse" };
}

export interface Categorie {
  espace: Espace;
  nom: string;
  /** Les lots encore là à la fin de la semaine. */
  vivants: number;
  /** Ceux que la semaine a mangés. */
  manges: number;
  /** Les restes de frigo passés — là, mais à jeter (T103). Ni vivants ni
   *  mangés : ils ne se servent plus, et ils n'ont pas encore quitté l'étagère. */
  perimes: number;
  /** Barres allumées sur quatre — un niveau, pas un compte exact. */
  barres: number;
  /** Le plus bas des niveaux de l'espace : un seul chiffre douteux suffit à
   *  rendre le total douteux. */
  conf: Niveau;
  note: string;
}

export const pluriel = (n: number, mot: string): string => `${n} ${mot}${n > 1 ? "s" : ""}`;

/**
 * Les rangements, avec ce qu'ils portent et ce qu'on en sait.
 *
 * UN ÉCART AU PROTO, ET C'EST UNE CORRECTION. Le proto écrivait « 3 lots »
 * sous le nom du rangement en ne comptant que les lots vivants, puis listait
 * en dessous CINQ lignes — les deux mangés compris, grisées. Le compte et la
 * liste qu'il annonce ne disaient pas la même chose, ce qui est exactement le
 * défaut qu'on a corrigé sur la pastille de « À prévoir » (T10). Ici les deux
 * nombres sont dits, parce que les deux existent : ce qui reste, et ce que la
 * semaine a mangé.
 */
export function categories(
  lignes: readonly LigneDepot[],
  perime: (l: LigneDepot) => boolean = () => false,
): Categorie[] {
  const vue = (espace: Espace, dedans: LigneDepot[]): Categorie => {
    // TROIS ÉTATS, PLUS DEUX — T103. « 37 lots » sous « Frigo », c'est ce que
    // l'année simulée a lu en septembre pour quatre boîtes réelles : le compte
    // des vivants prenait les périmés, et les barres de la jauge avec. Ils se
    // comptent maintenant à part, et la somme reste la liste qu'on ouvre.
    const manges = dedans.filter((l) => l.epuise).length;
    const perimes = dedans.filter((l) => !l.epuise && perime(l)).length;
    const vivants = dedans.length - manges - perimes;
    const niveaux = dedans.map((l) => fiabilite(l).niveau);
    const etats = [...new Set(dedans.map((l) => fiabilite(l).label))];
    return {
      espace,
      nom: nomEspace(espace),
      vivants,
      manges,
      perimes,
      barres: Math.min(4, vivants),
      conf: niveaux.includes("basse")
        ? "basse"
        : niveaux.every((n) => n === "haute")
          ? "haute"
          : "moyenne",
      note: [
        pluriel(vivants, "lot"),
        manges ? `${manges} mangé${manges > 1 ? "s" : ""}` : "",
        perimes ? `${perimes} à jeter` : "",
        ...etats,
      ]
        .filter(Boolean)
        .join(" · "),
    };
  };

  // PAR `location`, PAS PAR `espace` : ces trois entêtes sont des PORTES qu'on
  // va ouvrir. Ranger un lot sous « Congélo » parce que sa recette dit qu'il se
  // congèle envoie chercher au congélateur ce qui refroidit sur le plan de
  // travail — voir `LotStock.location`. Le budget de rangement, lui, continue de
  // se compter sur `espace`, et c'est `espaces()` qui le montre.
  return ESPACES.map(
    (espace) => [espace, lignes.filter((l) => l.location === espace)] as const,
  )
    .filter(([, dedans]) => dedans.length > 0)
    .map(([espace, dedans]) => vue(espace, dedans));
}

export interface Plafond {
  nom: string;
  /** Ce qu'il reste sous ce plafond-là. Jamais négatif : « −2 libres » n'est
   *  pas une quantité, et le débordement se dit en toutes lettres. */
  libres: number;
  /** Le remplissage, en pourcentage, borné à 100. */
  part: number;
  /** Le plafond qui mord — celui qui décide du geste. */
  commande: boolean;
}

export interface EspaceVue {
  espace: Espace;
  nom: string;
  /** Les étagères, puis les contenants. */
  plafonds: Plafond[];
  deborde: boolean;
  /**
   * Quoi faire, quand il y a quelque chose à faire.
   *
   * ÉCART AU PROTO, PARCE QUE LE PROTO CRIAIT TOUT LE TEMPS. Il affichait
   * « dégager une étagère » sous les trois rangements en permanence, débordant
   * ou pas : trois impératifs qui ne s'adressaient à personne. Un conseil qui
   * est toujours là n'est plus un conseil, et le jour où il compte vraiment il
   * ne se distingue plus des deux autres. Il ne paraît donc que quand la place
   * manque ou va manquer.
   */
  geste: string;
}

/** Le geste que réclame le plafond qui mord. Laver deux bocaux n'est pas
 *  dégager une étagère — c'est toute la raison d'avoir deux plafonds. */
const gesteDe = (s: BilanEspace): string =>
  s.cause === "contenant" ? "laver des boîtes" : "dégager une étagère";

const part = (n: number, max: number): number =>
  Math.max(0, Math.min(100, Math.round((n / (max || 1)) * 100)));

const libres = (max: number, fin: number): number => Math.max(0, +(max - fin).toFixed(1));

/** Les trois rangements sont garantis : le chargeur du catalogue exige les
 *  trois espaces, et `bilanStockage` en produit un bilan pour chacun. */
export function espaces(stockage: Record<Espace, BilanEspace>): EspaceVue[] {
  return ESPACES.map((espace) => {
    const s = stockage[espace];
    const boites = s.cause === "contenant";
    return {
      espace,
      nom: nomEspace(espace),
      plafonds: [
        { nom: "étagères", libres: libres(s.places, s.fin), part: part(s.fin, s.places), commande: !boites },
        // UN ESPACE SANS CONTENANT N'A QU'UN PLAFOND : afficher « contenants 0
        // libres » sur le placard dirait qu'il manque des boîtes là où il n'en
        // faut aucune.
        ...(s.contenants == null
          ? []
          : [
              {
                nom: "contenants",
                libres: libres(s.contenants, s.fin),
                part: part(s.fin, s.contenants),
                commande: boites,
              },
            ]),
      ],
      deborde: s.deborde,
      geste: s.deborde
        ? `⚠ ça déborde — ${gesteDe(s)}`
        : s.libre < 1
          ? `au plus juste — ${gesteDe(s)}`
          : "",
    };
  });
}

/* ─────────────────────────────────────────────────────────── les planchers */

/**
 * Ce que « L'inventaire » dit des planchers — T34 à T38.
 *
 * ICI ET PAS AILLEURS, parce que c'est le seul écran qui parle du dépôt
 * lui-même. Un plancher n'est pas une décision sur la semaine : c'est une
 * phrase sur le congélateur — « je veux toujours en avoir » — et elle se prend
 * devant le tiroir, pas devant une carte.
 *
 * ET C'EST LE SEUL ENDROIT OÙ UN PLANCHER PEUT NAÎTRE. Sans cet écran, T34 à
 * T38 seraient exactement ce que T48 recense : un mécanisme lu, typé, et sans
 * effet, parce que rien ne pourrait jamais valider une proposition.
 */
export interface PlancherVue {
  type: string;
  nom: string;
  niveau: number;
  /** Ce qu'il y a en ce moment, en portions. */
  a: number;
  sous: boolean;
  population: Population;
  /** Ce qui le recharge — dérivé, jamais saisi (T34). En titres lisibles. */
  plats: string[];
}

/**
 * Un type sur lequel on peut poser un plancher à la main — T89.
 *
 * MÊME FORME QUE `Posable` AU PLACARD, ET C'EST VOULU : c'est la même phrase,
 * dite sur l'autre rangement. Ce qui change est ce qu'elle déclenche — ici un
 * plat qui remonte dans la main, là-bas une ligne de courses — et l'écran le dit
 * sur chaque ligne plutôt que de le laisser deviner.
 */
export interface TypePosableVue {
  type: string;
  nom: string;
  population: Population;
  /** Ce qu'il y en a en ce moment, en portions. */
  a: number;
  /** Ce qui le recharge, en titres lisibles. */
  plats: string[];
  /** Déjà écarté une fois (T37). Dit, pas caché. */
  refuse: boolean;
}

export interface PropositionVue {
  type: string;
  nom: string;
  niveau: number;
  cuissons: number;
  plats: string[];
}

export interface PlanchersVue {
  /** L'état du plancher de secours, en une phrase. Toujours dit : c'est le seul
   *  chiffre du congélateur qui vaille dès le premier jour. */
  secours: string;
  sous: boolean;
  /** Les plafonds par population, en une phrase — T35. */
  populations: string;
  poses: PlancherVue[];
  propositions: PropositionVue[];
  /** Ce sur quoi on peut en poser un sans attendre que l'app le propose — T89. */
  libres: TypePosableVue[];
  /** Ce qui prend la place, quand il n'y en a plus — T38. Vide sinon. */
  plein: string;
}

const portions = (n: number): string => `${n} portion${n > 1 ? "s" : ""}`;

/**
 * Ce que le « − » descend, et où il s'arrête — T89.
 *
 * IL S'ARRÊTE À UN, ET IL NE RETIRE PAS. Au placard, descendre à zéro EST le
 * retrait : « j'en veux toujours zéro » est la façon compliquée de dire qu'on
 * n'en veut pas de plancher, et rien ne propose là-bas, donc effacer suffit.
 * Ici zéro n'aurait pas ce sens : un plancher de dépôt se retire en `niveau:
 * null`, c'est-à-dire en « non merci », c'est-à-dire en éteignant aussi la
 * proposition. Laisser un bouton « − » décider ça au douzième appui serait faire
 * prendre par un geste de réglage une décision qui a son propre bouton.
 *
 * Un plancher à zéro, lui, serait pire qu'inutile : toujours tenu, jamais sous
 * son seuil, il ne paierait plus rien et occuperait une ligne de l'écran à
 * prétendre qu'on suit quelque chose.
 */
export const baisserPlancher = (niveau: number): number => Math.max(1, niveau - 1);

export function vueDesPlanchers(
  jeu: Jeu,
  calc: Calcul,
  decisions: ReadonlyMap<string, number | null>,
  evenements: readonly Evenement[],
): PlanchersVue {
  const catalogue = jeu.catalogue;
  const etat = etatDuCongelo(catalogue, calc.depot.lignes);
  const qui = producteurs(catalogue);
  const titres = (type: string): string[] =>
    (qui.get(type) ?? []).map((id) => jeu.plats[id]?.titre ?? id);

  const poses: PlancherVue[] = [];
  for (const [type, niveau] of decisions) {
    if (niveau === null) continue;
    const a = etat.portions.get(type) ?? 0;
    poses.push({
      type,
      nom: nomDuType(type),
      niveau,
      a,
      sous: a < niveau,
      population: populationDuType(catalogue, type),
      plats: titres(type),
    });
  }

  return {
    secours:
      `${portions(etat.secours.portions)} au congélateur sur ${etat.reglages.secours} voulues, ` +
      `réparties sur ${etat.secours.types} type${etat.secours.types > 1 ? "s" : ""} sur ` +
      `${etat.reglages.diversite}`,
    sous: etat.secours.sous,
    populations:
      `${etat.parPopulation.apport}/${etat.reglages.plafonds.apport} de quoi accélérer un soir · ` +
      `${etat.parPopulation.diner}/${etat.reglages.plafonds.diner} dîners d'avance · ` +
      `${etat.total}/${etat.reglages.limite} places`,
    // TRIÉS PAR CE QUI MANQUE, parce que la liste est une liste de gestes : un
    // plancher tenu n'appelle rien, un plancher sous son seuil appelle un dîner.
    poses: poses.sort(
      (a, b) => Number(b.sous) - Number(a.sous) || a.nom.localeCompare(b.nom, "fr"),
    ),
    propositions: propositions(catalogue, evenements, new Set(decisions.keys())).map((p) => ({
      type: p.type,
      nom: nomDuType(p.type),
      niveau: p.niveau,
      cuissons: p.cuissons,
      plats: titres(p.type),
    })),
    libres: posablesAuDepot(catalogue, etat, decisions).map((p) => ({
      ...p,
      plats: titres(p.type),
    })),
    plein:
      etat.plein && etat.dominant
        ? `Plus une place : ${portions(etat.dominant.portions)} de ${nomDuType(etat.dominant.type)} ` +
          `sur ${etat.reglages.limite}. Aucun plancher ne pousse plus rien tant que ça n'a pas baissé.`
        : "",
  };
}

/* ────────────────────────────────────────── les planchers du garde-manger */

/**
 * Ce que « L'inventaire » dit des planchers de denrées — T39, T41, T46.
 *
 * MÊME ÉCRAN QUE LES PLANCHERS DU CONGÉLATEUR, ET C'EST LE BON. La phrase est la
 * même — « je veux toujours en avoir » — et elle se prend au même endroit, devant
 * le rangement. Ce qui change est ce qu'elle déclenche, et c'est justement ce que
 * l'écran doit rendre lisible : l'un fait remonter un plat, l'autre fait une
 * ligne de courses. Les séparer en deux écrans aurait fait croire à deux
 * mécanismes là où il n'y a qu'un objet vu de deux côtés.
 */
export interface PlancherDenreeVue {
  ingredient: string;
  nom: string;
  niveau: number;
  a: number;
  sous: boolean;
  /** Ce qu'on croit du chiffre, en un mot. */
  fiabilite: string;
  /** « pour l'apéro », ou vide (T40). */
  usage: string;
}

export interface PlanchersDenreesVue {
  poses: PlancherDenreeVue[];
  /** Ce sur quoi on peut encore en poser un, trié par nom. */
  libres: Posable[];
  /**
   * Ce que la barrière de T46 écarte, NOMMÉ et non caché.
   *
   * Une denrée qui n'offre pas le geste sans dire pourquoi ressemble à une
   * panne. Et la raison est la partie intéressante : elle vient d'une décision
   * sur ce que l'app peut honnêtement savoir, pas d'une limite du code.
   */
  ecartes: string;
  /** Ce que ça donne au magasin, en une phrase. Vide quand tout est tenu. */
  manquent: string;
}

export function vueDesPlanchersDenrees(
  catalogue: Catalogue,
  rejeu: Rejeu,
  planchers: readonly PlancherDenree[],
): PlanchersDenreesVue {
  const tous = posables(catalogue, rejeu);
  const parId = new Map(tous.map((p) => [p.ingredient, p]));
  const poses: PlancherDenreeVue[] = [];

  for (const p of planchers) {
    const vu = parId.get(p.ingredient);
    const a = vu?.a ?? 0;
    poses.push({
      ingredient: p.ingredient,
      nom: nomDeLaDenree(p.ingredient),
      niveau: p.niveau,
      a,
      sous: a < p.niveau,
      // Le même vocabulaire que les lots du dépôt : « compté » quand l'app a vu,
      // « estimé » quand elle déduit. Un troisième mot ici pour dire la même
      // chose forcerait à apprendre deux échelles sur le même écran.
      // T137 — l'âge l'a sans doute fini : le dire au conditionnel, jamais
      // « à jeter » — la fenêtre est un ordre de grandeur.
      fiabilite: rejeu.finis?.has(p.ingredient)
        ? `acheté il y a ${rejeu.finis.get(p.ingredient)} j — sans doute fini`
        : vu
          ? "compté"
          : rejeu.rentres?.has(p.ingredient)
            ? `rentré le ${rejeu.rentres.get(p.ingredient)}`
            : "jamais vu",
      usage: vu?.usage === "apero" ? "pour l’apéro" : "",
    });
  }

  // LES NON-COMPTABLES SONT ÉCARTÉS ICI, PAS DANS LE MODÈLE. `posables` les rend
  // tous, avec leur raison, parce que c'est un fait sur le placard ; c'est
  // l'écran qui décide de n'offrir le bouton que sur les uns et de nommer les
  // autres. Filtrer plus tôt aurait rendu la phrase impossible à écrire.
  const dejaPose = new Set(planchers.map((p) => p.ingredient));

  // GROUPÉS PAR RAISON, ET PAS PAR DENRÉE. Les trois classes écartées le sont
  // pour trois motifs différents ; les enfiler derrière un seul « — les fruits
  // et légumes ne s'estiment pas » ferait dire au frais court quelque chose de
  // faux. Sur le relevé du 2026-08-26 il n'y a qu'un groupe, mais la phrase doit
  // rester vraie le jour où le frigo daté de Workspace#50 en ouvrira un second.
  const parRaison = new Map<string, string[]>();
  for (const p of tous)
    if (!p.comptable) parRaison.set(p.raison, [...(parRaison.get(p.raison) ?? []), p.nom]);

  return {
    poses: poses.sort((a, b) => Number(b.sous) - Number(a.sous) || a.nom.localeCompare(b.nom, "fr")),
    libres: tous.filter((p) => p.comptable && !dejaPose.has(p.ingredient)),
    ecartes: [...parRaison]
      .map(([raison, noms]) => `${noms.join(", ")} — ${raison}`)
      .join(" · "),
    manquent: (() => {
      const sous = poses.filter((p) => p.sous);
      if (!sous.length) return "";
      const n = sous.reduce((t, p) => t + (p.niveau - p.a), 0);
      return `${sous.length} denrée${sous.length > 1 ? "s" : ""} sous son plancher, ${n} à racheter — c’est déjà dans « Courses ».`;
    })(),
  };
}

/** La population d'un type, lue au catalogue plutôt qu'au dépôt : un plancher
 *  existe avant qu'il y ait quoi que ce soit dans le tiroir, et c'est même son
 *  cas le plus utile. */
function populationDuType(catalogue: Catalogue, type: string): Population {
  for (const p of catalogue.plats)
    for (const e of p.emits) if (e.type === type) return e.kind === "base" ? "apport" : "diner";
  return "diner";
}

export interface LotVue {
  /** Stable dans un rendu : la clé de base pour un lot constaté, sa place dans
   *  le dépôt pour ce que la semaine produit. */
  cle: string;
  espace: Espace;
  /** L'identifiant de la sortie, tel quel. Le catalogue n'a pas de libellé
   *  lisible pour ce que produit un plat — c'est noté au backlog, et le
   *  dé-tiretiser ici produirait du faux français. */
  nom: string;
  /** D'où il sort et ce qu'il en reste, en une phrase. */
  ou: string;
  quantite: string;
  fiabilite: Fiabilite;
  epuise: boolean;
  /**
   * La clé de base, quand ce lot en a une.
   *
   * ELLE DIT CE QU'UN DOIGT PEUT TOUCHER. Un lot constaté appartient au foyer :
   * on peut dire qu'il n'existe plus. Un lot que la semaine produit est un
   * RÉSULTAT DE CALCUL — le retirer ne voudrait rien dire, il reviendrait au
   * rendu suivant. Ce qu'on veut alors, c'est changer la semaine, et ça se fait
   * ailleurs.
   */
  ref: string | null;
  /**
   * Ce que l'horloge a à dire de ce lot, ou « » quand elle n'a rien à dire.
   *
   * ELLE NE PARLE QUE DU CONGÉLATEUR DÉPASSÉ, et c'est la moitié visible de
   * « frigo dur, congélateur mou ». Un bocal congelé de quatre mois reste
   * servi : le taire en ferait un lot comme un autre, le retirer fabriquerait
   * de l'archéologie de congélateur. Il reste, et il le dit. Le reste de frigo
   * périmé a son propre mot, `perime` — voir plus bas.
   *
   * EN JOURS, PAS EN MOIS. La conversion vit du côté Python, une seule fois
   * (`JOURS_PAR_MOIS`) ; la refaire ici donnerait deux constantes libres de
   * diverger pour gagner un « 4 mois » à la place d'un « 128 j ».
   */
  horloge: string;
  /**
   * Où en est ce lot sur l'axe, en un mot ou zéro — T57.
   *
   * DEUX MOTS, ET LE SILENCE EST LE TROISIÈME POINT. « à manger » à mi-vie,
   * « urgent » aux quatre cinquièmes, rien avant : l'absence de marque EST
   * l'état frais, et c'est le cas de la grande majorité des lots. Un mot pour
   * dire « tout va bien » serait affiché en permanence sur tout le dépôt, et il
   * ne se remarquerait plus le jour où il change.
   *
   * ELLE NE REMPLACE PAS `horloge`, ELLE LA COMPLÈTE, ET LES DEUX NE PARLENT PAS
   * DU MÊME LOT. `horloge` est une phrase, réservée au congelé dépassé, qui dit
   * pourquoi un lot qu'on croirait mort est encore servi. La marque est un état,
   * porté par tous les lots datés, y compris ceux qui vont très bien — elle
   * répond « où en est-il », l'autre répond « pourquoi est-il encore là ».
   *
   * PAS DE POURCENTAGE, ET C'EST DÉLIBÉRÉ : voir `axe.ts`. Sur une carcasse de
   * volaille à deux jours, les seuils tombent à J+1 et J+1,6 — un chiffre y
   * serait faux à la décimale près. Seul le franchissement se dit.
   */
  marque: Marque;
  /**
   * Un reste de frigo passé : là sur l'étagère, sorti du jeu — T103.
   *
   * CE COMMENTAIRE DISAIT « IL N'EST PLUS LÀ », ET LE CODE EN DESSOUS LE
   * LISTAIT. Sorti du jeu, oui : le chaînage ne le sert plus depuis T58. Mais
   * l'écran le montrait comme un lot ordinaire, sans un mot — le pire des deux
   * mondes : ni absent, ni signalé. Sur l'année simulée, 37 lignes au frigo
   * pour 4 boîtes réelles.
   *
   * NI SILENCIEUX NI « URGENT ». Le taire laisse croire qu'il se mange ;
   * « urgent » dirait de le manger maintenant, c'est-à-dire de cuisiner ce que
   * le modèle refuse de proposer pour une question de sécurité. Il dit ce qu'il
   * faut en faire : `PERIME`.
   */
  perime: boolean;
}

/** Ce qu'on dit d'un reste de frigo passé. Une phrase qui commande un geste,
 *  pas un état sur l'axe — voir `LotVue.perime`. */
export const PERIME = "périmé · à jeter";

/**
 * Les restes de frigo passés que le foyer peut jeter — T103.
 *
 * SEULEMENT LES CONSTATÉS : un lot que la semaine produit naît dans le futur et
 * ne peut pas être passé, et s'il l'était il se retirerait en changeant la
 * semaine. `ref` est ce qu'un doigt touche.
 */
export function restesPerimes(depot: Depot, aujourdhui: Date): LigneDepot[] {
  return depot.initiales.filter((l) => l.ref !== null && depot.perime(l, aujourdhui));
}

/**
 * Combien de jours de CALENDRIER séparent la naissance d'un lot d'aujourd'hui.
 *
 * PAS L'ÂGE DE `Depot.vie`, ET C'EST MESURÉ. `vie` arrondit une différence
 * d'horodatages : `born` est minuit UTC (une date ISO lue par `new Date`),
 * aujourd'hui est l'heure qu'il est. Passé midi UTC — 14 h à Paris — la
 * différence dépasse un demi-jour et s'arrondit à 1 : le plat cuisiné ce soir
 * se serait dit « cuisiné hier ». C'est le décalage que `stock.vue.test.ts`
 * documente déjà pour l'axe (« IL EN PARAÎT UN DE PLUS »). Une phrase en mots
 * du calendrier ne peut pas se le permettre ; l'horloge de vie, elle, n'est pas
 * corrigée ici — c'est une décision sur le modèle, notée au backlog.
 */
const JOUR_MS = 86_400_000;
export const joursDepuis = (aujourdhui: Date, born: Date): number =>
  Math.round(
    (Date.UTC(aujourdhui.getFullYear(), aujourdhui.getMonth(), aujourdhui.getDate()) - born.getTime()) /
      JOUR_MS,
  );

export function lots(
  jeu: Jeu,
  depot: Depot,
  filtre: Espace | null,
  aujourdhui: Date,
): LotVue[] {
  return depot.lignes
    .map((l, i) => ({ l, i }))
    .filter(({ l }) => !filtre || l.location === filtre)
    .map(({ l, i }) => {
      const q = l.qty?.amount ?? null;
      const entame = l.reste != null && q != null && l.reste < q - 1e-9;
      const v = depot.vie(l, aujourdhui);
      const perime = depot.perime(l, aujourdhui);
      return {
        cle: l.ref ?? `d${i}`,
        espace: l.location,
        nom: nomDuType(l.type),
        ou: [
          nomEspace(l.location),
          // T104 — LE LIBELLÉ SUIVAIT `from`, QU'UN LOT JOURNALISÉ N'A JAMAIS.
          // `from` ne marque que ce que la PROJECTION de la semaine produit ;
          // une cuisson faite entre en base, revient par `auModele` sans lui,
          // et lisait donc « déjà là avant la semaine » — y compris le plat de
          // ce soir. L'âge se dit depuis `born`, que tout lot constaté porte.
          //
          // « CUISINÉ », ET C'EST VRAI PAR CONSTRUCTION : la table `stock`
          // n'est écrite que par une cuisson et par l'amorce du relevé, qui
          // ne porte que des préparations. Le jour où une porte d'entrée hors
          // liste (T114) y fera entrer des courgettes crues, ce mot sera faux
          // — c'est ici qu'il faudra lire l'origine.
          l.from
            ? `cuisiné cette semaine (${jeu.plats[l.from]?.titre ?? l.from})`
            : l.born
              ? `cuisiné ${depuis(joursDepuis(aujourdhui, l.born))}`
              : "déjà là avant la semaine",
          entame ? `reste ${fmt(l.reste!)} ${l.unite ?? ""}`.trim() : "",
          l.epuise ? "mangé par la semaine" : "",
        ]
          .filter(Boolean)
          .join(" · "),
        // La bande en mots (T104) : « lunchbox » et « 2-repas » sont des
        // identifiants du corpus, pas du français.
        quantite: q != null ? `${fmt(q)} ${l.unite ?? ""}`.trim() : bandeEnMots(l.band),
        fiabilite: fiabilite(l),
        epuise: l.epuise,
        ref: l.ref,
        horloge:
          v && !v.dur && v.depasse
            ? `au congélateur depuis ${v.age} j, au-delà des ${v.fenetre} prévus — encore bon à jouer`
            : "",
        // ELLE SE TAIT SUR UN LOT SORTI DU JEU — ET C'EST `perime` QUI PARLE À
        // SA PLACE. « urgent » veut dire « mange-le maintenant » : l'écrire sur
        // un reste de frigo périmé serait inviter à cuisiner ce que le modèle
        // vient de refuser de proposer pour une question de sécurité. Le congelé
        // dépassé, lui, reste marqué — il reste servi, donc il reste sur l'axe.
        // Frigo dur, congélateur mou, jusque dans les mots.
        //
        // Un lot sans naissance n'a pas de `vie` non plus, donc pas de marque :
        // le dépôt n'en produit pas aujourd'hui — constatés comme cuisinés, tous
        // naissent — mais inventer un âge pour pouvoir marquer serait exactement
        // le chiffre qui a l'air juste et ne l'est jamais.
        marque: v && !perime ? marque(v.fraction) : "",
        perime,
      };
    });
}

/* ───────────────────────────────────────────────────────── le garde-manger */

/**
 * Ce qu'on peut dire d'une denrée en une ligne.
 *
 * `quantite` ne ment jamais par arrondi : « 4 × 285 g » plutôt que « 1 140 g »,
 * parce que ce sont quatre boîtes et qu'on en ouvre une à la fois. Le total
 * pesé, lui, se lit au niveau de la zone — c'est là qu'il veut dire quelque
 * chose.
 */
export interface DenreeVue {
  cle: string;
  /** L'id du vocabulaire — ce sur quoi le rejeu et le relevé se recollent. */
  ingredient: string;
  nom: string;
  quantite: string;
  etat: string;
  /** Ce qui abîme cette denrée ICI, et rien quand la zone lui convient. */
  alerte: string;
  note: string | null;
  /** T142 — « industriel — à ne pas racheter », ou vide. */
  industriel?: string;
}

/** T142 — la phrase d'un produit industriel que le foyer ne rachète plus. */
export const PHRASE_INDUSTRIEL = "industriel — à ne pas racheter";

export interface ZoneVue {
  id: string;
  nom: string;
  espace: Espace;
  /** « 42 × 30 × 17 cm · 2 niveaux », ou ce qu'on en connaît. */
  cotes: string;
  /** « 42,8 L », ou vide quand une cote manque. */
  volume: string;
  /** L'ambiance, en mots : « à la lumière · près d'une source de chaleur ». */
  ambiance: string;
  denrees: DenreeVue[];
  /** Ce que la zone porte, en grammes pesés. Zéro quand rien n'est pesé. */
  poidsG: number;
  poids: string;
}

const nomDenree = (id: string): string => id.replace(/-/g, " ");

const ETIQUETTE_ETAT: Record<Denree["etat"], string> = {
  conserve: "conserve",
  bocal: "bocal",
  sec: "sec",
  entame: "entamé",
  frais: "frais",
};

/** Ce que la zone fait subir à la denrée — et seulement ce qu'elle lui fait
 *  subir vraiment. Une sensibilité que la zone ne contredit pas ne se dit pas :
 *  écrire « craint l'humidité » sous un paquet rangé au sec est un avertissement
 *  qui apprend à être ignoré. */
export function agressions(d: Denree, z: Zone): string[] {
  const dits: string[] = [];
  if (d.sensible.includes("lumiere") && z.exposition === "jour") dits.push("à la lumière");
  if (d.sensible.includes("humidite") && z.hygrometrie === "humide") dits.push("à l’humidité");
  if (d.sensible.includes("chaleur") && z.chaleur) dits.push("près d’une source de chaleur");
  return dits;
}

function denreeVue(d: Denree, z: Zone, i: number): DenreeVue {
  const q = d.parUnite;
  return {
    cle: `${d.zone}|${d.ingredient}|${i}`,
    // L'ID BRUT REMONTE À L'ÉCRAN, en plus du nom lisible : c'est lui qui
    // permet de poser dessus l'état rejoué (confiance, « vu le »), et c'est lui
    // qu'un relevé renvoie au journal. Un nom francisé ne se recolle à rien.
    ingredient: d.ingredient,
    nom: nomDenree(d.ingredient),
    // Une denrée non pesée dit son compte, jamais « — » : « 1 » est une
    // information, et c'est celle qu'on a.
    quantite: q
      ? d.unites > 1
        ? `${d.unites} × ${fmt(q.amount)} ${q.unit}`
        : `${fmt(q.amount)} ${q.unit}`
      : `${d.unites}`,
    etat: ETIQUETTE_ETAT[d.etat],
    alerte: agressions(d, z).join(" · "),
    note: d.note,
    industriel: d.industriel ? PHRASE_INDUSTRIEL : "",
  };
}

const cotesDe = (z: Zone): string => {
  const { largeur_cm: l, profondeur_cm: p, hauteur_cm: h } = z.dimensions;
  const dims = [l, p, h].every((c) => c != null)
    ? `${fmt(l!)} × ${fmt(p!)} × ${fmt(h!)} cm`
    : l != null && p != null
      ? `${fmt(l!)} × ${fmt(p!)} cm · hauteur libre`
      : "non mesurée";
  return [dims, z.niveaux > 1 ? `${z.niveaux} niveaux` : ""].filter(Boolean).join(" · ");
};

const ambianceDe = (z: Zone): string =>
  [
    z.exposition === "jour" ? "à la lumière du jour" : "",
    z.hygrometrie === "humide" ? "humide" : "",
    z.chaleur ? "près d’une source de chaleur" : "",
  ]
    .filter(Boolean)
    .join(" · ");

/**
 * Les rangements et ce qu'ils portent.
 *
 * L'ORDRE EST CELUI DU FICHIER, qui est celui du relevé — c'est-à-dire l'ordre
 * dans lequel on a fait le tour de la cuisine. Trier par volume ou par nombre de
 * denrées classerait des étagères par une grandeur dont personne ne se sert pour
 * les retrouver.
 */
export function zones(gm: GardeManger): ZoneVue[] {
  return gm.zones.map((z) => {
    const dedans = gm.denrees.filter((d) => d.zone === z.id);
    const poidsG = dedans.reduce((s, d) => s + (d.poidsG ?? 0), 0);
    return {
      id: z.id,
      nom: z.label,
      espace: z.espace,
      cotes: cotesDe(z),
      volume: z.volumeL == null ? "" : `${fmt(z.volumeL)} L`,
      ambiance: ambianceDe(z),
      denrees: dedans.map((d, i) => denreeVue(d, z, i)),
      poidsG,
      // Au-delà du kilo on lit des kilos : « 5 000 g de farine » se compte en
      // sacs, pas en grammes.
      poids: poidsG === 0 ? "" : poidsG >= 1000 ? `${fmt(poidsG / 1000)} kg` : `${fmt(poidsG)} g`,
    };
  });
}

export interface ASauverVue {
  cle: string;
  /** L'id, alias résolu — celui du rejeu, que corrige `corrigerLigne` (T139). */
  id: string;
  nom: string;
  urgence: Urgence;
  raison: string;
  /** Où aller le chercher. Plusieurs zones quand plusieurs lots courent. */
  ou: string;
  /**
   * L'AUTRE ISSUE, en une phrase : « ou : au congélateur (3 mois) ».
   *
   * Vide quand il n'y en a pas — et c'est le cas de la pomme de terre crue, que
   * le congélateur rend farineuse. Une denrée sans issue de conservation n'a
   * qu'une sortie : la cuisiner.
   */
  conserver: string;
  /** Ce qu'il faudrait savoir faire pour en avoir une de plus. Jamais présenté
   *  comme un achat à faire : c'est un nœud de compétence, la règle de #29. */
  debloquer: string;
}

/**
 * Ce qui se perd, prêt à lire.
 *
 * GROUPÉ PAR INGRÉDIENT, PARCE QUE LA LISTE EST UNE LISTE DE COURSES À L'ENVERS.
 * Le modèle rend un élément par LOT — trois fonds de paquets de pâtes font trois
 * lignes. Mais on ne cuisine pas « le deuxième paquet de pâtes » : on cuisine
 * des pâtes. Trois lignes identiques feraient croire à trois choses à faire.
 */
export function aSauverVue(catalogue: Catalogue, reste: Iterable<string>): ASauverVue[] {
  const par = new Map<string, ASauverVue & { zones: Set<string> }>();
  for (const s of aSauver(catalogue, reste)) {
    const vu = par.get(s.ingredient);
    if (vu) {
      vu.zones.add(s.zone);
      continue;
    }
    par.set(s.ingredient, {
      cle: s.ingredient,
      id: catalogue.rayons.aliases[s.ingredient] ?? s.ingredient,
      nom: s.nom,
      urgence: s.urgence,
      raison: s.raison,
      ou: s.zone,
      conserver: s.conserver.map((c) => `${c.label}${c.fenetre ? ` (${c.fenetre})` : ""}`).join(" · "),
      // UN SEUL VERROU, ET SEULEMENT S'IL EST TAILLÉ POUR CETTE MATIÈRE.
      //
      // Deux filtres, deux raisons. Lister les quatre méthodes qu'on ne possède
      // pas transforme un conseil en catalogue de courses, ce que #29 interdit
      // au modèle. Et le sous-vide, qui marche sur à peu près tout, était le
      // premier verrou des treize denrées : la même phrase treize fois de suite
      // n'est plus une phrase. Ne reste que ce qui dit quelque chose de CETTE
      // denrée-là — lacto-fermenter un oignon, sécher de l'ail.
      debloquer: ((v) =>
        v ? `${v.noeud ?? v.label}${v.manque ? ` — ${v.manque}` : ""}` : "")(
        s.verrouille.find((c) => c.specifique),
      ),
      zones: new Set([s.zone]),
    });
  }
  return [...par.values()].map(({ zones, ...v }) => ({ ...v, ou: [...zones].join(" · ") }));
}

/**
 * Ce qu'on peut ajouter à une zone — T139 : les ingrédients que le catalogue
 * connaît, relevé ou rayons, alias résolus, par nom.
 *
 * LE CATALOGUE ET RIEN D'AUTRE. Un champ libre créerait des ids qu'aucune
 * recette ne lit — « noix de cajou » à côté de `noix-cajou` — et la denrée
 * ajoutée ne retirerait jamais une ligne de courses : on l'aurait dite pour rien.
 */
export function ingredientsConnus(catalogue: Catalogue): { id: string; nom: string }[] {
  const alias = (id: string): string => catalogue.rayons.aliases[id] ?? id;
  const ids = new Set([
    ...Object.values(catalogue.rayons.rayons).flat().map(alias),
    ...idsDuReleve(catalogue),
  ]);
  return [...ids]
    .map((id) => ({ id, nom: nomDeLaDenree(id) }))
    .sort((a, b) => a.nom.localeCompare(b.nom, "fr"));
}

export interface GardeMangerVue {
  zones: ZoneVue[];
  /** Les erreurs de rangement, calculées à l'export. */
  alertes: string[];
  /** Ce qui se perd, du plus pressé au moins. L'autre moitié de l'anti-gaspi :
   *  « à déplacer » dit de ranger autrement, celle-ci dit de cuisiner. */
  aSauver: ASauverVue[];
  /** Ce qu'un relevé peut ajouter à une zone (T139). */
  connus: { id: string; nom: string }[];
  /** Le volume mesuré du garde-manger. Les zones non cotées n'y sont pas. */
  volume: string;
}

/**
 * Le garde-manger tel que le catalogue le DÉFINIT, et ce qui s'y perd.
 *
 * `reste` : les ids du relevé qui ont encore quelque chose — `jeu.gardeManger`,
 * la même intersection que le score et la liste (T106).
 *
 * LE COMPTE DES DENRÉES ET LEUR POIDS NE SONT PLUS ICI — T106. Ils venaient du
 * relevé du 26/08 (« 53 denrées … 23 sont pesées, pour 16 kg ») et l'écran les
 * affichait comme l'état du placard, sous un placard relevé vide. Ce qu'il en
 * RESTE se lit sur le rejeu : voir `resteAuPlacard`.
 */
export function gardeManger(catalogue: Catalogue, reste: Iterable<string>): GardeMangerVue {
  const gm = catalogue.gardeManger;
  const volumeL = gm.zones.reduce((s, z) => s + (z.volumeL ?? 0), 0);
  return {
    zones: zones(gm),
    alertes: gm.alertes,
    aSauver: aSauverVue(catalogue, reste),
    connus: ingredientsConnus(catalogue),
    volume: volumeL === 0 ? "" : `${fmt(volumeL)} L`,
  };
}

export interface ResteAuPlacard {
  /** Les ids du relevé dont le rejeu porte encore un lot. */
  restent: number;
  /** Les ids du relevé — ce que le placard EST. */
  relevees: number;
  /** Le jour du relevé, en `JJ/MM`, ou vide s'il n'est pas daté. */
  releve: string;
  /** Parmi ceux qui restent, ceux dont tous les lots sont chiffrés. */
  pesees: number;
  /** Leur poids, en toutes lettres — vide quand rien n'est pesé. */
  poids: string;
  /**
   * Par zone, puis par ingrédient tel que le relevé l'écrit : ce qu'il en reste
   * DANS CETTE ZONE — T107. Un ingrédient absent n'a pas d'entrée.
   */
  parZone: Map<string, Map<string, MesureZone>>;
  /** Par zone, le poids de ce qui y reste et se pèse de bout en bout. */
  poidsParZone: Map<string, string>;
}

export interface MesureZone {
  grammes: number | null;
  unites: number;
  /**
   * T139 — LA PORTÉE D'UNE CORRECTION FAITE SUR CETTE LIGNE (`corrigerLigne`).
   *
   * L'id de la zone quand le relevé range l'ingrédient dans plusieurs zones :
   * la ligne ne montre que ce qui est ici, sa correction ne touche que ce qui
   * est ici. `null` quand il n'a qu'une place — tous ses lots s'y lisent, y
   * compris ceux rentrés des courses sans rangement, et la correction doit les
   * atteindre aussi.
   */
  zone: string | null;
  /** Rangé là par un œil sans que le relevé le connaisse (`Rejeu.ajoutes`). */
  ajoute: boolean;
  /** Ce que la ligne affiche : « 4 boîtes », « 2 sachets · 1 entamé » — voir
   *  `enPaquets`. Des grammes seulement pour ce qui s'achète au poids. */
  quantite: string;
}

const enPoids = (g: number): string => (g >= 1000 ? `${fmt(g / 1000)} kg` : `${fmt(g)} g`);

/** Les mots d'unité féminins — pour accorder « entamée ». */
const FEMININS = new Set(["boîte", "brique", "tête", "pièce", "bouteille", "conserve"]);

const auPluriel = (mot: string, n: number): string =>
  n < 2 || /[sxz]$/.test(mot) ? mot : mot.endsWith("al") ? `${mot.slice(0, -2)}aux` : `${mot}s`;

/**
 * Le mot de l'unité d'achat d'un ingrédient, ou `null` s'il s'achète au poids
 * ou se compte sans emballage — T139.
 *
 * `fond.yaml:unite` d'abord (« sachet de 500 g » → « sachet ») : c'est le mot
 * que le foyer a écrit. À défaut, le relevé : une conserve est une boîte, un
 * paquet pesé est un paquet. Ce qui reste — les courses en vrac — se dit en
 * grammes, parce que c'est ainsi qu'on l'a acheté.
 */
export function motDuPaquet(catalogue: Catalogue, id: string): string | null {
  const alias = (x: string): string => catalogue.rayons.aliases[x] ?? x;
  const fond = (catalogue.fond?.denrees ?? []).find((d) => alias(d.ingredient) === id);
  const mot = fond?.unite.trim().split(/\s+/)[0]?.toLowerCase();
  if (mot) return mot;
  const releve = catalogue.gardeManger.denrees.find((d) => alias(d.ingredient) === id);
  if (!releve) return null;
  if (releve.etat === "conserve") return "boîte";
  return releve.parUnite ? "paquet" : null;
}

/**
 * Une poignée de lots, dite en PAQUETS — T139.
 *
 * « 1 kg » de maïs sur quatre boîtes ne se vérifie pas devant le placard ; on y
 * compte des boîtes. Les entamés se disent à part, parce que c'est ce que l'œil
 * distingue : un bocal ouvert n'est pas une boîte de plus. Le compte rejoint
 * celui de `mesurer` (un entamé vaut une unité), donc celui que corrigent les
 * boutons − / + : on corrige le nombre qu'on lit.
 */
export function enPaquets(lots: readonly LotPlacard[], mot: string | null): string {
  const m = mesurer(lots);
  if (!mot) return m.grammes != null ? enPoids(m.grammes) : `${m.unites}`;
  const entames = lots.reduce(
    (n, l) => n + (l.entame != null ? 1 : 0) + (l.etat === "entame" ? l.unites : 0),
    0,
  );
  const scelles = m.unites - entames;
  const e = (n: number) => `${n} entamé${FEMININS.has(mot) ? "e" : ""}${n > 1 ? "s" : ""}`;
  if (!scelles) return `${entames} ${auPluriel(mot, entames)} ${e(entames).replace(/^\d+ /, "")}`;
  return `${scelles} ${auPluriel(mot, scelles)}${entames ? ` · ${e(entames)}` : ""}`;
}

/**
 * Ce qu'il RESTE au garde-manger, dit en une phrase — T106.
 *
 * LA MÊME INTERSECTION QUE `hydraterGardeManger`, ET PAS LE REJEU ENTIER. Le
 * rejeu porte aussi ce qui rentre des courses — un saumon rangé en rentrant —
 * qui n'est pas une denrée de placard. Compter `parIngredient` tel quel aurait
 * fait grossir « le garde-manger » de toute la poissonnerie : c'est l'erreur
 * symétrique que #32 a écartée, et elle s'écarte ici de la même façon.
 *
 * DES INGRÉDIENTS, PLUS DES LIGNES DE RELEVÉ. Le catalogue disait 53 parce
 * qu'il compte les lignes — quatre paquets de pâtes, quatre lignes. Le rejeu
 * tient un état par ingrédient, et ce qu'on se demande devant un placard est
 * « est-ce qu'il y a des pâtes », pas « combien de lignes de pâtes ». Mesuré :
 * 45 ids pour 53 lignes, donc la phrase dit 45 sur une base neuve.
 *
 * LE POIDS NE COMPTE QUE CE QUI EST CHIFFRÉ DE BOUT EN BOUT. Un ingrédient dont
 * un seul lot n'est pas pesé n'a pas de total — `EtatIngredient.grammes` est
 * alors `null` — et l'additionner quand même donnerait un poids qui a l'air
 * d'un total et n'en est pas un.
 */
export function resteAuPlacard(catalogue: Catalogue, rejeu: Rejeu): ResteAuPlacard {
  const ids = idsDuReleve(catalogue);
  const la = ids.map((id) => rejeu.parIngredient.get(id)).filter((e) => e !== undefined);
  const pesees = la.filter((e) => e.grammes != null);
  const g = pesees.reduce((s, e) => s + (e.grammes ?? 0), 0);
  const [, mm, jj] = (catalogue.gardeManger.releve ?? "").split("-");
  const { parZone, poidsParZone } = parZoneDu(catalogue, rejeu);
  return {
    restent: la.length,
    relevees: ids.length,
    releve: jj && mm ? `${jj}/${mm}` : "",
    pesees: pesees.length,
    poids: pesees.length ? enPoids(g) : "",
    parZone,
    poidsParZone,
  };
}

/**
 * Ce qui reste, rangé zone par zone — T107.
 *
 * UNE ZONE NE MONTRE QUE LES LOTS RANGÉS EN ELLE. L'écran lisait l'état de
 * l'INGRÉDIENT entier sous chaque ligne, et retombait sur la quantité du
 * catalogue quand le rejeu ne le portait plus : une zone relevée à zéro lisait
 * encore « mais · 4 × 285 g · CONSERVE ». Supprimer le seul repli ne suffisait
 * pas, et c'est la mesure qui l'a dit : le concentré de tomate est relevé dans
 * DEUX zones, l'étagère ouverte et la demi-lune haute. Vider l'étagère laisse
 * l'ingrédient dans le rejeu par l'autre zone, et l'étagère aurait affiché le
 * total de la demi-lune sous ses propres yeux de relevé.
 *
 * UN LOT SANS PLACE CONNUE VA À LA PREMIÈRE ZONE QUI NOMME SON INGRÉDIENT. Une
 * course rentrée n'a pas de rangement (`zone: null`, que le rejeu pose en
 * `placard-haut`) : des pâtes rachetées atterrissent dans une zone qui n'a
 * aucune ligne de pâtes. Les filtrer par zone stricte les rendrait invisibles
 * partout — un placard plein qui se lirait vide, l'erreur inverse. Elles vont
 * donc là où le relevé range les pâtes, une seule fois, sans être recopiées
 * sous chaque zone qui les nomme.
 *
 * LE COMPTE DE L'ÉDITEUR, LUI, RESTE CELUI DE L'INGRÉDIENT ENTIER : un constat
 * porte sur un ingrédient (`ajusterUnites`), pas sur une zone. Proposer le
 * compte de la zone puis valider sans rien toucher retirerait les unités des
 * autres zones. Voir « Ce que ce bloc laisse ouvert ».
 */
function parZoneDu(
  catalogue: Catalogue,
  rejeu: Rejeu,
): { parZone: Map<string, Map<string, MesureZone>>; poidsParZone: Map<string, string> } {
  const gm = catalogue.gardeManger;
  const alias = (id: string): string => catalogue.rayons.aliases[id] ?? id;
  // Les zones qui nomment chaque ingrédient, dans l'ordre du relevé.
  const places = new Map<string, string[]>();
  for (const z of gm.zones)
    for (const d of gm.denrees) {
      if (d.zone !== z.id) continue;
      const l = places.get(alias(d.ingredient)) ?? [];
      if (!l.includes(z.id)) l.push(z.id);
      places.set(alias(d.ingredient), l);
    }
  // T139 — ce qu'un œil a rangé sans que le relevé le connaisse a UNE place :
  // celle où il l'a vu.
  for (const [id, zone] of rejeu.ajoutes) if (!places.has(id)) places.set(id, [zone]);
  const lots = new Map<string, LotPlacard[]>(); // clé : `zone|id`
  for (const [id, ou] of places) {
    for (const lot of rejeu.parIngredient.get(id)?.lots ?? []) {
      const zone = ou.includes(lot.zone) ? lot.zone : ou[0]!;
      const cle = `${zone}|${id}`;
      lots.set(cle, [...(lots.get(cle) ?? []), lot]);
    }
  }
  const parZone = new Map<string, Map<string, MesureZone>>();
  const poidsParZone = new Map<string, string>();
  for (const z of gm.zones) {
    const dedans = new Map<string, MesureZone>();
    for (const d of gm.denrees) {
      if (d.zone !== z.id || dedans.has(d.ingredient)) continue;
      const id = alias(d.ingredient);
      const l = lots.get(`${z.id}|${id}`);
      if (l?.length)
        dedans.set(d.ingredient, {
          ...mesurer(l),
          zone: (places.get(id)?.length ?? 0) > 1 ? z.id : null,
          ajoute: false,
          quantite: enPaquets(l, motDuPaquet(catalogue, id)),
        });
    }
    for (const [id, zone] of rejeu.ajoutes) {
      const l = lots.get(`${z.id}|${id}`);
      if (zone === z.id && l?.length && !dedans.has(id))
        dedans.set(id, {
          ...mesurer(l),
          zone: null,
          ajoute: true,
          quantite: enPaquets(l, motDuPaquet(catalogue, id)),
        });
    }
    parZone.set(z.id, dedans);
    const g = [...dedans.values()].reduce((s, m) => s + (m.grammes ?? 0), 0);
    poidsParZone.set(z.id, g > 0 ? enPoids(g) : "");
  }
  return { parZone, poidsParZone };
}

/**
 * « Tout ce qui était au congélo est perdu » — T105.
 *
 * UN GESTE PAR RANGEMENT, PARCE QUE LA PANNE EST PAR RANGEMENT. Sur l'année
 * simulée, la coupure de courant a coûté 19 « Je n'en ai plus », la panne de
 * frigo 36 — un par lot, pour dire une seule chose.
 *
 * FRIGO ET CONGÉLO, PAS LE PLACARD. Ce qui vide un rangement d'un coup est une
 * panne de froid ; un placard ne tombe pas en panne, et un bouton qui le
 * viderait n'aurait pas d'autre usage que l'erreur.
 *
 * SEULEMENT LES CONSTATÉS, MANGÉS PAR LA SEMAINE COMPRIS. Ce que la semaine
 * projette n'est pas encore cuisiné, donc pas perdu ; ce qu'elle prévoit de
 * manger jeudi est, ce soir, dans le congélateur en panne.
 *
 * DERRIÈRE UNE CONFIRMATION QUI DIT LE NOMBRE, et c'est la différence avec
 * « c'est jeté » (T103) : ici on retire des lots VIVANTS, ceux que le chaînage
 * sert. La phrase qui confirme porte le compte, parce que « tout » est le mot
 * qu'un pouce valide sans lire ; « 12 lots » se lit.
 */
export interface PerteVue {
  espace: Espace;
  bouton: string;
  question: string;
  confirmer: string;
  /** Les clés de base à retirer. */
  refs: string[];
}

export function perte(depot: Depot, filtre: Espace | null): PerteVue | null {
  if (filtre !== "frigo" && filtre !== "congelo") return null;
  const refs = depot.initiales
    .filter((l) => l.ref !== null && l.location === filtre)
    .map((l) => l.ref!);
  if (!refs.length) return null;
  const ou = filtre === "congelo" ? "au congélo" : "au frigo";
  const n = refs.length;
  const lots = n > 1 ? `les ${n} lots` : "le lot";
  return {
    espace: filtre,
    bouton: `Tout ce qui était ${ou} est perdu`,
    question: `${n > 1 ? `Les ${n} lots` : "Le lot"} ${ou} ${n > 1 ? "vont" : "va"} sortir de l’inventaire.`,
    confirmer: `Oui, retirer ${lots}`,
    refs,
  };
}

export interface Inventaire {
  categories: Categorie[];
  espaces: EspaceVue[];
  lots: LotVue[];
  gardeManger: GardeMangerVue;
  /**
   * Le rangement réellement ouvert.
   *
   * PAS TOUJOURS CELUI QU'ON A DEMANDÉ : retirer le dernier lot d'un rangement
   * fait disparaître son bouton, et l'écran resterait filtré sur une catégorie
   * qui n'est plus offerte — une liste vide, un titre qui nomme un rangement,
   * et plus rien pour en sortir que le bouton « Tout voir ». Un filtre sans
   * contenu se relâche tout seul.
   */
  filtre: Espace | null;
  /** Le rangement ouvert, en toutes lettres, ou `null`. */
  nomDuFiltre: string | null;
  /** Le geste « tout est perdu » du rangement ouvert, ou `null` (T105). */
  perte: PerteVue | null;
  /** Les lots que la base porte — ceux dont le foyer répond. Zéro veut dire
   *  que tout ce qu'on voit sort de la semaine, ce qui est une information. */
  constates: number;
}

export function vueDeLInventaire(jeu: Jeu, calc: Calcul, voulu: Espace | null): Inventaire {
  const lignes = calc.depot.lignes;
  // La date de référence est le PREMIER JOUR DE LA FENÊTRE, c'est-à-dire
  // aujourd'hui : l'inventaire dit ce qu'il y a maintenant, pas ce qu'il en
  // restera dimanche.
  const aujourdhui = jeu.jours[0]?.date ?? new Date();
  const cats = categories(lignes, (l) => calc.depot.perime(l, aujourdhui));
  const filtre = cats.some((c) => c.espace === voulu) ? voulu : null;
  return {
    categories: cats,
    espaces: espaces(calc.stockage),
    lots: lots(jeu, calc.depot, filtre, aujourdhui),
    // LE GARDE-MANGER NE SE FILTRE PAS PAR ESPACE, et c'est délibéré : ses sept
    // zones tombent toutes sur `placard`, donc le filtre ne trierait rien. Il se
    // lit par rangement, ce qui est la seule question qu'on se pose devant un
    // placard — « qu'est-ce qu'il y a dans celui-là ».
    gardeManger: gardeManger(jeu.catalogue, jeu.gardeManger),
    filtre,
    nomDuFiltre: filtre ? nomEspace(filtre) : null,
    perte: perte(calc.depot, filtre),
    constates: lignes.filter((l) => l.ref !== null).length,
  };
}

/* ─────────────────────────────────────────── le plan de la cuisine — T141 */

/**
 * Les trois choses qu'un rangement peut avoir à dire, et rien d'autre.
 *
 * TROIS GESTES, PAS TROIS NIVEAUX. « À manger vite » dit de cuisiner ;
 * « entamé » dit de finir avant d'ouvrir le suivant ; « à déplacer » dit de
 * ranger ailleurs. Le même oignon peut porter deux pastilles, et ce n'est pas
 * une redite — c'est la règle de « À déplacer » et « À manger en premier ».
 */
export type Signal = "vite" | "entame" | "deplacer";

export const SIGNAUX: readonly { genre: Signal; puce: string; puceLong: string; legende: string }[] = [
  { genre: "vite", puce: "!", puceLong: "à manger vite", legende: "à manger vite" },
  { genre: "entame", puce: "◐", puceLong: "entamés", legende: "entamé" },
  { genre: "deplacer", puce: "↔", puceLong: "à déplacer", legende: "à déplacer" },
];

const aucun = (): Record<Signal, number> => ({ vite: 0, entame: 0, deplacer: 0 });

export interface RangementVue extends RangementDuPlan {
  /** Combien de produits portent chaque signal, ICI. */
  signaux: Record<Signal, number>;
  /** Ce qu'il y a dedans, en produits — `null` tant que le journal n'a pas parlé. */
  produits: number | null;
  /** Ce que lit un lecteur d'écran : le nom, le compte, les signaux. */
  aria: string;
}

export interface PlanVue {
  murs: PlanCuisine["murs"];
  rangements: RangementVue[];
  decor: PlanCuisine["decor"];
  /**
   * Les zones que le plan ne dessine pas. Vide avec le catalogue du dépôt —
   * `verifier.py` le refuse —, mais un export plus vieux que l'écran ne doit pas
   * rendre une zone inouvrable : elles se touchent alors sous le dessin.
   */
  horsPlan: RangementVue[];
  totaux: Record<Signal, number>;
  produits: number;
}

/**
 * Ce qui est mal rangé, zone par zone, parmi ce qui RESTE — les ids.
 *
 * LA MÊME RÈGLE QUE LES ALERTES DE L'EXPORT (`alertes_rangement`) : une
 * sensibilité que la zone contredit, ou un voisin incompatible. Recalculée ici
 * parce que l'export l'écrit en phrases, et qu'une pomme de terre déclarée
 * finie ne doit plus allumer le sous-évier.
 */
export function aDeplacer(catalogue: Catalogue, reste: Iterable<string>): Map<string, Set<string>> {
  const alias = (id: string): string => catalogue.rayons.aliases[id] ?? id;
  const restent = new Set(reste);
  const zones = new Map(catalogue.gardeManger.zones.map((z) => [z.id, z]));
  const presents = (zid: string): Set<string> =>
    new Set(
      catalogue.gardeManger.denrees
        .filter((d) => d.zone === zid && restent.has(alias(d.ingredient)))
        .map((d) => d.ingredient),
    );
  const par = new Map<string, Set<string>>();
  for (const d of catalogue.gardeManger.denrees) {
    const z = zones.get(d.zone);
    if (!z || !restent.has(alias(d.ingredient))) continue;
    const voisins = presents(d.zone);
    if (agressions(d, z).length || d.incompatibles.some((i) => voisins.has(i))) {
      if (!par.has(d.zone)) par.set(d.zone, new Set());
      par.get(d.zone)!.add(alias(d.ingredient));
    }
  }
  return par;
}

/** Les signaux des zones du garde-manger, comptés par produit et pas par lot :
 *  trois fonds de paquets de pâtes sont UN produit entamé. */
export function signauxDesZones(catalogue: Catalogue, reste: Iterable<string>): Map<string, Record<Signal, number>> {
  const ids = [...reste];
  const par = new Map<string, Record<Signal, number>>();
  const de = (zid: string) => par.get(zid) ?? par.set(zid, aucun()).get(zid)!;
  const vus = new Set<string>();
  for (const s of aSauver(catalogue, ids)) {
    const cle = `${s.zoneId}|${s.ingredient}`;
    if (vus.has(cle)) continue;
    vus.add(cle);
    // LE PARTAGE DE « À MANGER EN PREMIER » : « pressé » d'un côté, « entamé »
    // de l'autre — les deux mots que la liste écrit déjà à droite de la ligne.
    de(s.zoneId)[s.urgence === "haute" ? "vite" : "entame"] += 1;
  }
  for (const [zid, mal] of aDeplacer(catalogue, ids)) de(zid).deplacer = mal.size;
  return par;
}

/** Un lot du frigo ou du congélateur, compté sur le plan : là, et pas à jeter. */
const vivant = (l: LotVue): boolean => !l.epuise && !l.perime;

/**
 * Le plan, prêt à dessiner.
 *
 * `lots` : TOUS les lots du dépôt (sans filtre) ; `produitsParZone` : ce que le
 * rejeu dit qu'il reste dans chaque zone, ou `null` tant qu'il n'a pas répondu.
 */
export function vueDuPlan(
  catalogue: Catalogue,
  reste: Iterable<string>,
  lots: readonly LotVue[],
  produitsParZone: ReadonlyMap<string, number> | null,
): PlanVue | null {
  const plan = catalogue.gardeManger.plan;
  if (!plan) return null;
  const signaux = signauxDesZones(catalogue, reste);
  const vue = (r: RangementDuPlan): RangementVue => {
    const dedans = r.zone ? null : lots.filter((l) => l.espace === r.espace && vivant(l));
    const s = r.zone
      ? (signaux.get(r.zone) ?? aucun())
      : { ...aucun(), vite: dedans!.filter((l) => l.marque === "urgent").length };
    const produits = r.zone ? (produitsParZone ? (produitsParZone.get(r.zone) ?? 0) : null) : dedans!.length;
    const dits = SIGNAUX.filter((x) => s[x.genre]).map((x) => `${s[x.genre]} ${x.legende}`);
    return {
      ...r,
      signaux: s,
      produits,
      aria: [r.label, produits == null ? "" : pluriel(produits, "produit"), ...dits]
        .filter(Boolean)
        .join(", "),
    };
  };
  const rangements = plan.rangements.map(vue);
  const dessinees = new Set(plan.rangements.map((r) => r.zone));
  const horsPlan = catalogue.gardeManger.zones
    .filter((z) => !dessinees.has(z.id))
    .map((z) =>
      vue({ id: z.id, zone: z.id, espace: z.espace, label: z.label, court: z.label, teinte: "bois",
        mur: "fond", x: 0, y: 0, w: 0, h: 0 }),
    );
  const tous = [...rangements, ...horsPlan];
  const totaux = aucun();
  for (const r of tous) for (const x of SIGNAUX) totaux[x.genre] += r.signaux[x.genre];
  return {
    murs: plan.murs,
    rangements,
    decor: plan.decor,
    horsPlan,
    totaux,
    produits: tous.reduce((n, r) => n + (r.produits ?? 0), 0),
  };
}

/** Un filtre éteint les rangements qui n'ont rien à dire sur lui — il ne les
 *  cache pas : le plan reste le plan, on ne déplace pas les meubles. */
export const eteint = (r: RangementVue, filtre: Signal | null): boolean =>
  filtre !== null && r.signaux[filtre] === 0;

/**
 * Le conseil de rangement d'un rangement, en phrases — l'encart vert.
 *
 * D'ABORD CE QUI EST MAL RANGÉ ICI (les alertes de l'export, tant qu'il reste
 * quelque chose à déplacer), PUIS LE GESTE DES FAMILLES DE GARDE de ce qui y
 * est rangé — `conservation.yaml`. Deux au plus : un encart de cinq conseils
 * est un encart qu'on saute. Le congélateur prend le conseil de sa famille ;
 * le frigo n'en a pas, ses lots sont des plats, pas des denrées.
 */
export function conseilDe(catalogue: Catalogue, r: RangementVue, reste: Iterable<string>): string[] {
  const familles = catalogue.garde ?? [];
  if (!r.zone) return familles.filter((f) => f.espace === r.espace && r.espace === "congelo").map((f) => f.conseil);
  const zone = catalogue.gardeManger.zones.find((z) => z.id === r.zone);
  if (!zone) return [];
  const alias = (id: string): string => catalogue.rayons.aliases[id] ?? id;
  const restent = new Set(reste);
  // « (sous-évier) » en fin d'alerte se tait : le panneau porte déjà le nom.
  const fin = ` (${zone.label})`;
  // UNE SEULE LIGNE « À DÉPLACER », quel que soit le nombre d'alertes (T142,
  // vu sur le sous-évier : deux lignes qui commençaient pareil, au-dessus d'un
  // conseil qui le redisait). Les diagnostics s'enchaînent derrière un seul
  // en-tête ; le geste de la famille, dessous, ne le répète plus.
  const diagnostics = r.signaux.deplacer
    ? catalogue.gardeManger.alertes.filter((a) => a.endsWith(fin)).map((a) => a.slice(0, -fin.length))
    : [];
  const alertes = diagnostics.length ? [`À déplacer : ${diagnostics.join(" ; ")}.`] : [];
  const ids = [
    ...new Set(
      catalogue.gardeManger.denrees
        .filter((d) => d.zone === zone.id && d.garde && restent.has(alias(d.ingredient)))
        .map((d) => d.garde!),
    ),
  ];
  const gestes = ids
    .map((id) => familles.find((f) => f.id === id)?.conseil)
    .filter((c): c is string => !!c)
    .slice(0, 2);
  return [...alertes, ...gestes];
}
