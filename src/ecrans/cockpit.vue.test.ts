import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, test } from "vitest";
import { cleArticle, type EtatCourse } from "../db";
import { articles, calculer, type Calcul } from "../model/calcul";
import { lireCatalogue } from "../model/catalogue";
import { creerJeu, SAUTE, type Jeu } from "../model/jeu";
import { contexte, rejouer } from "../model/journal";
import { proposerCeSoir } from "../model/pause";
import { PASSE_VIDE } from "../model/questions";
import type { Savoir } from "../model/scoring";
import type { Catalogue } from "../model/types";
import { JOURS_VISIBLES } from "../nav/jours";
import { eteint } from "../nav/routes";
import { aFaire, detailDesCourses, resumeCuisine, resumeSansJours, typeDuGeste, vueDuCockpit } from "./cockpit.vue";
import { vueAPrevoir } from "./prevoir.vue";

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

/** La vue, avec une base qui n'a rien à dire — c'est l'état d'un lundi neuf. */
const vue = (courses: Map<string, EtatCourse> = new Map(), gesteFait = false) =>
  vueDuCockpit(jeu, calculer(jeu), { courses, gesteFait });

const cles = (c: Calcul): string[] =>
  articles(c.panier).map((a) => cleArticle(a.id, a.unit));

/** Toute la liste marquée d'un coup — on ne coche pas douze articles à la main
 *  pour vérifier une phrase. */
const marquer = (c: Calcul, patch: Partial<EtatCourse>, combien = Infinity) =>
  new Map(
    cles(c)
      .slice(0, combien)
      .map((cle) => [cle, { cle, coche: false, rentre: false, maj: 0, ...patch }]),
  );

describe("ce qui vous attend aujourd'hui", () => {
  test("le jardin ne produit jamais de tâche — il n'a pas de modèle", () => {
    poser(0, "diner", "lasagnes");
    // Le proto en tirait trois de `data.js`. Aucune n'est calculée, aucune ne
    // se coche : une tâche qu'on ne peut pas finir revient tous les jours.
    expect(vue().taches.every((t) => t.facette === "Cuisine")).toBe(true);
  });

  test("un dîner de ce soir non posé est la première chose de la liste", () => {
    const t = vue().taches[0]!;
    expect(t.cle).toBe("ce-soir");
    // Elle ouvre le créneau NOMMÉ, pas un index : un lien gardé sur le
    // téléphone doit rouvrir le bon soir. Voir `nav/routes.ts`.
    expect(t.route).toEqual({
      ecran: "poser",
      creneau: { jour: "2026-08-17", repas: "diner" },
    });
  });

  test("« on ne mange pas là » est une réponse : la tâche s'en va", () => {
    jeu.choix[creneau(0, "diner")] = SAUTE;
    expect(vue().taches.find((t) => t.cle === "ce-soir")).toBeUndefined();
  });
});

/* ══════════════════════════ T129 — le cockpit dit la vérité sur le stock */

describe("T129 — la ligne « Ce soir » nomme le plat, et ce qui attend", () => {
  const A_15H = new Date("2026-08-17T15:00:00");
  const avecProposition = (cuisines: ReadonlySet<string> = new Set()) => {
    const rejeu = rejouer(catalogue, [], contexte(catalogue), "2026-08-17");
    const savoir: Savoir = { rejeu, passe: PASSE_VIDE, cuisinesRecemment: new Set(), planchers: [] };
    const soir = proposerCeSoir({ jeu, savoir, recents: new Set(), maintenant: A_15H });
    return { soir, vue: vueDuCockpit(jeu, calculer(jeu), { courses: new Map(), gesteFait: false, soir, cuisines }) };
  };

  test("plus jamais « Rien n'est posé » : le meilleur plat de 15 h, et un bouton pour le lancer", () => {
    // Trois portions d'un plat au congélateur, jeunes : elles ne pressent pas,
    // mais elles attendent — et l'année simulée ne les a jamais vues nommées.
    jeu.stock = [
      { type: "curry-pois-chiches", kind: "reste-plat", qty: null, qty_band: "3-repas", born: "2026-08-10", location: "congelo", ref: "7" },
    ];
    const { soir, vue: v } = avecProposition();
    const t = v.taches.find((x) => x.cle === "ce-soir")!;
    expect(t.titre).toBe(`Ce soir : ${soir.cartes[0]!.plat.titre}`);
    expect(t.detail).not.toMatch(/Rien n'est posé/);
    expect(t.detail).toMatch(/3 repas de curry pois chiches au congélo/);
    expect(t.route).toEqual({ ecran: "ce-soir" });
    expect(t.lancer).toBe(soir.cartes[0]!.plat.id);
  });

  test("un dîner posé et pas encore fait se rappelle, avec l'heure où le lancer", () => {
    poser(0, "diner", "lentilles-mijotees");
    const t = avecProposition().vue.taches.find((x) => x.cle === "ce-soir")!;
    expect(t.titre).toBe(`Ce soir : ${jeu.plats["lentilles-mijotees"]!.titre}`);
    expect(t.detail).toMatch(/^posé — à lancer avant \d+h\d\d/);
    expect(t.route).toEqual({ ecran: "cuisiner", creneau: { jour: "2026-08-17", repas: "diner" } });
  });

  test("la carte de la facette compte ce que la cuisine PEUT ce soir, pas le plan qu'on n'a pas fait", () => {
    const { soir, vue: v } = avecProposition();
    const libres = [...soir.cartes, ...soir.plus].filter((c) => c.manque.length === 0).length;
    expect(v.cuisine.resume).not.toMatch(/Rien n'est posé/);
    expect(v.cuisine.resume).toBe(resumeSansJours(0, soir));
    if (libres > 1) expect(v.cuisine.resume).toBe(`Ce soir, ${libres} dîners se font sans rien acheter.`);
  });

  test("un dîner déjà cuisiné ne réclame plus rien", () => {
    poser(0, "diner", "lentilles-mijotees");
    const { vue: v } = avecProposition(new Set(["2026-08-17|diner"]));
    expect(v.taches.find((x) => x.cle === "ce-soir")).toBeUndefined();
  });
  test("un bloc qui demande la veille fait le geste du jour : « à sortir ce soir pour demain »", () => {
    jeu.stock = [
      { type: "lasagnes", kind: "reste-plat", qty: null, qty_band: "3-repas", born: "2026-08-10", location: "congelo", ref: "8" },
    ];
    const { soir, vue: v } = avecProposition();
    expect(soir.aSortir.map((a) => a.lot.type)).toEqual(["lasagnes"]);
    const t = v.taches.find((x) => x.cle.startsWith("geste|"))!;
    expect(t.titre).toBe("Sortir lasagnes du congélo");
    expect(t.detail).toMatch(/^Pour demain/);
    // Il se coche sur place, sous la clé que le hook lit (`typeDuGeste`).
    expect(t.cocher).toBe("geste|2026-08-17|lasagnes");
    expect(typeDuGeste(null, soir)).toBe("lasagnes");
    // La ligne « Ce soir » ne le répète pas dans ce qui attend.
    expect(v.taches.find((x) => x.cle === "ce-soir")!.detail).not.toMatch(/lasagnes/);
  });

  test("le geste d'un plat posé demain passe devant celui de la proposition", () => {
    jeu.stock = [
      { type: "lasagnes", kind: "reste-plat", qty: null, qty_band: "3-repas", born: "2026-08-10", location: "congelo", ref: "8" },
    ];
    const { soir } = avecProposition();
    expect(typeDuGeste({ type: "sauce-bolognaise" }, soir)).toBe("sauce-bolognaise");
  });
});

describe("le geste du jour", () => {
  // Le dîner de demain prend dans le bocal de sauce, qui est au congélo : il
  // faut le sortir ce soir, sinon il sera pris en bloc à 19 h.
  beforeEach(() => {
    poser(0, "diner", "poulet-roti");
    poser(1, "diner", "pates-bolognaise");
  });

  // Une promesse DES JOURS : elle ne vaut que l'interrupteur allumé.
  test.runIf(JOURS_VISIBLES)("il paraît au cockpit avec les mots de « Aujourd'hui »", () => {
    const t = vue().taches.find((x) => x.cle.startsWith("geste|"));
    expect(t?.titre).toBe("Sortir sauce bolognaise du congélo");
    expect(t?.route).toEqual({ ecran: "aujourdhui" });
  });

  test("coché, il quitte la liste — sinon le cockpit réclame ce qui est fait", () => {
    expect(vue(new Map(), true).taches.find((x) => x.cle.startsWith("geste|"))).toBeUndefined();
  });
});

describe("les courses", () => {
  beforeEach(() => {
    poser(0, "diner", "lasagnes");
    poser(2, "diner", "poulet-roti");
  });

  test("la ligne dit où en est la liste, et pas autre chose", () => {
    // Le proto écrivait « rien de rentré au stock » quel que soit le nombre
    // d'articles rentrés : il lisait les cochés et concluait sur les rentrés.
    expect(detailDesCourses(12, 0, 0)).toBe("12 articles à cocher");
    expect(detailDesCourses(12, 5, 0)).toBe("5 sur 12 cochés");
    expect(detailDesCourses(12, 12, 4)).toBe("4 sur 12 rentrés au stock");
    expect(detailDesCourses(1, 0, 0)).toBe("1 article à cocher");
  });

  test("tout rentré, la tâche disparaît ; un seul article manquant, elle reste", () => {
    const calc = calculer(jeu);
    const n = articles(calc.panier).length;
    expect(n).toBeGreaterThan(1);

    expect(vue(marquer(calc, { coche: true, rentre: true })).taches.map((t) => t.cle)).not.toContain("courses");

    const presque = marquer(calc, { coche: true, rentre: true }, n - 1);
    const t = vue(presque).taches.find((x) => x.cle === "courses");
    expect(t?.detail).toBe(`${n - 1} sur ${n} rentrés au stock`);
  });

  test("une semaine vide n'envoie pas faire les courses", () => {
    jeu = creerJeu(catalogue, 7, LUNDI);
    expect(vue().taches.map((t) => t.cle)).not.toContain("courses");
  });
});

describe("le compte de la journée", () => {
  test("la pastille est la liste, pas un compte refait à côté", () => {
    poser(0, "diner", "poulet-roti");
    poser(1, "diner", "pates-bolognaise");
    const v = vue();
    expect(aFaire(v)).toBe(v.taches.length);
    // Et la phrase d'entrée compte la même chose que la pastille.
    expect(v.taches.length).toBeGreaterThan(0);
    expect(v.entree).toBe(
      v.taches.length === 1 ? "Une chose vous attend aujourd'hui." : `${v.taches.length} choses vous attendent aujourd'hui.`,
    );
  });

  // Une promesse DES JOURS : elle ne vaut que l'interrupteur allumé.
  test.runIf(JOURS_VISIBLES)("les offres se comptent là où l'on y répond", () => {
    // Une semaine qui réclame plus de sauce qu'il n'en existe : le modèle
    // propose d'agrandir le lot amont. Voir `prevoir.vue.test.ts`.
    poser(0, "diner", "sauce-bolognaise");
    poser(1, "dejeuner", "pates-bolognaise");
    poser(1, "diner", "lasagnes");
    poser(2, "dejeuner", "pates-bolognaise");
    poser(2, "diner", "lasagnes");

    const calc = calculer(jeu);
    const n = vueAPrevoir(jeu, calc).enAttente;
    expect(n).toBeGreaterThan(1);
    const t = vueDuCockpit(jeu, calc, { courses: new Map(), gesteFait: false }).taches.find(
      (x) => x.cle === "prevoir",
    );
    // Un seul endroit sait compter les offres, et c'est l'écran qui y répond.
    expect(t?.titre).toBe(`${n} offres attendent une réponse`);
    expect(t?.route).toEqual({ ecran: "prevoir" });
  });

  test("une journée sans rien le dit, plutôt que de montrer une liste vide", () => {
    // Tout est répondu, rien à acheter : le seul cockpit qui n'a rien à dire.
    for (const [i, c] of jeu.creneaux.entries()) if (c.nature === "choisi") jeu.choix[i] = SAUTE;
    const v = vue();
    expect(v.taches).toEqual([]);
    expect(v.entree).toBe("Rien ne vous attend aujourd'hui.");
  });
});

describe("la carte de la cuisine", () => {
  // Une promesse DES JOURS : elle ne vaut que l'interrupteur allumé.
  test.runIf(JOURS_VISIBLES)("elle compte les créneaux RÉPONDUS, pas les créneaux de la semaine", () => {
    // Le proto affichait « 14 créneaux » — un nombre qui ne bougeait jamais.
    const total = jeu.creneaux.filter((c) => c.nature === "choisi").length;
    expect(vue().cuisine.etat).toBe(`0/${total} répondus`);
    poser(0, "diner", "lasagnes");
    jeu.choix[creneau(1, "diner")] = SAUTE;
    expect(vue().cuisine.etat).toBe(`2/${total} répondus`);
  });

  test("elle n'annonce pas une semaine posée quand il reste des créneaux", () => {
    expect(resumeCuisine(3, "dimanche", 0)).toBe("3 créneaux restent à poser d'ici dimanche.");
    expect(resumeCuisine(1, "dimanche", 0)).toBe("Un créneau reste à poser d'ici dimanche.");
    expect(resumeCuisine(0, "dimanche", 0)).toBe("La semaine est répondue jusqu'à dimanche.");
    expect(resumeCuisine(0, "dimanche", 2)).toContain("2 offres attendent votre réponse.");
  });

  // Une promesse DES JOURS : elle ne vaut que l'interrupteur allumé.
  test.runIf(JOURS_VISIBLES)("le dernier jour est celui de la fenêtre, pas « dimanche » en dur", () => {
    // La semaine part d'aujourd'hui. Ouverte un mercredi, elle finit un mardi —
    // et le proto promettait quand même « posée jusqu'à dimanche ».
    jeu = creerJeu(catalogue, 7, new Date("2026-08-19T12:00:00Z"));
    expect(jeu.jours.at(-1)!.nom).toBe("mardi");
    expect(vue().cuisine.resume).toContain("d'ici mardi");
  });
});

describe("les chiffres de la carte", () => {
  test("une semaine vide n'affiche aucun chiffre plutôt que des zéros", () => {
    // Vu au navigateur : « 0 article » et « 0 min de cuisine » en pastilles,
    // trois choses à lire pour n'en dire aucune.
    expect(vue().cuisine.chiffres).toEqual([]);
  });

  test("posée, elle dit ce qu'il y a à acheter et à cuisiner", () => {
    poser(0, "diner", "lasagnes");
    const c = vue().cuisine.chiffres;
    expect(c.some((x) => /\d+ articles?$/.test(x))).toBe(true);
    expect(c.some((x) => x.endsWith("de cuisine"))).toBe(true);
  });
});

/* ═══════════════════ T103 — « c'est jeté », d'un seul geste ═════════════ */

describe("les restes passés", () => {
  /** Deux boîtes constatées au frigo, nées le 10/08 — passées au 17/08 (la
   *  carcasse tient 2 jours, les lentilles 4). */
  const passes = () => {
    jeu.stock = [
      { type: "carcasse-volaille", kind: "base", qty: null, qty_band: "1-repas", born: "2026-08-10", location: "frigo", ref: "9" },
      { type: "lentilles-vertes-cuites", kind: "base", qty: null, qty_band: "2-repas", born: "2026-08-10", location: "frigo", ref: "12" },
    ];
  };

  test("ils font UNE tâche, qui porte de quoi les jeter tous", () => {
    passes();
    const t = vue().taches.find((x) => x.cle === "perimes");
    expect(t?.titre).toBe("2 restes ont passé leur date");
    expect(t?.detail).toContain("carcasse volaille, lentilles vertes cuites");
    // Capture du 19/10 : l'id d'émission s'affichait tel quel.
    expect(t?.detail).not.toMatch(/\w-\w/);
    // Le geste ne demande rien de plus que ce que la tâche porte.
    expect(t?.jeter).toEqual(["9", "12"]);
  });

  test("un seul se dit au singulier", () => {
    passes();
    jeu.stock = jeu.stock.slice(0, 1);
    expect(vue().taches.find((x) => x.cle === "perimes")?.titre).toBe("Un reste a passé sa date");
  });

  test("rien de passé, pas de tâche — et pas de « 0 reste »", () => {
    passes();
    jeu.stock = jeu.stock.map((l) => ({ ...l, born: "2026-08-16" }));
    expect(vue().taches.some((x) => x.cle === "perimes")).toBe(false);
  });

  test("un congelé dépassé n'est pas à jeter : il reste servi", () => {
    jeu.stock = [
      { type: "sauce-bolognaise", kind: "base", qty: null, qty_band: "2-repas", born: "2026-01-05", location: "congelo", ref: "7" },
    ];
    expect(vue().taches.some((x) => x.cle === "perimes")).toBe(false);
  });

  test("c'est la seule tâche qui se règle sur place", () => {
    passes();
    poser(0, "diner", "lasagnes");
    const avecGeste = vue().taches.filter((t) => t.jeter);
    expect(avecGeste.map((t) => t.cle)).toEqual(["perimes"]);
  });
});

describe("le cockpit n'envoie pas vers un écran éteint — T110", () => {
  // Écrits pour l'interrupteur TEL QU'IL EST : allumé, ils ne disent rien de
  // plus que les tests du dessus ; éteint, ils sont la promesse du ticket.
  const semaineChargee = () => {
    // Tout ce qui produit une tâche : ce soir vide, un geste demain (la sauce
    // au congélo), des courses, et des offres en attente.
    poser(1, "diner", "pates-bolognaise");
    poser(1, "dejeuner", "pates-bolognaise");
    poser(2, "diner", "lasagnes");
    poser(2, "dejeuner", "pates-bolognaise");
  };

  test("aucune tâche n'ouvre un écran que l'interrupteur a éteint", () => {
    semaineChargee();
    const v = vue();
    expect(v.taches.length).toBeGreaterThan(0);
    for (const t of v.taches) expect(eteint(t.route), t.cle).toBe(false);
  });

  test.runIf(!JOURS_VISIBLES)("sans les jours, pas d'offre — elle ne se répond que sur un écran éteint", () => {
    semaineChargee();
    expect(vueAPrevoir(jeu, calculer(jeu)).enAttente).toBeGreaterThan(0);
    const v = vue();
    expect(v.taches.map((t) => t.cle)).not.toContain("prevoir");
    expect(v.cuisine.chiffres.some((c) => /offre/.test(c))).toBe(false);
  });

  // Le geste du jour, lui, survit aux jours cachés : il réclame un bocal à
  // sortir pour un plat POSÉ, pas une case de l'agenda. Il envoie au plat.
  test.runIf(!JOURS_VISIBLES)("sans les jours, le geste du jour ouvre la fiche du plat posé, et se coche sur place", () => {
    poser(0, "diner", "poulet-roti");
    poser(1, "diner", "pates-bolognaise");
    const t = vue().taches.find((x) => x.cle.startsWith("geste|"));
    expect(t?.titre).toBe("Sortir sauce bolognaise du congélo");
    // La fiche que « Posés » ouvre pour ce plat : son créneau nommé.
    expect(t?.route).toEqual({ ecran: "cuisiner", creneau: { jour: "2026-08-18", repas: "diner" } });
    expect(eteint(t!.route)).toBe(false);
    // Le plat, pas le jour : « demain » nomme ce que l'app ne montre plus.
    expect(t?.detail).toContain(jeu.plats["pates-bolognaise"]!.titre);
    expect(t?.detail).not.toMatch(/demain|déjeuner|dîner|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche/);
    // Le même drapeau que le « Fait » d'« Aujourd'hui », au jour d'aujourd'hui.
    expect(t?.cocher).toBe("geste|2026-08-17|sauce-bolognaise");
    // Coché, il s'en va — comme avec les jours.
    expect(vue(new Map(), true).taches.some((x) => x.cle.startsWith("geste|"))).toBe(false);
  });

  test.runIf(!JOURS_VISIBLES)("sans les jours, la carte ne compte ni créneaux ni jours", () => {
    // « 14 créneaux restent à poser d'ici jeudi », vu sur la carte pendant
    // toute l'année simulée.
    expect(vue().cuisine.resume).toBe(resumeSansJours(0));
    poser(0, "diner", "lasagnes");
    jeu.choix[creneau(1, "diner")] = SAUTE;
    const v = vue();
    expect(v.cuisine.etat).toBe("1 posé");
    expect(v.cuisine.resume).toBe("Un plat posé, à cuisiner quand vous voulez.");
    expect(v.cuisine.resume).not.toMatch(/créneau|d'ici|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche/);
  });
});
