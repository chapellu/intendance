// Deux relevés FABRIQUÉS, un par gabarit — partagés par les tests du lecteur
// et par le parcours e2e qui en fait un vrai PDF.
//
// AUCUN RELEVÉ RÉEL N'EST DANS CE DÉPÔT, et il n'y en aura jamais : ce sont des
// documents de foyer, et le dépôt est public. Les gabarits ont été écrits
// d'après de vrais relevés, lus sur une machine et jamais copiés ; ceux-ci en
// reproduisent la MISE EN PAGE — colonnes, formes de date, lignes de solde —
// avec des libellés, des montants et des IBAN d'exemple inventés.

/** Une ligne de relevé : chaque morceau est posé à sa colonne ; un montant
 *  (`fin`) est aligné à droite, comme sur le papier. */
export function ligne(...morceaux: ([number, string] | [number, string, "fin"])[]): string {
  let l = "";
  for (const [col, texte, alignement] of morceaux) {
    const debut = alignement === "fin" ? col - texte.length : col;
    l = l.padEnd(debut) + texte;
  }
  return l;
}

/* ─────────────────────────────────────── gabarit « date de valeur en tête » */

const D1 = 141; // fin des montants au débit
const C1 = 178; // fin des montants au crédit
const entete1 = (decale = 0) =>
  ligne([19 + decale, "Date Date de Valeur"], [76 + decale, "Opération"], [124 + decale, "Débit"], [153 + decale, "Crédit"]);

export const releve1 = (totalDebit = "1 042,30", totalCredit = "2 015,00") =>
  [
    ligne([88, "Relevé de Compte"]),
    ligne([15, "IBAN FR76 3000 6000 0112 3456 7890 189 BIC EXEMPLEXXX"]),
    "",
    entete1(),
    "",
    ligne([18, "ANCIEN SOLDE CRÉDITEUR AU 31 août 2026"], [C1 + 2, "500,00 €", "fin"]),
    "",
    ligne([18, "01/09"], [30, "01/09/2026 VIR SALAIRE EXEMPLE"], [C1, "2 000,00", "fin"]),
    ligne([18, "02/09"], [30, "02/09/2026 CARTE 01/09 BOULANGERIE TEST"], [D1, "12,30", "fin"]),
    ligne([18, "03/09"], [30, "03/09/2026 PRLV SEPA FOURNISSEUR EAU"], [D1, "30,00", "fin"]),
    ligne([45, "REF.MANDAT: ABC123456789"]),
    ligne([45, "Facture trimestre trois"]),
    ligne([11, "Émis le 30/09/2026"]),
    "\f" + ligne([88, "Relevé de Compte"]),
    entete1(1),
    ligne([19, "05/09"], [31, "05/09/2026 CARTE 04/09 MAGASIN TEST 12,50 EUR"], [D1 + 1, "12,50", "fin"]),
    // UN REMBOURSEMENT PAR CARTE : même libellé qu'un paiement, colonne crédit.
    ligne([19, "06/09"], [31, "06/09/2026 CARTE 05/09 MAGASIN TEST"], [C1 + 1, "15,00", "fin"]),
    ligne([19, "10/09"], [31, "10/09/2026 VIR INST VERS EPARGNE"], [D1 + 1, "987,50", "fin"]),
    "",
    ligne([20, "TOTAL DES OPÉRATIONS DU RELEVÉ"], [D1 + 1, totalDebit, "fin"], [C1 + 1, totalCredit, "fin"]),
    ligne([19, "NOUVEAU SOLDE CRÉDITEUR AU 30 septembre 2026"], [C1 + 3, "1 472,70 €", "fin"]),
    // Le tableau des frais a lui aussi ses colonnes Débit / Crédit : il est
    // APRÈS le nouveau solde, donc hors du tableau des opérations.
    ligne([18, "Total de vos frais du 1er au 30 sept 2026"], [124, "Débit"], [153, "Crédit"]),
    ligne([18, "Frais"], [D1, "2,00 €", "fin"]),
  ].join("\n");

/* ─────────────────────────────────────── gabarit « date de valeur en colonne » */

const D2 = 157;
const C2 = 183;
const entete2 = ligne([14, "DATE"], [50, "LIBELLE"], [106, "VALEUR"], [144, "DEBIT"], [168, "CREDIT"]);

export const releve2 = (fin = "31.12.2026", debut = "01.12.2026") =>
  [
    ligne([44, "RELEVE DE COMPTE"]),
    ligne([128, `du ${debut} au ${fin} - N° 12`]),
    ligne([15, "IBAN : GB82 WEST 1234 5698 7654 32"]),
    "",
    ligne([15, "ECRITURES DE LA PERIODE"]),
    entete2,
    ligne([14, "01.12"], [91, "ANCIEN SOLDE"], [C2, "1 000,00", "fin"]),
    ligne([14, "02.12"], [25, "VIR.PERMANENT LOYER EXEMPLE"], [113, "02.12.26"], [D2, "700,00", "fin"]),
    ligne([27, "pour le mois"]),
    ligne([27, "REF.MANDAT: XYZ987654321"]),
    ligne([14, "15.12"], [25, "PRLV SEPA ASSURANCE TEST"], [113, "15.12.26"], [D2, "45,50", "fin"]),
    // Ce gabarit écrit ses accents dans le vieux jeu français : `{` pour é.
    ligne([27, "Pr{l}vement trimestriel"]),
    ligne([31, "SOLDE INTERMEDIAIRE A FIN DE PAGE"], [C2, "254,50", "fin"]),
    ligne([175, "Page 1 / 2"]),
    "\f" + ligne([44, "RELEVE DE COMPTE"]),
    entete2,
    ligne([14, "28.12"], [25, "VIREMENT DE EXEMPLE"], [113, "28.12.26"], [C2, "2 100,00", "fin"], [190, "."]),
    // Les totaux de ce gabarit COMPTENT l'ancien solde : 1 000 + 2 100 au crédit.
    ligne([106, "TOTAUX"], [D2 - 1, "745,50", "fin"], [C2 - 1, "3 100,00", "fin"]),
    ligne([14, "31.12"], [91, "SOLDE EN EUROS"], [C2, "2 354,50", "fin"]),
    ligne([14, "Recapitulatif des frais"], [134, "DEBIT"], [159, "CREDIT"]),
    ligne([14, "AUTRES FRAIS"], [D2, "1,00", "fin"]),
  ].join("\n");
