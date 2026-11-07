// Le budget du foyer — le modèle, sans base ni écran.
//
// LA QUESTION À LAQUELLE IL RÉPOND : « combien puis-je mettre de côté chaque
// mois, une fois payé tout ce que je sais déjà devoir payer ? » Et la partie
// que les applis bancaires ratent, c'est le « déjà » : l'eau tombe tous les
// trimestres, la taxe foncière une fois l'an, l'assurance auto en mars. Ces
// sommes sont CONNUES, et c'est parce qu'on ne les lisse pas qu'un mois
// ordinaire finit dans le rouge.
//
// TROIS OBJETS, ET RIEN D'AUTRE N'EST SAISI :
//   - une ÉCHÉANCE : un montant qui revient tous les N mois, à une date connue ;
//     tous les 1 mois, c'est une charge fixe (le prêt, la crèche) ; au-delà,
//     c'est une PROVISION — on la met de côté par douzièmes, trimestres, etc. ;
//   - une ENVELOPPE : un plafond mensuel pour ce qui varie (courses, essence,
//     sorties) ;
//   - un REVENU : ce qui rentre chaque mois.
// Plus un seul nombre relevé à la main : le solde du compte où dorment les
// provisions. Tout le reste — prochaine date, ce qui devrait être de côté,
// virement conseillé, capacité d'épargne — se RECALCULE, pour la même raison
// que partout dans l'app : persister un calcul, c'est se garantir qu'il
// divergera un jour de ses entrées.
//
// LES MONTANTS SONT EN CENTIMES ENTIERS. Un budget qui additionne des flottants
// finit par afficher « 0,30000000000000004 € », et le jour où ça arrive, plus
// personne ne fait confiance au reste de l'écran.

/* ─────────────────────────────────────────────────────────── le vocabulaire */

/**
 * La nature d'une dépense — l'axe « est-ce que je peux y toucher ? ».
 *
 * TROIS CRANS ET PAS DEUX. « Obligatoire / plaisir » mélange le loyer et les
 * courses dans le même camp, alors que l'un est un contrat qu'on ne renégocie
 * pas ce mois-ci et l'autre un poste qu'on peut serrer : c'est précisément
 * entre ces deux-là que se cache la marge.
 */
export type Nature = "obligatoire" | "essentiel" | "plaisir";

export const NATURES: readonly Nature[] = ["obligatoire", "essentiel", "plaisir"];

export const NOM_NATURE: Record<Nature, string> = {
  obligatoire: "Obligatoire",
  essentiel: "Essentiel",
  plaisir: "Plaisir",
};

export const DIT_NATURE: Record<Nature, string> = {
  obligatoire: "un contrat ou une loi : on ne le baisse pas ce mois-ci",
  essentiel: "nécessaire, mais le montant se règle",
  plaisir: "ce qu'on choisit",
};

/** La catégorie — l'axe « à quoi ça sert ? ». Orthogonale à la nature : les
 *  vacances et la cantine sont toutes deux « enfants » ou « loisirs » selon
 *  qui les range, mais pas de la même nature. */
export type Categorie =
  | "logement"
  | "alimentation"
  | "transport"
  | "enfants"
  | "sante"
  | "assurances"
  | "impots"
  | "abonnements"
  | "loisirs"
  | "vacances"
  | "divers";

export const CATEGORIES: readonly Categorie[] = [
  "logement",
  "alimentation",
  "transport",
  "enfants",
  "sante",
  "assurances",
  "impots",
  "abonnements",
  "loisirs",
  "vacances",
  "divers",
];

export const NOM_CATEGORIE: Record<Categorie, string> = {
  logement: "Logement",
  alimentation: "Alimentation",
  transport: "Transport",
  enfants: "Enfants",
  sante: "Santé",
  assurances: "Assurances",
  impots: "Impôts et taxes",
  abonnements: "Abonnements",
  loisirs: "Loisirs",
  vacances: "Vacances",
  divers: "Divers",
};

/** Tous les combien de mois. 1 = une charge fixe, payée sur le mois. */
export type Frequence = 1 | 2 | 3 | 4 | 6 | 12;

export const FREQUENCES: readonly Frequence[] = [1, 2, 3, 4, 6, 12];

export const NOM_FREQUENCE: Record<Frequence, string> = {
  1: "Tous les mois",
  2: "Tous les 2 mois",
  3: "Tous les trimestres",
  4: "Tous les 4 mois",
  6: "Tous les semestres",
  12: "Tous les ans",
};

/* ──────────────────────────────────────────────────────────────── les objets */

export interface Echeance {
  id: string;
  nom: string;
  /** Centimes, par occurrence : la facture d'eau, pas son douzième. */
  montant: number;
  tousLes: Frequence;
  /**
   * UNE date d'échéance connue, passée ou à venir, en `AAAA-MM-JJ`.
   *
   * ON NE STOCKE PAS « LA PROCHAINE », et c'est ce qui rend l'objet durable :
   * une prochaine date stockée est fausse le lendemain de son échéance, et il
   * faudrait penser à la repousser à la main tous les trimestres. Une date de
   * référence et une fréquence suffisent à retrouver toutes les autres.
   */
  reference: string;
  categorie: Categorie;
  nature: Nature;
}

export interface Enveloppe {
  id: string;
  nom: string;
  /** Centimes par mois. */
  montant: number;
  categorie: Categorie;
  nature: Nature;
}

export interface Revenu {
  id: string;
  nom: string;
  /** Centimes nets par mois. */
  montant: number;
}

/* ──────────────────────────────────────────────────────────────── les dates */

/** `AAAA-MM-JJ` → [année, mois 0-11, jour]. */
function lire(jour: string): [number, number, number] {
  const [a, m, j] = jour.split("-").map(Number);
  return [a!, m! - 1, j!];
}

const ecrire = (a: number, m: number, j: number): string =>
  `${a}-${String(m + 1).padStart(2, "0")}-${String(j).padStart(2, "0")}`;

const joursDansLeMois = (a: number, m: number): number => new Date(a, m + 1, 0).getDate();

/**
 * Ajoute `n` mois (négatif possible) à une date.
 *
 * LE JOUR SE BORNE AU DERNIER DU MOIS, ET IL SE BORNE DEPUIS LA RÉFÉRENCE. Une
 * échéance au 31 janvier tombe le 28 février, puis le 31 mars — pas le 28 mars.
 * C'est pour ça que les occurrences se calculent toujours depuis la référence,
 * jamais de proche en proche : en avançant mois par mois, le 31 se serait
 * érodé en 28 au premier février et n'en serait jamais revenu.
 */
export function ajouterMois(jour: string, n: number): string {
  const [a, m, j] = lire(jour);
  const total = a * 12 + m + n;
  const na = Math.floor(total / 12);
  const nm = total - na * 12;
  return ecrire(na, nm, Math.min(j, joursDansLeMois(na, nm)));
}

/** Les jours entre deux dates, au calendrier (pas de fuseau, pas d'heure d'été). */
export function joursEntre(de: string, a: string): number {
  const [a1, m1, j1] = lire(de);
  const [a2, m2, j2] = lire(a);
  return Math.round((Date.UTC(a2, m2, j2) - Date.UTC(a1, m1, j1)) / 86_400_000);
}

/** Les mois calendaires entre deux dates : de novembre à janvier, 2. */
export function moisEntre(de: string, a: string): number {
  const [a1, m1] = lire(de);
  const [a2, m2] = lire(a);
  return (a2 - a1) * 12 + (m2 - m1);
}

/** Le rang de la prochaine occurrence, aujourd'hui compris : l'occurrence k
 *  tombe le `ajouterMois(reference, k × tousLes)`. */
function rangProchaine(e: Pick<Echeance, "reference" | "tousLes">, aujourdhui: string): number {
  // Une première approximation par les mois, puis on corrige d'un pas au plus
  // dans chaque sens : le bornage du jour peut décaler la frontière.
  let k = Math.floor(moisEntre(e.reference, aujourdhui) / e.tousLes);
  while (ajouterMois(e.reference, k * e.tousLes) < aujourdhui) k++;
  while (ajouterMois(e.reference, (k - 1) * e.tousLes) >= aujourdhui) k--;
  return k;
}

/**
 * La prochaine occurrence d'une échéance, AUJOURD'HUI COMPRIS : une facture
 * due ce matin n'est pas encore payée, elle est due.
 */
export const prochaine = (e: Pick<Echeance, "reference" | "tousLes">, aujourdhui: string): string =>
  ajouterMois(e.reference, rangProchaine(e, aujourdhui) * e.tousLes);

/** L'occurrence d'avant — le jour où le compteur de cette provision est reparti
 *  de zéro. */
export const precedente = (e: Pick<Echeance, "reference" | "tousLes">, aujourdhui: string): string =>
  ajouterMois(e.reference, (rangProchaine(e, aujourdhui) - 1) * e.tousLes);

/* ─────────────────────────────────────────────────────────── les provisions */

/** Une échéance qu'on lisse : tout ce qui ne se paie pas chaque mois. */
export const estProvision = (e: Pick<Echeance, "tousLes">): boolean => e.tousLes > 1;

/** Ce qu'une échéance coûte par mois, lissée. En centimes, NON arrondi : on
 *  arrondit à l'affichage, une seule fois, sinon onze arrondis s'additionnent. */
export const parMois = (e: Pick<Echeance, "montant" | "tousLes">): number => e.montant / e.tousLes;

/**
 * Ce qui DEVRAIT être de côté aujourd'hui pour cette échéance, si on avait
 * versé son douzième (son tiers, …) depuis la précédente.
 *
 * AU PRORATA DES JOURS, PAS DES MOIS : un mois après une échéance trimestrielle,
 * il en faut un tiers ; la veille, presque tout. Compter en mois entiers ferait
 * sauter le chiffre d'un tiers d'un coup le 1er, et l'écran dirait « en retard »
 * à quelqu'un qui verse le 5.
 */
export function requis(e: Echeance, aujourdhui: string): number {
  const k = rangProchaine(e, aujourdhui);
  const fin = ajouterMois(e.reference, k * e.tousLes);
  const debut = ajouterMois(e.reference, (k - 1) * e.tousLes);
  const total = joursEntre(debut, fin);
  const ecoule = joursEntre(debut, aujourdhui);
  return Math.round((e.montant * ecoule) / total);
}

/**
 * Combien de virements mensuels restent avant l'échéance : un par mois
 * calendaire AVANT celui de l'échéance. Le 7 novembre, pour le 15 janvier,
 * c'est novembre et décembre — le virement de janvier tomberait peut-être après
 * le prélèvement. Due ce mois-ci, il n'en reste qu'un : celui qu'on fait
 * maintenant.
 */
export const versementsRestants = (e: Echeance, aujourdhui: string): number =>
  Math.max(1, moisEntre(aujourdhui, prochaine(e, aujourdhui)));

export type EtatProvision = "couverte" | "a-jour" | "en-retard";

export interface LigneProvision {
  echeance: Echeance;
  prochaine: string;
  /** Jours avant l'échéance, aujourd'hui = 0. */
  dans: number;
  /** Ce qui devrait être de côté aujourd'hui. */
  requis: number;
  /** La part du solde relevé qui lui revient. */
  couvert: number;
  /** Le virement mensuel qui l'amène pile au montant le jour dit. */
  conseille: number;
  etat: EtatProvision;
}

export interface Provisions {
  lignes: LigneProvision[];
  /** Σ des douzièmes (tiers, …) : ce qu'on verse chaque mois en régime établi. */
  regime: number;
  /** Ce qu'il faut verser CE mois-ci pour que tout soit prêt à temps. Proche du
   *  régime quand le compte est à jour, plus haut quand il est en retard. */
  conseille: number;
  /** Σ de ce qui devrait être de côté aujourd'hui. */
  requis: number;
  solde: number;
  /** Solde − requis : positif, on a de l'avance ; négatif, du retard. */
  ecart: number;
}

/**
 * Le compte des provisions, échéance par échéance.
 *
 * LE SOLDE EST UN SEUL NOMBRE, ET C'EST UN CHOIX. On aurait pu demander « combien
 * as-tu de côté pour l'eau ? » — personne ne le sait. On sait ce que dit le
 * livret. Le modèle le répartit donc lui-même, en deux passes :
 *
 *   1. CE QUI DEVRAIT ÊTRE LÀ, dans l'ordre des échéances. S'il manque de
 *      l'argent, c'est l'échéance la plus lointaine qui le constate — elle a
 *      encore des mois pour rattraper ; celle qui tombe dans dix jours, non.
 *   2. LE SURPLUS, dans le même ordre, jusqu'au montant plein : l'avance sert
 *      d'abord ce qui arrive en premier.
 *
 * Conséquence voulue : un compte pile à jour donne un conseil égal au régime,
 * à quelques euros près (le dû se compte en jours, les virements en mois). Le conseil ne monte que si on est en retard, et redescend
 * tout seul une fois le retard comblé.
 */
export function provisions(echeances: readonly Echeance[], solde: number, aujourdhui: string): Provisions {
  const lignes = echeances
    .filter(estProvision)
    .map((e) => ({ echeance: e, prochaine: prochaine(e, aujourdhui), requis: requis(e, aujourdhui) }))
    .sort((a, b) => (a.prochaine < b.prochaine ? -1 : a.prochaine > b.prochaine ? 1 : a.echeance.nom.localeCompare(b.echeance.nom)));

  let reste = Math.max(0, solde);
  const couvert = lignes.map((l) => {
    const c = Math.min(reste, l.requis);
    reste -= c;
    return c;
  });
  lignes.forEach((l, i) => {
    const c = Math.min(reste, l.echeance.montant - couvert[i]!);
    couvert[i]! += c;
    reste -= c;
  });

  const detail: LigneProvision[] = lignes.map((l, i) => {
    const c = couvert[i]!;
    const n = versementsRestants(l.echeance, aujourdhui);
    const manque = l.echeance.montant - c;
    // Le manque, étalé sur les virements qui restent. Due ce mois-ci, tout ce
    // qui manque se verse maintenant.
    const conseille = manque <= 0 ? 0 : manque / n;
    const etat: EtatProvision = c >= l.echeance.montant ? "couverte" : c >= l.requis ? "a-jour" : "en-retard";
    return {
      echeance: l.echeance,
      prochaine: l.prochaine,
      dans: joursEntre(aujourdhui, l.prochaine),
      requis: l.requis,
      couvert: c,
      conseille,
      etat,
    };
  });

  const req = detail.reduce((s, l) => s + l.requis, 0);
  return {
    lignes: detail,
    regime: detail.reduce((s, l) => s + parMois(l.echeance), 0),
    conseille: detail.reduce((s, l) => s + l.conseille, 0),
    requis: req,
    solde,
    ecart: solde - req,
  };
}

/* ───────────────────────────────────────────────────────── le calendrier */

export interface MoisAVenir {
  /** `AAAA-MM`. */
  mois: string;
  /** Les provisions qui tombent ce mois-là. */
  echeances: { echeance: Echeance; jour: string }[];
  total: number;
}

/**
 * Les douze prochains mois, mois en cours compris, et ce qui y tombe.
 *
 * LES CHARGES MENSUELLES N'Y SONT PAS : elles reviennent chaque mois, elles ne
 * font pas de relief. Ce calendrier sert à voir les GROS mois venir — celui où
 * l'assurance auto et la taxe foncière tombent ensemble.
 */
export function calendrier(echeances: readonly Echeance[], aujourdhui: string, nombre = 12): MoisAVenir[] {
  const [a, m] = lire(aujourdhui);
  const mois: MoisAVenir[] = [];
  for (let i = 0; i < nombre; i++) {
    const premier = ajouterMois(ecrire(a, m, 1), i);
    mois.push({ mois: premier.slice(0, 7), echeances: [], total: 0 });
  }
  const debut = ecrire(a, m, 1);
  const fin = ajouterMois(debut, nombre);
  for (const e of echeances.filter(estProvision)) {
    for (let k = rangProchaine(e, debut); ; k++) {
      const jour = ajouterMois(e.reference, k * e.tousLes);
      if (jour >= fin) break;
      const cible = mois.find((x) => x.mois === jour.slice(0, 7))!;
      cible.echeances.push({ echeance: e, jour });
      cible.total += e.montant;
    }
  }
  for (const x of mois) x.echeances.sort((p, q) => (p.jour < q.jour ? -1 : p.jour > q.jour ? 1 : 0));
  return mois;
}

/* ─────────────────────────────────────────────────────────── le mois type */

export interface Poste {
  nature: Nature;
  /** Charges fixes : les échéances mensuelles. */
  fixes: number;
  /** Les douzièmes des provisions. */
  provisions: number;
  /** Les plafonds des enveloppes. */
  enveloppes: number;
  total: number;
}

export interface MoisType {
  revenus: number;
  postes: Record<Nature, Poste>;
  /** Par catégorie, toutes natures confondues, du plus gros au plus petit. */
  categories: { categorie: Categorie; total: number }[];
  depenses: number;
  /** Revenus − dépenses du mois type : ce qui reste pour épargner. Négatif, le
   *  budget ne tient pas tel qu'il est écrit. */
  capacite: number;
}

/**
 * Le mois TYPE — pas le mois réel, qui viendra avec les relevés.
 *
 * C'est le budget tel qu'on l'a écrit : chaque provision y compte pour son
 * douzième, chaque enveloppe pour son plafond. Sa dernière ligne est la seule
 * question qui compte ici : combien reste-t-il pour épargner ?
 */
export function moisType(
  revenus: readonly Revenu[],
  echeances: readonly Echeance[],
  enveloppes: readonly Enveloppe[],
): MoisType {
  const postes = Object.fromEntries(
    NATURES.map((n) => [n, { nature: n, fixes: 0, provisions: 0, enveloppes: 0, total: 0 }]),
  ) as Record<Nature, Poste>;
  const parCategorie = new Map<Categorie, number>();
  const ajouter = (c: Categorie, v: number) => parCategorie.set(c, (parCategorie.get(c) ?? 0) + v);

  for (const e of echeances) {
    const v = parMois(e);
    if (estProvision(e)) postes[e.nature].provisions += v;
    else postes[e.nature].fixes += v;
    ajouter(e.categorie, v);
  }
  for (const e of enveloppes) {
    postes[e.nature].enveloppes += e.montant;
    ajouter(e.categorie, e.montant);
  }
  for (const p of Object.values(postes)) p.total = p.fixes + p.provisions + p.enveloppes;

  const totalRevenus = revenus.reduce((s, r) => s + r.montant, 0);
  const depenses = NATURES.reduce((s, n) => s + postes[n].total, 0);
  return {
    revenus: totalRevenus,
    postes,
    categories: [...parCategorie.entries()]
      .map(([categorie, total]) => ({ categorie, total }))
      .sort((a, b) => b.total - a.total),
    depenses,
    capacite: totalRevenus - depenses,
  };
}

/* ─────────────────────────────────────────────────────────── les montants */

/**
 * « 1 234,56 », « 1234.5 », « 80 € » → centimes. `null` si ce n'est pas un
 * montant : une saisie qu'on ne comprend pas ne doit pas devenir zéro en
 * silence, sinon une virgule mal placée efface une ligne du budget.
 */
export function lireMontant(texte: string): number | null {
  const net = texte.replace(/[\s  €]/g, "").replace(",", ".");
  if (!/^\d+(\.\d{0,2})?$/.test(net)) return null;
  return Math.round(Number(net) * 100);
}

/** Centimes → « 1 234 € » ou « 83,33 € ». Les centimes ne s'affichent que
 *  quand il y en a : un budget se lit en euros ronds. */
export function euros(centimes: number): string {
  const c = Math.round(centimes);
  const entier = c % 100 === 0;
  return (
    (c / 100).toLocaleString("fr-FR", {
      minimumFractionDigits: entier ? 0 : 2,
      maximumFractionDigits: entier ? 0 : 2,
    }) + " €"
  );
}

/** Centimes → ce qu'on remet dans un champ pour le corriger : « 1234,56 ». */
export const enSaisie = (centimes: number): string =>
  centimes % 100 === 0 ? String(centimes / 100) : (centimes / 100).toFixed(2).replace(".", ",");
