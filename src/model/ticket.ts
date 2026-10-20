// Lire un ticket de caisse — T138.
//
// DU TEXTE À DES LIGNES, ET RIEN D'AUTRE. Ce module ne voit jamais la photo :
// il reçoit ce que l'OCR a cru lire et rend un en-tête (magasin, date) et des
// lignes (libellé, poids ou nombre, prix). Il est pur, donc testable contre les
// quatre papiers transcrits du foyer (`tickets-corpus/`) sans navigateur.
//
// CE QUE LE CORPUS A APPRIS, ET QUE CE FICHIER RESPECTE :
//
// - **Le chiffre en tête d'une ligne Carrefour est le code de TVA**, pas une
//   quantité. Lu comme quantité, il quadruplerait tout ce qui rentre.
// - **Une pesée Grand Frais est suivie d'une tare** de 5 g, en négatif : elle
//   s'attache à SA ligne, elle n'en est pas une.
// - **Une remise se retranche, un avantage fidélité non** : « AVANTAGES -10 %
//   CLUB 0,47 » va à une cagnotte et ne baisse pas le poireau.
// - **Le cliché coupe le haut ou le bas une fois sur deux**, et avec lui la
//   date. On ne l'invente pas : `date` reste `null` et l'écran la réclame. La
//   queue du code-barres (AAMMJJ) n'est qu'une SUGGESTION, à confirmer.
// - **Un ticket Grand Frais est l'addition de plusieurs vendeurs** dont la
//   liste change d'un papier à l'autre : on ne la code pas en dur.
// - **« RAYON BOUCHERIE TRADIT »** n'est pas un article mais un montant de
//   comptoir : la bonne question est « avez-vous le talon ? ».
//
// Le texte brut n'est jamais rendu ni gardé : le numéro de carte de fidélité y
// figure, et rien ici ne le recopie.

export type Enseigne = "grand-frais" | "carrefour" | "despi" | "inconnue";

export interface LigneLue {
  /** Rang dans le ticket : deux POTIMARRON du même vendeur sont deux lignes. */
  rang: number;
  vendeur: string;
  libelle: string;
  /** Nombre d'articles. 1 sauf « 2 X 1,99 ». Jamais le code TVA Carrefour. */
  quantite: number;
  poidsKg: number | null;
  puKg: number | null;
  /** Prix imprimé de la ligne, avant tare et remise. */
  prix: number;
  tare: number;
  remise: number;
  /** `prix + tare + remise` — le seul montant à sommer. */
  net: number;
  plu: number | null;
  /** Un montant relu sans virgule : à regarder de près. */
  douteux: boolean;
  /** Ligne de comptoir sans détail (« RAYON BOUCHERIE ») : il faut le talon. */
  opaque: boolean;
}

export interface TicketLu {
  enseigne: Enseigne;
  /** Le nom du magasin tel qu'on le montre. */
  magasin: string;
  /** `AAAA-MM-JJ` lu EN CLAIR sur le papier, ou `null`. */
  date: string | null;
  heure: string | null;
  /** Une date déduite (queue du code-barres) : proposée, jamais crue. */
  dateSuggeree: string | null;
  lignes: LigneLue[];
  totalImprime: number | null;
  /** Les totaux par vendeur que le papier imprime. */
  totauxVendeurs: Record<string, number>;
  sommeNets: number;
  /** Les nets tombent sur le total imprimé, au centime. `null` sans total. */
  concorde: boolean | null;
}

/* ═══════════════════════════════════════════════════════════════ nombres */

const cents = (x: number): number => Math.round(x * 100) / 100;

/** Dans un jeton qui ressemble à un nombre, l'OCR confond O/0, l/1, S/5. */
function reparerNombres(ligne: string): string {
  return ligne.replace(/(?<![A-Za-z])[-\dOoIlS]*\d[-\dOoIlS]*[,.][\dOoIlS]+|(?<![A-Za-z])[OoIlS]?[,.]\d{2,3}\b/g, (j) =>
    j.replace(/[Oo]/g, "0").replace(/[Il]/g, "1").replace(/S/g, "5"),
  );
}

/** Dans un mot, un 0 entre deux lettres est un O (« P0IREAU »). */
const reparerMots = (ligne: string): string =>
  ligne.replace(/(?<=[A-Z])0(?=[A-Z])/g, "O").replace(/\b0(?=[A-Z]{2})/g, "O");

/** Un prix lu, virgule comprise ou sautée (« 19,03 » ou « 1903 »). */
const prixLu = (s: string): number => (/[,.]/.test(s) ? nombre(s) : Number(s) / 100);
const PRIX_FIN = /(-?\d{1,4}(?:[,.]\s?)?\d{2})$/;

const nombre = (s: string): number => Number(s.replace(/\s/g, "").replace(",", "."));

/** Le montant en bout de ligne. `douteux` quand la virgule a sauté. */
function montantFinal(l: string): { avant: string; valeur: number; douteux: boolean } | null {
  const m = /^(.*?)(-?)\s?(\d{1,4})\s?[,.]\s?(\d{2})\s*(?:€|EUR)?\s*[A-Z0-9]?$/.exec(l);
  if (m && /\d[,.]\s?\d{2}\s*(?:€|EUR)?\s*[A-Z0-9]?$/.test(l)) {
    // « 4,66 » collé au libellé ou séparé : les deux se relisent pareil.
    const v = nombre(`${m[3]}.${m[4]}`);
    return { avant: m[1]!.trim(), valeur: m[2] ? -v : v, douteux: false };
  }
  // La virgule a sauté : « POIREAU VRAC 466 ». Trois ou quatre chiffres seuls
  // en bout d'une ligne qui a des lettres se lisent en centimes.
  const n = /^(.*[A-Z].*?)\s?(-?)(\d{3,4})$/.exec(l);
  if (n && !/\d[,.]\d/.test(n[1]!)) {
    const v = Number(n[3]) / 100;
    return { avant: n[1]!.trim(), valeur: n[2] ? -v : v, douteux: true };
  }
  return null;
}

/* ═══════════════════════════════════════════════════════════════ en-tête */

function enseigneDe(texte: string): Enseigne {
  const t = texte.toUpperCase();
  if (/DESPI|PLU\s+ARTICLE/.test(t)) return "despi";
  if (/GRAND\s*FRAIS|JARDINS DE ST|CALSEC|\bLDGF\b/.test(t)) return "grand-frais";
  if (/CARREFOUR|FRANCHEVILLE/.test(t)) return "carrefour";
  return "inconnue";
}

const NOMS: Record<Exclude<Enseigne, "inconnue">, string> = {
  "grand-frais": "Grand Frais",
  carrefour: "Carrefour",
  despi: "Boucherie Despi",
};

const MOIS: Record<string, number> = {
  JAN: 1, FEV: 2, FEB: 2, MAR: 3, AVR: 4, APR: 4, MAI: 5, MAY: 5, JUN: 6, JUI: 7,
  JUL: 7, AOU: 8, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12,
};

const iso = (a: number, m: number, j: number): string | null => {
  if (m < 1 || m > 12 || j < 1 || j > 31) return null;
  const d = new Date(a, m - 1, j);
  if (d.getMonth() !== m - 1) return null;
  return `${a}-${String(m).padStart(2, "0")}-${String(j).padStart(2, "0")}`;
};

const annee = (s: string): number => (s.length === 2 ? 2000 + Number(s) : Number(s));

/** La date écrite en clair : `03/10/2026`, `03-10-26`, `03/OCT/26`. */
export function dateImprimee(texte: string): { date: string; heure: string | null } | null {
  for (const brute of texte.split("\n")) {
    const l = reparerNombres(brute.toUpperCase()).replace(/\bO(?=\d[/.-])/g, "0");
    const heure = /\b([01]\d|2[0-3])[:.]([0-5]\d)(?:[:.]([0-5]\d))?\b/.exec(l);
    const h = heure ? heure[0].replace(/\./g, ":") : null;
    const num = /\b(\d{2})[/.-](\d{2})[/.-](\d{4}|\d{2})\b/.exec(l);
    if (num) {
      const d = iso(annee(num[3]!), Number(num[2]), Number(num[1]));
      if (d) return { date: d, heure: h };
    }
    const lettres = /\b(\d{2})[/.\s-]([A-Z0]{3})[A-Z]?[/.\s-](\d{4}|\d{2})\b/.exec(l);
    if (lettres) {
      const m = MOIS[lettres[2]!.replace(/0/g, "O")];
      const d = m ? iso(annee(lettres[3]!), m, Number(lettres[1])) : null;
      if (d) return { date: d, heure: h };
    }
  }
  return null;
}

/**
 * La queue du code-barres : un groupe AAMMJJ dans une ligne faite de chiffres.
 * Plausible seulement dans l'année écoulée — sinon c'est un numéro de caisse.
 */
export function dateDuCodeBarres(texte: string, aujourdhui: Date): string | null {
  for (const brute of texte.split("\n")) {
    const l = reparerNombres(brute);
    if ((l.match(/\d/g) ?? []).length < 12 || /[A-Za-z]{3}/.test(l)) continue;
    for (const m of l.matchAll(/(?<!\d)(2\d)(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])(?!\d)/g)) {
      const d = iso(2000 + Number(m[1]), Number(m[2]), Number(m[3]));
      if (!d) continue;
      const ecart = (aujourdhui.getTime() - new Date(`${d}T12:00:00`).getTime()) / 864e5;
      if (ecart > -1 && ecart < 370) return d;
    }
  }
  return null;
}

/* ═══════════════════════════════════════════════════════════════ corps */

const PESEE = /(\d+[,.]\d{3})\s*KG\s*[X×*]\s*(\d+[,.]\d{2})/;
const NOMBRE = /^(\d{1,2})\s*[X×*]\s*(\d+[,.]\d{2})/;
const DESPI = /^(\d{1,4})\s+(.+?)\s+(\d+[,.]\d{3})\s+(\d+[,.]\d{2})\s+(\d+[,.]?\d{2})$/;
const PIED = /^(CB|CARTE|CARTES|ESPECES|ESP\b|CHEQUE|RENDU|TVA|HT\b|TTC\b|MERCI|SIRET|TICKET|CAISSE|VOTRE|CAGNOTTE|VIGNETTE)/;
const FIDELITE = /AVANTAGE|CAGNOTTE|CLUB|FIDELITE|VIGNETTE/;
const BRUIT = /^(TEL\b|SIRET|PLU\s+ARTICLE|\d{5}\s|LUNDI|DU LUNDI|HORAIRES|BIENVENUE$|WWW|HTTP)/;

/**
 * Lit le texte d'un ticket.
 *
 * `aujourdhui` ne sert qu'à juger une date de code-barres plausible.
 */
export function lireTicket(texte: string, aujourdhui = new Date()): TicketLu {
  const enseigne = enseigneDe(texte);
  const lignesTexte = texte
    .split("\n")
    .map((l) => reparerMots(reparerNombres(l.toUpperCase())).replace(/\s+/g, " ").trim())
    .filter((l) => l.length > 0);

  const magasin = enseigne === "inconnue" ? (lignesTexte[0] ?? "Magasin") : NOMS[enseigne];
  const lignes: LigneLue[] = [];
  const totauxVendeurs: Record<string, number> = {};
  let totalImprime: number | null = null;
  let vendeur = magasin;
  let enAttente: string | null = null;
  let commence = false;

  const ajouter = (l: Omit<LigneLue, "rang" | "vendeur" | "net" | "tare" | "remise" | "opaque">) => {
    lignes.push({
      ...l,
      rang: lignes.length,
      vendeur,
      tare: 0,
      remise: 0,
      net: l.prix,
      opaque: /^RAYON\s/.test(l.libelle),
    });
    enAttente = null;
    commence = true;
  };
  const derniere = (): LigneLue | undefined => lignes[lignes.length - 1];

  for (let i = 0; i < lignesTexte.length; i += 1) {
    const l = lignesTexte[i]!;
    const suivante = lignesTexte[i + 1] ?? "";

    // LE TOTAL CLÔT LES ARTICLES. « 21 TOTAL », « TOTAL », « TOTAL A PAYER ».
    if (/^(\d+\s+)?TOTAL(\s+A\s+PAYER|\s+TTC)?\s*:?\s*-?\d/.test(l)) {
      totalImprime = montantFinal(l)?.valeur ?? null;
      break;
    }
    if (/^(SOUS[- ]?)?TOTAL\s/.test(l) || /^\d+\s+(ARTICLES?|POS)\b/.test(l)) {
      const m = montantFinal(l);
      if (m && /^TOTAL\s/.test(l)) totauxVendeurs[m.avant.replace(/^TOTAL\s+/, "")] = m.valeur;
      continue;
    }
    if (commence && PIED.test(l)) break;
    if (BRUIT.test(l)) continue;

    // LA TARE ET LA REMISE APPARTIENNENT À LA LIGNE D'AVANT.
    // Une tare ne suit qu'une pesée : collée à une autre ligne, elle ferait
    // perdre deux centimes à la batavia parce que l'OCR a raté le potimarron.
    if (/^TARE\b/.test(l)) {
      const d = derniere();
      const m = PRIX_FIN.exec(l);
      if (d?.poidsKg && m) {
        d.tare = cents(d.tare - Math.abs(prixLu(m[1]!)));
        d.net = cents(d.prix + d.tare + d.remise);
      }
      continue;
    }
    if (FIDELITE.test(l)) continue; // crédité à une cagnotte, pas déduit

    // LA PESÉE SE VÉRIFIE ELLE-MÊME : poids × prix au kilo, arrondi au plus
    // proche (la règle mesurée sur le corpus), doit retomber sur le prix lu.
    const pesee = PESEE.exec(l);
    if (pesee) {
      const m = PRIX_FIN.exec(l.slice(pesee.index + pesee[0].length));
      if (enAttente) {
        const poidsKg = nombre(pesee[1]!);
        const puKg = nombre(pesee[2]!);
        const attendu = cents(poidsKg * puKg);
        const lu = m ? prixLu(m[1]!.replace(/\s/g, "")) : null;
        ajouter({
          libelle: enAttente,
          quantite: 1,
          poidsKg,
          puKg,
          prix: lu ?? attendu,
          plu: null,
          douteux: lu === null || Math.abs(lu - attendu) > 0.011,
        });
      }
      continue;
    }
    const nb = NOMBRE.exec(l);
    if (nb && enAttente) {
      const m = montantFinal(l);
      if (m) {
        ajouter({
          libelle: enAttente,
          quantite: Number(nb[1]),
          poidsKg: null,
          puKg: null,
          prix: m.valeur,
          plu: null,
          douteux: m.douteux,
        });
        continue;
      }
    }

    if (enseigne === "despi") {
      const d = DESPI.exec(l);
      if (d) {
        ajouter({
          libelle: d[2]!,
          quantite: 1,
          poidsKg: nombre(d[3]!),
          puKg: nombre(d[4]!),
          prix: prixLu(d[5]!),
          plu: Number(d[1]),
          douteux: false,
        });
        continue;
      }
    }

    const m = montantFinal(l);
    if (m && /[A-Z]{2}/.test(m.avant)) {
      if (m.valeur < 0) {
        // « 10620-Offre App milanais à rotir -2,28 » : une remise.
        const d = derniere();
        if (d) {
          d.remise = cents(d.remise + m.valeur);
          d.net = cents(d.prix + d.tare + d.remise);
        }
        continue;
      }
      // LE CODE TVA CARREFOUR : « 4 POIREAU VRAC ». Retiré, jamais compté.
      const libelle = enseigne === "carrefour" ? m.avant.replace(/^\d\s+/, "") : m.avant;
      ajouter({ libelle, quantite: 1, poidsKg: null, puKg: null, prix: m.valeur, plu: null, douteux: m.douteux });
      continue;
    }

    // UNE LIGNE SANS MONTANT : le libellé d'une pesée, ou un nom de vendeur.
    // Chez Grand Frais, la ligne seule qui n'annonce pas de pesée ouvre le bloc
    // d'un vendeur — dont la liste change d'un ticket à l'autre.
    if (/[A-Z]{2}/.test(l)) {
      if (PESEE.test(suivante) || NOMBRE.test(suivante)) enAttente = l;
      else if (enseigne === "grand-frais") vendeur = l;
    }
  }

  const imprimee = dateImprimee(texte);
  const sommeNets = cents(lignes.reduce((s, l) => s + l.net, 0));
  return {
    enseigne,
    magasin,
    date: imprimee?.date ?? null,
    heure: imprimee?.heure ?? null,
    dateSuggeree: imprimee ? null : dateDuCodeBarres(texte, aujourdhui),
    lignes,
    totalImprime,
    totauxVendeurs,
    sommeNets,
    concorde: totalImprime === null ? null : Math.abs(totalImprime - sommeNets) < 0.005,
  };
}

/* ═══════════════════════════════════════════════════════════ quantités */

/** Un format lu dans un libellé ou une unité du fond : « 1,5KG », « 180GR »,
 *  « sachet de 500 g », « 11G ». En grammes ou millilitres. */
export function formatDe(texte: string): { amount: number; unit: "g" | "ml" } | null {
  const m = /(\d+(?:[,.]\d+)?)\s*(KG|GR|G|CL|ML|L)\b/i.exec(texte.replace(/(\d)X(\d)/gi, "$1 X $2"));
  if (!m) return null;
  const v = nombre(m[1]!);
  switch (m[2]!.toUpperCase()) {
    case "KG": return { amount: Math.round(v * 1000), unit: "g" };
    case "G": case "GR": return { amount: Math.round(v), unit: "g" };
    case "L": return { amount: Math.round(v * 1000), unit: "ml" };
    case "CL": return { amount: Math.round(v * 10), unit: "ml" };
    default: return { amount: Math.round(v), unit: "ml" };
  }
}
