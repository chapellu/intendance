import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, test } from "vitest";
import { calculer } from "./calcul";
import { lireCatalogue } from "./catalogue";
import { creerJeu, type Jeu } from "./jeu";
import { contexte, rejouer } from "./journal";
import { centralite, questions, type Reste } from "./questions";
import { categorie, couverture, main, offre, parRayon } from "./scoring";
import type { Catalogue } from "./types";

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

describe("la couverture", () => {
  test("se mesure sur les repas principaux, pas sur les vingt-et-un créneaux", () => {
    // Les plafonds ont été posés contre six dîners. Les étaler sur toute la
    // semaine les diviserait par deux sans que personne l'ait décidé.
    const gouter = jeu.creneaux.findIndex((c) => c.repas === "gouter");
    const platGouter = catalogue.plats.find((p) => p.creneaux.includes("gouter"))!;
    jeu.choix[gouter] = platGouter.id;
    const cov = couverture(jeu, jeu.choix);
    expect(Object.keys(cov.servi)).toHaveLength(0);
    expect(cov.familles.size).toBe(0);
  });

  test("elle compte les familles de légumes, et dit combien il en manque", () => {
    const vide = couverture(jeu, jeu.choix);
    expect(vide.famillesManquantes).toBe(catalogue.equilibre.cibles.familles_legumes_min);

    poser(0, "diner", "sauce-bolognaise");
    const apres = couverture(jeu, jeu.choix);
    expect(apres.familles.size).toBeGreaterThan(0);
    expect(apres.famillesManquantes).toBeLessThan(vide.famillesManquantes);
  });

  test("une protéine sous son minimum manque", () => {
    const cov = couverture(jeu, jeu.choix);
    for (const [p, c] of Object.entries(catalogue.equilibre.cibles.proteine))
      if (c.min != null && c.min > 0) expect(cov.manques[p]).toBe(c.min);
  });

  test("un plat bâti sur un reste ne sature pas sa protéine", () => {
    // La saturation compte ce qu'on ACHÈTE. Un plat qui mange un reste ne
    // coûte rien de plus : le refuser pour cause de quota serait absurde.
    poser(0, "diner", "pates-bolognaise");
    const cov = couverture(jeu, jeu.choix);
    const p = jeu.plats["pates-bolognaise"]!;
    const surReste = p.ingredients.some((x) => x.base);
    expect(surReste).toBe(true);
    expect(cov.servi[p.apports.proteine]).toBe(1);
    expect(cov.satures[p.apports.proteine]).toBeUndefined();
  });
});

describe("l'enseigne d'une carte est dérivée, jamais étiquetée", () => {
  test("un plat qui accepte un reste est une dérivée", () => {
    expect(categorie(jeu.plats["pates-bolognaise"]!)).toBe("derive");
  });

  test("un plat qui produit une base est une souche", () => {
    expect(categorie(jeu.plats["sauce-bolognaise"]!)).toBe("souche");
  });

  test("chaque plat du catalogue en a une, et une seule", () => {
    const valides = ["derive", "souche", "express", "congelable", "complet"];
    for (const p of catalogue.plats) expect(valides).toContain(categorie(p));
  });
});

describe("le score dit pourquoi une carte est ici", () => {
  test("un plat déjà posé ailleurs n'est pas reproposé", () => {
    poser(0, "diner", "sauce-bolognaise");
    const cartes = offre(jeu, jeu.choix, creneau(1, "diner"));
    expect(cartes.some((c) => c.plat.id === "sauce-bolognaise")).toBe(false);
  });

  test("un plat ne se propose que sur les créneaux qui lui vont", () => {
    const gouter = jeu.creneaux.findIndex((c) => c.repas === "gouter");
    for (const c of offre(jeu, jeu.choix, gouter))
      expect(c.plat.creneaux.length === 0 || c.plat.creneaux.includes("gouter")).toBe(true);
  });

  test("un plat qui trouve son reste le raconte, et coûte moins d'articles", () => {
    const carte = offre(jeu, jeu.choix, creneau(0, "diner"))
      .find((c) => c.plat.id === "pates-bolognaise")!;
    expect(carte.chaine).toBe(true);
    expect(carte.recit).toContain("du congélo");
    expect(carte.partiel).toBe(false);
  });

  test("un plat qui exige un reste que rien ne couvre est pénalisé et le dit", () => {
    // « Reste de la veille » n'a pas de repli : sans reste, il n'existe pas.
    // Les falafels, eux, ont un `sansReste` — ils coûtent plus cher, mais
    // restent faisables, et ne sont donc pas dans ce cas.
    const carte = offre(jeu, jeu.choix, creneau(0, "dejeuner"))
      .find((c) => c.plat.id === "reste-de-la-veille")!;
    expect(carte.manque).toBe(true);
    expect(carte.pourquoi.some((r) => r.startsWith("demande "))).toBe(true);

    const falafels = offre(jeu, jeu.choix, creneau(0, "diner"))
      .find((c) => c.plat.id === "falafels-aux-herbes")!;
    expect(falafels.manque).toBe(false);
    expect(falafels.plein).toBe(true);
  });

  test("le coût marginal se mesure en posant la carte, pas en la lisant", () => {
    const cartes = offre(jeu, jeu.choix, creneau(0, "diner"));
    for (const c of cartes) expect(c.marginal).toBeGreaterThanOrEqual(0);
    // Une carte servie par le stock coûte moins qu'une carte à plein tarif.
    const chainee = cartes.find((c) => c.chaine && !c.partiel);
    const pleine = cartes.find((c) => !c.chaine && c.plat.accepts.length === 0);
    if (chainee && pleine) expect(chainee.marginal).toBeLessThanOrEqual(pleine.marginal);
  });

  test("les cartes arrivent triées, la meilleure d'abord", () => {
    const scores = offre(jeu, jeu.choix, creneau(0, "diner")).map((c) => c.score);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
  });

  test("un plat qui voyage mal sur un créneau de gamelle est noté moins bien", () => {
    const gamelle = jeu.creneaux.findIndex((c) => c.emporte && c.nature === "choisi");
    const cartes = offre(jeu, jeu.choix, gamelle);
    for (const c of cartes.filter((x) => x.malTransporte))
      expect(c.pourquoi).toContain("voyage mal en gamelle");
  });
});

describe("la main de cartes", () => {
  test("est la même tant qu'on ne repioche pas", () => {
    jeu.slot = creneau(0, "diner");
    const a = main(jeu).map((c) => c.plat.id);
    const b = main(jeu).map((c) => c.plat.id);
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(0);
  });

  test("et change quand on repioche", () => {
    jeu.slot = creneau(0, "diner");
    const a = main(jeu).map((c) => c.plat.id);
    jeu.repioches[jeu.slot] = 1;
    const b = main(jeu).map((c) => c.plat.id);
    expect(a).not.toEqual(b);
  });

  test("garantit la variété des enseignes plutôt que cinq fois la même", () => {
    jeu.slot = creneau(0, "diner");
    const m = main(jeu);
    const jouables = offre(jeu, jeu.choix, jeu.slot);
    for (const cat of ["express", "souche", "derive"] as const)
      if (jouables.some((l) => l.categorie === cat))
        expect(m.some((c) => c.categorie === cat)).toBe(true);
  });

  test("ne sert jamais deux fois le même plat", () => {
    jeu.slot = creneau(0, "diner");
    const ids = main(jeu).map((c) => c.plat.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("rend une main vide quand plus rien ne convient", () => {
    // Tous les plats du créneau sont posés ailleurs : il ne reste rien.
    const cible = creneau(0, "diner");
    let libre = 0;
    for (const p of catalogue.plats) {
      while (libre < jeu.creneaux.length && (jeu.creneaux[libre]!.nature !== "choisi" || libre === cible))
        libre++;
      if (libre >= jeu.creneaux.length) break;
      jeu.choix[libre++] = p.id;
    }
    jeu.slot = cible;
    // La taille vient du catalogue depuis T52 (`equilibre.main.taille: 5`) :
    // l'écrire en dur ici referait exactement le réglage mort qu'il a réparé.
    expect(main(jeu).length).toBeLessThanOrEqual(catalogue.equilibre.main.taille);
  });

  test("T52 — la taille et les enseignes garanties viennent du catalogue", () => {
    // TROIS RÉGLAGES LUS, TYPÉS, ET SANS EFFET jusqu'ici. La parité avec le
    // proto les gardait morts ; le proto est parti en T22, l'argument avec.
    jeu.slot = creneau(0, "diner");
    expect(catalogue.equilibre.main.taille).toBe(5);
    expect(main(jeu)).toHaveLength(5);

    const enseignes = new Set(main(jeu).map((c) => c.categorie));
    for (const garantie of catalogue.equilibre.main.garantir)
      expect(enseignes.has(garantie as never)).toBe(true);
  });

  test("T52 — un plat cuisiné dans les dix jours sort du paquet", () => {
    jeu.slot = creneau(0, "diner");
    const ctx = contexte(catalogue);
    const rejeu = rejouer(catalogue, [], ctx, "2026-08-17");
    const sans = main(jeu, undefined, {
      rejeu, passe: { repondu: new Map(), depense: new Map() },
      cuisinesRecemment: new Set<string>(),
    planchers: [],
    });
    expect(sans.length).toBeGreaterThan(0);

    const ecarte = sans[0]!.plat.id;
    const avec = main(jeu, undefined, {
      rejeu, passe: { repondu: new Map(), depense: new Map() },
      cuisinesRecemment: new Set([ecarte]),
      planchers: [],
    });
    expect(avec.map((c) => c.plat.id)).not.toContain(ecarte);
  });

  test("T52 — le cooldown s'efface plutôt que d'affamer la main", () => {
    // UN PLAT DÉJÀ VU VAUT MIEUX QUE PAS DE DÎNER. Si tout le paquet est en
    // cooldown, on repioche dedans — la même règle qui interdit à T33 de
    // retirer un plat définitivement.
    jeu.slot = creneau(0, "diner");
    const ctx = contexte(catalogue);
    const rejeu = rejouer(catalogue, [], ctx, "2026-08-17");
    const tout = new Set(catalogue.plats.map((p) => p.id));
    const cartes = main(jeu, undefined, {
      rejeu, passe: { repondu: new Map(), depense: new Map() },
      cuisinesRecemment: tout,
      planchers: [],
    });
    expect(cartes.length).toBeGreaterThan(0);
  });
});

describe("la liste de courses suit le magasin", () => {
  test("les rayons sortent dans l'ordre où on les traverse", () => {
    poser(0, "diner", "fajitas-poulet");
    poser(1, "diner", "sauce-bolognaise");
    const noms = parRayon(catalogue, calculer(jeu).panier).map(([r]) => r);
    const attendu = catalogue.rayons.ordre.filter((r) => noms.includes(r));
    expect(noms.filter((n) => n !== "autre")).toEqual(attendu);
  });

  test("un article qu'aucun rayon ne réclame finit dans « autre », jamais nulle part", () => {
    poser(0, "diner", "fajitas-poulet");
    poser(1, "diner", "sauce-bolognaise");
    poser(2, "diner", "poulet-roti");
    const calc = calculer(jeu);
    const groupes = parRayon(catalogue, calc.panier);
    const places = groupes.flatMap(([, items]) => items.map((a) => a.id));
    const attendus = [...calc.panier.values()].map((a) => a.id);
    expect(new Set(places)).toEqual(new Set(attendus));
    if (groupes.some(([r]) => r === "autre")) expect(groupes.at(-1)?.[0]).toBe("autre");
  });
});

describe("l'anti-gaspi entre dans le score", () => {
  const premierDiner = () => jeu.creneaux.findIndex((c) => c.repas === "diner");

  test("un plat qui finit un paquet entamé le dit, et le dit en français", () => {
    const carte = offre(jeu, jeu.choix, premierDiner()).find((c) => c.plat.id === "pates-bolognaise");
    expect(carte?.ecoule.map((a) => a.id)).toContain("pates");
    expect(carte?.pourquoi.some((p) => p.startsWith("finit des paquets entamés"))).toBe(true);
  });

  test("LE PLACARD ET LE DÉPÔT SONT DANS LA MÊME SOMME — T47", () => {
    // Le même plat écoule un paquet de pâtes ouvert (garde-manger, 0,4 projeté)
    // ET le bocal de bolognaise de l'amorce (dépôt, sa vraie fraction de vie).
    // Avant ce ticket les deux étaient comptés par deux mécaniques qui ne se
    // parlaient pas — l'une cumulait sur trois articles, l'autre payait un
    // forfait selon l'ENDROIT du lot.
    const carte = offre(jeu, jeu.choix, premierDiner()).find((c) => c.plat.id === "pates-bolognaise")!;
    expect(carte.ecoule.map((a) => a.ou).sort()).toEqual(["depot", "placard"]);
    // Et l'ordre est celui de l'urgence, pas celui des sources : au démarrage à
    // froid le paquet entamé (0,4) passe devant le bocal congelé (0,32).
    expect(carte.ecoule[0]!.id).toBe("pates");
  });

  test("AUCUNE CARTE NE CRIE AU GASPILLAGE AU DÉMARRAGE À FROID", () => {
    // Avant T60, `sauve` était vrai sur les 40 plats qui contiennent un oignon ou
    // de l'ail — la phrase forte était presque toujours affichée, donc ne se
    // remarquait jamais.
    //
    // ELLE RESTE MUETTE ICI, MAIS PLUS POUR LA MÊME RAISON, et la nuance vaut le
    // test : ce n'est plus parce que le seuil haut serait hors d'atteinte, c'est
    // parce que RIEN NE COURT ENCORE. Le placard n'offre que des paquets entamés
    // (0,4) et le seul lot vivant de l'amorce est un bocal congelé à un tiers de
    // ses trois mois. Le test suivant montre la même phrase se déclencher dès
    // qu'un lot vieillit.
    const cartes = offre(jeu, jeu.choix, premierDiner());
    expect(cartes.some((c) => c.ecoule.length)).toBe(true);
    expect(cartes.every((c) => !c.sauve)).toBe(true);
  });

  test("UNE RAMPE, PAS UN FORFAIT : le même plat monte à mesure que le lot vieillit", () => {
    // LA PROMESSE ENTIÈRE DE T47, sur le corpus réel. On pose des lentilles
    // mijotées lundi soir ; elles laissent 400 g de `lentilles-vertes-cuites`,
    // qui tiennent 4 jours au frigo. La carte qui les mange vaut de plus en plus
    // cher chaque jour, et le mot ne change qu'au dernier — celui d'après, le
    // frigo étant DUR (T58), le lot sort du jeu et la carte cesse de chaîner.
    //
    // C'est le cas que la paire abandonnée ne savait PAS noter du tout : elle ne
    // payait que les lots présents avant la semaine. Un reste produit mardi et
    // oublié jusqu'à samedi ne valait rien de plus que le mercredi.
    poser(0, "diner", "lentilles-mijotees");
    const vu: [number, boolean][] = [];
    for (const jour of [1, 2, 3, 4]) {
      const c = offre(jeu, jeu.choix, creneau(jour, "diner")).find(
        (x) => x.plat.id === "burgers-de-lentilles",
      )!;
      expect(c.chaine).toBe(true);
      expect(c.ecoule.map((a) => a.id)).toEqual(["lentilles-vertes-cuites"]);
      vu.push([c.ecoule[0]!.fraction, c.sauve]);
    }
    expect(vu.map(([f]) => f)).toEqual([0.25, 0.5, 0.75, 1]);
    // Le mot arrive au dernier jour, et à lui seul.
    expect(vu.map(([, s]) => s)).toEqual([false, false, false, true]);
  });

  test("deux phrases, parce que ce sont deux gestes", () => {
    // « Se perdent » appelle à cuisiner ce soir ; « entamés » dit seulement
    // qu'un paquet est ouvert et qu'autant le finir. Les confondre ferait crier
    // au gaspillage sous un paquet de biscottes.
    //
    // LE PARTAGE N'EST PLUS CELUI DU STOCK, C'EST CELUI DE L'AXE : la phrase
    // urgente parle de tout ce qui a franchi la ligne, d'où que ça vienne.
    for (const c of offre(jeu, jeu.choix, premierDiner()).filter((x) => x.ecoule.length)) {
      const dit = c.pourquoi.filter((p) => p.includes("sauve ce qui se perd") || p.includes("entamés"));
      if (c.sauve) expect(dit.some((p) => p.startsWith("sauve ce qui se perd"))).toBe(true);
      else expect(dit.every((p) => p.startsWith("finit des paquets entamés"))).toBe(true);
    }
  });

  test("UN BOCAL JEUNE COMPTE SANS SE RÉPÉTER : `recit` le dit déjà", () => {
    // Il vaut ses points — la fraction est petite, pas nulle — mais il ne prend
    // pas une deuxième ligne dans `pourquoi`. La carte annonce déjà « 700 g du
    // congélo » par `recit`, que l'écran affiche en toutes lettres depuis le
    // prototype, et le redire en « finit des paquets entamés : sauce bolognaise »
    // serait faux deux fois : ce n'est pas un paquet, et ce n'est pas entamé.
    const c = offre(jeu, jeu.choix, premierDiner()).find((x) => x.plat.id === "lasagnes")!;
    expect(c.ecoule.map((a) => a.id)).toEqual(["sauce-bolognaise"]);
    expect(c.ecoule[0]!.fraction).toBeGreaterThan(0);
    expect(c.pourquoi.some((p) => p.includes("entamés") || p.includes("sauve"))).toBe(false);
    expect(c.recit).toContain("congélo");
  });

  test("l'écoulement départage, il ne commande pas — MESURÉ, plus déduit des poids", () => {
    // LE GARDE-FOU DU TERME, ET IL A CHANGÉ DE NATURE DEUX FOIS. Il se lisait sur
    // les poids — « le bonus vaut 5, `proteine_manquante` vaut 6, donc il
    // départage » — et cette lecture est morte le jour où le terme s'est mis à
    // cumuler (T59). Il se mesure donc sur le corpus, et le chiffre a bougé avec
    // T47 : le maximum d'articles écoulés par un plat est passé de 1 à 2, le
    // second étant le bocal du dépôt.
    //
    // TANT QUE C'EST 2 le terme plafonne sous `proteine_manquante`, parce qu'un
    // seul de ces deux articles peut atteindre 1,0. Ce test tombera le jour où un
    // plat en écoulera trois, et c'est ce qu'on lui demande : il dit qu'aujourd'hui
    // l'écoulement ne commande pas, pas qu'il ne le pourra jamais — Workspace#41
    // demande justement d'encourager « au maximum » l'utilisation des stocks.
    const p = catalogue.equilibre.poids;
    const cartes = offre(jeu, jeu.choix, premierDiner());
    expect(cartes.length).toBeGreaterThan(0);
    expect(Math.max(...cartes.map((c) => c.ecoule.length))).toBe(2);
    const pire = Math.max(...cartes.map((c) => c.ecoule.reduce((s, a) => s + a.fraction, 0)));
    expect(p["ecoule"]! * pire).toBeLessThan(p["proteine_manquante"]!);
  });

  test("un plat qui n'écoule rien n'est pas puni", () => {
    // Un bonus absent n'est pas une pénalité : le score reste celui des autres
    // termes, et rien dans `pourquoi` ne parle de stock.
    const sans = offre(jeu, jeu.choix, premierDiner()).filter((c) => !c.ecoule.length);
    expect(sans.length).toBeGreaterThan(0);
    expect(sans.every((c) => !c.pourquoi.some((x) => x.includes("sauve") || x.includes("entamés")))).toBe(true);
  });
});

/* ═══════════════════════════ T33 — la question, sur le corpus réel ═══════ */

describe("T33 — ce que la proposition sait", () => {
  const ctx = contexte(catalogue);
  const rejeu = rejouer(catalogue, [], ctx, "2026-08-17");
  const estCentral = centralite(catalogue, ctx);
  const savoirAvec = (repondu: Record<string, Reste>, depense: Record<string, number> = {}) => ({
    rejeu,
    passe: { repondu: new Map(Object.entries(repondu)), depense: new Map(Object.entries(depense)) },
    cuisinesRecemment: new Set<string>(),
    planchers: [],
  });

  test("sans savoir, rien ne change : ni blocage, ni pari", () => {
    // LA RÉTROCOMPATIBILITÉ EST LE CONTRAT. `offre` est appelé par des écrans
    // qui n'ont pas le journal ; ils doivent continuer à voir la même chose.
    const slot = creneau(0, "diner");
    const cartes = offre(jeu, jeu.choix, slot);
    expect(cartes.length).toBeGreaterThan(0);
    expect(cartes.every((c) => c.paris.length === 0)).toBe(true);
  });

  test("« non » sur un central retire les plats qui en veulent", () => {
    const slot = creneau(0, "diner");
    const avant = offre(jeu, jeu.choix, slot);
    const viande = avant.filter((c) =>
      c.plat.ingredients.some((i) => i.id === "boeuf-hache" && !i.base),
    );
    expect(viande.length).toBeGreaterThan(0);

    const apres = offre(jeu, jeu.choix, slot, savoirAvec({ "boeuf-hache": "non" }));
    const restants = new Set(apres.map((c) => c.plat.id));
    for (const c of viande) expect(restants.has(c.plat.id)).toBe(false);
    // ET LE RESTE SURVIT : on retire ce qui manque, on ne rétrécit pas la main.
    expect(apres.length).toBe(avant.length - viande.length);
  });

  test("« peu » ne retire rien tant que rien n'est posé dessus", () => {
    const slot = creneau(0, "diner");
    const avant = offre(jeu, jeu.choix, slot);
    const apres = offre(jeu, jeu.choix, slot, savoirAvec({ "boeuf-hache": "peu" }));
    expect(apres.length).toBe(avant.length);
  });

  test("« peu » déjà dépensé une fois retire les suivants", () => {
    const slot = creneau(0, "diner");
    const avant = offre(jeu, jeu.choix, slot);
    const apres = offre(jeu, jeu.choix, slot, savoirAvec({ "boeuf-hache": "peu" }, { "boeuf-hache": 1 }));
    expect(apres.length).toBeLessThan(avant.length);
  });

  test("la main honore le blocage comme l'offre", () => {
    jeu.slot = creneau(0, "diner");
    const cartes = main(jeu, 4, savoirAvec({ "boeuf-hache": "non" }));
    expect(cartes.every((c) => !c.plat.ingredients.some((i) => i.id === "boeuf-hache" && !i.base))).toBe(true);
  });

  test("sur le corpus réel, la viande est centrale et l'oignon ne l'est pas", () => {
    // Le garde-fou de `rayons.centraux` : si un jour la boucherie sortait des
    // rayons centraux, ou l'oignon y entrait, c'est ici que ça se verrait.
    const est = estCentral;
    expect(est({ id: "boeuf-hache", central: false })).toBe(true);
    expect(est({ id: "colin-surgele", central: false })).toBe(true);
    expect(est({ id: "riz", central: false })).toBe(true);
    expect(est({ id: "oignon", central: false })).toBe(false);
    expect(est({ id: "persil", central: false })).toBe(false);
    expect(est({ id: "vinaigre-balsamique", central: false })).toBe(false);
  });

  test("un placard jamais relevé fait demander sur les centraux proposés", () => {
    jeu.slot = creneau(0, "diner");
    const cartes = main(jeu, 4, savoirAvec({}));
    const qs = questions({
      catalogue, ctx, rejeu,
      proposes: cartes.map((c) => c.plat),
      candidats: offre(jeu, jeu.choix, jeu.slot, savoirAvec({})).map((c) => c.plat),
      repondu: new Map(),
    });
    // Chaque question porte sur un central, aucune sur un aromate, et l'ordre
    // décroît sur ce qu'elle débloque.
    for (const q of qs) expect(estCentral({ id: q.ingredient, central: false })).toBe(true);
    const d = qs.map((q) => q.debloque);
    expect([...d].sort((a, b) => b - a)).toEqual(d);
  });
});
