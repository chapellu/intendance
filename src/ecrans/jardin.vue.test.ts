// Ce que la facette jardin montre, par promesse.

import { describe, expect, test } from "vitest";
import { cellule } from "../model/terrasse";
import { decale, entree, vueDeLaCellule, vueDeLaTerrasse } from "./jardin.vue";

const LE_24_SEPTEMBRE = new Date(2026, 8, 24);
const vue = (id: string, d = LE_24_SEPTEMBRE) => vueDeLaCellule(cellule(id)!, d);

describe("l'ordre des verdicts répond à la question qu'on a posée", () => {
  test("ce qui répond OUI passe devant, même quand sa récolte est moins belle", () => {
    // La carotte du carré A est « attendre mars, BELLE récolte » ; le kale est
    // « agir, récolte correcte ». Trier par bande mettrait en tête une culture
    // qu'on ne peut pas planter aujourd'hui — on n'ouvre pas une cellule pour
    // savoir ce qui y pousserait bien dans six mois.
    const v = vue("bac2-a");
    const noms = v.verdicts.map((x) => x.culture.nom);
    expect(noms.indexOf("Chou kale")).toBeLessThan(noms.indexOf("Carotte"));
    expect(v.verdicts[0]!.statut === "prete" || v.verdicts[0]!.statut === "agir").toBe(true);
  });

  test("à statut égal, la meilleure bande passe devant", () => {
    const ouverts = vue("bac2-a").verdicts.filter((x) => x.statut === "agir");
    const bandes = ouverts.map((x) => x.bande);
    expect(bandes).toEqual([...bandes].sort());
  });
});

describe("la carte dit l'état d'une cellule en un mot", () => {
  test("un bac de mobilier est « permanent », jamais « occupée »", () => {
    // « Occupée » ferait espérer qu'il se libère. Le lilas ne se libère pas.
    expect(vue("bac1").etat).toBe("permanent");
    expect(vue("bac2-a").etat).toBe("occupée");
    expect(vue("pot-1").etat).toBe("libre");
  });

  test("une cellule qui n'a rien à offrir n'annonce aucun chiffre", () => {
    // Même règle qu'au cockpit : un zéro donne une chose de plus à lire pour
    // n'en dire aucune.
    expect(vue("bac1").ouvertes).toBe(0);
    expect(vue("bac2-a").ouvertes).toBeGreaterThan(0);
  });
});

describe("l'horizon est un curseur, pas un écran de plus", () => {
  test("la même cellule, une autre date, d'autres verdicts", () => {
    // La mâche se met en place jusqu'au 30 septembre. Deux semaines plus tard,
    // ce n'est plus un arbitrage avec les tomates, c'est une année à attendre.
    const mache = (d: Date) => vue("bac2-a", d).verdicts.find((x) => x.culture.id === "mache")!;
    expect(mache(LE_24_SEPTEMBRE).statut).toBe("agir");
    expect(mache(decale(LE_24_SEPTEMBRE, 14)).statut).toBe("attendre");
  });

  test("`decale` traverse les mois sans les compter à la main", () => {
    expect(decale(LE_24_SEPTEMBRE, 14).getMonth()).toBe(9);
  });
});

describe("la phrase d'accueil compte des emplacements, pas des cultures", () => {
  test("elle compte les cellules qui peuvent recevoir quelque chose", () => {
    // Un jardinier devant sa terrasse compte des emplacements libres, pas des
    // lignes de catalogue : cinq cellules, pas trente-deux verdicts.
    const vues = vueDeLaTerrasse(LE_24_SEPTEMBRE);
    const ouvertes = vues.filter((v) => v.ouvertes > 0).length;
    expect(entree(vues)).toBe(`${ouvertes} cellules peuvent recevoir quelque chose aujourd'hui.`);
  });

  test("zéro se dit en toutes lettres, jamais « 0 cellules »", () => {
    expect(entree([])).toBe("Rien ne peut entrer dans la terrasse aujourd'hui.");
  });
});
