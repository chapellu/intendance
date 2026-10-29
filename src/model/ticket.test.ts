// T138 — le lecteur de ticket contre les quatre papiers transcrits du foyer.
//
// Les JSON de `tickets-corpus/` sont la vérité terrain (Workspace,
// `docs/supply/tickets/`). On en refait un texte TEL QUE L'OCR LE RENDRAIT —
// colonnes, tares, remises, code TVA en tête chez Carrefour — puis une variante
// abîmée (O/0, virgule sautée, colonnes collées), et on vérifie que la lecture
// retombe sur les lignes et les totaux du papier.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { dateDuCodeBarres, dateImprimee, formatDe, lireTicket } from "./ticket";

interface LigneJson {
  vendeur: string;
  libelle: string;
  code_tva?: number;
  poids_kg: number | null;
  pu_kg: number | null;
  prix_imprime_ttc: number;
  tare_kg: number | null;
  tare_ttc: number;
  remise_ttc: number;
  remise_libelle?: string | null;
  net_ttc: number;
  plu?: number | null;
}
interface TicketJson {
  enseigne: string;
  magasin: { nom: string; adresse?: string | null; telephone?: string | null };
  date_achat: string;
  heure_achat: string | null;
  vendeurs: { code: string; total_ttc: number }[];
  lignes: LigneJson[];
  totaux: { compteur_imprime: number; net_paye_ttc: number };
}

const DOSSIER = join(__dirname, "tickets-corpus");
const corpus: [string, TicketJson][] = readdirSync(DOSSIER)
  .filter((f) => f.endsWith(".json"))
  .sort()
  .map((f): [string, TicketJson & { type?: string }] => [f, JSON.parse(readFileSync(join(DOSSIER, f), "utf8"))])
  // T160 — la facture drive a son texte et son lecteur à elle
  // (`factureDrive.test.ts`) : ce n'est pas un papier qu'on refait d'OCR.
  .filter(([, t]) => t.type !== "facture");

const eur = (x: number): string => x.toFixed(2).replace(".", ",");
const kg = (x: number): string => x.toFixed(3).replace(".", ",");
const col = (g: string, d: string, w = 34): string => `${g}${" ".repeat(Math.max(1, w - g.length - d.length))}${d}`;
const MOIS = ["JAN", "FEV", "MAR", "AVR", "MAI", "JUN", "JUI", "AOU", "SEP", "OCT", "NOV", "DEC"];

/**
 * Le texte qu'un OCR rendrait du papier. La date n'est écrite que si le
 * papier l'a donnée EN CLAIR (`heure_achat` lue) : au 12/09 le haut était
 * hors cadre, chez Carrefour le bas — seule la queue du code-barres reste.
 */
function texteDe(t: TicketJson): string {
  const [a, m, j] = t.date_achat.split("-");
  const out: string[] = [];
  if (t.enseigne === "Grand Frais") {
    if (t.heure_achat) out.push("GRAND FRAIS", t.magasin.nom, "TEL 04.78.68.07.29");
    let vendeur = "";
    for (const l of t.lignes) {
      if (l.vendeur !== vendeur) {
        if (vendeur) out.push(col(`TOTAL ${vendeur}`, eur(t.vendeurs.find((v) => v.code === vendeur)!.total_ttc)));
        vendeur = l.vendeur;
        out.push(vendeur);
      }
      if (l.poids_kg) {
        out.push(l.libelle, col(`  ${kg(l.poids_kg)} kg x ${eur(l.pu_kg!)} EUR/kg`, eur(l.prix_imprime_ttc)));
      } else out.push(col(l.libelle, eur(l.prix_imprime_ttc)));
      if (l.tare_ttc) out.push(col(`  TARE ${kg(l.tare_kg!)} kg`, eur(l.tare_ttc)));
      if (l.remise_ttc) out.push(col(`  ${l.remise_libelle ?? "REMISE"}`, eur(l.remise_ttc)));
    }
    out.push(col(`TOTAL ${vendeur}`, eur(t.vendeurs.find((v) => v.code === vendeur)!.total_ttc)));
    out.push(col(`${t.totaux.compteur_imprime} TOTAL`, eur(t.totaux.net_paye_ttc)), col("CB", eur(t.totaux.net_paye_ttc)));
    if (t.heure_achat) out.push(`${t.heure_achat} ${j}/${MOIS[Number(m) - 1]}/${a!.slice(2)}`);
  } else if (t.enseigne === "Carrefour") {
    out.push("CARREFOUR", t.magasin.nom, "TEL 04 72 16 39 79");
    for (const l of t.lignes) {
      out.push(col(`${l.code_tva} ${l.libelle}`, eur(l.prix_imprime_ttc)));
      if (l.libelle === "POIREAU VRAC") out.push(col("  AVANTAGES -10% CLUB", "0,47"));
    }
    out.push(`${t.lignes.length} ARTICLES`, col("TOTAL", eur(t.totaux.net_paye_ttc)), col("Cartes Bancaires", eur(t.totaux.net_paye_ttc)));
    // Le pied est coupé : seule la queue du code-barres est dans le cadre.
    out.push(`0350 0012 ${a!.slice(2)}${m}${j} 2022`);
  } else {
    out.push("BOUCHERIE DESPI", "19 route de la Liberation", "TEL 04 78 68 14 32");
    out.push(`${j}/${m}/${a!.slice(2)} ${t.heure_achat}`, "PLU ARTICLE KG EUR/KG EUR");
    for (const l of t.lignes) out.push(`${l.plu} ${l.libelle} ${kg(l.poids_kg!)} ${eur(l.pu_kg!)} ${eur(l.prix_imprime_ttc)}`);
    out.push(`${t.totaux.compteur_imprime} POS`, col("TOTAL", eur(t.totaux.net_paye_ttc)), "TVA 5.50% 2.19");
  }
  return out.join("\n");
}

/** Les fautes typiques d'un OCR de ticket, déterministes. */
function abimer(texte: string): string {
  return texte
    .split("\n")
    .map((l, i) => {
      if (i % 3 === 0) l = l.replace(/0(?=[,.]\d)/, "O"); // 0 lu O
      if (i % 4 === 1) l = l.replace(/(\d),(\d{2})$/, "$1$2"); // virgule sautée
      if (i % 5 === 2) l = l.replace(/([A-Z])\s{2,}(\d)/, "$1$2"); // colonnes collées
      if (i % 7 === 3) l = l.replace(/O(?=[A-Z])/, "0"); // O lu 0 dans un mot
      return l;
    })
    .join("\n");
}

const AUJOURDHUI = new Date(2026, 9, 20);

describe("lireTicket — les quatre papiers du corpus", () => {
  test.each(corpus)("%s : lignes, nets et total", (_f, t) => {
    const lu = lireTicket(texteDe(t), AUJOURDHUI);
    expect(lu.lignes.map((l) => l.libelle)).toEqual(t.lignes.map((l) => l.libelle));
    expect(lu.lignes.map((l) => l.net)).toEqual(t.lignes.map((l) => l.net_ttc));
    expect(lu.lignes.map((l) => l.vendeur)).toEqual(
      t.enseigne === "Grand Frais" ? t.lignes.map((l) => l.vendeur) : t.lignes.map(() => lu.magasin),
    );
    expect(lu.lignes.map((l) => l.poidsKg)).toEqual(t.lignes.map((l) => l.poids_kg));
    expect(lu.totalImprime).toBe(t.totaux.net_paye_ttc);
    expect(lu.concorde).toBe(true);
  });

  test("le chiffre en tête d'une ligne Carrefour est le code TVA, pas une quantité", () => {
    const [, t] = corpus.find(([f]) => f.includes("carrefour"))!;
    const lu = lireTicket(texteDe(t), AUJOURDHUI);
    expect(lu.lignes.every((l) => l.quantite === 1)).toBe(true);
    // Et l'avantage fidélité ne baisse pas le poireau.
    expect(lu.lignes[0]).toMatchObject({ libelle: "POIREAU VRAC", net: 4.66, remise: 0 });
  });

  test("tares et remises s'attachent à leur ligne", () => {
    const [, t] = corpus.find(([f]) => f.startsWith("2026-09-12"))!;
    const lu = lireTicket(texteDe(t), AUJOURDHUI);
    expect(lu.lignes[0]).toMatchObject({ libelle: "MELON CHARENTAIS JAUNE", prix: 2.98, tare: -0.02, net: 2.96 });
    expect(lu.lignes.find((l) => l.libelle.startsWith("VEAU"))).toMatchObject({ remise: -2.28, net: 16.75 });
  });

  test("la ligne de comptoir est marquée opaque", () => {
    const [, t] = corpus.find(([f]) => f === "2026-10-03-grand-frais-ste-foy.json")!;
    const lu = lireTicket(texteDe(t), AUJOURDHUI);
    expect(lu.lignes.filter((l) => l.opaque).map((l) => l.libelle)).toEqual(["RAYON BOUCHERIE TRADIT"]);
  });

  test("le talon Despi porte son PLU et ses pesées", () => {
    const [, t] = corpus.find(([f]) => f.includes("despi"))!;
    const lu = lireTicket(texteDe(t), AUJOURDHUI);
    expect(lu.enseigne).toBe("despi");
    expect(lu.lignes.map((l) => l.plu)).toEqual([47, 55, 748]);
  });
});

describe("lireTicket — la date", () => {
  test("lue en clair quand le papier la porte, absente sinon — jamais inventée", () => {
    const dates = Object.fromEntries(corpus.map(([f, t]) => [f, lireTicket(texteDe(t), AUJOURDHUI)]));
    expect(dates["2026-10-03-grand-frais-ste-foy.json"]).toMatchObject({ date: "2026-10-03", heure: "16:28:14" });
    expect(dates["2026-10-03-despi-ste-foy.json"]).toMatchObject({ date: "2026-10-03", heure: "16:03:09" });
    // Le haut du 12/09 était hors cadre : pas de date, pas de suggestion.
    expect(dates["2026-09-12-grand-frais-ste-foy.json"]).toMatchObject({ date: null, dateSuggeree: null });
    // Le bas du Carrefour était hors cadre : la queue du code-barres SUGGÈRE.
    expect(dates["2026-10-03-carrefour-francheville.json"]).toMatchObject({ date: null, dateSuggeree: "2026-10-03" });
  });

  test("formats imprimés", () => {
    expect(dateImprimee("16:28:14 03/OCT/26")?.date).toBe("2026-10-03");
    expect(dateImprimee("16:28:14 O3/0CT/26")?.date).toBe("2026-10-03");
    expect(dateImprimee("LE 12/09/2026 A 10:04")?.date).toBe("2026-09-12");
    expect(dateImprimee("TEL 04.78.68.07.29")).toBeNull();
    expect(dateImprimee("31/02/26")).toBeNull();
  });

  test("le code-barres ne suggère qu'une date de l'année écoulée", () => {
    expect(dateDuCodeBarres("0350 0012 261003 2022", AUJOURDHUI)).toBe("2026-10-03");
    expect(dateDuCodeBarres("0350 0012 241003 2022", AUJOURDHUI)).toBeNull();
    expect(dateDuCodeBarres("POIREAU 261003 2022 4,66", AUJOURDHUI)).toBeNull();
  });
});

describe("lireTicket — un OCR qui se trompe", () => {
  test.each(corpus)("%s abîmé : les montants se relisent, le total le vérifie", (_f, t) => {
    const lu = lireTicket(abimer(texteDe(t)), AUJOURDHUI);
    expect(lu.lignes.map((l) => l.net)).toEqual(t.lignes.map((l) => l.net_ttc));
    expect(lu.lignes).toHaveLength(t.lignes.length);
    expect(lu.concorde).toBe(true);
  });

  test("une virgule sautée rend la ligne douteuse, pas fausse", () => {
    const lu = lireTicket("CARREFOUR\n4 POIREAU VRAC 466\nTOTAL 4,66");
    expect(lu.lignes[0]).toMatchObject({ libelle: "POIREAU VRAC", prix: 4.66, douteux: true });
  });

  test("P0IREAU se relit POIREAU, 1O,49 se relit 10,49", () => {
    const lu = lireTicket("CARREFOUR\n4 P0IREAU VRAC 1O,49\nTOTAL 10,49");
    expect(lu.lignes[0]).toMatchObject({ libelle: "POIREAU VRAC", prix: 10.49 });
  });

  test("un ticket inconnu passe par le repli générique, quantité comprise", () => {
    const lu = lireTicket("SUPER U\nLAIT DEMI ECREME\n2 X 1,05 2,10\nCAROTTES 1KG 1,49\nTOTAL 3,59\n12/10/2026 18:02");
    expect(lu.enseigne).toBe("inconnue");
    expect(lu.magasin).toBe("SUPER U");
    expect(lu.lignes).toMatchObject([
      { libelle: "LAIT DEMI ECREME", quantite: 2, prix: 2.1 },
      { libelle: "CAROTTES 1KG", quantite: 1, prix: 1.49 },
    ]);
    expect(lu).toMatchObject({ date: "2026-10-12", concorde: true });
  });
});

describe("formatDe", () => {
  test("lit le format d'un libellé ou d'une unité du fond", () => {
    expect(formatDe("OIGNON FILET 1,5KG")).toEqual({ amount: 1500, unit: "g" });
    expect(formatDe("BUCHE DE CHEVRE 180GR")).toEqual({ amount: 180, unit: "g" });
    expect(formatDe("sachet de 500 g")).toEqual({ amount: 500, unit: "g" });
    expect(formatDe("paquet de 1 kg")).toEqual({ amount: 1000, unit: "g" });
    expect(formatDe("NECTAR 75CL")).toEqual({ amount: 750, unit: "ml" });
    expect(formatDe("POIREAU VRAC")).toBeNull();
  });
});

describe("lireTicket — la pesée imprimée sous la ligne", () => {
  test("« 4 POIREAU VRAC 4,66 » puis « 0,932 kg x 5,00 » : la ligne prend son poids", () => {
    const lu = lireTicket("CARREFOUR\n4 POIREAU VRAC 4,66\n  0,932 kg x 5,00 EUR/kg\n4 CAROTTES VRAC 1,50\nTOTAL 6,16");
    expect(lu.lignes).toMatchObject([
      { libelle: "POIREAU VRAC", poidsKg: 0.932, puKg: 5, prix: 4.66 },
      { libelle: "CAROTTES VRAC", poidsKg: null },
    ]);
    expect(lu.concorde).toBe(true);
  });

  test("une pesée dont le compte ne tombe pas n'est pas collée à la ligne d'avant", () => {
    const lu = lireTicket("CARREFOUR\n4 POIREAU VRAC 4,66\n  0,500 kg x 2,00 EUR/kg\nTOTAL 4,66");
    expect(lu.lignes[0]!.poidsKg).toBeNull();
  });
});
