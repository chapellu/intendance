import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, test } from "vitest";
import { calculer } from "../model/calcul";
import { lireCatalogue } from "../model/catalogue";
import { creerJeu, type Jeu } from "../model/jeu";
import type { Catalogue, Denree, Zone } from "../model/types";
import {
  agressions, categories, espaces, fiabilite, gardeManger, lots, vueDeLInventaire, zones,
} from "./stock.vue";

const LUNDI = new Date("2026-08-17T12:00:00Z");
const catalogue: Catalogue = lireCatalogue(
  JSON.parse(readFileSync("public/cuisine-data.json", "utf8")) as unknown,
);

let jeu: Jeu;
beforeEach(() => {
  jeu = creerJeu(catalogue, 7, LUNDI);
});

const creneau = (jour: number, repas: string): number => {
  const i = jeu.creneaux.findIndex((c) => c.jour === jour && c.repas === repas);
  if (i < 0) throw new Error(`pas de créneau ${repas} le jour ${jour}`);
  return i;
};

const poser = (jour: number, repas: string, rid: string) => {
  jeu.choix[creneau(jour, repas)] = rid;
};

describe("d'où vient un chiffre", () => {
  test("l'export a pesé : compté", () => {
    const c = calculer(jeu);
    const bocal = c.depot.lignes.find((l) => l.type === "sauce-bolognaise");
    expect(fiabilite(bocal!)).toMatchObject({ label: "compté", niveau: "haute" });
  });

  test("la semaine a cuisiné : estimé, même quand la quantité existe", () => {
    // C'est le point de l'ordre des tests dans `fiabilite`. Le lot de sauce du
    // lundi PORTE une quantité — 1400 g — mais c'est un facteur d'échelle
    // multiplié par une recette, pas une balance. Le dire « compté » ferait
    // croire que quelqu'un l'a vu.
    poser(0, "diner", "sauce-bolognaise");
    const c = calculer(jeu);
    const lot = c.depot.lignes.find((l) => l.from === "sauce-bolognaise");
    expect(lot?.qty?.amount).toBeGreaterThan(0);
    expect(fiabilite(lot!)).toMatchObject({ label: "estimé", niveau: "moyenne" });
  });

  test("rien à compter : en bloc, et sans classe à colorer", () => {
    // Un lot constaté sans être pesé — ce que la base permet et que le
    // catalogue ne permettait pas (voir `LotInitial`).
    jeu.stock = [
      { type: "gratin-restant", kind: "reste-plat", qty: null, qty_band: "2-repas", born: "2026-08-16", location: "frigo" },
    ];
    const c = calculer(jeu);
    const l = c.depot.lignes[0]!;
    expect(fiabilite(l)).toMatchObject({ label: "en bloc", classe: "", niveau: "basse" });
    // Et la quantité affichée retombe sur la bande de repas, pas sur « — ».
    expect(lots(jeu, c.depot.lignes, null)[0]?.quantite).toBe("2-repas");
  });
});

describe("les rangements", () => {
  test("le compte annoncé est celui de la liste qu'il ouvre", () => {
    // La correction du proto : il comptait les lots vivants et listait aussi
    // les mangés. Les deux nombres se disent, et leur somme est la liste.
    poser(0, "diner", "pates-bolognaise");
    const c = calculer(jeu);
    for (const cat of categories(c.depot.lignes)) {
      const dedans = lots(jeu, c.depot.lignes, cat.espace);
      expect(cat.vivants + cat.manges).toBe(dedans.length);
      expect(cat.manges).toBe(dedans.filter((l) => l.epuise).length);
    }
  });

  test("un seul chiffre douteux fait douter du rangement", () => {
    jeu.stock = [
      { type: "sauce-bolognaise", kind: "base", qty: { amount: 700, unit: "g" }, qty_band: "2-repas", born: "2026-08-16", location: "placard" },
      { type: "bocal-mystere", kind: "base", qty: null, qty_band: "1-repas", born: "2026-08-16", location: "placard" },
    ];
    const cats = categories(calculer(jeu).depot.lignes);
    expect(cats.find((c) => c.espace === "placard")?.conf).toBe("basse");
  });

  test("la jauge sature à quatre barres — c'est un niveau, pas un compte", () => {
    jeu.stock = Array.from({ length: 7 }, (_, i) => ({
      type: `bocal-${i}`,
      kind: "base" as const,
      qty: { amount: 100, unit: "g" },
      qty_band: "1-repas",
      born: "2026-08-16",
      location: "placard" as const,
    }));
    const cat = categories(calculer(jeu).depot.lignes).find((c) => c.espace === "placard");
    expect(cat?.vivants).toBe(7);
    expect(cat?.barres).toBe(4);
  });

  test("un rangement vide ne s'affiche pas", () => {
    jeu.stock = [];
    // Une semaine sans plat ne produit rien : les trois rangements sont vides.
    expect(categories(calculer(jeu).depot.lignes)).toHaveLength(0);
  });
});

describe("les deux plafonds", () => {
  test("celui qui commande est celui que le modèle désigne", () => {
    const vues = espaces(calculer(jeu).stockage);
    for (const v of vues) {
      const commande = v.plafonds.filter((p) => p.commande);
      expect(commande).toHaveLength(1);
    }
    // Le catalogue actuel fait mordre les étagères partout.
    expect(vues.map((v) => v.plafonds.find((p) => p.commande)?.nom)).toEqual([
      "étagères", "étagères", "étagères",
    ]);
  });

  test("aucun geste tant qu'il reste de la place", () => {
    // La correction du proto : il écrivait « dégager une étagère » sous les
    // trois rangements en permanence, débordement ou pas.
    expect(espaces(calculer(jeu).stockage).every((v) => v.geste === "")).toBe(true);
  });

  test("ça déborde : le geste paraît, et il nomme le plafond qui mord", () => {
    // Vingt lots au placard pour un plafond de vingt places, plus un.
    jeu.stock = Array.from({ length: 21 }, (_, i) => ({
      type: `bocal-${i}`,
      kind: "base" as const,
      qty: { amount: 100, unit: "g" },
      qty_band: "1-repas",
      born: "2026-08-16",
      location: "placard" as const,
    }));
    const placard = espaces(calculer(jeu).stockage).find((v) => v.espace === "placard");
    expect(placard?.deborde).toBe(true);
    expect(placard?.geste).toBe("⚠ ça déborde — dégager une étagère");
    // Une jauge ne descend pas sous zéro et ne dépasse pas cent.
    for (const p of placard!.plafonds) {
      expect(p.libres).toBeGreaterThanOrEqual(0);
      expect(p.part).toBeLessThanOrEqual(100);
    }
  });

  test("au plus juste : on prévient avant que ça déborde", () => {
    jeu.stock = Array.from({ length: 20 }, (_, i) => ({
      type: `bocal-${i}`,
      kind: "base" as const,
      qty: { amount: 100, unit: "g" },
      qty_band: "1-repas",
      born: "2026-08-16",
      location: "placard" as const,
    }));
    const placard = espaces(calculer(jeu).stockage).find((v) => v.espace === "placard");
    expect(placard?.deborde).toBe(false);
    expect(placard?.geste).toBe("au plus juste — dégager une étagère");
  });
});

describe("les lots", () => {
  test("un lot constaté porte sa clé de base, un lot cuisiné n'en a pas", () => {
    jeu.stock = [
      { type: "sauce-bolognaise", kind: "base", qty: { amount: 700, unit: "g" }, qty_band: "2-repas", born: "2026-08-16", location: "congelo", ref: "42" },
    ];
    poser(0, "diner", "sauce-bolognaise");
    const vus = lots(jeu, calculer(jeu).depot.lignes, null);
    expect(vus.find((l) => l.nom === "sauce-bolognaise" && l.ref === "42")).toBeTruthy();
    expect(vus.filter((l) => l.ref === null).length).toBeGreaterThan(0);
  });

  test("un lot entamé dit ce qu'il en reste, un lot fini dit qu'il est mangé", () => {
    // Les pâtes du lundi entament le bocal du congélo : 500 g pris sur 700.
    poser(0, "diner", "pates-bolognaise");
    const vus = lots(jeu, calculer(jeu).depot.lignes, null);
    const bocal = vus.find((l) => l.nom === "sauce-bolognaise");
    expect(bocal?.ou).toContain("reste 200 g");
    expect(bocal?.ou).toContain("Congélo");
    expect(bocal?.ou).toContain("déjà là avant la semaine");
    expect(bocal?.epuise).toBe(false);
  });

  test("un lot cuisiné cette semaine nomme le plat, pas son identifiant", () => {
    poser(0, "diner", "sauce-bolognaise");
    const vus = lots(jeu, calculer(jeu).depot.lignes, null);
    const titre = catalogue.plats.find((p) => p.id === "sauce-bolognaise")?.titre;
    expect(vus.some((l) => l.ou.includes(`cuisiné cette semaine (${titre})`))).toBe(true);
  });

  test("le filtre ne montre qu'un rangement", () => {
    const lignes = calculer(jeu).depot.lignes;
    const congelo = lots(jeu, lignes, "congelo");
    expect(congelo.length).toBeGreaterThan(0);
    expect(congelo.every((l) => l.espace === "congelo")).toBe(true);
    expect(congelo.length).toBeLessThan(lots(jeu, lignes, null).length);
  });

  test("deux lots ne partagent jamais une clé", () => {
    poser(0, "diner", "sauce-bolognaise");
    poser(1, "diner", "pates-bolognaise");
    const cles = lots(jeu, calculer(jeu).depot.lignes, null).map((l) => l.cle);
    expect(new Set(cles).size).toBe(cles.length);
  });
});

describe("la vue entière", () => {
  test("un filtre qui ne montre plus rien se relâche tout seul", () => {
    // Le dernier lot du congélo retiré : le bouton disparaît, et l'écran ne
    // doit pas rester coincé sur une catégorie qu'il n'offre plus.
    jeu.stock = catalogue.stock.filter((o) => o.location !== "congelo");
    const vue = vueDeLInventaire(jeu, calculer(jeu), "congelo");
    expect(vue.filtre).toBeNull();
    expect(vue.nomDuFiltre).toBeNull();
    expect(vue.lots.length).toBe(calculer(jeu).depot.lignes.length);
  });

  test("un filtre qui a du contenu tient", () => {
    const vue = vueDeLInventaire(jeu, calculer(jeu), "congelo");
    expect(vue.filtre).toBe("congelo");
    expect(vue.nomDuFiltre).toBe("Congélo");
  });

  test("on compte ce dont le foyer répond, pas ce que la semaine produit", () => {
    poser(0, "diner", "sauce-bolognaise");
    jeu.stock = catalogue.stock.map((o, i) => ({ ...o, ref: String(i + 1) }));
    const vue = vueDeLInventaire(jeu, calculer(jeu), null);
    expect(vue.constates).toBe(catalogue.stock.length);
    expect(vue.lots.length).toBeGreaterThan(vue.constates);
  });
});

/* ───────────────────────────────────────────────────────── le garde-manger */

const zoneTest = (p: Partial<Zone> = {}): Zone => ({
  id: "z",
  label: "une zone",
  espace: "placard",
  niveaux: 1,
  dimensions: { largeur_cm: 40, profondeur_cm: 30, hauteur_cm: 20 },
  forme: "rectangle",
  volumeL: 24,
  exposition: "sombre",
  hygrometrie: "sec",
  chaleur: false,
  note: null,
  ...p,
});

const denreeTest = (p: Partial<Denree> = {}): Denree => ({
  ingredient: "farine",
  zone: "z",
  unites: 1,
  parUnite: { amount: 1000, unit: "g" },
  poidsG: 1000,
  etat: "sec",
  sensible: [],
  incompatibles: [],
  note: null,
  ...p,
});

describe("ce que la zone fait subir à la denrée", () => {
  test("une sensibilité que la zone ne contredit pas ne se dit pas", () => {
    // C'EST LA RÈGLE QUI FAIT QUE L'AVERTISSEMENT COMPTE. Écrire « craint
    // l'humidité » sous chaque paquet de biscottes rangé au sec produirait un
    // écran où l'alerte est le décor, et le jour où elle mord elle ne se
    // distinguerait plus.
    const d = denreeTest({ sensible: ["humidite"] });
    expect(agressions(d, zoneTest({ hygrometrie: "sec" }))).toEqual([]);
    expect(agressions(d, zoneTest({ hygrometrie: "humide" }))).toEqual(["à l’humidité"]);
  });

  test("plusieurs agressions se cumulent", () => {
    const d = denreeTest({ sensible: ["lumiere", "chaleur"] });
    expect(agressions(d, zoneTest({ exposition: "jour", chaleur: true }))).toHaveLength(2);
  });

  test("les pignons de pin du relevé sont bien signalés", () => {
    // Le cas réel, contre les vraies données : sachet gras, en pleine lumière,
    // à côté de la bouilloire.
    const gm = catalogue.gardeManger;
    const pignons = gm.denrees.find((d) => d.ingredient === "pignons-pin");
    const z = gm.zones.find((x) => x.id === pignons!.zone);
    expect(agressions(pignons!, z!)).toEqual(["à la lumière", "près d’une source de chaleur"]);
  });
});

/** Une zone et ce qu'elle porte, vues. Le `!` est sûr : `zones()` rend une vue
 *  par zone, et on lui en donne exactement une. */
const uneZone = (denrees: Denree[], z: Partial<Zone> = {}) =>
  zones({ zones: [zoneTest(z)], denrees, alertes: [] })[0]!;

const SANS_COTES = { largeur_cm: null, profondeur_cm: null, hauteur_cm: null };

describe("les rangements", () => {
  test("une denrée non pesée dit son compte, pas un tiret", () => {
    // « 1 » est une information — celle qu'on a. « — » ferait croire à un trou.
    const z = uneZone([denreeTest({ parUnite: null, poidsG: null })]);
    expect(z.denrees[0]!.quantite).toBe("1");
  });

  test("plusieurs unités se disent en facteur, jamais en total", () => {
    // Quatre boîtes de maïs sont quatre boîtes : on en ouvre une à la fois, et
    // « 1 140 g » ne se range pas dans un placard.
    const z = uneZone([denreeTest({ unites: 4, parUnite: { amount: 285, unit: "g" }, poidsG: 1140 })]);
    expect(z.denrees[0]!.quantite).toBe("4 × 285 g");
  });

  test("le poids d'une zone additionne ce qui est pesé, et l'écrit en kilos", () => {
    const z = uneZone([
      denreeTest({ poidsG: 4000 }),
      denreeTest({ poidsG: 1000 }),
      denreeTest({ poidsG: null }),
    ]);
    expect(z.poidsG).toBe(5000);
    expect(z.poids).toBe("5 kg");
  });

  test("une zone sans cotes n'annonce pas de volume", () => {
    const z = uneZone([], { volumeL: null, dimensions: SANS_COTES });
    expect(z.volume).toBe("");
    expect(z.cotes).toBe("non mesurée");
  });

  test("une hauteur libre se dit, elle ne s'invente pas", () => {
    const z = uneZone([], {
      volumeL: null,
      dimensions: { largeur_cm: 42, profondeur_cm: 30, hauteur_cm: null },
    });
    expect(z.cotes).toBe("42 × 30 cm · hauteur libre");
  });

  test("l'ordre est celui du relevé, pas un tri", () => {
    // On retrouve une étagère par le tour qu'on fait de sa cuisine, jamais par
    // son volume.
    const ids = zones(catalogue.gardeManger).map((z) => z.id);
    expect(ids).toEqual(catalogue.gardeManger.zones.map((z) => z.id));
  });
});

describe("le garde-manger entier", () => {
  test("il compte ses denrées et distingue celles qui sont pesées", () => {
    const vue = gardeManger(catalogue.gardeManger);
    expect(vue.denrees).toBe(catalogue.gardeManger.denrees.length);
    expect(vue.pesees).toBeGreaterThan(0);
    expect(vue.pesees).toBeLessThan(vue.denrees);
  });

  test("le volume mesuré ignore les zones non cotées, sans les cacher", () => {
    const vue = gardeManger(catalogue.gardeManger);
    const cotees = catalogue.gardeManger.zones.filter((z) => z.volumeL != null);
    expect(cotees.length).toBeLessThan(vue.zones.length);
    expect(vue.volume).not.toBe("");
  });

  test("les alertes du relevé remontent jusqu'à la vue", () => {
    // Le couple pommes de terre / oignons est la seule perte ACTIVE du relevé :
    // s'il cessait d'être signalé, l'écran mentirait par omission.
    const vue = gardeManger(catalogue.gardeManger);
    expect(
      vue.alertes.some((a) => a.includes("pomme de terre") && a.includes("voisiner")),
    ).toBe(true);
  });

  test("ce qui se corrige d'un seul geste tient sur une seule alerte", () => {
    // LE REGROUPEMENT EST LA MOITIÉ DE L'INTÉRÊT DE CET ÉCRAN. Sans lui le
    // relevé produit sept lignes pour trois problèmes — les pignons comptent
    // double, et le sous-évier répète « humide » sous quatre légumes qu'on
    // sortira du même mouvement. Une liste de sept ne se lit pas.
    const vue = gardeManger(catalogue.gardeManger);
    expect(vue.alertes.length).toBeLessThanOrEqual(4);
    const humide = vue.alertes.find((a) => a.includes("endroit humide"));
    expect(humide).toContain("pomme de terre");
    expect(humide).toContain("ail");
  });

  test("la vue de l'inventaire porte le garde-manger", () => {
    const vue = vueDeLInventaire(jeu, calculer(jeu), null);
    expect(vue.gardeManger.zones.length).toBe(catalogue.gardeManger.zones.length);
  });
});
