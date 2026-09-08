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

import type { BilanEspace, Calcul } from "../model/calcul";
import type { Depot, LigneDepot } from "../model/depot";
import type { Jeu } from "../model/jeu";
import { aSauver } from "../model/gardeManger";
import type { Evenement, Rejeu } from "../model/journal";
import {
  etatDuCongelo,
  nomDuType,
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
import type { Catalogue, Denree, Espace, GardeManger, Urgence, Zone } from "../model/types";
import { fmt } from "../ui/format";
import { nomEspace } from "../ui/phrases";

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
  /** Barres allumées sur quatre — un niveau, pas un compte exact. */
  barres: number;
  /** Le plus bas des niveaux de l'espace : un seul chiffre douteux suffit à
   *  rendre le total douteux. */
  conf: Niveau;
  note: string;
}

const pluriel = (n: number, mot: string): string => `${n} ${mot}${n > 1 ? "s" : ""}`;

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
export function categories(lignes: readonly LigneDepot[]): Categorie[] {
  const vue = (espace: Espace, dedans: LigneDepot[]): Categorie => {
    const vivants = dedans.filter((l) => !l.epuise).length;
    const manges = dedans.length - vivants;
    const niveaux = dedans.map((l) => fiabilite(l).niveau);
    const etats = [...new Set(dedans.map((l) => fiabilite(l).label))];
    return {
      espace,
      nom: nomEspace(espace),
      vivants,
      manges,
      barres: Math.min(4, vivants),
      conf: niveaux.includes("basse")
        ? "basse"
        : niveaux.every((n) => n === "haute")
          ? "haute"
          : "moyenne",
      note: [
        pluriel(vivants, "lot"),
        manges ? `${manges} mangé${manges > 1 ? "s" : ""}` : "",
        ...etats,
      ]
        .filter(Boolean)
        .join(" · "),
    };
  };

  return ESPACES.map((espace) => [espace, lignes.filter((l) => l.espace === espace)] as const)
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
        {
          nom: "contenants",
          libres: libres(s.contenants, s.fin),
          part: part(s.fin, s.contenants),
          commande: boites,
        },
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
  /** Ce qui prend la place, quand il n'y en a plus — T38. Vide sinon. */
  plein: string;
}

const portions = (n: number): string => `${n} portion${n > 1 ? "s" : ""}`;

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
      fiabilite: vu ? "compté" : "jamais vu",
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
   * « frigo dur, congélateur mou ». Un reste de frigo périmé n'a pas de phrase
   * parce qu'il n'est plus là — il est sorti du jeu, en silence, et c'est le
   * bon comportement pour une question de sécurité. Un bocal congelé de quatre
   * mois, lui, reste servi : le taire en ferait un lot comme un autre, le
   * retirer fabriquerait de l'archéologie de congélateur. Il reste, et il le
   * dit.
   *
   * EN JOURS, PAS EN MOIS. La conversion vit du côté Python, une seule fois
   * (`JOURS_PAR_MOIS`) ; la refaire ici donnerait deux constantes libres de
   * diverger pour gagner un « 4 mois » à la place d'un « 128 j ».
   */
  horloge: string;
}

export function lots(
  jeu: Jeu,
  depot: Depot,
  filtre: Espace | null,
  aujourdhui: Date,
): LotVue[] {
  return depot.lignes
    .map((l, i) => ({ l, i }))
    .filter(({ l }) => !filtre || l.espace === filtre)
    .map(({ l, i }) => {
      const q = l.qty?.amount ?? null;
      const entame = l.reste != null && q != null && l.reste < q - 1e-9;
      const v = depot.vie(l, aujourdhui);
      return {
        cle: l.ref ?? `d${i}`,
        espace: l.espace,
        nom: l.type,
        ou: [
          nomEspace(l.espace),
          l.from ? `cuisiné cette semaine (${jeu.plats[l.from]?.titre ?? l.from})` : "déjà là avant la semaine",
          entame ? `reste ${fmt(l.reste!)} ${l.unite ?? ""}`.trim() : "",
          l.epuise ? "mangé par la semaine" : "",
        ]
          .filter(Boolean)
          .join(" · "),
        quantite: q != null ? `${fmt(q)} ${l.unite ?? ""}`.trim() : l.band || "—",
        fiabilite: fiabilite(l),
        epuise: l.epuise,
        ref: l.ref,
        horloge:
          v && !v.dur && v.depasse
            ? `au congélateur depuis ${v.age} j, au-delà des ${v.fenetre} prévus — encore bon à jouer`
            : "",
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
}

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
export function aSauverVue(catalogue: Catalogue): ASauverVue[] {
  const par = new Map<string, ASauverVue & { zones: Set<string> }>();
  for (const s of aSauver(catalogue)) {
    const vu = par.get(s.ingredient);
    if (vu) {
      vu.zones.add(s.zone);
      continue;
    }
    par.set(s.ingredient, {
      cle: s.ingredient,
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

export interface GardeMangerVue {
  zones: ZoneVue[];
  /** Les erreurs de rangement, calculées à l'export. */
  alertes: string[];
  /** Ce qui se perd, du plus pressé au moins. L'autre moitié de l'anti-gaspi :
   *  « à déplacer » dit de ranger autrement, celle-ci dit de cuisiner. */
  aSauver: ASauverVue[];
  /** Combien de denrées en tout, et combien pèsent quelque chose de connu. */
  denrees: number;
  pesees: number;
  /** Le poids total constaté, en toutes lettres. */
  poids: string;
  /** Le volume mesuré du garde-manger. Les zones non cotées n'y sont pas. */
  volume: string;
}

export function gardeManger(catalogue: Catalogue): GardeMangerVue {
  const gm = catalogue.gardeManger;
  const vues = zones(gm);
  const poidsG = vues.reduce((s, z) => s + z.poidsG, 0);
  const volumeL = gm.zones.reduce((s, z) => s + (z.volumeL ?? 0), 0);
  return {
    zones: vues,
    alertes: gm.alertes,
    aSauver: aSauverVue(catalogue),
    denrees: gm.denrees.length,
    pesees: gm.denrees.filter((d) => d.poidsG != null).length,
    poids: poidsG >= 1000 ? `${fmt(poidsG / 1000)} kg` : `${fmt(poidsG)} g`,
    volume: volumeL === 0 ? "" : `${fmt(volumeL)} L`,
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
  /** Les lots que la base porte — ceux dont le foyer répond. Zéro veut dire
   *  que tout ce qu'on voit sort de la semaine, ce qui est une information. */
  constates: number;
}

export function vueDeLInventaire(jeu: Jeu, calc: Calcul, voulu: Espace | null): Inventaire {
  const lignes = calc.depot.lignes;
  const cats = categories(lignes);
  const filtre = cats.some((c) => c.espace === voulu) ? voulu : null;
  return {
    categories: cats,
    espaces: espaces(calc.stockage),
    // La date de référence est le PREMIER JOUR DE LA FENÊTRE, c'est-à-dire
    // aujourd'hui : l'inventaire dit ce qu'il y a maintenant, pas ce qu'il en
    // restera dimanche.
    lots: lots(jeu, calc.depot, filtre, jeu.jours[0]?.date ?? new Date()),
    // LE GARDE-MANGER NE SE FILTRE PAS PAR ESPACE, et c'est délibéré : ses sept
    // zones tombent toutes sur `placard`, donc le filtre ne trierait rien. Il se
    // lit par rangement, ce qui est la seule question qu'on se pose devant un
    // placard — « qu'est-ce qu'il y a dans celui-là ».
    gardeManger: gardeManger(jeu.catalogue),
    filtre,
    nomDuFiltre: filtre ? nomEspace(filtre) : null,
    constates: lignes.filter((l) => l.ref !== null).length,
  };
}
