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
import { restesApresTable } from "../model/restes";
import type { LotInitial } from "../model/depot";
import type { Contenant, Emit, EmitKind, Espace, Foyer, Plat, Quantite } from "../model/types";

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
  /** Ce qui manque quand le pool libre ne suffit pas — T109. `null` sinon. */
  manque: Manque | null;
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
 * entre les deux que cet écran range. `emits` la porte, mesurée recette par
 * recette (« sur 4 parts, c'est ce qui reste une fois le dîner servi », dit
 * `ratatouille-minute`) — MAIS POUR LE FOYER : T108 retranche les bouches de
 * plus, et c'est `restesApresTable` qui le fait, pour cet écran ET pour la
 * base (`journaliserCuisson`), afin que les deux n'écrivent jamais deux restes.
 */
export function vueDeLaSortie(
  p: Plat,
  parts: number,
  f: number,
  foyer: Foyer,
  stock: readonly LotInitial[] = [],
): VueSortie {
  const lots: LotSortie[] = [];
  // T109 — LES LOTS DE LA SORTIE PUISENT L'UN APRÈS L'AUTRE dans ce que le
  // dépôt laisse libre : deux lots ne prennent jamais la même boîte.
  const libres = contenantsLibres(foyer, stock);
  restesApresTable(p, f, parts, foyer).forEach(({ emit: rang, repas: total, qty }) => {
    const e = p.emits[rang]!;
    couper(e, total).forEach((part, n) => {
      // AU PRORATA DES REPAS, et seulement quand l'emit chiffre quelque chose.
      const qtyDuLot = qty != null && e.qty ? { amount: (qty * part.repas) / total, unit: e.qty.unit } : null;
      lots.push({
        emit: rang,
        type: e.type,
        kind: e.kind,
        location: part.location,
        repas: part.repas,
        band: bandeDuLot(e, part.repas, total),
        // AU PRORATA DES REPAS, et seulement quand l'emit chiffre quelque
        // chose : 91 des 126 emits du corpus ont `qty: null` — un reste de plat
        // se compte en repas, pas en grammes. L'écran qui réclamait « 200 g »
        // n'aura donc un poids que sur un emit sur trois, et il vaut mieux
        // n'en afficher aucun que d'en inventer un.
        qty: qtyDuLot?.amount ?? null,
        unite: e.qty ? e.qty.unit : null,
        garde: part.location === "frigo" ? e.gardeFrigo : null,
        note: n === 0 ? e.note : null,
        ...rangerEtPrendre(foyer, part.location, part.repas, qtyDuLot, libres),
      });
    });
  });
  return { table: parts, lots, rien: lots.length === 0 };
}

/**
 * La bande d'un lot : celle du corpus quand le lot porte tout l'emit tel que
 * déclaré, `N-repas` sinon. Une bande « 3-repas » sur un lot qui n'en porte
 * plus que deux ferait compter au budget de rangement des invités partis.
 */
export const bandeDuLot = (e: Emit, repas: number, total: number): string =>
  repas === total && total === bandRepas(e.band) ? e.band : `${repas}-repas`;

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
 * Combien de millilitres un lot occupe — `null` quand on ne sait pas le dire.
 *
 * LES GRAMMES COMPTENT POUR DES MILLILITRES (1 g/ml), et c'est une hypothèse,
 * pas une mesure : le dépôt ne connaît aucune densité. Elle est exacte pour ce
 * qui se range en sauce, en soupe, en purée ; elle est OPTIMISTE pour les
 * morceaux (viande, légumes entiers), qui laissent du vide entre eux et
 * prennent plus de place que leur poids. Mesuré sur le corpus : 19 emits sur
 * 126 sont en grammes, et 3 lots pesés sur 36 changeraient de nombre de boîtes
 * à 0,7 g/ml (`npm run sortie`). Les pièces, pâtes, pots et lots n'ont pas de
 * volume : ils se rangent en portions seules.
 */
export function volumeDe(q: Quantite | null): number | null {
  if (!q) return null;
  switch (q.unit.toLowerCase()) {
    case "ml":
      return q.amount;
    case "cl":
      return q.amount * 10;
    case "l":
      return q.amount * 1000;
    case "g":
      return q.amount * DENSITE;
    case "kg":
      return q.amount * 1000 * DENSITE;
    default:
      return null;
  }
}

/** Grammes par millilitre — voir `volumeDe`. */
export const DENSITE = 1;

/** Ce qu'il reste de propre, par famille : `id` → nombre. */
export type Libres = Map<string, number>;

/** Ce qui manque quand le pool ne suffit pas — T109. */
export interface Manque {
  nombre: number;
  /** La famille qu'on aurait prise. */
  label: string;
  /** Un consommable libre que le foyer n'a pas déclaré pour cet espace — un
   *  sac au frigo. Une question, pas une consigne. */
  repli: string | null;
}

export interface Rangement {
  boites: Boite[];
  manque: Manque | null;
}

/**
 * Quelles boîtes, et combien — T99, repris par T109.
 *
 * CE QU'UNE BOÎTE PREND D'UN LOT EST LA PLUS PETITE DE DEUX PARTS : ses
 * portions sur les repas du lot, son volume sur celui du lot. Avant T109, seul
 * le premier comptait, et « 1 250 ml → 1 × boîtes hermétiques 0,5 / 1 L »
 * s'affichait sans ciller.
 *
 * LES BOÎTES QUI SE LAVENT PASSENT DEVANT LES SACS QU'ON RACHÈTE — la règle de
 * T99, inchangée : un sac n'apparaît que là où plus rien d'autre ne va.
 * Ensuite, tant qu'aucune boîte ne prend tout ce qui reste, LA PLUS GROSSE ; dès
 * qu'une le peut, LA PLUS PETITE QUI LE PEUT — une boîte à moitié pleine est
 * une boîte, mais on ne sort pas un bocal pour un fond.
 *
 * ON NE PUISE QUE DANS CE QUI EST LIBRE. `libres` est le pool après ce que le
 * dépôt occupe déjà (`contenantsLibres`) ; sans lui, tout ce que le foyer
 * déclare est supposé propre — au mieux. Quand le pool s'épuise, la réponse le
 * DIT (`manque`) au lieu de proposer une boîte qu'on n'a pas : c'était le
 * pot-au-feu qui « n'avait pas assez de boîtes ».
 *
 * NE MODIFIE PAS `libres` : c'est `prendre` qui retire ce qu'on a choisi.
 */
export function rangerDans(
  foyer: Foyer,
  espace: Espace,
  repas: number,
  qty: Quantite | null = null,
  libres?: ReadonlyMap<string, number>,
): Rangement {
  const declares = foyer.contenants.filter((c) => c.portions > 0 && c.espaces.includes(espace));
  if (!declares.length) return { boites: [], manque: null };

  const vol = volumeDe(qty);
  const part = (c: Contenant): number =>
    Math.min(c.portions / Math.max(repas, 1e-9), c.volumeMl != null && vol ? c.volumeMl / vol : Infinity);
  const reste = new Map(declares.map((c) => [c.id, libres?.get(c.id) ?? c.nombre]));

  const prises: Boite[] = [];
  let a = 1;
  while (a > 1e-9) {
    const dispo = declares.filter((c) => (reste.get(c.id) ?? 0) > 0);
    if (!dispo.length) break;
    const lavables = dispo.filter((c) => !c.consommable);
    const classe = lavables.length ? lavables : dispo;
    const tient = classe.filter((c) => part(c) >= a - 1e-9);
    const c = tient.length
      ? tient.reduce((m, x) => (part(x) < part(m) ? x : m))
      : classe.reduce((m, x) => (part(x) > part(m) ? x : m));
    reste.set(c.id, reste.get(c.id)! - 1);
    a -= part(c);
    const deja = prises.find((b) => b.label === c.label);
    if (deja) deja.nombre += 1;
    else prises.push({ label: c.label, nombre: 1 });
  }
  if (a <= 1e-9) return { boites: prises, manque: null };

  // LE MANQUE SE COMPTE DANS LA FAMILLE QU'ON AURAIT PRISE : la plus grosse
  // des boîtes qui se lavent, faute de quoi la plus grosse tout court.
  const lavables = declares.filter((c) => !c.consommable);
  const ref = (lavables.length ? lavables : declares).reduce((m, x) => (part(x) > part(m) ? x : m));
  const repli = foyer.contenants.find(
    (c) => c.consommable && !c.espaces.includes(espace) && (libres?.get(c.id) ?? c.nombre) > 0,
  );
  return {
    boites: prises,
    manque: { nombre: Math.ceil(a / part(ref) - 1e-9), label: ref.label, repli: repli?.label ?? null },
  };
}

/**
 * Quelles boîtes, et combien — la réponse courte de `rangerDans`.
 *
 * GARDÉE SOUS CE NOM ET CETTE FORME parce que la mise en place (T112) la lit
 * pour dire quelles boîtes sortir avant de commencer. Les deux derniers
 * paramètres sont facultatifs : sans eux, c'est le comportement de T99 plafonné
 * au nombre déclaré.
 */
export const boitesPour = (
  foyer: Foyer,
  espace: Espace,
  repas: number,
  qty: Quantite | null = null,
  libres?: ReadonlyMap<string, number>,
): Boite[] => rangerDans(foyer, espace, repas, qty, libres).boites;

/** Retire du pool les boîtes qu'on vient de prendre. MUTE `libres`. */
export function prendre(foyer: Foyer, libres: Libres, boites: readonly Boite[]): void {
  for (const b of boites) {
    const c = foyer.contenants.find((x) => x.label === b.label);
    if (c) libres.set(c.id, Math.max(0, (libres.get(c.id) ?? c.nombre) - b.nombre));
  }
}

/**
 * Ce qui reste de propre — le pool, moins ce que le dépôt occupe.
 *
 * DÉRIVÉ, PAS PERSISTÉ. Un lot ne dit pas dans quelles boîtes il dort : on les
 * lui RE-DONNE, dans l'ordre de la base, par la même règle que la sortie. C'est
 * une estimation — quelqu'un a pu mettre la ratatouille dans un bocal — mais
 * c'est celle que la sortie avait proposée, et persister « il faut deux bocaux »
 * ferait d'un calcul une seconde vérité.
 *
 * L'INVENTAIRE COMPTE AUTREMENT, ET LES DEUX NOMBRES PEUVENT DIFFÉRER : son
 * plafond « contenants » est en PLACES par espace, avec la semaine planifiée
 * dedans, et une boîte qui va au frigo comme au congélateur y compte deux fois.
 * Ici une boîte est une boîte, et seul compte ce qui est rangé maintenant.
 */
export function contenantsLibres(foyer: Foyer, stock: readonly LotInitial[]): Libres {
  const libres: Libres = new Map(foyer.contenants.map((c) => [c.id, c.nombre]));
  for (const l of stock) {
    const { boites } = rangerDans(foyer, l.location, bandRepas(l.qty_band), l.qty, libres);
    prendre(foyer, libres, boites);
  }
  return libres;
}

/**
 * « il manque 2 × boîtes hermétiques 0,5 / 1 L : sacs congélation ? »
 *
 * LA QUESTION QUAND IL Y A UN REPLI, LE GESTE SINON — et le geste est celui
 * que l'inventaire nomme déjà (`laver des boîtes`), pour que les deux écrans
 * disent la même chose du même manque.
 */
export const phraseDuManque = (m: Manque): string =>
  `il manque ${m.nombre} × ${m.label} : ${m.repli ? `${m.repli} ?` : "laver des boîtes"}`;

const rangerEtPrendre = (foyer: Foyer, espace: Espace, repas: number, qty: Quantite | null, libres: Libres): Rangement => {
  const r = rangerDans(foyer, espace, repas, qty, libres);
  prendre(foyer, libres, r.boites);
  return r;
};

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
