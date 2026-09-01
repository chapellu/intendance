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
import type { LigneDepot } from "../model/depot";
import type { Jeu } from "../model/jeu";
import { aSauver } from "../model/gardeManger";
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
}

export function lots(jeu: Jeu, lignes: readonly LigneDepot[], filtre: Espace | null): LotVue[] {
  return lignes
    .map((l, i) => ({ l, i }))
    .filter(({ l }) => !filtre || l.espace === filtre)
    .map(({ l, i }) => {
      const q = l.qty?.amount ?? null;
      const entame = l.reste != null && q != null && l.reste < q - 1e-9;
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
    lots: lots(jeu, lignes, filtre),
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
