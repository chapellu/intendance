// Le dépôt : ce que la cuisine contient, et ce qu'un plat y prélève.
//
// LE CHAÎNAGE ÉTAIT UN JEU DE JETONS. Une sortie entrait en stock, on la
// TROUVAIT, et personne ne la retirait jamais : le même bocal de bolognaise
// couvrait les pâtes du mardi (500 g) ET les lasagnes du mercredi (700 g), soit
// 1200 g réclamés sur un bocal — pendant que la sauce du lundi n'était mangée
// par personne. Ce qui manquait n'était pas un contrôle mais une GRANDEUR.
//
// DEUX MESURES COEXISTENT, parce qu'elles mesurent des choses différentes.
// `qty` chiffre une BASE (700 g de sauce, 1 carcasse) : c'est en grammes que
// « y en a-t-il assez » a un sens. `band` compte des REPAS (« 2-repas ») : on
// ne mange pas 340 g de gratin, on mange une part, et c'est l'unité du budget
// de rangement. Une arête chiffrée des deux côtés se règle en grandeur ; sinon
// on retombe sur le jeton, et le prélèvement se dit `approximatif` au lieu de
// faire semblant.
//
// Port de `apps/proto-shell/semaine.js` (`Prise`, `Stock`). Deux champs que le
// JS confondait volontiers sont ici distincts, parce qu'ils ne servent pas à la
// même chose : `espace` dit OÙ ÇA SE RANGE (le budget de rangement le compte),
// `location` dit COMMENT ÇA VIEILLIT.
//
// ─────────────────────────────────────────────────────────────────────────────
// L'HORLOGE (T54–T56, T58). La phrase ci-dessus disait « le congélo ignore la
// fenêtre du frigo », et c'était vrai au sens le plus littéral : le congélo
// n'avait aucune fenêtre du tout. Un bocal de 2019 restait proposable. Le frigo,
// lui, en avait une seule, celle du foyer, appliquée à tout le monde — alors que
// le corpus porte 78 `frigo_days` saisis à la main, de 0 à 7 jours, que deux
// écrans affichaient déjà (« 3 j au frigo ») pendant que le modèle périmait à 4.
//
// Désormais TOUT LOT A UNE HORLOGE, et il y en a deux sortes :
//
//   — le frigo est DUR. Passé sa fenêtre, le lot sort du jeu. C'est une question
//     de sécurité, pas de qualité, et ça ne se négocie pas.
//   — le congélateur est MOU. Passé son forfait de trois mois le bocal reste
//     jouable, sa fraction de vie plafonne à 1, et l'app le DIT. Refuser de
//     proposer une bolognaise de quatre mois, c'est fabriquer de l'archéologie
//     de congélateur.
//
// La FRACTION DE VIE CONSOMMÉE (0 → 1) est ce que ce fichier produit de neuf et
// qu'il ne consomme pas lui-même : c'est le dénominateur commun que le score
// attendait pour cesser de classer l'urgence par ENDROIT. Elle vit ici parce que
// c'est ici qu'on sait quelle fenêtre s'applique à quel lot.
// ─────────────────────────────────────────────────────────────────────────────

import type { Accept, Catalogue, Emit, EmitKind, Espace, Quantite } from "./types";

const JOUR_MS = 86_400_000;

const enJours = (fin: Date, debut: Date): number =>
  Math.round((fin.getTime() - debut.getTime()) / JOUR_MS);

/** Un `accepts` vise soit une sortie précise (`type`), soit toute une CLASSE de
 *  sorties (`kind`). C'est ce qui permet à une seule carte « reste réchauffé »
 *  de manger le gratin d'hier comme la quiche d'avant-hier. */
export function accepte(out: { type: string; kind: EmitKind }, acc: Accept): boolean {
  if (acc.type) return out.type === acc.type;
  if (acc.kind) return out.kind === acc.kind;
  return false;
}

export const libelle = (acc: Accept): string => acc.type ?? `un ${acc.kind}`;

export const qteDe = (b: { qty: Quantite | null } | null | undefined): [number | null, string | null] =>
  b?.qty?.amount != null ? [b.qty.amount, b.qty.unit] : [null, null];

/** « 2-repas » → 2. Une bande illisible vaut un repas : c'est le minimum qu'une
 *  chose rangée occupe, jamais zéro. */
export function bandRepas(b: string | null | undefined): number {
  const n = Number.parseInt(String(b ?? ""), 10);
  return n > 0 ? n : 1;
}

export const fmtQte = (v: number, u: string | null): string =>
  `${Math.round(v * 10) / 10} ${u ?? ""}`.trim();

/* ══════════════════════════════════════════════════════════ les horloges */

/** L'identifiant de la méthode qui donne son forfait au congélateur. Le corpus
 *  la porte depuis le prototype ; jusqu'à T55 l'export jetait sa fenêtre. */
const METHODE_CONGELO = "congeler";

/**
 * D'où sort la fenêtre qu'on applique à un lot, du plus précis au plus vague.
 *
 * RENDU, ET PAS SEULEMENT CALCULÉ. Deux raisons, et la seconde est la vraie :
 * l'écran peut dire pourquoi un reste tient trois jours plutôt que quatre ; et
 * un test peut vérifier qu'on n'est pas retombé sur `foyer` sans le vouloir.
 * C'est exactement le défaut que T54 corrige — une valeur de repli qui s'applique
 * partout finit par ressembler à une règle, et personne ne voit qu'elle a mangé
 * les 78 valeurs du corpus.
 */
export type SourceHorloge = "dluo" | "lot" | "type" | "congelateur" | "foyer";

/** Les fenêtres que le catalogue sait donner, dérivées une fois. */
export interface Horloges {
  /** Le défaut du foyer, pour un lot de frigo dont on ne sait rien d'autre. */
  frigo: number;
  /** Le forfait du congélateur, en jours. */
  congelo: number;
  /**
   * Ce que chaque type garde au frigo, DÉRIVÉ DES EMITS QUI LE PRODUISENT.
   *
   * Un lot CONSTATÉ ne déclare pas sa fenêtre : la table `stock` porte un type,
   * une quantité et une date de naissance, jamais un `frigo_days`. Sans cette
   * table il retomberait sur le défaut du foyer — c'est-à-dire que la moitié du
   * dépôt aurait continué de périmer à 4 jours pendant que l'autre suivait le
   * corpus, et le ticket n'aurait été qu'à moitié fait, en silence.
   *
   * Même geste que `producteurs()` dans `plancher.ts` : on ne saisit pas ce
   * qu'on peut dériver. Mesuré sur le corpus : 74 types émis, et UN SEUL dont
   * les producteurs divergent (`reste-roti`, 3 ou 4 jours). On prend le PLUS
   * COURT — entre deux avis sur la durée de vie d'un reste, le prudent est celui
   * qui ne rend malade personne.
   */
  parType: ReadonlyMap<string, number>;
}

/**
 * Les horloges du catalogue.
 *
 * ÉCHOUE BRUYAMMENT SI LE CONGÉLATEUR N'A PAS DE FENÊTRE, comme le chargeur du
 * catalogue échoue sur un export qui a dérivé. Se rabattre sur un nombre écrit
 * ici rendrait au congélateur le silence dont T55 vient de le sortir : il aurait
 * l'air d'avoir une horloge, elle ne viendrait plus du corpus, et rien ne le
 * dirait.
 */
export function horlogesDu(catalogue: Catalogue): Horloges {
  const congeler = catalogue.conservation.find((c) => c.id === METHODE_CONGELO);
  if (congeler?.fenetreJours == null)
    throw new Error(
      `conservation : la méthode « ${METHODE_CONGELO} » doit porter une fenêtre en jours ` +
        `— sans elle le congélateur n'a pas d'horloge.`,
    );

  const parType = new Map<string, number>();
  for (const p of catalogue.plats)
    for (const e of p.emits) {
      const vu = parType.get(e.type);
      parType.set(e.type, vu == null ? e.gardeFrigo : Math.min(vu, e.gardeFrigo));
    }

  return { frigo: catalogue.foyer.fenetreFrigo, congelo: congeler.fenetreJours, parType };
}

/** Ce qu'il reste à vivre à un lot, et sur quelle horloge on le compte. */
export interface Vie {
  /** Jours depuis la naissance du lot. */
  age: number;
  /** La fenêtre appliquée, en jours. */
  fenetre: number;
  source: SourceHorloge;
  /**
   * La part de vie consommée, de 0 à 1, PLAFONNÉE.
   *
   * Le plafond n'est pas une commodité d'affichage : au congélateur un lot
   * dépassé reste jouable, et une fraction qui monterait à 1,7 puis 4,2 ferait
   * un score qui grimpe sans fin sur un bocal que personne ne mange — l'inverse
   * exact du service rendu.
   */
  fraction: number;
  /** Le lot a passé sa fenêtre. */
  depasse: boolean;
  /** L'horloge est-elle DURE (frigo : il sort du jeu) ou molle (congélateur :
   *  il reste jouable et le dit) ? */
  dur: boolean;
}

/**
 * Un lot déjà là quand la semaine commence.
 *
 * LE CATALOGUE N'EST PLUS LE SEUL À EN FOURNIR. `LigneStock` en est un cas
 * particulier — l'amorce exportée du modèle Python — et la table `stock` de la
 * base en est un autre, celui qui fait foi dès qu'un doigt y a touché. D'où
 * deux différences avec le catalogue, toutes deux réelles :
 *
 *  — `qty` peut être `null`. Un bocal trouvé au fond du placard se constate
 *    sans se peser : « il y en a » est une information, et le dépôt sait déjà
 *    quoi en faire — `prelever` fait partir la ligne entière et le dit
 *    (`approximatif`), au lieu de faire semblant de compter.
 *  — `ref` porte l'identité du lot CHEZ CELUI QUI L'A FOURNI. Le modèle ne s'en
 *    sert jamais et ne la lit pas ; il la transporte pour que l'écran retrouve
 *    la ligne de base qu'un doigt touche, sans faire correspondre deux listes
 *    par leur index — la même erreur que la clé d'un créneau (voir
 *    `db/schema.ts`), et elle ne se verrait pas davantage ici.
 */
export interface LotInitial {
  type: string;
  kind: EmitKind;
  /** `null` = constaté sans être compté. */
  qty: Quantite | null;
  /** En repas — l'unité du budget de rangement. */
  qty_band: string;
  /** ISO `AAAA-MM-JJ`. */
  born: string;
  location: Espace;
  ref?: string;
  /**
   * La date imprimée sur la boîte, ISO `AAAA-MM-JJ`. Elle GAGNE sur la fenêtre
   * du type quand elle est là.
   *
   * LE SEUL NOMBRE VRAI DE TOUTE L'HORLOGE, et c'est pourquoi elle passe devant
   * tout le reste : les fenêtres du corpus sont des ordres de grandeur posés à
   * vue, une DLUO est une mesure.
   *
   * ET POURTANT ELLE EST L'EXCEPTION, PAS LE CAS NORMAL. Personne ne tapera une
   * date dans un écran — ça se saisit une fois, par curiosité, puis plus jamais,
   * et le modèle se retrouve avec un champ que trois lots portent. Elle
   * n'arrivera donc que GRATUITEMENT : un scan de code-barres, un événement
   * `entree` du journal. D'où l'absence, assumée, de tout écran de saisie : si
   * cette date devait coûter un formulaire, elle ne vaudrait pas son prix.
   */
  dluo?: string;
}

/** Une ligne du dépôt : un lot réel, présent avant la semaine ou produit par
 *  elle, avec ce qu'il en reste. */
export interface LigneDepot {
  type: string;
  kind: EmitKind;
  qty: Quantite | null;
  /** En repas — l'unité du budget de rangement. */
  band: string;
  /** Où ça se range. Commande le plafond d'espace. */
  espace: Espace;
  /** Où ça se trouve, pour le vieillissement : c'est ce qui décide de LAQUELLE
   *  des deux horloges compte, celle du frigo ou celle du congélateur. */
  location: Espace;
  born: Date | null;
  /** Jours de vie au frigo pour CE lot. Renseigné pour ce que la semaine
   *  produit (l'emit le porte) comme pour un lot constaté (dérivé de son type,
   *  voir `Horloges.parType`) ; `null` seulement pour un type que le catalogue
   *  ne produit nulle part. */
  gardeFrigo: number | null;
  congelo: boolean;
  /** La date imprimée sur la boîte, quand elle est arrivée gratuitement. */
  dluo: Date | null;
  /** L'identifiant du plat qui l'a produit, s'il vient de cette semaine. */
  from: string | null;
  /** L'identité du lot chez son fournisseur — la clé de base d'un lot constaté,
   *  `null` pour ce que la semaine produit. Opaque au modèle. */
  ref: string | null;
  /** Ce qu'il en reste. `null` = lot non chiffré, qui part en entier. */
  reste: number | null;
  unite: string | null;
  epuise: boolean;
}

export interface Source {
  ligne: LigneDepot;
  /** `null` quand la ligne part en entier faute d'être chiffrée. */
  pris: number | null;
  age: number;
}

/** Ce qu'un `accepts` a réellement obtenu du dépôt. */
export class Prise {
  readonly out: LigneDepot | null;
  readonly age: number | null;
  readonly pris: number | null;
  readonly manque: number;
  readonly unite: string | null;
  readonly approximatif: boolean;
  readonly sources: Source[];

  constructor(o: Partial<Prise> = {}) {
    this.out = o.out ?? null;
    this.age = o.age ?? null;
    this.pris = o.pris ?? null;
    this.manque = o.manque ?? 0;
    this.unite = o.unite ?? null;
    this.approximatif = o.approximatif ?? false;
    this.sources = o.sources ?? [];
  }

  get trouve(): boolean {
    return this.out !== null;
  }

  get couvert(): boolean {
    return this.out !== null && this.manque <= 1e-9;
  }

  /** D'où sort ce que le plat a pris, MORCEAU PAR MORCEAU. Annoncer le total
   *  sur le premier bocal quand la prise a traversé deux lots est un mensonge,
   *  et c'est exactement ce que disait le message d'avant. */
  raconte(): string {
    return this.sources
      .map((s) => {
        const ou = s.ligne.from
          ? `du lot « ${s.ligne.from} »`
          : s.ligne.location === "congelo"
            ? "du congélo"
            : `du frigo (J-${s.age})`;
        return `${s.pris == null ? s.ligne.type : fmtQte(s.pris, this.unite)} ${ou}`;
      })
      .join(" + ");
  }
}

interface Ajout {
  born?: Date;
  source?: string;
  location?: Espace;
}

export class Depot {
  readonly lignes: LigneDepot[] = [];

  constructor(
    private readonly horloges: Horloges,
    initial: readonly LotInitial[] = [],
  ) {
    for (const o of initial) {
      this.lignes.push({
        type: o.type,
        kind: o.kind,
        qty: o.qty,
        band: o.qty_band,
        espace: o.location,
        location: o.location,
        born: new Date(o.born),
        // Un lot constaté ne déclare pas sa fenêtre — la table `stock` porte un
        // type, pas un `frigo_days`. On la dérive de son type ; `null` seulement
        // pour un type que rien ne produit au catalogue, et il retombe alors sur
        // le défaut du foyer, faute de mieux à dire.
        gardeFrigo: horloges.parType.get(o.type) ?? null,
        congelo: o.location === "congelo",
        dluo: o.dluo ? new Date(o.dluo) : null,
        from: null,
        ref: o.ref ?? null,
        // Un lot non chiffré n'a pas de reste : il part en entier ou pas du
        // tout. C'est déjà le cas des restes de plat produits par la semaine ;
        // ce qui change, c'est qu'un lot CONSTATÉ peut l'être aussi.
        reste: o.qty?.amount ?? null,
        unite: o.qty?.unit ?? null,
        epuise: false,
      });
    }
  }

  /** Range une sortie de plat. `location` vaut « frigo » par défaut, et c'est
   *  volontaire : ce qu'on vient de cuisiner refroidit au frigo, même quand il
   *  se congèle — le congeler est un geste qu'on n'a pas encore fait. La
   *  conséquence est réelle : un lot congelable posé cette semaine vieillit
   *  dans la fenêtre du frigo, pas hors du temps. Le port la garde telle
   *  quelle ; la changer serait changer le modèle, pas le traduire. */
  ajouter(sortie: Emit, { born, source, location }: Ajout = {}): LigneDepot {
    const [amount, unit] = qteDe(sortie);
    const l: LigneDepot = {
      type: sortie.type,
      kind: sortie.kind,
      qty: sortie.qty,
      band: sortie.band,
      espace: sortie.espace,
      location: location ?? "frigo",
      born: born ?? null,
      gardeFrigo: sortie.gardeFrigo,
      congelo: sortie.congelo,
      // Ce que la semaine produit n'a pas de DLUO : c'est une date d'INDUSTRIEL,
      // imprimée sur une boîte achetée. Un bocal qu'on vient de faire n'en porte
      // aucune, et lui en inventer une serait le chiffre qui a l'air juste.
      dluo: null,
      from: source ?? null,
      ref: null,
      reste: amount,
      unite: unit,
      epuise: false,
    };
    this.lignes.push(l);
    return l;
  }

  /**
   * SUR QUELLE HORLOGE CE LOT COURT-IL ?
   *
   * Le congélateur, dès que le lot y est. Et AUSSI quand le catalogue refuse le
   * frigo : `frigo_days: 0` sur un lot congelable ne veut pas dire « à jeter
   * demain », il veut dire « ça n'a aucune vie au frigo ». Mesuré, les trois
   * emits à zéro jour du corpus sont trois desserts glacés — glace au chocolat,
   * muffins, crème glacée — tous `congelo: true`. Personne ne fait refroidir une
   * glace au frigo, et leur appliquer une fenêtre de zéro jour les ferait
   * disparaître le lendemain de leur cuisson, alors qu'elles sont exactement ce
   * qu'on garde au congélateur.
   *
   * ATTENTION À CE QUE ÇA NE DIT PAS : un lot congelable à 3 jours vieillit
   * toujours au frigo, parce que `ajouter()` l'y range et que « le congeler est
   * un geste qu'on n'a pas encore fait ». Cette dette-là reste ouverte au
   * backlog et ce ticket n'y touche pas. On ne traite ici que le cas où la
   * fenêtre est NULLE, c'est-à-dire où le corpus dit explicitement non.
   */
  private auCongelo(ligne: LigneDepot): boolean {
    return (
      ligne.location === "congelo" || (ligne.gardeFrigo === 0 && ligne.congelo)
    );
  }

  /**
   * Ce qu'il reste à vivre à ce lot, à cette date. `null` s'il n'a pas de date
   * de naissance : sans elle il n'y a pas d'âge, et donc rien à dire.
   */
  vie(ligne: LigneDepot, date: Date): Vie | null {
    if (!ligne.born) return null;
    const age = enJours(date, ligne.born);
    const congelo = this.auCongelo(ligne);

    // L'ORDRE EST LA RÈGLE : la mesure bat le forfait, le forfait bat le défaut.
    // Une DLUO se compte depuis la naissance du lot, pas depuis aujourd'hui —
    // sinon la fraction de vie consommée repartirait de zéro chaque jour.
    const [fenetre, source]: [number, SourceHorloge] = ligne.dluo
      ? [Math.max(0, enJours(ligne.dluo, ligne.born)), "dluo"]
      : congelo
        ? [this.horloges.congelo, "congelateur"]
        : ligne.gardeFrigo != null
          ? [ligne.gardeFrigo, "type"]
          : [this.horloges.frigo, "foyer"];

    // Une fenêtre nulle ne se divise pas. Le lot est neuf le jour de sa
    // naissance et fini le lendemain : c'est la seule lecture qui ne fabrique
    // ni infini ni NaN.
    const fraction = fenetre > 0 ? Math.min(1, age / fenetre) : age > 0 ? 1 : 0;

    return { age, fenetre, source, fraction, depasse: age > fenetre, dur: !congelo };
  }

  /**
   * L'âge d'un lot ENCORE EN JEU, `null` s'il en est sorti.
   *
   * FRIGO DUR, CONGÉLATEUR MOU. Passé sa fenêtre un reste de frigo sort du jeu,
   * et ça ne se négocie pas : le mode d'échec est sanitaire. Passé son forfait
   * un bocal congelé reste candidat — son mode d'échec à lui est la qualité, et
   * refuser de proposer une bolognaise de quatre mois fabrique de l'archéologie
   * de congélateur. Sa fraction plafonne à 1 et l'app le dit ; elle ne le cache
   * pas et ne le retire pas.
   */
  private age(ligne: LigneDepot, date: Date): number | null {
    const v = this.vie(ligne, date);
    if (!v) return null;
    return v.dur && v.depasse ? null : v.age;
  }

  private *candidats(acc: Accept, date: Date): Generator<[LigneDepot, number]> {
    for (const l of this.lignes) {
      if (l.epuise || !accepte(l, acc)) continue;
      const age = this.age(l, date);
      if (age !== null) yield [l, age];
    }
  }

  /** Sonde NON destructive : proposer une carte n'est pas la jouer, donc rien
   *  ne se consomme ici. C'est `calculer` qui prélève pour de bon. */
  disponible(acc: Accept, date: Date): [LigneDepot, number] | [null, null] {
    for (const c of this.candidats(acc, date)) return c;
    return [null, null];
  }

  prelever(acc: Accept, date: Date): Prise {
    const [besoin, unite] = qteDe(acc);
    let premier: LigneDepot | null = null;
    let premierAge: number | null = null;
    let total = 0;
    const sources: Source[] = [];

    for (const [l, age] of this.candidats(acc, date)) {
      if (besoin == null || l.reste == null || l.unite !== unite) {
        // Une des deux faces ne chiffre rien : la ligne entière part. C'est le
        // cas des restes de plat, comptés en repas et pas en grammes.
        l.epuise = true;
        return new Prise({
          out: l, age, approximatif: true, unite,
          sources: [{ ligne: l, pris: null, age }],
        });
      }
      const pris = Math.min(besoin - total, l.reste);
      if (pris <= 0) continue;
      l.reste -= pris;
      if (l.reste <= 1e-9) l.epuise = true;
      total += pris;
      sources.push({ ligne: l, pris, age });
      if (premier === null) {
        premier = l;
        premierAge = age;
      }
      if (total >= besoin - 1e-9) break;
    }

    if (premier === null) return new Prise({ manque: besoin ?? 0, unite });
    return new Prise({
      out: premier,
      age: premierAge,
      pris: total,
      unite,
      sources,
      manque: Math.max(0, (besoin ?? 0) - total),
    });
  }
}
