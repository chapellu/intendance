// Lire une facture Carrefour Drive / « Livré chez vous » — T160.
//
// LE MÊME RÉSULTAT QU'UN TICKET, UNE AUTRE ENTRÉE. La facture arrive en PDF ;
// `ecrans/pdf.ts` en refait un texte à colonnes (comme `pdftotext -layout`),
// et ce module en tire un `TicketLu` que la revue du ticket (T138) prend tel
// quel : même table apprise, même « Tout rentrer ».
//
// CE QUE LA FACTURE DU 28/10/2026 A APPRIS, ET QUE CE FICHIER RESPECTE :
//
// - **Un libellé se replie sur deux ou trois rangées, et l'EAN est sur celle
//   du milieu** — ou sur la première, ou sur la dernière. Un article est donc
//   un BLOC de rangées serrées, séparé du suivant par une ligne vide ; lire
//   rangée par rangée perdait 13 lignes sur 35.
// - **Deux quantités : commandée, puis livrée.** C'est la livrée qui rentre.
// - **La remise ne se lit pas toujours dans sa colonne.** Les crozets
//   l'impriment (1,69) ; les lardons ne l'impriment pas mais leur montant est
//   déjà remisé (2 × 2,06 = 4,12, montant 3,71) ; l'eau Arancia, elle, n'a sa
//   remise (2,33) QUE dans le récapitulatif « Total des remises appliquées ».
//   Le montant de la ligne, moins ce que le récapitulatif ajoute, tombe sur le
//   « Montant Net payé » au centime.
// - **La colonne de droite du récapitulatif va à la cagnotte**, elle ne baisse
//   aucun prix — la même règle que l'« AVANTAGES CLUB » du ticket papier.
// - **La date qui compte est celle de LIVRAISON** : c'est le jour où ça entre
//   au placard, pas celui où l'on a cliqué.
// - **L'EAN est la clé** : il ne change ni d'un magasin à l'autre ni d'une
//   facture à la suivante, là où le libellé se replie autrement à chaque page.
// - **Le rayon dit souvent « pas pour la cuisine »** (DROGUERIE, PARFUMERIE
//   HYGIENE) : c'est proposé, jamais imposé.
//
// Le texte brut porte le nom, l'adresse, l'identifiant client et les numéros
// de commande et de facture : rien ici ne les lit ni ne les recopie.

import type { LigneLue, TicketLu } from "./ticket";

export interface FactureLue extends TicketLu {
  /** « 43 articles » imprimé dans le récapitulatif. */
  articlesImprimes: number | null;
  /** « Total panier TTC (avant remises) ». */
  brutImprime: number | null;
}

const cents = (x: number): number => Math.round(x * 100) / 100;
const nombre = (s: string): number => Number(s.replace(/\s/g, "").replace(",", "."));
const NB = String.raw`-?\d+(?:[.,]\d+)?`;

/** Le PDF est-il une facture du drive ? La colonne « Code EAN13 » le dit. */
export const estFactureDrive = (texte: string): boolean => /Code\s+EAN\s*13/i.test(texte);

/** Les rayons qui ne mangent pas : proposés « pas pour la cuisine ». */
const HORS_CUISINE = /DROGUERIE|PARFUMERIE|HYGIENE|HYGIÈNE|ENTRETIEN|ANIMALERIE|BAZAR|PAPETERIE/;

/**
 * Une rangée d'article : EAN, libellé éventuel, quantité commandée, livrée,
 * TVA %, PU HT, PU TTC, [remise TTC], montant TTC.
 */
const ARTICLE = new RegExp(
  String.raw`^(\d{13})(?:\s+(.*?))?\s{2,}(\d+)\s+(\d+)\s+(\d+[.,]\d)\s+(\d+[.,]\d{2})\s+(\d+[.,]\d{2})(?:\s+(-?\d+[.,]\d{2}))?\s+(-?\d+[.,]\d{2})$`,
);

/** Un intertitre de rayon : seul dans son bloc, en capitales, sans chiffre. */
const estRayon = (l: string): boolean =>
  !/[a-zà-ÿ\d]/.test(l) && (l.match(/[A-ZÀ-Ý]/g) ?? []).length >= 2 && l.length <= 40;

/** Le pied et le récapitulatif closent les articles de la page. */
const FIN_DES_ARTICLES = /^(La présente facture|Aucun escompte|Carrefour Drive - SNC|RCS\s*:|Récapitulatif de votre facture)/;

const normal = (s: string): string => s.replace(/\s+/g, " ").trim();

interface Rangee {
  texte: string;
  /** Colonne du premier caractère : sépare les deux colonnes du récapitulatif. */
  retrait: number;
  page: number;
}

function rangees(texte: string): Rangee[] {
  let page = 0;
  return texte.split("\n").map((brute) => {
    let l = brute;
    if (l.includes("\f")) {
      page += 1;
      l = l.replace(/\f/g, "");
    }
    return { texte: l.trim(), retrait: l.length - l.trimStart().length, page };
  });
}

/** Un montant du récapitulatif : « Montant Net payé (en euros) 171.88 € ». */
function montantDe(texte: string, libelle: RegExp): number | null {
  for (const l of texte.split("\n").map(normal)) {
    const m = new RegExp(String.raw`${libelle.source}[^\d-]*(${NB})\s*€`).exec(l);
    if (m) return nombre(m[1]!);
  }
  return null;
}

export function lireFactureDrive(texte: string): FactureLue {
  const rs = rangees(texte);

  /* ─────────────────────────────── les articles, bloc par bloc ── */
  // Un bloc = des rangées non vides consécutives. On n'en lit qu'entre l'en-tête
  // de colonnes (« Code EAN13 ») et le pied de la page.
  const blocs: Rangee[][] = [];
  let dansLesArticles = false;
  let enTete = false;
  let page = -1;
  let bloc: Rangee[] = [];
  const clore = () => {
    if (bloc.length && dansLesArticles && !enTete) blocs.push(bloc);
    bloc = [];
  };
  for (const r of rs) {
    if (r.page !== page) {
      clore();
      page = r.page;
      dansLesArticles = false;
    }
    if (!r.texte) {
      clore();
      enTete = false;
      continue;
    }
    if (/Code\s+EAN\s*13/i.test(r.texte)) {
      // L'en-tête de colonnes est un bloc à lui seul : ce qui le suit est à lire.
      bloc = [];
      dansLesArticles = true;
      enTete = true;
      continue;
    }
    if (FIN_DES_ARTICLES.test(normal(r.texte))) {
      clore();
      dansLesArticles = false;
      continue;
    }
    bloc.push(r);
  }
  clore();

  const lignes: (LigneLue & { ean: string; rayon: string })[] = [];
  let rayon = "";
  for (const b of blocs) {
    const articles = b.map((r) => ARTICLE.exec(r.texte));
    const indices = articles.flatMap((m, i) => (m ? [i] : []));
    if (!indices.length) {
      if (b.length === 1 && estRayon(b[0]!.texte)) rayon = normal(b[0]!.texte);
      continue;
    }
    // LES RANGÉES DE TEXTE VONT À L'ARTICLE DU BLOC. Un bloc n'en porte qu'un
    // d'ordinaire ; s'il en porte deux, une rangée entre les deux va au suivant
    // quand celui-ci n'a pas de libellé sur sa propre rangée, sinon au précédent.
    const morceaux: string[][] = indices.map(() => []);
    b.forEach((r, i) => {
      const m = articles[i];
      const k = indices.findIndex((j) => j >= i);
      if (m) {
        if (m[2]) morceaux[k]!.push(m[2]);
        return;
      }
      if (k === -1) morceaux[indices.length - 1]!.push(r.texte);
      else if (k === 0) morceaux[0]!.push(r.texte);
      else morceaux[articles[indices[k]!]![2] ? k - 1 : k]!.push(r.texte);
    });
    indices.forEach((i, k) => {
      const m = articles[i]!;
      const livree = Number(m[4]);
      if (livree === 0) return; // commandé, pas livré : rien n'entre
      const puTTC = nombre(m[7]!);
      const montant = nombre(m[9]!);
      const prix = cents(livree * puTTC);
      lignes.push({
        rang: lignes.length,
        vendeur: "Carrefour Drive",
        libelle: normal(morceaux[k]!.join(" ")),
        quantite: livree,
        poidsKg: null,
        puKg: null,
        prix,
        tare: 0,
        // Le montant est déjà remisé, colonne « Remise » imprimée ou non.
        remise: cents(montant - prix),
        net: montant,
        plu: null,
        douteux: false,
        opaque: false,
        ean: m[1]!,
        rayon,
        horsCuisine: HORS_CUISINE.test(rayon),
      });
    });
  }

  /* ──────────────────── les remises que seul le récapitulatif porte ── */
  // « Total des remises appliquées » ouvre la colonne de GAUCHE ; celle de
  // droite (« créditées sur votre cagnotte ») ne baisse aucun prix. On sépare
  // les deux par le retrait, et non par l'ordre des rangées : d'un outil à
  // l'autre, elles s'entrelacent différemment.
  const retraitGauche = new Map<number, number>();
  let rappel = Infinity;
  for (const r of rs) {
    if (/^Et un rappel de vos économies/.test(normal(r.texte))) rappel = Math.min(rappel, r.page);
    if (/^Total des remises appliquées/.test(normal(r.texte))) retraitGauche.set(r.page, r.retrait);
  }
  const deja = new Set<number>();
  let gauche: number | undefined;
  for (const r of rs) {
    if (r.page < rappel) continue;
    gauche = retraitGauche.get(r.page) ?? gauche;
    if (gauche === undefined || r.retrait > gauche + 15 || /^Total des remises/.test(normal(r.texte))) continue;
    const m = new RegExp(String.raw`^(.+?)\s{2,}(${NB})\s*€`).exec(r.texte);
    if (!m) continue;
    const libelle = normal(m[1]!).toUpperCase();
    const montant = nombre(m[2]!);
    const l = lignes.find((x) => !deja.has(x.rang) && x.libelle.toUpperCase().startsWith(libelle));
    if (!l) continue;
    deja.add(l.rang);
    // Déjà dans le montant de la ligne (crozets, lardons) : rien à ajouter.
    if (Math.abs(-l.remise - montant) < 0.005) continue;
    l.remise = cents(l.remise - montant);
    l.net = cents(l.net - montant);
  }

  /* ───────────────────────────────────────────────── en-tête et totaux ── */
  const date = (libelle: string): string | null => {
    const m = new RegExp(String.raw`Date de ${libelle}\s*:\s*(\d{2})/(\d{2})/(\d{4})`).exec(texte.replace(/[ \t]+/g, " "));
    return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
  };
  const livraison = date("livraison");
  const totalImprime = montantDe(texte, /Montant Net pay[ée]+/);
  const frais = montantDe(texte, /Frais de livraison/) ?? 0;
  const promo = montantDe(texte, /Code Promo - Remise/) ?? 0;
  const sacs = montantDe(texte, /Remboursement sac\(s\)[^\d]*/) ?? 0;
  const articles = /(\d+)\s+articles\b/.exec(texte);
  const sommeNets = cents(lignes.reduce((s, l) => s + l.net, 0));
  return {
    enseigne: "carrefour-drive",
    magasin: "Carrefour Drive",
    date: livraison,
    heure: null,
    // Sans date de livraison, celle de facturation est proposée, à confirmer.
    dateSuggeree: livraison ? null : date("facturation"),
    lignes,
    totalImprime,
    totauxVendeurs: {},
    sommeNets,
    // Les frais de livraison s'ajoutent aux articles ; un code promo et les
    // sacs consignés remboursés s'en retranchent.
    concorde: totalImprime === null ? null : Math.abs(totalImprime - cents(sommeNets + frais - promo - sacs)) < 0.005,
    articlesImprimes: articles ? Number(articles[1]) : null,
    brutImprime: montantDe(texte, /Total panier TTC \(avant remises\)/),
  };
}
