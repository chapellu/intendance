// Lire un relevé de compte — du texte mis en page aux opérations, vérifiées.
//
// L'ENTRÉE EST LE TEXTE QUE `ecrans/pdf.ts` REFAIT D'UN PDF, à la manière de
// `pdftotext -layout` : des lignes, des colonnes posées à leur abscisse, un
// saut de page (`\f`) entre deux pages. C'est ce qui permet de lire un relevé
// sur le téléphone, sans serveur, et de tester ce fichier sur du texte écrit à
// la main.
//
// RIEN ICI NE NOMME UN ÉTABLISSEMENT. Un *gabarit* est une MISE EN PAGE — une
// ligne d'en-tête, une forme de date, une façon d'écrire les soldes — et se
// reconnaît à son en-tête. Le jour où une autre banque imprime la même chose,
// elle est lue sans une ligne de plus.
//
// ────────────────────────────────────────────────────────────────────────────
// LE SENS D'UN MONTANT SE LIT À SA POSITION, JAMAIS À SON LIBELLÉ.
//
// Un relevé n'imprime pas de signe : il pose le montant sous « Débit » ou sous
// « Crédit ». Un paiement par carte REMBOURSÉ porte le même libellé qu'un
// paiement, et seule sa colonne dit qu'il rentre. On mesure donc où finit le
// montant (les colonnes sont alignées à droite) et on le range sous l'en-tête
// le plus proche — en-tête relu à chaque page, parce qu'il s'y décale d'une
// colonne ou deux.
//
// ET UN RELEVÉ QUI NE SE RELIT PAS JUSTE EST REFUSÉ, PAS IMPORTÉ À PEU PRÈS.
// Chaque relevé imprime de quoi se vérifier : ses totaux, son ancien et son
// nouveau solde. La somme des débits lus doit tomber au centime sur le total
// imprimé, celle des crédits aussi, et l'ancien solde plus les mouvements sur
// le nouveau. Une ligne mal lue, un montant rangé dans la mauvaise colonne, et
// l'une des trois égalités casse. Un budget nourri de chiffres faux est pire
// qu'un budget vide : on le croit.
// ────────────────────────────────────────────────────────────────────────────

export type GabaritId = "valeur-en-tete" | "valeur-en-colonne";

export interface Operation {
  /** Jour de l'opération, `AAAA-MM-JJ`. */
  jour: string;
  /** La ligne principale, blancs resserrés. */
  libelle: string;
  /** Les lignes de détail qui la suivent (motif d'un virement, créancier). */
  detail: string[];
  /** Centimes, SIGNÉS : négatif = débit, positif = crédit. */
  montant: number;
}

export interface ReleveLu {
  gabarit: GabaritId;
  /** L'IBAN imprimé, sans blancs, s'il y en a un. NE SORT JAMAIS DE
   *  L'APPAREIL : la base n'en garde qu'une empreinte (voir `db/releves.ts`). */
  iban: string | null;
  debut: string | null;
  fin: string;
  soldeInitial: number;
  soldeFinal: number;
  operations: Operation[];
}

export type Lecture = { ok: true; releve: ReleveLu } | { ok: false; raison: string };

/* ──────────────────────────────────────────────────────────────── montants */

/** « 1 234,56 » — milliers séparés d'UN blanc (normal, insécable ou fin). Un
 *  double blanc sépare deux colonnes, jamais deux chiffres d'un même montant. */
const MONTANT = /\d{1,3}(?:[   ]\d{3})*,\d{2}(?!\d)/g;

const centimes = (texte: string): number => Math.round(Number(texte.replace(/[   ]/g, "").replace(",", ".")) * 100);

interface MontantPose {
  valeur: number;
  /** Colonne (index de caractère) où le montant finit. */
  fin: number;
  debut: number;
}

/** Tous les montants d'une ligne, avec leur position. */
function montants(ligne: string): MontantPose[] {
  return [...ligne.matchAll(MONTANT)].map((m) => ({
    valeur: centimes(m[0]),
    debut: m.index!,
    fin: m.index! + m[0].length,
  }));
}

/* ─────────────────────────────────────────────────────────────── colonnes */

interface Colonnes {
  /** Où finissent les mots « Débit » et « Crédit » de l'en-tête. */
  debit: number;
  credit: number;
}

/** Débit ou crédit : l'en-tête dont la fin est la plus proche de la fin du
 *  montant. `null` si le montant est loin des deux — ce n'est pas un
 *  mouvement, c'est une phrase qui contient un chiffre. */
function cote(m: MontantPose, c: Colonnes): "debit" | "credit" | null {
  const dd = Math.abs(m.fin - c.debit);
  const dc = Math.abs(m.fin - c.credit);
  const ecart = Math.abs(c.credit - c.debit);
  if (Math.min(dd, dc) > ecart) return null;
  return dd <= dc ? "debit" : "credit";
}

/** Le montant d'une ligne qui tombe dans une des deux colonnes : le DERNIER,
 *  parce qu'un libellé peut citer un prix (« … 12,50 EUR »). */
function mouvement(ligne: string, c: Colonnes): { sens: "debit" | "credit"; valeur: number; debut: number } | null {
  const ms = montants(ligne);
  for (let i = ms.length - 1; i >= 0; i--) {
    const s = cote(ms[i]!, c);
    if (s) return { sens: s, valeur: ms[i]!.valeur, debut: ms[i]!.debut };
  }
  return null;
}

/* ──────────────────────────────────────────────────────────────── gabarits */

const MOIS: Record<string, number> = {
  janvier: 1, fevrier: 2, mars: 3, avril: 4, mai: 5, juin: 6,
  juillet: 7, aout: 8, septembre: 9, octobre: 10, novembre: 11, decembre: 12,
};

const sansAccents = (s: string): string => s.normalize("NFD").replace(/[̀-ͯ]/g, "");

const iso = (a: number, m: number, j: number): string =>
  `${a}-${String(m).padStart(2, "0")}-${String(j).padStart(2, "0")}`;

/** « 30 septembre 2026 » → `2026-09-30`. */
function dateEnLettres(texte: string): string | null {
  const m = /(\d{1,2})\s+([a-zéèêûôàç]+)\s+(\d{4})/i.exec(texte);
  if (!m) return null;
  const mois = MOIS[sansAccents(m[2]!.toLowerCase())];
  return mois ? iso(Number(m[3]), mois, Number(m[1])) : null;
}

interface Gabarit {
  id: GabaritId;
  /** La ligne d'en-tête du tableau des opérations. */
  entete: RegExp;
  /** Une ligne d'opération : jour, mois, et le reste (libellé + montant). Le
   *  groupe `libelle` s'arrête avant la date de valeur quand elle le suit. */
  operation: RegExp;
  ancien: RegExp;
  total: RegExp;
  /** La fin du tableau : rien de ce qui suit n'est un mouvement. */
  nouveau: RegExp;
  /** Le signe d'un solde : par son mot (« débiteur ») ou par sa colonne. */
  signe: (ligne: string, sens: "debit" | "credit") => 1 | -1;
  /** La ligne des totaux compte-t-elle l'ancien solde dans sa colonne ?
   *  Certains relevés l'additionnent aux mouvements, si bien que « crédit −
   *  débit » des totaux y donne directement le nouveau solde. */
  totauxAvecAncien: boolean;
  /** Les bornes de la période, pour donner une année aux jours. */
  periode: (texte: string) => { debut: string | null; fin: string | null };
}

const parColonne = (_l: string, sens: "debit" | "credit"): 1 | -1 => (sens === "debit" ? -1 : 1);

const GABARITS: readonly Gabarit[] = [
  {
    // « Date | Date de Valeur | Opération | Débit | Crédit » ; jours en
    // `jj/mm`, date de valeur `jj/mm/aaaa` AVANT le libellé ; soldes écrits
    // « … CRÉDITEUR AU 30 septembre 2026 ».
    id: "valeur-en-tete",
    entete: /\bDate\s+Date de Valeur\s+Op[ée]ration\s+D[ée]bit\s+Cr[ée]dit\b/i,
    operation: /^\s*(?<jour>\d{2})\/(?<mois>\d{2})\s+\d{2}\/\d{2}\/\d{4}\s+(?<libelle>\S.*)$/,
    ancien: /\bANCIEN SOLDE\b/i,
    total: /\bTOTAL DES OP[ÉE]RATIONS\b/i,
    nouveau: /\bNOUVEAU SOLDE\b/i,
    signe: (l) => (/D[ÉE]BITEUR/i.test(l) ? -1 : 1),
    totauxAvecAncien: false,
    periode: (t) => {
      const a = /\bANCIEN SOLDE\b[^\n]*?\bAU\s+([^\n]*?\d{4})/i.exec(t);
      const n = /\bNOUVEAU SOLDE\b[^\n]*?\bAU\s+([^\n]*?\d{4})/i.exec(t);
      return { debut: a ? dateEnLettres(a[1]!) : null, fin: n ? dateEnLettres(n[1]!) : null };
    },
  },
  {
    // « DATE | LIBELLE | VALEUR | DEBIT | CREDIT » ; jours en `jj.mm`, date
    // de valeur `jj.mm.aa` APRÈS le libellé ; période « du jj.mm.aaaa au
    // jj.mm.aaaa » en tête ; soldes signés par leur colonne.
    id: "valeur-en-colonne",
    entete: /\bDATE\s+LIBELLE\s+VALEUR\s+DEBIT\s+CREDIT\b/,
    operation: /^\s*(?<jour>\d{2})\.(?<mois>\d{2})\s+(?<libelle>\S.*?)\s+\d{2}\.\d{2}\.\d{2}(?:\s|$)/,
    ancien: /\bANCIEN SOLDE\b/,
    total: /^\s*TOTAUX\b|\s{2,}TOTAUX\b/,
    nouveau: /\bSOLDE EN EUROS\b/,
    signe: parColonne,
    // Relevé réel : l'écart entre les crédits lus et le total imprimé était
    // EXACTEMENT l'ancien solde, et « total crédit − total débit » le solde
    // final. Le total est un cumul, pas une somme des mouvements.
    totauxAvecAncien: true,
    periode: (t) => {
      const m = /\bdu\s+(\d{2})\.(\d{2})\.(\d{4})\s+au\s+(\d{2})\.(\d{2})\.(\d{4})/.exec(t);
      if (!m) return { debut: null, fin: null };
      return { debut: iso(+m[3]!, +m[2]!, +m[1]!), fin: iso(+m[6]!, +m[5]!, +m[4]!) };
    },
  },
];

/** Le mot d'en-tête « Débit »/« Crédit » et sa fin, dans la ligne d'en-tête. */
function colonnesDe(ligne: string): Colonnes | null {
  // LES DERNIÈRES OCCURRENCES : « Débit » et « Crédit » sont les deux derniers
  // mots de l'en-tête, et un en-tête qui dirait « Date de débit » plus tôt ne
  // doit pas déplacer la colonne.
  const fin = (re: RegExp): number => {
    let f = -1;
    for (const m of ligne.matchAll(re)) f = m.index! + m[0].length;
    return f;
  };
  const debit = fin(/D[ÉE]BIT/gi);
  const credit = fin(/CR[ÉE]DIT/gi);
  return debit < 0 || credit < 0 ? null : { debit, credit };
}

/** La clé d'un IBAN se vérifie : modulo 97, le nombre formé doit valoir 1. */
export function ibanValide(iban: string): boolean {
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(iban)) return false;
  const chiffres = (iban.slice(4) + iban.slice(0, 4)).replace(/[A-Z]/g, (l) => String(l.charCodeAt(0) - 55));
  let r = 0;
  for (const ch of chiffres) r = (r * 10 + Number(ch)) % 97;
  return r === 1;
}

/**
 * L'IBAN imprimé après le mot « IBAN », sans blancs — SEULEMENT si sa clé est
 * juste. Les groupes de quatre se suivent d'un blanc, et le mot d'après (un BIC,
 * un intitulé) ressemble à un groupe de plus : on essaie donc les longueurs de
 * la plus longue à la plus courte, et la clé tranche.
 */
function ibanDe(texte: string): string | null {
  for (const m of texte.matchAll(/\bIBAN\b\s*:?\s*([A-Z]{2}\d{2}(?: ?[A-Z0-9]{1,4}){2,8})/g)) {
    const groupes = m[1]!.split(" ");
    for (let n = groupes.length; n >= 3; n--) {
      const candidat = groupes.slice(0, n).join("");
      if (ibanValide(candidat)) return candidat;
    }
  }
  return null;
}

/** L'année d'un jour `jj/mm` d'après la fin de la période : un relevé arrêté en
 *  janvier porte des opérations de décembre, qui sont de l'année d'avant. */
function annee(mois: number, fin: string): number {
  const [a, m] = fin.split("-").map(Number);
  return mois > m! ? a! - 1 : a!;
}

const resserrer = (s: string): string => s.replace(/\s+/g, " ").trim();

/**
 * Une ligne de détail qui DIT quelque chose — le motif d'un virement, le nom
 * d'un créancier — plutôt qu'une référence de mandat ou un identifiant.
 *
 * MOINS ON GARDE, MIEUX C'EST, même sur le téléphone : les références (« REF. »,
 * « ID. », suites de lettres et de chiffres) ne servent à classer aucune
 * dépense, et ce sont précisément elles qui identifient un contrat.
 */
function parlant(ligne: string): boolean {
  const l = ligne.trim();
  if (/^(?:REF|ID)\.[A-Z]+\s*:/i.test(l)) return false;
  return /[A-Za-zÀ-ÿ]{3,}/.test(l.replace(/\S*\d\S*/g, " ").replace(/\b[A-Z0-9]{8,}\b/g, " "));
}

/* ──────────────────────────────────────────────────────────────── la lecture */

/** Quel gabarit, s'il y en a un, reconnaît ce texte ? */
export const gabaritDe = (texte: string): GabaritId | null => GABARITS.find((g) => g.entete.test(texte))?.id ?? null;

export function lireReleve(texte: string): Lecture {
  const g = GABARITS.find((x) => x.entete.test(texte));
  if (!g) return { ok: false, raison: "Ce PDF ne ressemble à aucun relevé de compte connu." };

  const { debut, fin } = g.periode(texte);
  if (!fin) return { ok: false, raison: "La période du relevé est introuvable." };

  const operations: Operation[] = [];
  let soldeInitial: number | null = null;
  let soldeFinal: number | null = null;
  let totalDebits: number | null = null;
  let totalCredits: number | null = null;
  // La colonne où commencent les libellés : une ligne de détail s'y aligne, un
  // pied de page non. C'est ce qui empêche « Page 2 / 3 » de devenir le motif
  // du dernier virement de la page.
  let colLibelle = -1;
  let termine = false;

  for (const page of texte.split("\f")) {
    if (termine) break;
    const lignes = page.split("\n");
    const i0 = lignes.findIndex((l) => g.entete.test(l));
    if (i0 < 0) continue;
    const col = colonnesDe(lignes[i0]!);
    if (!col) continue;
    let derniere: Operation | null = null;

    for (const ligne of lignes.slice(i0 + 1)) {
      if (!ligne.trim()) continue;

      if (g.nouveau.test(ligne)) {
        const m = mouvement(ligne, col);
        if (m) soldeFinal = g.signe(ligne, m.sens) * m.valeur;
        termine = true;
        break;
      }
      if (g.ancien.test(ligne) && soldeInitial === null) {
        const m = mouvement(ligne, col);
        if (m) soldeInitial = g.signe(ligne, m.sens) * m.valeur;
        derniere = null;
        continue;
      }
      if (g.total.test(ligne)) {
        totalDebits = 0;
        totalCredits = 0;
        for (const m of montants(ligne)) {
          const s = cote(m, col);
          if (s === "debit") totalDebits = m.valeur;
          if (s === "credit") totalCredits = m.valeur;
        }
        derniere = null;
        continue;
      }

      const op = g.operation.exec(ligne);
      if (op?.groups) {
        const mv = mouvement(ligne, col);
        if (!mv) return { ok: false, raison: `Une opération du ${op.groups["jour"]}/${op.groups["mois"]} n'a pas de montant lisible.` };
        const mois = Number(op.groups["mois"]);
        const libelleBrut = op.groups["libelle"]!;
        // Le libellé s'arrête avant le montant (et, pour un gabarit dont la
        // date de valeur suit le libellé, l'expression l'a déjà coupé avant).
        const debutLibelle = ligne.indexOf(libelleBrut);
        const libelle = resserrer(libelleBrut.slice(0, Math.max(0, mv.debut - debutLibelle)));
        colLibelle = debutLibelle;
        derniere = {
          jour: iso(annee(mois, fin), mois, Number(op.groups["jour"])),
          libelle,
          detail: [],
          montant: mv.sens === "debit" ? -mv.valeur : mv.valeur,
        };
        operations.push(derniere);
        continue;
      }

      // Ni opération, ni solde, ni total : une ligne de détail SI elle
      // s'aligne sur les libellés et ne porte pas de montant en colonne (un
      // sous-total, un solde intermédiaire). Sinon, du texte de page.
      const retrait = ligne.length - ligne.trimStart().length;
      if (derniere && colLibelle >= 0 && Math.abs(retrait - colLibelle) <= 6 && !mouvement(ligne, col)) {
        if (derniere.detail.length < 3 && parlant(ligne)) derniere.detail.push(resserrer(ligne));
      } else derniere = null;
    }
  }

  if (soldeInitial === null) return { ok: false, raison: "L'ancien solde est introuvable." };
  if (soldeFinal === null) return { ok: false, raison: "Le nouveau solde est introuvable." };

  // LES TROIS ÉGALITÉS. Voir l'en-tête : c'est ce qui autorise l'import.
  const debits = operations.filter((o) => o.montant < 0).reduce((s, o) => s - o.montant, 0);
  const credits = operations.filter((o) => o.montant > 0).reduce((s, o) => s + o.montant, 0);
  const report = g.totauxAvecAncien ? soldeInitial : 0;
  if (totalDebits !== null && debits + Math.max(0, -report) !== totalDebits)
    return { ok: false, raison: "La somme des débits lus ne tombe pas sur le total imprimé." };
  if (totalCredits !== null && credits + Math.max(0, report) !== totalCredits)
    return { ok: false, raison: "La somme des crédits lus ne tombe pas sur le total imprimé." };
  if (soldeInitial + credits - debits !== soldeFinal)
    return { ok: false, raison: "L'ancien solde plus les mouvements ne donne pas le nouveau solde." };

  return {
    ok: true,
    releve: { gabarit: g.id, iban: ibanDe(texte), debut, fin, soldeInitial, soldeFinal, operations },
  };
}

/* ──────────────────────────────────────────────────────────────── le motif */

/**
 * Ce qui reste d'un libellé quand on en retire la mécanique bancaire — la
 * clé sous laquelle une règle de classement s'apprend.
 *
 * « CARTE 12/09 BOULANGERIE DU COIN 69 » et « CARTE 03/10 BOULANGERIE DU COIN
 * 69 » sont la même dépense : on retire le type d'opération, les dates, les
 * nombres et la ponctuation, on garde les QUATRE premiers mots. Plus, et une
 * référence de mandat changeante ferait de chaque prélèvement un inconnu ;
 * moins, et deux enseignes d'un même centre commercial se confondraient.
 */
export function motif(libelle: string): string {
  const s = sansAccents(libelle.toUpperCase())
    .replace(/^(?:CARTE|CB|PRLV(?: SEPA)?|PRELEVEMENT(?: SEPA)?|VIR(?:EMENT)?(?:\.| )?(?:INST|PERMANENT|SEPA|RECU|EMIS)?|CHQ\.?|CHEQUE|RETRAIT(?: DAB)?)\b\.?/, " ")
    .replace(/\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/g, " ")
    .replace(/[^A-Z ]+/g, " ")
    .replace(/\b[A-Z]\b/g, " ");
  const mots = s.split(/\s+/).filter(Boolean).slice(0, 4);
  return mots.length ? mots.join(" ") : sansAccents(libelle.toUpperCase()).replace(/\d+/g, "#").trim();
}
