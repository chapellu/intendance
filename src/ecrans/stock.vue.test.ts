import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, test } from "vitest";
import { calculer } from "../model/calcul";
import { lireCatalogue } from "../model/catalogue";
import { creerJeu, type Jeu } from "../model/jeu";
import type { Catalogue, Denree, Zone } from "../model/types";
import { contexte, rejouer, type Evenement } from "../model/journal";
import {
  agressions, categories, espaces, fiabilite, gardeManger, lots, vueDeLInventaire,
  vueDesPlanchers, vueDesPlanchersDenrees, zones,
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
    expect(lots(jeu, c.depot, null, LUNDI)[0]?.quantite).toBe("2-repas");
  });
});

describe("les rangements", () => {
  test("le compte annoncé est celui de la liste qu'il ouvre", () => {
    // La correction du proto : il comptait les lots vivants et listait aussi
    // les mangés. Les deux nombres se disent, et leur somme est la liste.
    poser(0, "diner", "pates-bolognaise");
    const c = calculer(jeu);
    for (const cat of categories(c.depot.lignes)) {
      const dedans = lots(jeu, c.depot, cat.espace, LUNDI);
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
    const vus = lots(jeu, calculer(jeu).depot, null, LUNDI);
    expect(vus.find((l) => l.nom === "sauce-bolognaise" && l.ref === "42")).toBeTruthy();
    expect(vus.filter((l) => l.ref === null).length).toBeGreaterThan(0);
  });

  test("un lot entamé dit ce qu'il en reste, un lot fini dit qu'il est mangé", () => {
    // Les pâtes du lundi entament le bocal du congélo : 500 g pris sur 700.
    poser(0, "diner", "pates-bolognaise");
    const vus = lots(jeu, calculer(jeu).depot, null, LUNDI);
    const bocal = vus.find((l) => l.nom === "sauce-bolognaise");
    expect(bocal?.ou).toContain("reste 200 g");
    expect(bocal?.ou).toContain("Congélo");
    expect(bocal?.ou).toContain("déjà là avant la semaine");
    expect(bocal?.epuise).toBe(false);
  });

  test("un lot cuisiné cette semaine nomme le plat, pas son identifiant", () => {
    poser(0, "diner", "sauce-bolognaise");
    const vus = lots(jeu, calculer(jeu).depot, null, LUNDI);
    const titre = catalogue.plats.find((p) => p.id === "sauce-bolognaise")?.titre;
    expect(vus.some((l) => l.ou.includes(`cuisiné cette semaine (${titre})`))).toBe(true);
  });

  test("le filtre ne montre qu'un rangement", () => {
    const depot = calculer(jeu).depot;
    const congelo = lots(jeu, depot, "congelo", LUNDI);
    expect(congelo.length).toBeGreaterThan(0);
    expect(congelo.every((l) => l.espace === "congelo")).toBe(true);
    expect(congelo.length).toBeLessThan(lots(jeu, depot, null, LUNDI).length);
  });

  test("deux lots ne partagent jamais une clé", () => {
    poser(0, "diner", "sauce-bolognaise");
    poser(1, "diner", "pates-bolognaise");
    const cles = lots(jeu, calculer(jeu).depot, null, LUNDI).map((l) => l.cle);
    expect(new Set(cles).size).toBe(cles.length);
  });

  // T58, la moitié visible de « frigo dur, congélateur mou ».
  test("un bocal congelé au-delà du forfait le DIT, et reste servi", () => {
    jeu.stock = [
      { type: "sauce-bolognaise", kind: "base", qty: { amount: 700, unit: "g" }, qty_band: "2-repas", born: "2026-01-05", location: "congelo", ref: "7" },
    ];
    const vu = lots(jeu, calculer(jeu).depot, null, LUNDI).find((l) => l.ref === "7");
    expect(vu?.horloge).toContain("au-delà des 90 prévus");
    // Il le DIT sans sortir du jeu : c'est toute la différence avec le frigo.
    expect(vu?.epuise).toBe(false);
    poser(0, "diner", "pates-bolognaise");
    expect(calculer(jeu).chaine).toHaveLength(1);
  });

  test("un bocal congelé dans son forfait n'a rien à dire", () => {
    // L'horloge ne parle que quand elle a quelque chose à dire : une phrase
    // affichée en permanence ne se distingue plus le jour où elle compte —
    // c'est la leçon de « dégager une étagère » en T15.
    jeu.stock = [
      { type: "sauce-bolognaise", kind: "base", qty: { amount: 700, unit: "g" }, qty_band: "2-repas", born: "2026-08-10", location: "congelo", ref: "7" },
    ];
    expect(lots(jeu, calculer(jeu).depot, null, LUNDI).find((l) => l.ref === "7")?.horloge).toBe("");
  });

  test("un reste de frigo périmé n'a pas de phrase : il n'est plus là", () => {
    // FRIGO DUR. Il sort du jeu en silence, et c'est le bon comportement pour
    // une question de sécurité — il n'y a rien à proposer sur un lot qu'on ne
    // propose plus.
    jeu.stock = [
      { type: "carcasse-volaille", kind: "base", qty: { amount: 1, unit: "pièce" }, qty_band: "1-repas", born: "2026-08-10", location: "frigo", ref: "9" },
    ];
    expect(lots(jeu, calculer(jeu).depot, null, LUNDI).find((l) => l.ref === "9")?.horloge).toBe("");
    poser(0, "diner", "soupe-de-poule");
    expect(calculer(jeu).chaine).toHaveLength(0);
  });
});

/* ═════════════════════════ T57 — un axe, deux mots ══════════════════════ */

describe("les deux mots de l'axe", () => {
  /**
   * Le seul lot du dépôt, né il y a `ilYA` jours.
   *
   * ⚠ IL EN PARAÎT UN DE PLUS, ET C'EST VOULU. `LUNDI` est à midi tandis qu'une
   * date de naissance se lit à minuit : un lot né il y a n jours en compte n+0,5,
   * arrondis à n+1. Le décalage est antérieur à ce ticket ; les nombres
   * ci-dessous sont donc choisis pour tomber franchement d'un côté d'un seuil,
   * jamais dessus.
   */
  const ne = (type: string, ilYA: number, location: "frigo" | "congelo", ref: string) => {
    const d = new Date(LUNDI);
    d.setDate(d.getDate() - ilYA);
    jeu.stock = [
      {
        type, kind: "base", qty: { amount: 700, unit: "g" },
        qty_band: "2-repas", born: d.toISOString().slice(0, 10), location, ref,
      },
    ];
    return lots(jeu, calculer(jeu).depot, null, LUNDI).find((l) => l.ref === ref);
  };

  /** Forfait congélateur : 90 j. Seuils à J+45 et J+72. */
  const congele = (ilYA: number) => ne("sauce-bolognaise", ilYA, "congelo", "7");

  /** La carcasse tient DEUX jours au frigo, pas les quatre du foyer (T54). */
  const carcasse = (ilYA: number) => ne("carcasse-volaille", ilYA, "frigo", "9")?.marque;

  test("un lot frais ne porte AUCUNE marque, et c'est le troisième point", () => {
    // L'absence de marque EST l'état frais, comme *Fresh* n'a pas de préfixe
    // dans Don't Starve. Un mot pour dire « tout va bien » serait affiché sur la
    // quasi-totalité du dépôt en permanence, et ne se remarquerait plus.
    expect(congele(10)?.marque).toBe("");
  });

  test("à mi-vie il passe « à manger »", () => {
    expect(congele(43)?.marque).toBe("");
    expect(congele(46)?.marque).toBe("à manger");
  });

  test("aux quatre cinquièmes il passe « urgent »", () => {
    expect(congele(70)?.marque).toBe("à manger");
    expect(congele(72)?.marque).toBe("urgent");
  });

  test("un congelé au-delà du forfait reste « urgent » et ne monte pas plus haut", () => {
    // La fraction plafonne à 1 (T58) : sans ce plafond un bocal oublié
    // grimperait sans fin, et il n'y a de toute façon pas de mot au-dessus
    // d'« urgent ». CONGÉLATEUR MOU : il dépasse, il reste sur l'axe.
    expect(congele(245)?.marque).toBe("urgent");
    // La marque dit OÙ IL EN EST, la phrase dit POURQUOI IL EST ENCORE LÀ.
    // Elles ne se remplacent pas.
    expect(congele(245)?.horloge).toContain("encore bon à jouer");
  });

  test("LA MARQUE ET LA PHRASE NE PARLENT PAS DU MÊME LOT", () => {
    // C'est ce qui justifie qu'elles coexistent. `horloge` est réservée au
    // congelé dépassé — un seul cas, rare. La marque porte sur tout lot encore
    // en jeu, y compris ceux qui vont bien.
    const vu = congele(60);
    expect(vu?.marque).toBe("à manger");
    expect(vu?.horloge).toBe("");
  });

  test("la même échelle vaut au frigo, sur une fenêtre quarante-cinq fois plus courte", () => {
    // TOUT STOCK A UNE HORLOGE, TOUTES LES HORLOGES SE LISENT SUR LE MÊME AXE.
    // La carcasse tient deux jours : elle franchit les DEUX seuils dans sa
    // première journée. C'est précisément pourquoi on affiche deux mots et
    // aucune jauge — un pourcentage serait ici faux à la décimale près, alors
    // que le franchissement, lui, se dit.
    expect(carcasse(0)).toBe("à manger");
    expect(carcasse(1)).toBe("urgent");
  });

  test("FRIGO DUR : passé sa fenêtre, il ne dit plus rien du tout", () => {
    // « urgent » veut dire « mange-le maintenant ». L'écrire sur un reste de
    // frigo périmé inviterait à cuisiner ce que le modèle vient justement de
    // refuser de proposer, pour une question de sécurité. Silence, comme la
    // phrase de T58 — et à l'inverse exact du congelé dépassé, qui reste marqué
    // parce qu'il reste servi.
    expect(carcasse(2)).toBe("");
    poser(0, "diner", "soupe-de-poule");
    expect(calculer(jeu).chaine).toHaveLength(0);
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
  urgence: "basse",
  nature: "autre",
  usage: null,
  conservations: [],
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
  zones({ releve: "2026-08-26", zones: [zoneTest(z)], denrees, alertes: [] })[0]!;

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
    const vue = gardeManger(catalogue);
    expect(vue.denrees).toBe(catalogue.gardeManger.denrees.length);
    expect(vue.pesees).toBeGreaterThan(0);
    expect(vue.pesees).toBeLessThan(vue.denrees);
  });

  test("le volume mesuré ignore les zones non cotées, sans les cacher", () => {
    const vue = gardeManger(catalogue);
    const cotees = catalogue.gardeManger.zones.filter((z) => z.volumeL != null);
    expect(cotees.length).toBeLessThan(vue.zones.length);
    expect(vue.volume).not.toBe("");
  });

  test("les alertes du relevé remontent jusqu'à la vue", () => {
    // Le couple pommes de terre / oignons est la seule perte ACTIVE du relevé :
    // s'il cessait d'être signalé, l'écran mentirait par omission.
    const vue = gardeManger(catalogue);
    expect(
      vue.alertes.some((a) => a.includes("pomme de terre") && a.includes("voisiner")),
    ).toBe(true);
  });

  test("ce qui se corrige d'un seul geste tient sur une seule alerte", () => {
    // LE REGROUPEMENT EST LA MOITIÉ DE L'INTÉRÊT DE CET ÉCRAN. Sans lui le
    // relevé produit sept lignes pour trois problèmes — les pignons comptent
    // double, et le sous-évier répète « humide » sous quatre légumes qu'on
    // sortira du même mouvement. Une liste de sept ne se lit pas.
    const vue = gardeManger(catalogue);
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

/* ═══════════════ les planchers, vus depuis « L'inventaire » — T34 à T38 ═══ */

const cuisine = (plat: string, jour: string): Evenement => ({
  sorte: "cuisine", jour, saisi: jour, maj: Date.parse(jour), repas: "diner", plat, parts: 2.5,
});

describe("ce qu'on veut toujours avoir", () => {
  test("une base neuve ne montre aucun plancher, et n'en propose aucun", () => {
    // DÉMARRAGE À FROID : ZÉRO PLANCHER. L'écran dit quand même l'état du stock
    // d'urgence, parce que celui-là ne se décide pas — il vient du catalogue.
    const vue = vueDesPlanchers(jeu, calculer(jeu), new Map(), []);
    expect(vue.poses).toEqual([]);
    expect(vue.propositions).toEqual([]);
    expect(vue.secours).toContain("portion");
  });

  test("l'amorce est sous le plancher de secours, et l'écran le dit", () => {
    // Un seul bocal au congélo : deux portions, un type. C'est exactement le
    // cas que `congelateur.plancher` décrit depuis le prototype.
    const vue = vueDesPlanchers(jeu, calculer(jeu), new Map(), []);
    expect(vue.sous).toBe(true);
  });

  test("un plancher posé dit ce qu'il y a, ce qu'on veut, et ce qui le recharge", () => {
    const vue = vueDesPlanchers(jeu, calculer(jeu), new Map([["sauce-bolognaise", 4]]), []);
    const p = vue.poses.find((x) => x.type === "sauce-bolognaise")!;
    expect(p.a).toBe(2);
    expect(p.niveau).toBe(4);
    expect(p.sous).toBe(true);
    expect(p.population).toBe("apport");
    expect(p.plats.length).toBeGreaterThan(0);
  });

  test("un plancher tenu ne demande rien, et passe derrière ceux qui manquent", () => {
    const vue = vueDesPlanchers(
      jeu,
      calculer(jeu),
      new Map([["sauce-bolognaise", 1], ["lasagnes", 2]]),
      [],
    );
    expect(vue.poses.find((x) => x.type === "sauce-bolognaise")!.sous).toBe(false);
    expect(vue.poses[0]!.sous).toBe(true);
  });

  test("un refus ne s'affiche pas et ne se repropose pas", () => {
    // « Non merci » est une décision, pas un silence : sans elle, la même
    // proposition revient à chaque ouverture de l'écran.
    const plat = catalogue.plats.find((p) => p.emits.some((e) => e.type === "sauce-bolognaise"))!;
    const evts = [cuisine(plat.id, "2026-08-10"), cuisine(plat.id, "2026-08-17")];
    const decisions = new Map<string, number | null>([["sauce-bolognaise", null]]);
    const vue = vueDesPlanchers(jeu, calculer(jeu), decisions, evts);
    expect(vue.poses.some((x) => x.type === "sauce-bolognaise")).toBe(false);
    expect(vue.propositions.some((x) => x.type === "sauce-bolognaise")).toBe(false);
  });

  test("deux cuissons proposent un plancher, et montrent ce qui le recharge", () => {
    const plat = catalogue.plats.find((p) => p.emits.some((e) => e.type === "sauce-bolognaise"))!;
    const evts = [cuisine(plat.id, "2026-08-10"), cuisine(plat.id, "2026-08-17")];
    const vue = vueDesPlanchers(jeu, calculer(jeu), new Map(), evts);
    const prop = vue.propositions.find((x) => x.type === "sauce-bolognaise")!;
    expect(prop.niveau).toBe(1);
    expect(prop.cuissons).toBe(2);
    expect(prop.plats).toContain(plat.titre);
  });

  test("un congélateur qui a de la place ne raconte pas qu'il est plein", () => {
    expect(vueDesPlanchers(jeu, calculer(jeu), new Map(), []).plein).toBe("");
  });
});

/* ══════ les planchers du garde-manger, vus depuis « L'inventaire » — T39 ═══ */

describe("ce qu'on veut toujours avoir, au placard", () => {
  const placard = () => rejouer(catalogue, [], contexte(catalogue), "2026-09-07");

  test("une base neuve n'en montre aucun, et l'app n'en propose AUCUN", () => {
    // L'ÉCART ASSUMÉ AVEC LE CONGÉLATEUR. Là-bas le journal des cuissons permet
    // à l'app d'ouvrir la bouche la première ; ici la seule chose qu'elle sache
    // est combien il en reste, ce qui ne dit rien de combien on en VEUT.
    // Proposer « en garder 1 » sur les 41 denrées comptables inventerait 41
    // habitudes. T45 rouvrira le dossier avec la mesure qui le permet.
    const vue = vueDesPlanchersDenrees(catalogue, placard(), []);
    expect(vue.poses).toEqual([]);
    expect(vue.manquent).toBe("");
    expect(vue.libres.length).toBeGreaterThan(0);
  });

  test("un plancher posé dit ce qu'il y a et ce qu'on veut, en unités", () => {
    const vue = vueDesPlanchersDenrees(catalogue, placard(), [{ ingredient: "mais", niveau: 6 }]);
    const p = vue.poses.find((x) => x.ingredient === "mais")!;
    expect(p.a).toBe(4);
    expect(p.niveau).toBe(6);
    expect(p.sous).toBe(true);
    expect(vue.manquent).toContain("2 à racheter");
  });

  test("un plancher tenu ne demande rien, et passe derrière ceux qui manquent", () => {
    const vue = vueDesPlanchersDenrees(catalogue, placard(), [
      { ingredient: "mais", niveau: 2 },
      { ingredient: "graines-courge", niveau: 3 },
    ]);
    expect(vue.poses.find((x) => x.ingredient === "mais")!.sous).toBe(false);
    expect(vue.poses[0]!.sous).toBe(true);
    expect(vue.manquent).toContain("1 denrée");
  });

  test("ce qui porte déjà un plancher ne se repropose pas", () => {
    const vue = vueDesPlanchersDenrees(catalogue, placard(), [{ ingredient: "mais", niveau: 2 }]);
    expect(vue.libres.some((p) => p.ingredient === "mais")).toBe(false);
  });

  test("l'apéro se dit, parce que rien d'autre ne le dirait", () => {
    // Ces six denrées ne sont citées par aucune recette : hors de cette ligne,
    // elles n'ont aucune raison lisible d'être dans une liste de courses.
    const vue = vueDesPlanchersDenrees(catalogue, placard(), [
      { ingredient: "graines-courge", niveau: 2 },
    ]);
    expect(vue.poses[0]!.usage).toBe("pour l’apéro");
  });

  test("ce qui ne peut pas porter de plancher est NOMMÉ, avec sa raison", () => {
    // T46 — un placard où quatre denrées n'offrent pas le bouton, sans un mot,
    // ressemble à une panne. Et la raison est la partie intéressante.
    const vue = vueDesPlanchersDenrees(catalogue, placard(), []);
    expect(vue.ecartes).toContain("oignon");
    expect(vue.ecartes).toContain("s’estiment pas");
    expect(vue.libres.some((p) => p.ingredient === "oignon")).toBe(false);
  });

  test("un plancher qui a survécu à sa denrée se dit « jamais vu »", () => {
    const vue = vueDesPlanchersDenrees(catalogue, placard(), [
      { ingredient: "denree-imaginaire", niveau: 1 },
    ]);
    expect(vue.poses[0]!.fiabilite).toBe("jamais vu");
    expect(vue.poses[0]!.a).toBe(0);
  });
});
