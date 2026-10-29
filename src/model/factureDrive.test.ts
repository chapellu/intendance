// T160 — la facture Carrefour Drive du 28/10/2026, contre sa vérité terrain.
//
// `tickets-corpus/2026-10-28-carrefour-drive.txt` est la sortie
// `pdftotext -layout` du PDF, identifiants remplacés ; le `.json` du même nom
// est la transcription ligne à ligne, faite à la main. Le PDF n'est pas
// versionné.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { lireCatalogue } from "./catalogue";
import { estFactureDrive, lireFactureDrive } from "./factureDrive";
import { lireTicket } from "./ticket";
import { candidatsDu, cleDeLaLigne, proposer, quantiteDe } from "./ticketCorrespondance";
import { rangeesDu } from "../ecrans/ticket.vue";
import type { Catalogue } from "./types";

interface LigneJson {
  rayon: string;
  ean: string;
  libelle: string;
  qte_commandee: number;
  qte_livree: number;
  pu_ttc: number;
  prix_brut_ttc: number;
  montant_ttc: number;
  net_ttc: number;
  pour_la_cuisine: boolean;
}
interface FactureJson {
  date_commande: string;
  date_livraison: string;
  lignes: LigneJson[];
  totaux: { compteur_imprime: number; articles: number; panier_brut_ttc: number; remises_ttc: number; net_paye_ttc: number };
}

const DOSSIER = join(__dirname, "tickets-corpus");
const TEXTE = readFileSync(join(DOSSIER, "2026-10-28-carrefour-drive.txt"), "utf8");
const VERITE = JSON.parse(readFileSync(join(DOSSIER, "2026-10-28-carrefour-drive.json"), "utf8")) as FactureJson;
const lu = lireFactureDrive(TEXTE);
const somme = (xs: readonly number[]): number => Math.round(xs.reduce((s, x) => s + x, 0) * 100) / 100;

describe("lireFactureDrive — la facture du 28/10/2026", () => {
  test("toutes les lignes, dans l'ordre, par leur EAN", () => {
    expect(lu.lignes.map((l) => l.ean)).toEqual(VERITE.lignes.map((l) => l.ean));
  });

  test("un libellé replié sur deux ou trois rangées est recollé en entier", () => {
    expect(lu.lignes.map((l) => l.libelle)).toEqual(VERITE.lignes.map((l) => l.libelle));
    // Les cas qui tombaient : l'EAN sur la rangée du milieu, ou sur la première.
    const par = (ean: string) => lu.lignes.find((l) => l.ean === ean)!.libelle;
    expect(par("3560071463311")).toBe("Haricots lingots Blancs Engagé auprès des producteurs partenaires CARREFOUR BIO");
    expect(par("3270190146421")).toBe("Farine De Blé Semi-Complète T110 Bio Engagé auprès des producteurs partenaires CARREFOUR BIO");
  });

  test("la quantité est la LIVRÉE : le beurre, les crozets, les haricots verts, le lait par deux", () => {
    expect(lu.lignes.map((l) => l.quantite)).toEqual(VERITE.lignes.map((l) => l.qte_livree));
    for (const ean of ["3155251205500", "3252971585858", "3270190207337", "3176571983008", "3270190192749"]) {
      expect(lu.lignes.find((l) => l.ean === ean)!.quantite).toBe(2);
    }
    expect(somme(lu.lignes.map((l) => l.quantite))).toBe(43);
    expect(lu.articlesImprimes).toBe(43);
  });

  test("prix brut et net par ligne, remises du récapitulatif comprises", () => {
    expect(lu.lignes.map((l) => l.prix)).toEqual(VERITE.lignes.map((l) => l.prix_brut_ttc));
    expect(lu.lignes.map((l) => l.net)).toEqual(VERITE.lignes.map((l) => l.net_ttc));
    const remise = (ean: string) => lu.lignes.find((l) => l.ean === ean)!.remise;
    expect(remise("3252971585858")).toBe(-1.69); // crozets : imprimée
    expect(remise("3270190023661")).toBe(-0.41); // lardons : déjà dans le montant
    expect(remise("8002270506796")).toBe(-2.33); // Arancia : récapitulatif seul
  });

  test("les totaux tombent au centime : brut 176,31, remises 4,43, net payé 171,88", () => {
    expect(somme(lu.lignes.map((l) => l.prix))).toBe(VERITE.totaux.panier_brut_ttc);
    expect(lu.brutImprime).toBe(176.31);
    expect(somme(lu.lignes.map((l) => l.remise))).toBe(-VERITE.totaux.remises_ttc);
    expect(lu.sommeNets).toBe(VERITE.totaux.net_paye_ttc);
    expect(lu.totalImprime).toBe(171.88);
    expect(lu.concorde).toBe(true);
  });

  test("ni pied de page, ni récapitulatif, ni en-tête parmi les lignes", () => {
    for (const l of lu.lignes) {
      expect(l.libelle).not.toMatch(/RCS|CAEN|CODE PROMO|FRAIS DE LIVRAISON|MONTANT NET|TOTAL|CAGNOTTE|PAYÉ|FACTURE|COMMANDE|SNC/i);
      expect(l.ean).toMatch(/^\d{13}$/);
    }
  });

  test("la date est celle de LIVRAISON, pas de commande", () => {
    expect(VERITE.date_commande).toBe("2026-10-27");
    expect(lu.date).toBe("2026-10-28");
    expect(lu.dateSuggeree).toBeNull();
    expect(lu.magasin).toBe("Carrefour Drive");
  });

  test("le rayon est gardé, et DROGUERIE / PARFUMERIE HYGIENE disent « pas pour la cuisine »", () => {
    expect(lu.lignes.map((l) => l.rayon)).toEqual(VERITE.lignes.map((l) => l.rayon));
    expect(lu.lignes.map((l) => !l.horsCuisine)).toEqual(VERITE.lignes.map((l) => l.pour_la_cuisine));
    expect(lu.lignes.filter((l) => !l.horsCuisine)).toHaveLength(30);
  });

  test("lireTicket sur le même texte en perdait : c'est bien un autre lecteur qu'il fallait", () => {
    expect(lireTicket(TEXTE).lignes.length).toBeLessThan(VERITE.lignes.length);
  });

  test("un article commandé mais pas livré ne rentre pas", () => {
    const texte = TEXTE.replace(
      /(3560071561482 +Lait de coco SIMPL +)1( +)1( +5\.5 +0\.71 +0\.75 +)0\.75/,
      "$11$20$30.00",
    );
    const l = lireFactureDrive(texte);
    expect(l.lignes.map((x) => x.ean)).not.toContain("3560071561482");
    expect(l.lignes).toHaveLength(34);
  });

  test("des frais de livraison s'ajoutent aux articles sans casser le compte", () => {
    const texte = TEXTE.replace(/(Frais de livraison +)0\.00/, "$15.90").replace(/(Montant Net pay\S+ \(en euros\) +)171\.88/, "$1177.78");
    expect(lireFactureDrive(texte).concorde).toBe(true);
  });
});

describe("estFactureDrive", () => {
  test("reconnaît la facture, pas un ticket de caisse", () => {
    expect(estFactureDrive(TEXTE)).toBe(true);
    expect(estFactureDrive("CARREFOUR\nFRANCHEVILLE\n4 POIREAU VRAC   4,66\nTOTAL 4,66")).toBe(false);
  });
});

describe("la table apprise retient l'EAN, pas le libellé", () => {
  const catalogue: Catalogue = lireCatalogue(JSON.parse(readFileSync("public/cuisine-data.json", "utf8")) as unknown);
  const candidats = candidatsDu(catalogue);

  test("la clé d'une ligne de facture est son EAN", () => {
    const l = lu.lignes.find((x) => x.ean === "3560071561482")!; // lait de coco
    expect(cleDeLaLigne("carrefour-drive", l)).toBe(`ean|${l.ean}`);
    // Une ligne de ticket sans EAN garde sa clé composite.
    const t = { ...l };
    delete t.ean;
    expect(cleDeLaLigne("carrefour", t)).toBe(`carrefour|CARREFOUR DRIVE|${l.libelle.toUpperCase()}`);
  });

  test("le même EAN, libellé replié autrement, est reconnu", () => {
    const l = lu.lignes.find((x) => x.ean === "3155251205500")!;
    const appris = new Map([[`ean|${l.ean}`, { cle: `ean|${l.ean}`, ingredient: "beurre", maj: 0 }]]);
    const p = proposer("carrefour-drive", { ...l, libelle: "Beurre Gastronomique Doux" }, appris, candidats);
    expect(p.reconnu).toBe(true);
    expect(p.ingredient).toBe("beurre");
  });

  test("la revue propose « pas pour la cuisine » aux couches, et deux plaquettes de beurre", () => {
    const rs = rangeesDu(lu, new Map(), candidats, catalogue);
    const couches = rs.find((r) => r.libelle.startsWith("Couches-Culottes 9-15kg"))!;
    expect(couches.ingredient).toBeNull();
    expect(couches.ignoree).toBe(true);
    expect(rs.filter((r) => r.ingredient === null)).toHaveLength(5);
    const beurre = lu.lignes.find((x) => x.ean === "3155251205500")!;
    expect(quantiteDe(beurre, "beurre", catalogue).unites).toBe(2);
  });
});
