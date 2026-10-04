// La sortie — ce qu'un plat fini laisse sur le plan de travail, et où ça va.
//
// DEMANDÉ LE 24/09/2026, AU SORTIR D'UNE RATATOUILLE :
//
//   « Même arrivé au bout de la recette je n'ai pas eu de message pour la
//     clore. J'aurais aimé une petite information du style mettre une part
//     (style 200 g) dans tel Tupperware. Deux parts dans celui-ci et le reste
//     dans les assiettes. Genre un Tupperware au frigo l'autre au congélateur.
//     Le tout avec une validation de ma part pour dire si j'ai suivi la
//     recommandation ou non. »
//
// TOUTES LES DONNÉES ÉTAIENT DÉJÀ DANS LE TÉLÉPHONE, ET AUCUNE N'ÉTAIT
// AFFICHÉE. `ratatouille-minute` déclare 500 g de reste, `band: lunchbox`,
// `gardeFrigo: 3`, `congelo: true` ; le foyer déclare 8 boîtes hermétiques
// (1 portion), 12 bocaux Le Parfait (2 portions) et 20 sacs congélation. Le
// `Contenant` était parsé, typé, et lu par un seul lecteur — le PLAFOND de
// rangement, qui n'en compte que le nombre. Une boîte était une capacité ;
// c'est ici qu'elle devient une destination.
//
// CE QUE CET ÉCRAN APPREND À L'APP, ET QUE RIEN D'AUTRE NE PEUT LUI APPRENDRE.
// `db/journal.ts` écrit tout ce qu'on cuisine avec `location: "frigo"`, sous un
// commentaire qui dit pourquoi : « congeler reste un geste qu'on n'a pas encore
// fait ; c'est l'inventaire qui l'enregistrera quand un doigt le dira ». La
// sortie EST ce doigt — c'est le premier endroit de l'app où quelqu'un peut
// dire qu'un bocal est parti au congélateur.

import { bandRepas } from "../model/depot";
import type { Contenant, Emit, EmitKind, Espace, Foyer, Plat } from "../model/types";

/** Un contenant du foyer, et combien il en faut. */
export interface Boite {
  /** Le label du catalogue — « bocaux Le Parfait 0,75 L ». */
  label: string;
  nombre: number;
}

/**
 * Un lot à ranger : une part de ce qu'un `emit` laisse, et l'endroit où elle
 * part MAINTENANT.
 *
 * LA FORME EST CELLE QUE `journaliserCuisson` SAIT ÉCRIRE (`RangementLot`) —
 * quatre champs sur les dix, et c'est voulu : le reste (les boîtes, les jours
 * de garde) est de l'affichage, et n'a rien à faire en base. Ce qui se persiste
 * est ce qu'un doigt a décidé ; « il faut deux bocaux » est un calcul, et un
 * calcul se refait.
 */
export interface LotSortie {
  /** Le rang de l'emit dans `plat.emits`. Le lot en tire son type, son `kind`
   *  et son `espace` de destination — inutile de les recopier ici. */
  emit: number;
  type: string;
  kind: EmitKind;
  /** Où ça part CE SOIR. Décide de l'horloge qui compte. */
  location: Espace;
  /** En repas — l'unité du budget de rangement, celle que `band` compte. */
  repas: number;
  /**
   * Ce que l'emit ENTIER a laissé, en repas — le plafond du lot, pas sa taille.
   *
   * DE L'AFFICHAGE, ET LA SEULE BORNE QUE LA CORRECTION DE T102 POSSÈDE. Deux
   * lots nés du même emit se partagent ce nombre : laisser chacun monter
   * jusqu'à 3 repas sur un emit qui en a produit 3 ferait ranger six repas qui
   * n'ont jamais existé. Il est porté ici plutôt que recalculé dans l'écran
   * parce que `repasDeLEmit` ARRONDIT : le refaire ailleurs en ferait une
   * seconde vérité, et c'est elle qui divergerait.
   */
  total: number;
  /** La bande de CE lot, redécoupée quand l'emit se sépare en deux endroits. */
  band: string;
  qty: number | null;
  unite: string | null;
  /** Combien de jours ça tient là où ça part, quand c'est le frigo qui compte.
   *  `null` au congélateur : le forfait est une affaire de `Depot`, pas d'un
   *  écran, et le recopier ici en ferait une seconde vérité. */
  garde: number | null;
  /** Ce que la recette dit de ce reste — « meilleure réchauffée le lendemain ».
   *  SUR LE PREMIER MORCEAU SEULEMENT : la phrase parle de l'emit, pas de la
   *  boîte, et l'écrire deux fois ferait croire à deux conseils. */
  note: string | null;
  boites: Boite[];
}

export interface VueSortie {
  /** Les parts qui passent à table ce soir — « le reste dans les assiettes ». */
  table: number;
  lots: LotSortie[];
  /** Le plat ne laisse rien à ranger : 23 plats du corpus sur 138. */
  rien: boolean;
}

/**
 * Ce que le plat laisse, et où on le met.
 *
 * `parts` EST CE QUI PASSE À TABLE, `f` CE QU'ON A CUISINÉ. Les deux sont déjà
 * sur la fiche — « Pour 2,5 parts · on en cuisine 4 » — et c'est la différence
 * entre les deux que cet écran range. On ne la recalcule pas : `emits` la porte
 * déjà, mesurée recette par recette (« sur 4 parts, c'est ce qui reste une fois
 * le dîner servi », dit `ratatouille-minute` dans son propre fichier).
 */
export function vueDeLaSortie(p: Plat, parts: number, f: number, foyer: Foyer): VueSortie {
  const lots: LotSortie[] = [];
  p.emits.forEach((e, rang) => {
    const total = repasDeLEmit(e, f);
    couper(e, total).forEach((part, n) => {
      lots.push({
        emit: rang,
        type: e.type,
        kind: e.kind,
        location: part.location,
        repas: part.repas,
        total,
        band: part.repas === total ? e.band : `${part.repas}-repas`,
        // AU PRORATA DES REPAS, et seulement quand l'emit chiffre quelque
        // chose : 91 des 126 emits du corpus ont `qty: null` — un reste de plat
        // se compte en repas, pas en grammes. L'écran qui réclamait « 200 g »
        // n'aura donc un poids que sur un emit sur trois, et il vaut mieux
        // n'en afficher aucun que d'en inventer un.
        qty: e.qty ? (e.qty.amount * f * part.repas) / total : null,
        unite: e.qty ? e.qty.unit : null,
        garde: part.location === "frigo" ? e.gardeFrigo : null,
        note: n === 0 ? e.note : null,
        boites: boitesPour(foyer, part.location, part.repas),
      });
    });
  });
  return { table: parts, lots, rien: lots.length === 0 };
}

/**
 * Combien de repas cet emit met sur le plan de travail.
 *
 * ARRONDI, ET JAMAIS EN DESSOUS D'UN : on range des boîtes, pas des fractions
 * de boîte, et un emit qui existe occupe au moins une place. C'est déjà la
 * règle de `bandRepas` (« une bande illisible vaut un repas ») — ici c'est
 * l'échelle qui peut produire le 0,5.
 */
const repasDeLEmit = (e: Emit, f: number): number =>
  Math.max(1, Math.round(bandRepas(e.band) * f));

interface Part {
  repas: number;
  location: Espace;
}

/**
 * La règle qui coupe un emit en deux endroits — et c'est TOUTE la demande.
 *
 * « GENRE UN TUPPERWARE AU FRIGO L'AUTRE AU CONGÉLATEUR » : le premier repas
 * reste au frigo parce qu'il se mange dans les jours qui viennent — c'est le
 * `gardeFrigo` de la recette qui le dit, 3 jours en médiane sur le corpus — et
 * congeler ce qu'on mangera demain est un geste qu'il faudrait défaire. Le
 * surplus, lui, ne tiendra pas : il part au froid.
 *
 * DEUX LOTS AU MAXIMUM, ET PAS UN PAR BOÎTE. Le lot dit où une chose se trouve
 * et sur quelle horloge elle court ; deux bocaux côte à côte au congélateur
 * n'ont rien à dire de différent. Découper par boîte multiplierait les lignes
 * du dépôt sans ajouter un seul fait.
 *
 * `congelo: false` ⇒ TOUT RESTE AU FRIGO, quelle que soit la quantité. Mesuré :
 * les 45 emits non congelables du corpus déclarent tous `espace: frigo`, et les
 * 81 congelables tous `espace: congelo` — les deux champs ne se contredisent
 * jamais, donc on peut suivre le plus explicite des deux.
 *
 * `gardeFrigo: 0` ⇒ RIEN AU FRIGO. Trois emits du corpus sont dans ce cas, tous
 * des desserts glacés : leur place est le congélateur dès la sortie du bol.
 */
function couper(e: Emit, total: number): Part[] {
  if (!e.congelo) return [{ repas: total, location: "frigo" }];
  const frais = e.gardeFrigo > 0 ? Math.min(1, total) : 0;
  const froid = total - frais;
  return [
    ...(frais > 0 ? [{ repas: frais, location: "frigo" as Espace }] : []),
    ...(froid > 0 ? [{ repas: froid, location: e.espace }] : []),
  ];
}

/**
 * Quelles boîtes, et combien — le glouton, du plus gros au plus petit.
 *
 * DEUX RÈGLES, ET LA PREMIÈRE N'EST PAS UNE OPTIMISATION. Un contenant
 * `consommable` — les 20 sacs congélation — est une ligne de courses à racheter ;
 * le proposer d'abord dépenserait un stock en silence pour épargner une
 * vaisselle. Les boîtes qui se lavent passent donc devant, et un sac n'apparaît
 * que là où rien d'autre ne va.
 *
 * ENSUITE LE PLUS GROS QUI TIENT, parce que c'est ce qu'on lave le moins et ce
 * que le plafond de rangement compte le mieux : `Contenant.portions` est dans
 * la MÊME unité que `band` — le foyer déclare 32 places au frigo, qui sont
 * 8 boîtes × 1 + 12 bocaux × 2.
 *
 * LE DERNIER RESTE ARRONDIT VERS LE HAUT : une boîte à moitié pleine est une
 * boîte. Sans cette ligne, un reste de 1 repas face à des bocaux de 2 ne
 * recevrait aucun contenant et l'écran se tairait sur le seul geste qu'il a à
 * donner.
 *
 * AUCUN CONTENANT POUR CET ESPACE ⇒ ON NE DIT RIEN, et l'écran dira la quantité
 * sans la boîte. Inventer un contenant que le foyer n'a pas déclaré serait la
 * faute que tout ce dépôt passe son temps à réparer.
 */
export function boitesPour(foyer: Foyer, espace: Espace, repas: number): Boite[] {
  const dispo = foyer.contenants
    .filter((c) => c.portions > 0 && c.espaces.includes(espace))
    .sort(ordreDesContenants);
  if (!dispo.length) return [];

  const prises: Boite[] = [];
  let reste = repas;
  for (const c of dispo) {
    if (reste <= 0) break;
    const n = Math.floor(reste / c.portions);
    if (n > 0) {
      prises.push({ label: c.label, nombre: n });
      reste -= n * c.portions;
    }
  }
  if (reste > 0) {
    const petit = dispo.reduce((min, c) => (c.portions < min.portions ? c : min), dispo[0]!);
    const deja = prises.find((b) => b.label === petit.label);
    if (deja) deja.nombre += 1;
    else prises.push({ label: petit.label, nombre: 1 });
  }
  return prises;
}

const ordreDesContenants = (a: Contenant, b: Contenant): number =>
  a.consommable === b.consommable ? b.portions - a.portions : a.consommable ? 1 : -1;

/**
 * « 2 × bocaux Le Parfait 0,75 L ».
 *
 * LE COMPTE DEVANT, AVEC UN « × », ET PAS D'ACCORD. Les labels du catalogue
 * sont des noms de FAMILLE, écrits au pluriel — « bocaux », « boîtes
 * hermétiques », « sacs congélation ». Les accorder demanderait un singulier
 * que personne n'a saisi, et « bocaux » n'en a pas de régulier : « 1 bocaux »
 * a l'air cassé, « 1 bocal » se devine mais s'inventerait ici. Le « × » dit
 * qu'on multiplie une famille, ce qui est exactement ce qu'on fait.
 */
export const phraseDesBoites = (boites: readonly Boite[]): string =>
  boites.map((b) => `${b.nombre} × ${b.label}`).join(" + ");

/**
 * Ce qu'on range, en une ligne — « 250 g » ou « 2 repas ».
 *
 * LA BANDE EST LE REPLI, PAS L'INVERSE. Un poids est plus parlant qu'un compte
 * de repas devant une casserole, mais il manque sur 91 des 126 emits ; dire
 * « 2 repas » là où on ne sait pas peser vaut mieux que se taire, et bien mieux
 * que d'annoncer un chiffre dérivé d'une bande.
 */
export const quantiteDuLot = (l: LotSortie): string =>
  l.qty != null
    ? `${Math.round(l.qty)} ${l.unite ?? ""}`.trim()
    : `${l.repas} repas`;

/* ───────────────────────────────────────────────── la sortie qu'on corrige */

/**
 * CE QUE « J'AI FAIT AUTREMENT » DOIT POUVOIR DIRE — T102.
 *
 * DIT LE 03/10/2026, AU SORTIR D'UNE RECETTE :
 *
 *   « J'ai eu l'écran de fin, qui est mieux, mais quand j'ai cliqué sur "j'ai
 *     fait autrement" pour ranger le reste, rien ne m'a été proposé. »
 *
 * LE BOUTON N'ÉTAIT PAS UNE SAISIE, C'ÉTAIT UN REPLI. T99 l'a câblé sur
 * `repondre(null, "autre")` : la cuisson se journalisait, la proposition était
 * jetée, et `journaliserCuisson` retombait sur sa prudence — un lot par emit,
 * au frigo. L'écran se fermait donc sur le seul geste qu'il avait à offrir.
 * « Autrement » nommait un fait sans jamais demander lequel.
 *
 * DEUX LEVIERS PAR LOT, ET PAS UN DE PLUS : où c'est parti, et combien on en a
 * rangé. Ce sont les deux seules choses que la base retienne (`RangementLot`
 * porte `location` et `qty`/`band`) ; les boîtes, elles, sont de l'affichage et
 * se recalculent. Tout le reste de l'écart au réel — « j'ai pris un bocal au
 * lieu de deux », « j'en ai donné à la voisine » — se dit déjà avec ces deux-là.
 *
 * ON PART DE LA PROPOSITION, ON NE REPART PAS DE ZÉRO. Une saisie vide
 * jetterait l'arithmétique qui marche (43 des 126 emits se coupent en deux
 * endroits, et c'est juste) pour la faire retaper à quelqu'un qui a les mains
 * grasses. Corriger deux crans vaut mieux que déclarer trois lots.
 */
export interface Retouche {
  location: Espace;
  /** En repas, et `0` VEUT DIRE « PAS GARDÉ » — mangé ce soir, donné, jeté.
   *  C'est une réponse, pas un trou : le lot ne part pas en base, et l'écran
   *  compte ce qui n'est rangé nulle part plutôt que de le laisser filer. */
  repas: number;
}

/**
 * Les deux destinations d'une casserole qu'on vient de vider.
 *
 * `placard` EST UN ESPACE DU FOYER ET N'EST PAS UNE DESTINATION ICI. Les 12
 * bocaux Le Parfait le déclarent — c'est vrai d'un bocal vide, et de conserves
 * stérilisées — mais rien dans le corpus ne dit qu'une ratatouille du soir se
 * stérilise, et l'offrir en un tap ferait affirmer à la base une conservation
 * que personne n'a mesurée. Le relevé du dépôt sait déjà le rattraper.
 */
export const DESTINATIONS: readonly Espace[] = ["frigo", "congelo"];

/** La proposition, prise comme point de départ de la correction. */
export const retouchesDe = (lots: readonly LotSortie[]): Retouche[] =>
  lots.map((l) => ({ location: l.location, repas: l.repas }));

/**
 * Combien de repas ce lot peut encore porter.
 *
 * LE PLAFOND EST CELUI DE L'EMIT, PARTAGÉ ENTRE SES LOTS. Un emit de 3 repas
 * coupé en 1 + 2 laisse le premier monter à 2 — tant que le second redescend.
 * Sans ce partage, deux crans sur deux lignes rangeraient six repas d'un plat
 * qui en a laissé trois, et le budget de rangement les compterait tous les six.
 */
export function plafondDuLot(
  lots: readonly LotSortie[],
  retouches: readonly Retouche[],
  n: number,
): number {
  const l = lots[n]!;
  const ailleurs = lots.reduce(
    (somme, x, k) => (k !== n && x.emit === l.emit ? somme + (retouches[k]?.repas ?? 0) : somme),
    0,
  );
  return Math.max(0, l.total - ailleurs);
}

/** Un cran de plus ou de moins sur un lot, borné par son plafond et par zéro. */
export const bougerLeLot = (
  lots: readonly LotSortie[],
  retouches: readonly Retouche[],
  n: number,
  pas: number,
): Retouche[] =>
  retouches.map((r, k) =>
    k === n
      ? { ...r, repas: Math.max(0, Math.min(plafondDuLot(lots, retouches, n), r.repas + pas)) }
      : r,
  );

/**
 * Changer la destination d'un lot — et ÇA NE TOUCHE PAS SA TAILLE.
 *
 * « Tout est allé au congélateur » est le cas le plus courant de l'écart, et
 * c'est un seul tap : la quantité n'a pas bougé, c'est l'endroit qui a changé.
 */
export const rangerAilleurs = (
  retouches: readonly Retouche[],
  n: number,
  location: Espace,
): Retouche[] => retouches.map((r, k) => (k === n ? { ...r, location } : r));

export interface VueRetouchee {
  /** Tous les lots, corrigés — y compris ceux qu'on a ramenés à zéro, qui
   *  restent à l'écran pour qu'on puisse les remonter. */
  lots: LotSortie[];
  /** Ce qui part en base. C'est `[]` quand on n'a rien gardé, et ce vide est
   *  une réponse — voir `journaliserCuisson`, qui ne le confond plus avec
   *  l'absence de réponse. */
  gardes: LotSortie[];
  /** En repas, ce qui n'est rangé nulle part : mangé, donné, jeté. Compté par
   *  emit, pour qu'un lot descendu de 2 à 1 le dise au lieu de l'effacer. */
  horsBoite: number;
}

/**
 * La proposition relue à travers une correction.
 *
 * TOUT SE RECALCULE, PARCE QUE TOUT EN DÉPEND. Baisser un lot de 2 repas à 1
 * change son poids (au prorata, comme `vueDeLaSortie`), sa bande (ce que le
 * budget compte), et la boîte à sortir ; le passer au congélateur lui retire
 * sa fenêtre de garde, qui est une affaire de frigo. Un écran qui n'en
 * recalculerait qu'une partie afficherait « 1 repas · 2 × boîtes », et c'est
 * précisément le genre de ligne qui fait douter de tout le reste.
 */
export function vueRetouchee(
  p: Plat,
  f: number,
  foyer: Foyer,
  lots: readonly LotSortie[],
  retouches: readonly Retouche[],
): VueRetouchee {
  const corriges = lots.map((l, n) => {
    const r = retouches[n] ?? { location: l.location, repas: l.repas };
    const e = p.emits[l.emit]!;
    return {
      ...l,
      location: r.location,
      repas: r.repas,
      // UN LOT À ZÉRO GARDE SA BANDE, et c'est volontaire : « 0-repas » serait
      // un budget de rangement nul pour une place qu'on n'occupe pas du tout.
      // Il ne part pas en base, donc la question ne se pose jamais là-bas ;
      // elle se posait ici, et la réponse est de ne rien inventer.
      band: r.repas === 0 ? l.band : r.repas === l.total ? e.band : `${r.repas}-repas`,
      qty: e.qty ? (e.qty.amount * f * r.repas) / l.total : null,
      garde: r.location === "frigo" ? e.gardeFrigo : null,
      boites: r.repas > 0 ? boitesPour(foyer, r.location, r.repas) : [],
    };
  });
  return {
    lots: corriges,
    gardes: corriges.filter((l) => l.repas > 0),
    horsBoite: horsBoite(lots, corriges),
  };
}

/**
 * Ce qui n'est rangé nulle part, en une phrase.
 *
 * ICI ET PAS DANS LE JSX, parce que la première version y était et qu'elle
 * disait « 1 repas ne est rangé » : trois ternaires imbriqués entre deux
 * accolades ne se relisent pas, et un parcours qui cherche la phrase par son
 * texte ne trouve même pas les morceaux. Une phrase est une valeur ; elle se
 * teste comme les autres.
 *
 * ET ELLE DIT CE QUE LA BASE N'APPRENDRA PAS. Un repas mangé de plus que prévu
 * ne laisse aucune trace — il n'y a pas d'événement « mangé » dans ce dépôt —
 * donc l'écran le dit au lieu de le laisser croire rangé quelque part.
 */
export const phraseHorsBoite = (repas: number): string =>
  repas === 1
    ? "1 repas n’est rangé nulle part : mangé, donné ou jeté. Le placard n’en gardera pas la trace."
    : `${repas} repas ne sont rangés nulle part : mangés, donnés ou jetés. Le placard n’en gardera pas la trace.`;

/** Ce qu'aucune boîte ne reçoit, emit par emit — et jamais en dessous de zéro :
 *  le plafond l'interdit déjà, et un reste négatif se lirait comme un bug. */
const horsBoite = (lots: readonly LotSortie[], corriges: readonly LotSortie[]): number => {
  const vus = new Set<number>();
  let somme = 0;
  lots.forEach((l) => {
    if (vus.has(l.emit)) return;
    vus.add(l.emit);
    const garde = corriges.reduce((s, c) => (c.emit === l.emit ? s + c.repas : s), 0);
    somme += Math.max(0, l.total - garde);
  });
  return somme;
};
