// T142 — les trois autres repas : le midi pris au dîner, les routines
// rejouées, la fournée proposée.

import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { lignesDuJour, phraseDeFournee, phraseDuMidi } from "../ecrans/repas.vue";
import { contenantsLibres } from "../ecrans/sortie.vue";
import type { LotInitial } from "./depot";
import { goutersAvantCourses, JOURS_DE_COURSES, type PropositionDuSoir } from "./pause";
import { fruitsDeLaSemaine } from "./plancherGardeManger";
import { calculer } from "./calcul";
import { lireCatalogue } from "./catalogue";
import { creerJeu } from "./jeu";
import { contexte, rejouer, type Evenement } from "./journal";
import {
  dejeunerDuStock,
  estUneFournee,
  evenementsDesRoutines,
  fourneeAProposer,
  fruitsAuDelaDuGouter,
  lotsEnBoites,
  midisDuFrigo,
  resteDuFrigoAuMidi,
  matinsDePain,
  midisPasses,
  fruitsMurs,
  midiDeDemain,
  partsDuMidi,
  platDuSoir,
  portionsParBoite,
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

  test("quatre boîtes libres : le dîner s'agrandit de trois parts, rangées dans deux boîtes", () => {
    const m = midiDeDemain(jeuDuLundi(), plat("dahl-lentilles-corail"), libres(4));
    expect(m).toMatchObject({ etat: "oui", parts: 3, boites: 2 });
    expect(phraseDuMidi(m)).toBe("+ le déjeuner de demain, 2 boîtes");
  });

  test("T145 — une boîte de 0,8 L porte deux parts adultes : deux boîtes libres suffisent au midi", () => {
    const ikea = catalogue.foyer.contenants.find((c) => c.id === "boites-hermetiques")!;
    expect(portionsParBoite(ikea)).toBe(2);
    expect(portionsParBoite({ portions: 1, volumeMl: null })).toBe(1);
    expect(midiDeDemain(jeuDuLundi(), plat("dahl-lentilles-corail"), libres(2))).toMatchObject({ etat: "oui", boites: 2 });
  });

  test("une boîte seulement : la carte le dit, et le dîner reste à sa taille", () => {
    const m = midiDeDemain(jeuDuLundi(), plat("dahl-lentilles-corail"), libres(1));
    expect(m).toMatchObject({ etat: "boites-pleines", libres: 1 });
    expect(phraseDuMidi(m)).toBe("Boîtes pleines (1 libre) : ce soir seulement");
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
  // Du pain pour trois matins : la fournée de ces tests est celle du goûter.
  const pain = congelo("pain-de-mie-maison", "3-repas");

  test("le congélateur vide de goûters : une fournée, le moins d'achats d'abord", () => {
    const f = fourneeAProposer(catalogue, [pain], [], ici)!;
    expect(f.raison).toBe("stock-bas");
    expect(f.manque).toEqual([]);
    expect(phraseDeFournee(f)).toMatch(/^Fournée : .+ — plus de goûter au congélo$/);
  });

  test("à achats égaux, Chioca d'abord", () => {
    const tout = new Set(catalogue.plats.flatMap((p) => p.ingredients.map((i) => catalogue.rayons.aliases[i.id] ?? i.id)));
    expect(fourneeAProposer(catalogue, [pain], [], tout)!.plat.source?.auteur).toMatch(/Chioca/);
  });

  // T149 — L'ANNÉE SIMULÉE N° 10 : 143 GOÛTERS SANS POMME. La compote (1 kg)
  // se lançait dès qu'il y avait une pomme, et le sachet de la semaine
  // n'allait plus jusqu'aux courses suivantes.
  test("T149 — la pomme du goûter passe avant la compote", () => {
    const pommes = new Set(["pommes", "eau"]);
    const compote = (auDela: Map<string, number>) => {
      const f = fourneeAProposer(catalogue, [pain], ["pommes"], pommes, new Set(), false, auDela);
      return f?.plat.id === "compote-pommes-poires" ? f : null;
    };
    // 1,4 kg au placard, quatre goûters à servir d'ici samedi : 800 g de trop
    // ne font pas le kilo de la compote — elle demande des fruits.
    expect(compote(new Map([["pommes", 1400 - 4 * 150]]))?.manque ?? ["autre fournée"]).not.toEqual([]);
    // 1,9 kg : la compote se fait de ce qui dépasse.
    expect(compote(new Map([["pommes", 1900 - 4 * 150]]))).toMatchObject({ manque: [] });
  });

  test("T149 — la réserve du goûter : une pomme de 150 g par goûter d'ici les courses", () => {
    const e = { sorte: "entree" as const, jour: "2026-10-24", saisi: "2026-10-24", maj: 1,
      lignes: [{ ingredient: "pommes", unites: 1, parUnite: { amount: 1500, unit: "g" }, zone: null, etat: "frais" as const }] };
    // Un sachet de 1,5 kg rentré samedi, trois goûters servis (sam., dim., lun.).
    const r = rejouer(catalogue, [e], contexte(catalogue), "2026-10-26");
    expect(r.parIngredient.get("pommes")?.grammes).toBe(1500 - 3 * 150);
    // Lundi : lundi et mardi avant les courses du mercredi.
    expect(goutersAvantCourses(["lundi"], JOURS_DE_COURSES)).toBe(2);
    expect(goutersAvantCourses(["samedi"], JOURS_DE_COURSES)).toBe(4);
    expect(fruitsAuDelaDuGouter(catalogue, r, 2).get("pommes")).toBe(1050 - 300);
  });

  test(`${SEUIL_FOURNEE} goûters au congélateur et rien qui passe : pas de fournée`, () => {
    expect(fourneeAProposer(catalogue, [pain, congelo("banana-bread", "3-repas")], [], ici)).toBeNull();
  });

  test("des bananes qui passent : le banana bread, même avec le congélateur plein", () => {
    const f = fourneeAProposer(catalogue, [pain, congelo("cookies-avoine", "3-repas"), congelo("compote-maison", "3-repas")], ["banane"], ici)!;
    expect(f).toMatchObject({ raison: "fruits-murs", fruits: ["banane"] });
    expect(f.plat.id).toBe("banana-bread-avoine");
    expect(phraseDeFournee(f)).toContain("les bananes sont mûres");
  });

  test("T146 — une banane rentrée il y a cinq jours passe ; il y a quatre, non", () => {
    const entree = (jour: string): Evenement => ({
      sorte: "entree", jour, saisi: jour, maj: 1,
      // Deux mains de cinq : le porridge en prend une par matin (la routine).
      lignes: [{ ingredient: "banane", unites: 2, parUnite: { amount: 5, unit: "pièce" }, zone: null, etat: "frais" }],
    });
    const r4 = rejouer(catalogue, [entree("2026-10-21")], contexte(catalogue), "2026-10-26");
    expect(fruitsMurs(catalogue, r4, "2026-10-26")).toContain("banane");
    const r1 = rejouer(catalogue, [entree("2026-10-23")], contexte(catalogue), "2026-10-26");
    expect(fruitsMurs(catalogue, r1, "2026-10-26")).not.toContain("banane");
    // Rachetée entre-temps : la coupe a été renouvelée, rien ne passe.
    const r2 = rejouer(catalogue, [entree("2026-10-20"), entree("2026-10-24")], contexte(catalogue), "2026-10-26");
    expect(fruitsMurs(catalogue, r2, "2026-10-26")).not.toContain("banane");
  });

  test("T146 — sans besoin de goûters, le fruit mûr ne relance pas la fournée déjà au congélo ni celle de la semaine", () => {
    const plein = [pain, congelo("cookies-avoine", "3-repas"), congelo("banana-bread", "2-repas")];
    // Le banana bread est déjà au congélo : les bananes mûres n'en relancent pas un.
    expect(fourneeAProposer(catalogue, plein, ["banane"], ici)).toBeNull();
    // Compote faite avant-hier : les poires mûres attendent.
    const tout = new Set(catalogue.plats.flatMap((p) => p.ingredients.map((i) => catalogue.rayons.aliases[i.id] ?? i.id)));
    const sansCompote = [pain, congelo("cookies-avoine", "3-repas")];
    const auxPoires = catalogue.plats.filter((p) => estUneFournee(catalogue, p) && p.ingredients.some((i) => i.id === "poires")).map((p) => p.id);
    expect(fourneeAProposer(catalogue, sansCompote, ["poires"], tout)?.raison).toBe("fruits-murs");
    expect(fourneeAProposer(catalogue, sansCompote, ["poires"], tout, new Set(["compote-pommes-poires"]))?.plat.id).not.toBe("compote-pommes-poires");
    expect(fourneeAProposer(catalogue, sansCompote, ["poires"], tout, new Set(auxPoires))).toBeNull();
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

/* ═══════════════════════════════════════ T144 — ce que l'année simulée a vu */

describe("T144 — les boîtes libres ne comptent que les restes vivants en boîte", () => {
  const reste = (type: string, band: string, born: string, extra: Partial<LotInitial> = {}): LotInitial => ({
    type, kind: "reste-plat", qty: null, qty_band: band, born, location: "frigo", ...extra,
  });
  const libresDe = (stock: LotInitial[], quand: Date) =>
    contenantsLibres(catalogue.foyer, lotsEnBoites(catalogue, stock, quand)).get("boites-hermetiques");

  test("les sachets de la fournée et du pain ne prennent aucune boîte IKEA", () => {
    const stock: LotInitial[] = [
      { ...reste("banana-bread", "3-repas", "2026-10-24"), location: "congelo" },
      { ...reste("compote-maison", "3-repas", "2026-10-24"), location: "congelo" },
      { type: "pain-de-mie-maison", kind: "base", qty: null, qty_band: "3-repas", born: "2026-10-24", location: "congelo" },
    ];
    // Avant T144, les trois sachets prenaient trois des quatre boîtes ; depuis
    // T148, rien de ce qui dort au congélateur n'en prend une, routine ou pas.
    expect(contenantsLibres(catalogue.foyer, stock).get("boites-hermetiques")).toBe(4);
    expect(libresDe(stock, LUNDI)).toBe(4);
    expect(midiDeDemain(jeuDuLundi(), plat("dahl-lentilles-corail"), contenantsLibres(catalogue.foyer, lotsEnBoites(catalogue, stock, LUNDI))).etat).toBe("oui");
  });

  test("un reste du frigo périmé ne garde pas sa boîte ; un reste vivant, si", () => {
    expect(libresDe([reste("dahl-lentilles-corail", "1-repas", "2026-10-10")], LUNDI)).toBe(4);
    expect(libresDe([reste("dahl-lentilles-corail", "1-repas", "2026-10-25")], LUNDI)).toBe(3);
  });

  test("T145 — la bolognaise (700 g, deux repas) tient une seule boîte de 0,8 L", () => {
    const bolo: LotInitial = { type: "sauce-bolognaise", kind: "base", qty_band: "2-repas", qty: { amount: 700, unit: "g" }, born: "2026-10-25", location: "frigo" };
    expect(libresDe([bolo], LUNDI)).toBe(3);
    expect(midiDeDemain(jeuDuLundi(), plat("dahl-lentilles-corail"), contenantsLibres(catalogue.foyer, lotsEnBoites(catalogue, [bolo], LUNDI))).etat).toBe("oui");
  });

  // T148 — L'ANNÉE SIMULÉE N° 10 : 159 cartes « Boîtes pleines », dont 119 avec
  // deux boîtes libres ou plus au réel. Le 21/10 : la bolognaise du relevé (née
  // le 20/07, au congélo) tenait une boîte, et le houmous de la veille trois ;
  // l'app en voyait cinq occupées sur quatre, la cuisine trois.
  test("T148 — ce qui dort au congélateur ne tient aucune boîte du midi", () => {
    const bolo: LotInitial = { type: "sauce-bolognaise", kind: "base", qty_band: "2-repas", qty: { amount: 700, unit: "g" }, born: "2026-07-20", location: "congelo" };
    const lentilles: LotInitial = { type: "lentilles-vertes-cuites", kind: "base", qty_band: "2-repas", qty: { amount: 300, unit: "g" }, born: "2026-10-20", location: "congelo" };
    const gratin = reste("gratin-pates", "1-repas", "2026-10-25");
    expect(libresDe([bolo, lentilles, gratin], LUNDI)).toBe(3);
    expect(midiDeDemain(jeuDuLundi(), plat("dahl-lentilles-corail"), contenantsLibres(catalogue.foyer, lotsEnBoites(catalogue, [bolo, lentilles, gratin], LUNDI))).etat).toBe("oui");
  });

  test("le midi mis de côté rend ses boîtes une fois le déjeuner passé", () => {
    const midi = reste("dahl-lentilles-corail", "3-repas", "2026-10-25", { midiLe: "2026-10-26", midi: 3 });
    // T145 — trois parts tiennent dans deux boîtes de 0,8 L.
    expect(libresDe([midi], new Date(2026, 9, 26, 11, 0))).toBe(2);
    expect(libresDe([midi], LUNDI)).toBe(4);
    // Un reste qui avait grossi des parts du midi garde ce qui dépasse.
    const gros = reste("dahl-lentilles-corail", "4-repas", "2026-10-25", { midiLe: "2026-10-26", midi: 3 });
    expect(libresDe([gros], LUNDI)).toBe(3);
  });

  test("`midisPasses` : le lot fini, le lot réduit, le midi à venir intact", () => {
    const lots = [
      { id: 1, band: "3-repas", midiLe: "2026-10-26", midi: 3 },
      { id: 2, band: "4-repas", midiLe: "2026-10-25", midi: 3 },
      { id: 3, band: "3-repas", midiLe: "2026-10-27", midi: 3 },
      { id: 4, band: "2-repas" },
    ];
    expect(midisPasses(lots, LUNDI)).toEqual([{ id: 1, band: null }, { id: 2, band: "1-repas" }]);
  });
});

describe("T144 — le midi se classe comme « Ce soir » : le stock d'abord", () => {
  const tout = new Set(catalogue.plats.flatMap((p) => p.ingredients.map((i) => catalogue.rayons.aliases[i.id] ?? i.id)));

  test("tout est là : un midi sans achat", () => {
    const d = dejeunerDuStock(catalogue, tout, 10)!;
    expect(d.plat).not.toBeNull();
    expect(d).toMatchObject({ manque: 0 });
  });

  test("un midi faisable passe devant Chioca ; Chioca ne fait que départager", () => {
    const hors = catalogue.plats.find(
      (p) => p.role === "plat" && p.creneaux.includes("dejeuner") && !/chioca/i.test(p.source?.auteur ?? "") &&
        p.accepts.every((a) => !a.requis) && p.id !== RESTE_DE_LA_VEILLE && p.ingredients.some((i) => !i.base && !i.assaisonnement),
    )!;
    const ici = new Set(hors.ingredients.map((i) => catalogue.rayons.aliases[i.id] ?? i.id));
    const d = dejeunerDuStock(catalogue, ici, 10)!;
    expect(d).toMatchObject({ manque: 0 });
    expect(d.plat).not.toBeNull();
  });

  test("rien de faisable : la ligne le dit, sans recette à six articles", () => {
    expect(dejeunerDuStock(catalogue, new Set(), 10)).toEqual({ plat: null });
    const j = jeuDuLundi();
    const soir = { attend: [], dejeuner: { plat: null }, fournee: null } as unknown as PropositionDuSoir;
    const l = lignesDuJour(j, soir).find((x) => x.cle === "dejeuner")!;
    expect(l.texte).toBe("Midi : rien ne se fait avec le stock — un reste, ou des tartines");
    expect(l.route).toBeUndefined();
  });
});

describe("T144 — le fruit de la semaine", () => {
  const r = () => rejouer(catalogue, [], contexte(catalogue), "2026-10-26");

  test("en octobre : sept bananes et des poires, au frais de la semaine", () => {
    const l = fruitsDeLaSemaine(catalogue, r(), 10);
    const banane = l.find((x) => x.ingredient === "banane")!;
    expect(banane).toMatchObject({ hebdo: true, manque: 7 - banane.a });
    expect(l.some((x) => x.ingredient === "poires")).toBe(true);
  });

  // T149 — au kilo : sous 2 kg la ligne part, et remonte vers 3.
  test("T145 — la pomme du goûter est au frais de la semaine : trois kilos quand il n'y en a plus, en saison", () => {
    const pommes = fruitsDeLaSemaine(catalogue, r(), 10).find((x) => x.ingredient === "pommes");
    expect(pommes).toMatchObject({ hebdo: true, sansPlancher: true, manque: 3 });
    expect(fruitsDeLaSemaine(catalogue, r(), 7).some((x) => x.ingredient === "pommes")).toBe(false);
  });

  test("en juin, les poires se taisent ; la banane, d'import, reste", () => {
    const l = fruitsDeLaSemaine(catalogue, r(), 6).map((x) => x.ingredient);
    expect(l).toContain("banane");
    expect(l).not.toContain("poires");
  });
});

describe("T144 — le pain, puis des goûters qui tournent", () => {
  const congelo = (type: string, band: string) => ({ type, qty_band: band, location: "congelo" as const, born: "2026-10-20" });
  const tout = new Set(catalogue.plats.flatMap((p) => p.ingredients.map((i) => catalogue.rayons.aliases[i.id] ?? i.id)));
  const fond = new Set(["eau", "farine-complete", "levure-boulangere", "oeufs", "beurre", "sucre-complet", "flocons-avoine", "poudre-a-lever", "lait"]);

  test("plus de pain au congélo : la fournée est le pain maison, compté à part des goûters", () => {
    const f = fourneeAProposer(catalogue, [congelo("banana-bread", "3-repas"), congelo("cookies-avoine", "3-repas")], [], fond)!;
    expect(f).toMatchObject({ raison: "pain-bas", restants: 0, manque: [] });
    expect(f.plat.id).toBe("pain-maison-semi-complet");
    expect(phraseDeFournee(f)).toBe("Fournée : Pain maison semi-complet — plus de pain maison");
    expect(matinsDePain(catalogue, [congelo("pain-de-mie-maison", "3-repas")])).toBe(3);
  });

  test("le pain maison part en sachets, deux de trois matins", async () => {
    const { vueDeLaSortie } = await import("../ecrans/sortie.vue");
    const p = plat("pain-maison-semi-complet");
    expect(estUneFournee(catalogue, p)).toBe(true);
    const v = vueDeLaSortie(p, catalogue.foyer.parts, 1, catalogue.foyer, [], true);
    const auCongelo = v.lots.filter((l) => l.location === "congelo");
    expect(auCongelo.reduce((n, l) => n + l.repas, 0)).toBe(6);
    for (const l of auCongelo) expect(l.boites.map((b) => b.label)).toEqual(["sacs congélation"]);
  });

  test("T145 — le pain sous trois matins gagne la fournée, même quand les goûters manquent davantage", () => {
    const pain = congelo("pain-de-mie-maison", "2-repas");
    expect(fourneeAProposer(catalogue, [pain], [], fond)!.raison).toBe("pain-bas");
    expect(fourneeAProposer(catalogue, [pain, congelo("cookies-avoine", "2-repas")], [], fond)!.raison).toBe("pain-bas");
    expect(fourneeAProposer(catalogue, [congelo("pain-de-mie-maison", "3-repas")], [], fond)!.raison).toBe("stock-bas");
  });

  test("T145 — jamais une fournée sans le stock : rien à acheter, ou un seul article du frais de la semaine", () => {
    const pain = congelo("pain-de-mie-maison", "3-repas");
    // Un placard vide : aucune fournée ne se lance.
    expect(fourneeAProposer(catalogue, [pain], [], new Set())).toBeNull();
    // Il ne manque que le fruit de la semaine : la compote se propose.
    const sans = new Set([...tout].filter((x) => x !== "pommes" && x !== "poires"));
    const seule: Catalogue = { ...catalogue, plats: catalogue.plats.filter((p) => p.id === "compote-pommes-poires" || !estUneFournee(catalogue, p)) };
    expect(fourneeAProposer(seule, [pain], [], sans)?.manque).toEqual(["pommes ou poires"]);
    // Le pain sans levure ne se propose pas : on retombe sur un goûter.
    expect(fourneeAProposer(catalogue, [], [], new Set(["eau", "farine-complete"]))?.raison).not.toBe("pain-bas");
    expect(fourneeAProposer(catalogue, [], [], fond)?.raison).toBe("pain-bas");
  });

  test("T145 — la fournée tourne : celle des derniers jours passe après", () => {
    const stock = [congelo("pain-de-mie-maison", "3-repas")];
    const a = fourneeAProposer(catalogue, stock, [], tout)!;
    const b = fourneeAProposer(catalogue, stock, [], tout, new Set([a.plat.id]))!;
    expect(b.plat.id).not.toBe(a.plat.id);
  });

  test("T146 — un jour de courses, la fournée qui manque d'un article passe devant la compote d'hier", () => {
    const tout = new Set(catalogue.plats.flatMap((p) => p.ingredients.map((i) => catalogue.rayons.aliases[i.id] ?? i.id)));
    const sansOeufs = new Set([...tout].filter((x) => x !== "oeufs"));
    const stock = [congelo("pain-de-mie-maison", "3-repas"), congelo("compote-maison", "2-repas")];
    const hier = new Set(["compote-pommes-poires"]);
    // Un autre jour : seule la compote se lance sans achat — elle revient.
    expect(fourneeAProposer(catalogue, stock, [], sansOeufs, hier)?.plat.id).toBe("compote-pommes-poires");
    // Un jour de courses : un gâteau, et la ligne dit ce qu'il faut prendre.
    const f = fourneeAProposer(catalogue, stock, [], sansOeufs, hier, true)!;
    expect(f.plat.id).not.toBe("compote-pommes-poires");
    expect(f.manque).toHaveLength(1);
  });

  test("la compote déjà au congélo : la fournée suivante est un gâteau, même pommes et poires mûres", () => {
    const stock = [congelo("pain-de-mie-maison", "3-repas"), congelo("compote-maison", "2-repas")];
    const f = fourneeAProposer(catalogue, stock, ["pommes", "poires"], tout)!;
    expect(f.plat.id).not.toBe("compote-pommes-poires");
    expect(f.plat.emits.some((e) => e.type === "compote-maison")).toBe(false);
    // Et sans compote au congélo, les fruits mûrs la ramènent.
    const g = fourneeAProposer(catalogue, [congelo("pain-de-mie-maison", "3-repas"), congelo("banana-bread", "2-repas")], ["pommes"], tout)!;
    expect(g.plat.id).toBe("compote-pommes-poires");
  });

  test("la compote se fait de ce qu'on a : « pommes ou poires », jamais le mauvais fruit", () => {
    // Un catalogue où la compote est la seule fournée du goûter : on lit sa phrase.
    const seule: Catalogue = {
      ...catalogue,
      plats: catalogue.plats.filter((p) => p.id === "compote-pommes-poires" || !estUneFournee(catalogue, p) || p.id === "pain-maison-semi-complet"),
    };
    const sans = new Set([...tout].filter((x) => x !== "pommes" && x !== "poires"));
    const manque = (ici: ReadonlySet<string>) => fourneeAProposer(seule, [congelo("pain-de-mie-maison", "3-repas")], [], ici)!.manque;
    expect(manque(sans)).toEqual(["pommes ou poires"]);
    expect(manque(new Set([...sans, "pommes"]))).toEqual([]);
    expect(manque(new Set([...sans, "poires"]))).toEqual([]);
  });
});

test("T144 — la ligne du fruit de la semaine ne parle pas de plancher", async () => {
  const { phraseDuPlancher } = await import("../ecrans/courses.vue");
  const l = fruitsDeLaSemaine(catalogue, rejouer(catalogue, [], contexte(catalogue), "2026-10-26"), 10).find((x) => x.ingredient === "banane")!;
  expect(phraseDuPlancher(l, 0)).toMatch(/^frais de la semaine · il en reste \d/);
});

describe("T146 — le midi sans geste et le reste qu'il prend", () => {
  const l = (o: Record<string, unknown>) => ({ type: "curry-pois-chiches", kind: "reste-plat", band: "4-repas", born: "2026-10-24", location: "frigo", ...o });
  test("le plus ancien reste du frigo né avant le jour — ni une routine, ni un midi prévu, ni le congélo", () => {
    const stock = [
      l({ type: "compote-maison", born: "2026-10-20" }),
      l({ type: "dahl", born: "2026-10-21", location: "congelo" }),
      l({ type: "hachis", born: "2026-10-22", midiLe: "2026-10-26" }),
      l({ type: "soupe", born: "2026-10-26" }),
      l({ type: "curry", born: "2026-10-23" }),
    ];
    expect(resteDuFrigoAuMidi(catalogue, stock, "2026-10-26")?.type).toBe("curry");
  });
  test("un midi passé prend ses parts au prorata ; un midi cuisiné ou prévu, rien", () => {
    const stock = [{ id: 1, ...l({}) }];
    const p = partsDuMidi(catalogue.foyer);
    expect(midisDuFrigo(catalogue, stock, ["2026-10-25"], new Set(), new Set())).toEqual([{ id: 1, band: `${4 - p}-repas` }]);
    expect(midisDuFrigo(catalogue, stock, ["2026-10-25"], new Set(["2026-10-25"]), new Set())).toEqual([]);
    expect(midisDuFrigo(catalogue, stock, ["2026-10-25"], new Set(), new Set(["2026-10-25"]))).toEqual([]);
    expect(midisDuFrigo(catalogue, stock, ["2026-10-25", "2026-10-26"], new Set(), new Set())).toEqual([{ id: 1, band: null }]);
  });
});
