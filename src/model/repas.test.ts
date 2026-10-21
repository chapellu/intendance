// T142 — les trois autres repas : le midi pris au dîner, les routines
// rejouées, la fournée proposée.

import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { phraseDeFournee, phraseDuMidi } from "../ecrans/repas.vue";
import { calculer } from "./calcul";
import { lireCatalogue } from "./catalogue";
import { creerJeu } from "./jeu";
import { contexte, rejouer, type Evenement } from "./journal";
import {
  evenementsDesRoutines,
  fourneeAProposer,
  fruitsMurs,
  midiDeDemain,
  partsDuMidi,
  platDuSoir,
  prisesDesRoutines,
  RESTE_DE_LA_VEILLE,
  SEUIL_FOURNEE,
} from "./repas";
import { restesApresTable } from "./restes";
import type { Catalogue, Plat } from "./types";

const catalogue: Catalogue = lireCatalogue(JSON.parse(readFileSync("public/cuisine-data.json", "utf8")));
const plat = (id: string): Plat => catalogue.plats.find((p) => p.id === id)!;
const LUNDI = new Date(2026, 9, 26, 15, 0, 0);
const jeuDuLundi = () => {
  const j = creerJeu(catalogue, 7, LUNDI);
  j.stock = [];
  return j;
};
const libres = (n: number) => new Map([["boites-hermetiques", n], ["sacs-congelation", 20]]);

describe("le déjeuner de demain, pris au dîner de ce soir", () => {
  test("un midi du foyer fait trois parts : les adultes à la leur, les enfants à une demi", () => {
    expect(partsDuMidi(catalogue.foyer)).toBe(3);
  });

  test("quatre boîtes libres : le dîner s'agrandit de trois parts, rangées dans trois boîtes", () => {
    const m = midiDeDemain(jeuDuLundi(), plat("dahl-lentilles-corail"), libres(4));
    expect(m).toMatchObject({ etat: "oui", parts: 3, boites: 3 });
    expect(phraseDuMidi(m)).toBe("+ le déjeuner de demain, 3 boîtes");
  });

  test("deux boîtes seulement : la carte le dit, et le dîner reste à sa taille", () => {
    const m = midiDeDemain(jeuDuLundi(), plat("dahl-lentilles-corail"), libres(2));
    expect(m).toMatchObject({ etat: "boites-pleines", libres: 2 });
    expect(phraseDuMidi(m)).toBe("Boîtes pleines (2 libres) : ce soir seulement");
    expect(phraseDuMidi(midiDeDemain(jeuDuLundi(), plat("dahl-lentilles-corail"), libres(0)))).toBe(
      "Boîtes pleines : ce soir seulement",
    );
  });

  test("les sacs de congélation ne portent pas un déjeuner", () => {
    const m = midiDeDemain(jeuDuLundi(), plat("dahl-lentilles-corail"), new Map([["boites-hermetiques", 0], ["sacs-congelation", 20]]));
    expect(m.etat).toBe("boites-pleines");
  });

  test("demain midi déjà posé à la main : on n'y touche pas ; posé par un « Je lance ça », si", () => {
    const j = jeuDuLundi();
    const midi = j.creneaux.findIndex((c) => c.jour === 1 && c.repas === "dejeuner");
    j.choix[midi] = "salade-lentilles-amelioree";
    expect(midiDeDemain(j, plat("dahl-lentilles-corail"), libres(4)).etat).toBe("deja-pose");
    j.choix[midi] = RESTE_DE_LA_VEILLE;
    j.deLaVeille![midi] = "soupe-pois-casses-carottes";
    expect(midiDeDemain(j, plat("dahl-lentilles-corail"), libres(4)).etat).toBe("oui");
  });

  test("« Reste réchauffé » ne se prolonge pas en midi", () => {
    expect(midiDeDemain(jeuDuLundi(), plat(RESTE_DE_LA_VEILLE), libres(4)).etat).toBe("non");
  });

  test("un plat sans reste déclaré gagne le reste du midi ; un plat qui en déclare un le grossit", () => {
    const sans = plat("tortilla-pommes-de-terre-haricots-verts");
    const avec = platDuSoir(sans, 3);
    if (!sans.emits.some((e) => e.kind === "reste-plat")) {
      expect(avec.emits.at(-1)).toMatchObject({ kind: "reste-plat", band: "3-repas", midi: true });
      const r = restesApresTable(avec, 1, catalogue.foyer.parts, catalogue.foyer);
      expect(r.at(-1)?.repas).toBe(3);
    }
    const dahl = plat("dahl-lentilles-corail");
    expect(platDuSoir(dahl, 3)).toBe(dahl);
    const ceSoirSeul = restesApresTable(dahl, 1, catalogue.foyer.parts, catalogue.foyer)[0]!;
    const avecMidi = restesApresTable(dahl, (catalogue.foyer.parts + 3) / dahl.portions, catalogue.foyer.parts, catalogue.foyer)[0]!;
    expect(avecMidi.repas).toBeGreaterThanOrEqual(ceSoirSeul.repas);
  });

  test("au calcul, le reste du dîner agrandi couvre « Reste réchauffé » demain midi", () => {
    const j = jeuDuLundi();
    const soir = j.creneaux.findIndex((c) => c.jour === 0 && c.repas === "diner");
    const midi = j.creneaux.findIndex((c) => c.jour === 1 && c.repas === "dejeuner");
    const choix = [...j.choix];
    choix[soir] = "tortilla-pommes-de-terre-haricots-verts";
    choix[midi] = RESTE_DE_LA_VEILLE;
    j.parts[soir] = catalogue.foyer.parts + 3;
    expect(calculer(j, choix).chaine.some((c) => c.creneau === midi)).toBe(
      plat("tortilla-pommes-de-terre-haricots-verts").emits.some((e) => e.kind === "reste-plat"),
    );
    j.midi![soir] = 3;
    expect(calculer(j, choix).chaine.some((c) => c.creneau === midi)).toBe(true);
  });
});

describe("les routines se rejouent, chaque jour", () => {
  const depuis = catalogue.creneaux.routines!.depuis;
  const lendemain = (() => {
    const d = new Date(`${depuis}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().slice(0, 10);
  })();
  const courses: Evenement = {
    sorte: "entree", jour: depuis, saisi: depuis, maj: 1,
    lignes: [
      { ingredient: "yaourt-nature", unites: 3, parUnite: { amount: 4, unit: "pot" }, zone: null, etat: "frais" },
      { ingredient: "lait-croissance", unites: 6, parUnite: { amount: 1000, unit: "ml" }, zone: null, etat: "conserve" },
    ],
  };

  test("deux rations par jour depuis `depuis`, rien avant", () => {
    expect(evenementsDesRoutines(catalogue, lendemain)).toHaveLength(4);
    expect(evenementsDesRoutines(catalogue, "2026-10-01")).toEqual([]);
    expect(new Set(evenementsDesRoutines(catalogue, lendemain).map((e) => e.plat))).toEqual(
      new Set(["petit-dejeuner-des-enfants", "gouter-des-enfants"]),
    );
  });

  test("deux jours de goûters et de petits-déjeuners : 8 yaourts en moins, et le lait descend", () => {
    const r = rejouer(catalogue, [courses], contexte(catalogue), lendemain);
    expect(r.parIngredient.get("yaourt-nature")?.unites).toBe(1);
    // Le lait se retire à la quantité (une brique ouverte devient un reste,
    // T135) : on vérifie qu'il descend, jour après jour, sans l'arithmétique
    // interne de la brique entamée.
    const veille = rejouer(catalogue, [courses], contexte(catalogue), "2026-10-20");
    expect(veille.parIngredient.get("lait-croissance")?.grammes).toBe(6000);
    expect(r.parIngredient.get("lait-croissance")!.grammes!).toBeLessThan(6000);
    expect(r.retraits.filter((x) => x.ingredient === "lait-croissance")).toHaveLength(4);
  });

  test("une ration n'est pas un doute : elle ne fait pas redemander « des yaourts ? »", () => {
    const r = rejouer(catalogue, [courses], contexte(catalogue), lendemain);
    expect(r.parIngredient.get("yaourt-nature")?.depuisVu).toBe(0);
  });

  test("le goûter prend une part par jour au dépôt, le lot le plus ancien d'abord", () => {
    const gouter = catalogue.creneaux.routines!.liste.filter((x) => x.repas === "gouter");
    const lots = [
      { id: 1, type: "banana-bread", band: "3-repas", born: "2026-10-20", location: "congelo" },
      { id: 2, type: "compote-maison", band: "3-repas", born: "2026-10-18", location: "congelo" },
      { id: 3, type: "sauce-bolognaise", band: "2-repas", born: "2026-10-01", location: "congelo" },
    ];
    const prises = prisesDesRoutines(gouter, lots, ["2026-10-21", "2026-10-22", "2026-10-23", "2026-10-24"]);
    expect(prises).toEqual(
      expect.arrayContaining([
        { id: 2, band: null },
        { id: 1, band: "2-repas" },
      ]),
    );
    expect(prises.find((p) => p.id === 3)).toBeUndefined();
  });

  test("un jour sans lot ne prend rien, et un lot né demain n'est pas mangé hier", () => {
    const gouter = catalogue.creneaux.routines!.liste.filter((x) => x.repas === "gouter");
    expect(prisesDesRoutines(gouter, [], ["2026-10-21"])).toEqual([]);
    const futur = [{ id: 9, type: "cookies-avoine", band: "3-repas", born: "2026-10-25" }];
    expect(prisesDesRoutines(gouter, futur, ["2026-10-21", "2026-10-22"])).toEqual([]);
  });
});

describe("la fournée, proposée à la pause", () => {
  const congelo = (type: string, band: string) => ({ type, qty_band: band, location: "congelo" as const, born: "2026-10-20" });
  const ici = new Set(["farine-complete", "oeufs", "beurre", "sucre-complet", "flocons-avoine", "poudre-a-lever", "banane", "lait"]);

  test("le congélateur vide de goûters : une fournée, le moins d'achats d'abord", () => {
    const f = fourneeAProposer(catalogue, [], [], ici)!;
    expect(f.raison).toBe("stock-bas");
    expect(f.manque).toEqual([]);
    expect(phraseDeFournee(f)).toMatch(/^Fournée : .+ — plus de goûter au congélo$/);
  });

  test("à achats égaux, Chioca d'abord", () => {
    const tout = new Set(catalogue.plats.flatMap((p) => p.ingredients.map((i) => catalogue.rayons.aliases[i.id] ?? i.id)));
    expect(fourneeAProposer(catalogue, [], [], tout)!.plat.source?.auteur).toMatch(/Chioca/);
  });

  test(`${SEUIL_FOURNEE} goûters au congélateur et rien qui passe : pas de fournée`, () => {
    expect(fourneeAProposer(catalogue, [congelo("banana-bread", "3-repas")], [], ici)).toBeNull();
  });

  test("des bananes qui passent : le banana bread, même avec le congélateur plein", () => {
    const f = fourneeAProposer(catalogue, [congelo("cookies-avoine", "3-repas"), congelo("compote-maison", "3-repas")], ["banane"], ici)!;
    expect(f).toMatchObject({ raison: "fruits-murs", fruits: ["banane"] });
    expect(f.plat.id).toBe("banana-bread-avoine");
    expect(phraseDeFournee(f)).toContain("les bananes sont mûres");
  });

  test("une banane rentrée il y a quatre jours passe ; rentrée hier, non", () => {
    const entree = (jour: string): Evenement => ({
      sorte: "entree", jour, saisi: jour, maj: 1,
      // Deux mains de cinq : le porridge en prend une par matin (la routine).
      lignes: [{ ingredient: "banane", unites: 2, parUnite: { amount: 5, unit: "pièce" }, zone: null, etat: "frais" }],
    });
    const r4 = rejouer(catalogue, [entree("2026-10-22")], contexte(catalogue), "2026-10-26");
    expect(fruitsMurs(catalogue, r4, "2026-10-26")).toContain("banane");
    const r1 = rejouer(catalogue, [entree("2026-10-25")], contexte(catalogue), "2026-10-26");
    expect(fruitsMurs(catalogue, r1, "2026-10-26")).not.toContain("banane");
  });

  test("les portions d'une fournée partent en sachets de congélation, pas en boîtes", async () => {
    const { vueDeLaSortie } = await import("../ecrans/sortie.vue");
    const p = plat("banana-bread-avoine");
    const v = vueDeLaSortie(p, catalogue.foyer.parts, 1, catalogue.foyer, [], true);
    const auCongelo = v.lots.filter((l) => l.location === "congelo");
    for (const l of auCongelo) expect(l.boites.map((b) => b.label)).toEqual(["sacs congélation"]);
  });
});

describe("le fond et le stock de T142", () => {
  test("`jusqua` chiffre la ligne : sous six boîtes de tomates, on remonte à dix", async () => {
    const { sousLeurPlancher } = await import("./plancherGardeManger");
    const r = rejouer(catalogue, [], contexte(catalogue), "2026-10-26");
    const l = sousLeurPlancher(catalogue, r, [{ ingredient: "tomates-pelees", niveau: 6 }])[0]!;
    expect(l).toMatchObject({ niveau: 6, manque: 10 - l.a, fond: true });
  });

  test("le frais de la semaine se dit tel quel sur la liste", async () => {
    const { sousLeurPlancher } = await import("./plancherGardeManger");
    const { phraseDuPlancher } = await import("../ecrans/courses.vue");
    const r = rejouer(catalogue, [], contexte(catalogue), "2026-10-26");
    const l = sousLeurPlancher(catalogue, r, [{ ingredient: "yaourt-nature", niveau: 3 }])[0]!;
    expect(l.hebdo).toBe(true);
    expect(phraseDuPlancher(l, 0)).toContain("frais de la semaine");
  });

  test("l'industriel du relevé : au stock, dit « à ne pas racheter », jamais proposé", async () => {
    const { posables, industriels } = await import("./plancherGardeManger");
    const { zones } = await import("../ecrans/stock.vue");
    const r = rejouer(catalogue, [], contexte(catalogue), "2026-10-26");
    const tags = ["biscottes", "chocolat-poudre", "cocktail-fruits", "cracotte", "pate-a-tartiner", "sauce-bolognaise-bocal"];
    expect([...industriels(catalogue)].sort()).toEqual(tags);
    const ids = new Set(posables(catalogue, r).map((p) => p.ingredient));
    for (const id of tags) expect(ids.has(id)).toBe(false);
    const dessus = zones(catalogue.gardeManger).find((z) => z.id === "dessus-etagere")!;
    expect(dessus.denrees.find((d) => d.ingredient === "biscottes")?.industriel).toBe("industriel — à ne pas racheter");
    expect(catalogue.fond.denrees.map((d) => d.ingredient)).not.toContain("gnocchis");
  });
});

describe("les lignes calmes du cockpit", () => {
  test("le goûter dit la fournée du congélateur ; le midi dit le reste d'hier", async () => {
    const { lignesDuJour } = await import("../ecrans/repas.vue");
    const j = jeuDuLundi();
    j.stock = [{ type: "banana-bread", kind: "reste-plat", qty: null, qty_band: "3-repas", born: "2026-10-20", location: "congelo" }];
    const midi = j.creneaux.findIndex((c) => c.jour === 0 && c.repas === "dejeuner");
    j.choix[midi] = RESTE_DE_LA_VEILLE;
    j.deLaVeille![midi] = "dahl-lentilles-corail";
    const l = lignesDuJour(j, null);
    expect(l.find((x) => x.cle === "gouter")?.texte).toBe("Goûter : banana bread (congélo, 3 restants), yaourt, fruit");
    expect(l.find((x) => x.cle === "dejeuner")?.texte).toBe(`Midi : le reste de ${plat("dahl-lentilles-corail").titre}`);
    expect(l.find((x) => x.cle === "petit-dejeuner")?.texte).toBe("Petit-déj : porridge, yaourt, fruit — plus de pain maison");
  });
});
