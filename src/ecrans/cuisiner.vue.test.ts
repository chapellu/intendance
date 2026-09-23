import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { lireCatalogue } from "../model/catalogue";
import { creerJeu, SAUTE } from "../model/jeu";
import type { Catalogue, Etape } from "../model/types";
import {
  aArmer,
  aTable,
  phraseDuRole,
  aSortir,
  avancement,
  basculerMinuteur,
  chauffeDe,
  credit,
  minuteur,
  minuteurUtile,
  outilDe,
  pourLire,
  provenanceIngredient,
  SANS_FEU,
  sansRecette,
  tempsDuPlat,
  type EtatMinuteur,
} from "./cuisiner.vue";

const catalogue: Catalogue = lireCatalogue(
  JSON.parse(readFileSync("public/cuisine-data.json", "utf8")) as unknown,
);

// `uses: null` et non `[]` : ce helper ne dit rien des ingrédients, il ne
// prétend pas qu'il n'y en a aucun. Voir `Etape.uses`.
const etape = (needs: string[], minutes = 0): Etape => ({
  id: "e", action: "", minutes, needs, surveille: true, astuce: null,
  uses: null, enParallele: null, attente: null, attenteRaison: null,
  attenteSouple: true, rattrapage: null,
  enfant: null, enfantDes: null, porteAssaisonnement: false,
});

describe("la chauffe", () => {
  test("le vocabulaire des recettes devient quelque chose qu'une main comprend", () => {
    expect(chauffeDe(etape(["bake"])).nom).toBe("Four");
    expect(chauffeDe(etape(["boil"])).niveau).toBe(4);
    expect(chauffeDe(etape(["reheat"])).niveau).toBe(1);
  });

  test("une étape sans feu le dit, et c'est une information", () => {
    // Zéro barre veut dire « faisable n'importe quand » : c'est ce qui permet
    // de décaler une étape sans risque.
    expect(chauffeDe(etape(["chop-coarse"]))).toEqual(SANS_FEU);
    expect(chauffeDe(etape([])).niveau).toBe(0);
  });

  test("le premier besoin reconnu gagne : mijoter et remuer, c'est mijoter", () => {
    expect(chauffeDe(etape(["stir", "simmer"])).nom).toBe("Feu doux");
  });

  test("toutes les étapes du catalogue tombent quelque part", () => {
    // Aucun `needs` ne doit produire d'écran vide : au pire « Sans feu ».
    for (const p of catalogue.plats)
      for (const e of p.steps) expect(chauffeDe(e).nom.length).toBeGreaterThan(0);
  });
});

describe("le minuteur", () => {
  const T0 = 1_800_000_000_000;

  test("neuf, il affiche la durée de l'étape sans rien compter", () => {
    expect(minuteur(null, 12, T0)).toEqual({ reste: 720, actif: false, sonne: false });
  });

  test("lancé, il court", () => {
    const e = basculerMinuteur(null, 12, T0);
    expect(minuteur(e, 12, T0 + 60_000)).toEqual({ reste: 660, actif: true, sonne: false });
  });

  test("UNE ÉCHÉANCE, PAS UN COMPTEUR : le temps passe même écran éteint", () => {
    // C'EST LE TEST QUI JUSTIFIE LA FORME. Le proto décrémentait une seconde
    // par battement de `setInterval` ; les navigateurs mobiles ralentissent ces
    // battements à un par minute en arrière-plan, c'est-à-dire exactement quand
    // on repose le téléphone pour cuisiner. Ici rien ne compte : on compare.
    const e = basculerMinuteur(null, 12, T0);
    expect(minuteur(e, 12, T0 + 13 * 60_000)).toEqual({ reste: 0, actif: false, sonne: true });
  });

  test("mis en pause, il garde ce qu'il reste et ne bouge plus", () => {
    const lance = basculerMinuteur(null, 12, T0);
    const pause = basculerMinuteur(lance, 12, T0 + 2 * 60_000);
    expect(pause).toEqual({ reste: 600 });
    expect(minuteur(pause, 12, T0 + 99 * 60_000)).toEqual({
      reste: 600, actif: false, sonne: false,
    });
  });

  test("repris, il repart de là où il s'était arrêté", () => {
    const pause: EtatMinuteur = { reste: 600 };
    const repris = basculerMinuteur(pause, 12, T0);
    expect(minuteur(repris, 12, T0 + 60_000).reste).toBe(540);
  });

  test("sonné, il se relance depuis le début", () => {
    // C'est la seule chose qu'on puisse vouloir d'un minuteur terminé.
    const fini = basculerMinuteur(null, 12, T0 - 20 * 60_000);
    expect(minuteur(fini, 12, T0).sonne).toBe(true);
    expect(minuteur(basculerMinuteur(fini, 12, T0), 12, T0).reste).toBe(720);
  });
});

describe("ce qui déclenche une alarme — T82", () => {
  const T0 = 1_800_000_000_000;

  test("un minuteur lancé arme l'échéance que le doigt vient d'écrire", () => {
    // Pas « dans douze minutes » mais « à cette date-là » : c'est le même objet
    // que celui qui part en base, et c'est ce qui rend `armer` idempotente —
    // le geste et l'effet de montage arment la MÊME chose, pas deux délais
    // calculés à deux instants différents.
    const lance = basculerMinuteur(null, 12, T0);
    expect(aArmer(lance, T0)).toBe(T0 + 12 * 60_000);
  });

  test("un minuteur neuf n'arme rien : rien n'a encore été demandé", () => {
    expect(aArmer(null, T0)).toBeNull();
  });

  test("une pause n'a pas d'échéance, donc rien à annoncer", () => {
    // C'est la forme `{ reste }` qui le dit. Lui inventer une échéance
    // réintroduirait le compteur que T12 a refusé.
    const pause = basculerMinuteur(basculerMinuteur(null, 12, T0), 12, T0 + 60_000);
    expect(aArmer(pause, T0 + 60_000)).toBeNull();
  });

  test("ROUVRIR UNE FICHE NE FAIT PAS SONNER LA CUISINE POUR HIER", () => {
    // Le cas de tous les jours, pas une garde défensive : le minuteur a sonné
    // pendant qu'on était ailleurs, l'état reste en base, et l'écran se
    // remonte. Sans ça, chaque retour sur la fiche réarmerait une alarme pour
    // un événement déjà passé — et `armer` la ferait partir aussitôt.
    const fini = basculerMinuteur(null, 12, T0 - 20 * 60_000);
    expect(minuteur(fini, 12, T0).sonne).toBe(true);
    expect(aArmer(fini, T0)).toBeNull();
  });

  test("relancer un minuteur sonné arme la nouvelle échéance, pas l'ancienne", () => {
    const fini = basculerMinuteur(null, 12, T0 - 20 * 60_000);
    expect(aArmer(basculerMinuteur(fini, 12, T0), T0)).toBe(T0 + 12 * 60_000);
  });
});

describe("ce que la fiche dit du rôle", () => {
  const parRole = (role: string) => catalogue.plats.find((p) => p.role === role)!;

  // `portions_eq` EST UN NOMBRE DONT LE SENS DÉPEND DU RÔLE. La fiche affiche
  // « on en cuisine 6 » ; sur le tian, ces six parts sont six ACCOMPAGNEMENTS,
  // et c'était écrit dans un commentaire faute d'un champ pour le dire.
  test("un accompagnement dit dans quel rôle ses parts se comptent", () => {
    expect(phraseDuRole(parRole("accompagnement"))).toBe(
      "Ces parts se comptent en accompagnement.",
    );
    expect(phraseDuRole(parRole("entree"))).toBe("Ces parts se comptent en entrée.");
  });

  test("une base et une boisson disent autre chose, parce que ce n'est pas la même chose", () => {
    // Compter les parts d'une pâte brisée « en base » n'aurait aucun sens :
    // ce qui manque à qui la lit, c'est de savoir qu'elle entre ailleurs.
    expect(phraseDuRole(parRole("base"))).toMatch(/entre dans un autre plat/);
    expect(phraseDuRole(parRole("boisson"))).toMatch(/pas un repas/);
  });

  test("et elle se tait sur un plat, qui est le cas des 121 autres", () => {
    expect(phraseDuRole(parRole("plat"))).toBe(null);
  });
});

describe("à table, à côté", () => {
  const jeu = creerJeu(catalogue);
  const escalopes = catalogue.plats.find((x) => x.id === "escalopes-emmental-champignons")!;

  test("la fiche dit avec quoi servir le plat, à l’échelle de la tablée", () => {
    // 300 g de riz pour six parts : à 2,5, la fiche en annonce 130 — et pas
    // 300, qui est ce que le LOT d'escalopes réclame en champignons.
    expect(aTable(jeu, escalopes, 2.5).map((l) => [l.nom, l.quantite])).toEqual([
      ["riz", "130 g"],
      ["salade verte", "0,5 pièce"],
    ]);
    expect(aTable(jeu, escalopes, 6).map((l) => l.quantite)).toEqual(["300 g", "1 pièce"]);
  });

  test("et dit d’où ça sort, comme pour un ingrédient", () => {
    expect(aTable(jeu, escalopes, 6)[0]!.prov.acheter).toBe(true);
  });

  // SE TAIRE N'EST PAS « RIEN À AJOUTER ». 120 plats sur 138 ne disent pas
  // encore avec quoi les servir ; la fiche n'affiche alors aucune section,
  // plutôt qu'une section vide qui promettrait que l'assiette est pleine.
  test("elle se tait sur un plat qui ne le dit pas", () => {
    const gratin = catalogue.plats.find((x) => x.id === "gratin-de-pates-tomates")!;
    expect(aTable(jeu, gratin, 2.5)).toEqual([]);
  });
});

describe("la provenance vue de la fiche", () => {
  const ing = (id: string, base = false) =>
    ({ id, nom: id, qty: null, base, assaisonnement: false }) as never;

  // LA FICHE LIT LE JEU, PAS LE CATALOGUE — et `creerJeu` amorce le
  // garde-manger avec le relevé de l'export, donc un jeu neuf répond ce que
  // le catalogue répondait avant. C'est tout l'intérêt de l'amorce : les
  // promesses ci-dessous n'ont pas eu à changer de valeur attendue.
  const jeu = creerJeu(catalogue);

  test("ce qui dort au placard ne part pas aux courses", () => {
    const p = catalogue.plats.find((x) => x.id === "sauce-bolognaise")!;
    const huile = p.ingredients.find((x) => x.id === "huile-olive")!;
    expect(provenanceIngredient(jeu, huile)).toEqual({ label: "placard", acheter: false });
  });

  test("une base vient d'un autre plat, et se marque comme telle", () => {
    const p = catalogue.plats.find((x) => x.id === "pates-bolognaise")!;
    const base = p.ingredients.find((x) => x.base)!;
    expect(provenanceIngredient(jeu, base).label).toBe("base");
    // Une base « s'achète » au sens de la fiche : elle n'est pas au placard. La
    // semaine, elle, sait qu'on ne l'achète pas — voir `calcul.provenance`.
    expect(provenanceIngredient(jeu, base).acheter).toBe(true);
  });

  test("un alias de rayon désigne la même chose que sa cible", () => {
    // « oignons » et « oignon » ne doivent pas tomber dans deux rayons
    // différents, sinon la moitié d'une liste se dédouble.
    const [id, cible] = Object.entries(catalogue.rayons.aliases)[0]!;
    expect(provenanceIngredient(jeu, ing(id))).toEqual(
      provenanceIngredient(jeu, ing(cible)),
    );
  });

  test("ce dont le relevé dit qu'il en reste ne s'achète pas les yeux fermés", () => {
    // CE TEST DISAIT « les pâtes partent aux courses », ET C'ÉTAIT VRAI. Depuis
    // que le garde-manger est branché sur `provenance`, ce n'est plus la bonne
    // réponse : il traîne trois fonds de paquets en demi-lune haute. La fiche ne
    // promet pas la quantité — personne ne la suit —, elle dit d'aller voir.
    expect(provenanceIngredient(jeu, ing("pates"))).toEqual({
      label: "au garde-manger",
      acheter: false,
    });
  });

  test("ce qui n'est ni au placard ni au relevé part aux courses", () => {
    expect(provenanceIngredient(jeu, ing("saumon"))).toEqual({
      label: "à acheter",
      acheter: true,
    });
  });

  test("le fond de placard l'emporte sur le relevé", () => {
    // Les deux mènent à « ne pas acheter », mais ne disent pas la même chose :
    // on a TOUJOURS du sel, tandis qu'on a QUATRE BOÎTES de maïs. Pour le sel,
    // « combien m'en reste-t-il » n'est pas une question qui se pose.
    const fond = catalogue.rayons.placard[0]!;
    expect(provenanceIngredient(jeu, ing(fond)).label).toBe("placard");
  });

  test("un garde-manger vidé fait repasser la ligne à « à acheter »", () => {
    // LE JUMEAU DU BUG DE LA LISTE DE COURSES. La fiche interrogeait elle aussi
    // la liste figée de l'export : elle écrivait « au garde-manger » en face de
    // pâtes dont l'utilisateur venait de constater qu'il n'en restait rien.
    // C'est la fiche qu'on lit au moment de cuisiner — c'est là que le mensonge
    // coûte le dîner, pas juste un passage au magasin.
    const vide: typeof jeu = { ...jeu, gardeManger: [] };
    expect(provenanceIngredient(vide, ing("pates"))).toEqual({
      label: "à acheter",
      acheter: true,
    });
  });

  test("vider le garde-manger n'envoie pas le fond de placard aux courses", () => {
    // Le sel n'est pas au relevé, il est une APPARTENANCE : les deux sources
    // sont distinctes, et l'ordre du test le tient.
    const vide: typeof jeu = { ...jeu, gardeManger: [] };
    expect(provenanceIngredient(vide, ing(catalogue.rayons.placard[0]!)).label).toBe("placard");
  });
});

describe("l'avancement", () => {
  test("les minutes déjà faites ne comptent plus", () => {
    // « reste 25 min sur 50 » ne veut dire quelque chose que si « reste »
    // décroît vraiment à mesure qu'on avance.
    const steps = [etape([], 10), etape([], 20), etape([], 5)];
    expect(avancement(steps, 0)).toEqual({ reste: 35, total: 35 });
    expect(avancement(steps, 1)).toEqual({ reste: 25, total: 35 });
    expect(avancement(steps, 2)).toEqual({ reste: 5, total: 35 });
  });
});

/* ─────────────────────────────────────────────────────── T73 — le crédit */

describe("la provenance d'une recette", () => {
  // « L'origine je parlait de la provenance (auteur, ouvrage, url) »
  // — 2026-09-12, Workspace#56.
  const plats = catalogue.plats;

  test("une recette d'auteur nomme son auteur et son ouvrage", () => {
    const avec = plats.filter((p) => p.source !== null);
    expect(avec.length).toBeGreaterThan(0);
    for (const p of avec) {
      const c = credit(p);
      expect(c.texte).toContain(p.source!.auteur);
      expect(c.texte).toContain(p.source!.ouvrage);
    }
  });

  // LA PROMESSE QUI A DÉCIDÉ LE TICKET. Le silence se lirait comme une donnée
  // manquante alors que c'est une réponse : ces plats n'ont pas de source parce
  // qu'ils sont à nous. Un champ vide sur un quart du catalogue ressemble à un
  // bug — c'est l'option écartée.
  test("un plat du foyer le DIT, il ne se tait pas", () => {
    const sans = plats.filter((p) => p.source === null);
    expect(sans.length).toBeGreaterThan(0);
    for (const p of sans) {
      expect(credit(p).texte).toBe("Recette du foyer");
      expect(credit(p).url).toBeNull();
    }
  });

  test("aucune fiche ne reste sans phrase de provenance", () => {
    for (const p of plats) expect(credit(p).texte.length).toBeGreaterThan(0);
  });

  // `work` porte déjà la page — « …, Terre vivante, p. 116 ». Si le crédit
  // devait un jour la recomposer depuis `page`, deux orthographes du même
  // nombre finiraient par diverger ; `page` reste donc hors de l'export.
  test("la page vient de l'ouvrage, et rien ne la recompose", () => {
    const avecPage = plats.filter((p) => /\bp\. ?\d+/.test(p.source?.ouvrage ?? ""));
    expect(avecPage.length).toBeGreaterThan(0);
    for (const p of avecPage) expect(credit(p).texte).toMatch(/\bp\. ?\d+/);
  });

  // L'url n'est portée que par 5 sources ; là où elle existe, c'est là que #26 a
  // délibérément laissé la prose, et y renvoyer est le comportement voulu.
  test("l'url ne sort que si la source en porte une", () => {
    for (const p of plats) expect(credit(p).url).toBe(p.source?.url ?? null);
  });

  // Workspace#41 a tranché : la saisonnalité roule sur le plancher (#43), pas
  // sur la planification. `saison` entre dans le modèle et n'en ressort nulle
  // part — un no-op DÉCLARÉ, épinglé ici pour que le brancher au score soit un
  // geste visible et non un oubli.
  test("`saison` entre dans le modèle et ne pilote rien", () => {
    const avecSaison = plats.filter((p) => p.source?.saison);
    expect(avecSaison.length).toBeGreaterThan(0);
    for (const p of avecSaison) expect(credit(p).texte).not.toContain(p.source!.saison!);
  });
});

/* ────────────────────────────────────────────────── T74 — la vaisselle */

describe("l'ustensile à sortir avant de commencer", () => {
  // « J'aimerai bien aussi que tu m'indique quel outil utiliser et de quelle
  // taille. » La moitié de la réponse était déjà calculée et jamais montrée.
  test("la taille est dans le libellé, on ne la calcule pas", () => {
    const avec = catalogue.plats.filter((p) => p.vaisselle !== null);
    expect(avec.length).toBeGreaterThan(0);
    for (const p of avec) expect(aSortir(p)).toBe(p.vaisselle!.label);
    // Chaque libellé du corpus porte un nombre — 28 cm, 7,5 L. Si une vaisselle
    // arrivait un jour sans taille, c'est le compilateur qu'il faudrait relire.
    for (const p of avec) expect(aSortir(p)).toMatch(/\d/);
  });

  // Silence délibéré, pas oubli : le compilateur n'a pas trouvé d'ustensile à
  // nommer, et en inventer un serait pire que se taire.
  test("un plat sans vaisselle ne montre rien", () => {
    const sans = catalogue.plats.filter((p) => p.vaisselle === null);
    expect(sans.length).toBeGreaterThan(0);
    for (const p of sans) expect(aSortir(p)).toBeNull();
  });

  // MESURÉ AVANT D'ÉCRIRE LA PHRASE, comme le ticket l'exigeait : trois
  // endroits lisent `facteurMax` et deux l'écrivent déjà — `parts.vue.cuisson()`
  // et `offres.reserves()`. La tête de fiche n'en fait pas un troisième libellé.
  test("le débordement ne se dit pas ici — il se dit déjà ailleurs", () => {
    for (const p of catalogue.plats) {
      const t = aSortir(p);
      if (t !== null) expect(t).not.toMatch(/⚠|au plus|tournée/);
    }
  });

  // `chauffeDe` écrase `needs` en un niveau de feu et JETTE l'ustensile :
  // `simmer-large` devient « Feu vif » et la cocotte de 7,5 L disparaît. Les
  // deux répondent à deux questions et ne se remplacent pas.
  test("l'ustensile ne se déduit pas de la chauffe", () => {
    const cocotte = catalogue.plats.find((p) => p.vaisselle?.label.includes("cocotte"));
    expect(cocotte).toBeDefined();
    expect(aSortir(cocotte!)).toContain("cocotte");
  });
});

describe("le plat qu'on n'a pas encore écrit", () => {
  // TROISIÈME CHEMIN — T78. Deux autres avaient été construits devant la
  // plainte du 14/09 : écrire les étapes (T76) et filtrer le plat (T77, retiré
  // ici). L'utilisateur a tranché le 15/09 pour « proposer en le disant ».

  test("le corpus entier se tait, et c'est la mesure de T76", () => {
    // Les quinze plats du répertoire ont reçu leurs étapes ; s'il en restait
    // un, ce serait une régression de T76 et pas un cas à afficher.
    for (const p of catalogue.plats) expect(sansRecette(p)).toBeNull();
  });

  test("un plat entré au niveau plan dit ce qui lui manque", () => {
    const muet = { ...catalogue.plats[0]!, steps: [], cuisinable: false };
    const dit = sansRecette(muet);
    expect(dit).not.toBeNull();
    expect(dit!.court.length).toBeGreaterThan(0);
    expect(dit!.long.length).toBeGreaterThan(0);
  });

  // CE QUI MANQUE EST LA RECETTE, PAS LE PLAT, et la phrase doit le porter.
  // Le temps, les quantités et les apports viennent du même catalogue que les
  // autres et ont passé le même `verifier.py` ; une formule du genre « plat
  // incomplet » salirait des données qui ne le sont pas. Ce test épingle le
  // vocabulaire parce que c'est précisément ce que le ticket décide.
  test("elle parle de la recette, jamais du plat", () => {
    const dit = sansRecette({ ...catalogue.plats[0]!, steps: [], cuisinable: false })!;
    for (const texte of [dit.court, dit.long]) {
      expect(texte).toMatch(/recette|étapes|pas-à-pas/);
      expect(texte).not.toMatch(/incomplet|invalide|erreur|manquant|indisponible/i);
    }
  });

  // ELLE LIT LE DRAPEAU, PAS LA LONGUEUR. `cuisinable` porte la définition du
  // catalogue ; la redériver ici la ferait diverger le jour où elle bougera.
  // Le chargeur interdit par ailleurs aux deux de se contredire, donc ce cas ne
  // peut venir que d'un objet fabriqué — comme celui-ci.
  test("c'est `cuisinable` qui décide", () => {
    const p = catalogue.plats.find((x) => x.steps.length > 0)!;
    expect(sansRecette({ ...p, cuisinable: false })).not.toBeNull();
  });
});

/* ──────────────────── 15/09 — le minuteur permanent et l'outil qui manquait */

const bolo = catalogue.plats.find((p) => p.id === "sauce-bolognaise")!;
const pas = (id: string): Etape => bolo.steps.find((s) => s.id === id)!;

describe("le minuteur ne s'affiche que quand le temps agit sur le plat", () => {
  // « Tu mets en permanence un timer alors que je n'ai pas besoin de timer pour
  // couper des légumes. » Capture d'écran à l'appui, étape 1 de la bolognaise.
  test("couper des légumes n'en demande pas", () => {
    const tailler = pas("tailler");
    expect(tailler.minutes).toBeGreaterThan(0); // la durée existe…
    expect(minuteurUtile(tailler)).toBe(false); // …ce n'est pas une cuisson
  });

  test("mais la cuisson qui suit, oui", () => {
    expect(minuteurUtile(pas("revenir"))).toBe(true);
    expect(minuteurUtile(pas("mijoter"))).toBe(true);
  });

  // Les trois portes, une par une, sur des étapes fabriquées : chacune doit
  // suffire À ELLE SEULE, sinon la règle dépend d'un hasard du corpus.
  test("l'attente suffit, sans le moindre feu", () => {
    const trempage = { ...etape([], 5), attente: 720, attenteRaison: "trempage" };
    expect(chauffeDe(trempage)).toEqual(SANS_FEU);
    expect(minuteurUtile(trempage)).toBe(true);
  });

  test("s'en aller suffit : c'est le cas où il faut être rappelé", () => {
    const refroidir = { ...etape([], 20), surveille: false };
    expect(chauffeDe(refroidir)).toEqual(SANS_FEU);
    expect(minuteurUtile(refroidir)).toBe(true);
  });

  test("la chauffe suffit", () => {
    expect(minuteurUtile(etape(["bake"], 30))).toBe(true);
  });

  // L'INVARIANT QUI PROTÈGE LE TICKET DANS LES DEUX SENS. On ne retire un
  // minuteur QUE sur des gestes — jamais sur une cuisson, jamais sur une
  // attente, jamais sur une étape qu'on laisse. Et on en retire vraiment.
  test("aucune cuisson du corpus ne perd son minuteur", () => {
    const steps = catalogue.plats.flatMap((p) => p.steps);
    const perdues = steps.filter((e) => !minuteurUtile(e));
    expect(perdues.length).toBeGreaterThan(0);
    expect(perdues.length).toBeLessThan(steps.length);
    for (const e of perdues) {
      expect(chauffeDe(e)).toEqual(SANS_FEU);
      expect(e.attente).toBeNull();
      expect(e.surveille).toBe(true);
    }
  });

  // LE GRIL ET LE GAUFRIER TOMBAIENT EN « SANS FEU », ce qui est faux devant
  // une résistance de voûte, et leur aurait retiré le minuteur au passage.
  // Trouvé en écrivant la règle ci-dessus : c'est elle qui rend l'oubli visible.
  test("le gril et le gaufrier sont des cuissons", () => {
    expect(chauffeDe(etape(["grill"])).niveau).toBeGreaterThan(0);
    expect(chauffeDe(etape(["gaufrier"])).niveau).toBeGreaterThan(0);
    expect(minuteurUtile(etape(["grill"], 5))).toBe(true);
    expect(minuteurUtile(etape(["gaufrier"], 25))).toBe(true);
  });
});

describe("l'outil de l'étape", () => {
  const foyer = catalogue.foyer;

  // « Sur l'étape 2 il me manquerait la casserole à utiliser. » La réponse
  // était déjà résolue par `compile.py` et jetée par le chargeur.
  test("l'étape 2 de la bolognaise nomme la cocotte", () => {
    const o = outilDe(foyer, pas("revenir"));
    expect(o).toEqual({ texte: "cocotte 7,5 L", methode: false });
  });

  test("une étape sans besoin ne dit rien", () => {
    expect(pas("saler").needs).toEqual([]);
    expect(outilDe(foyer, pas("saler"))).toBeNull();
  });

  // Nommer un ustensile qu'on n'a pas serait pire que se taire : `compile.py`
  // marque déjà ces étapes « aucune solution avec l'équipement du foyer ».
  test("une capacité que le foyer ne porte pas se tait", () => {
    expect(foyer.outils["gaufrier"]?.label).toBeNull();
    expect(outilDe(foyer, etape(["gaufrier"]))).toBeNull();
  });

  // Un repli ne se résume pas à son nom : c'est la manière de faire qui est
  // l'instruction. L'écran ne la met donc pas en gras — d'où `methode`.
  test("la réécriture l'emporte sur le libellé", () => {
    const o = outilDe(foyer, etape(["chop-coarse"]))!;
    expect(o.methode).toBe(true);
    expect(o.texte).toBe(foyer.outils["chop-coarse"]!.reecrit);
  });

  // LA RÈGLE QUI DÉPARTAGE, et la seule chose que ce ticket ajoute à la
  // résolution : la ligne d'à côté dit déjà « Chauffe : Four », alors nommer le
  // four ici serait dire deux fois la même chose. Le récipient, lui, est l'autre
  // moitié de la question.
  test("le récipient l'emporte sur l'appareil", () => {
    expect(outilDe(foyer, etape(["bake", "gratin-vessel"]))!.texte).toContain("gratin");
    expect(outilDe(foyer, etape(["bake"]))!.texte).toBe("four chaleur tournante");
  });

  test("aucun outil inventé : tout ce qui sort vient de la table du foyer", () => {
    const dits = new Set<string>();
    for (const o of Object.values(foyer.outils)) {
      if (o.label) dits.add(o.label);
      if (o.reecrit) dits.add(o.reecrit);
    }
    let vus = 0;
    for (const p of catalogue.plats)
      for (const e of p.steps) {
        const o = outilDe(foyer, e);
        if (o === null) continue;
        vus++;
        expect(dits.has(o.texte)).toBe(true);
      }
    expect(vus).toBeGreaterThan(0);
  });

  // La taille est DANS le libellé, comme sur la fiche — c'est la seconde
  // moitié de la demande de T74, « et de quelle taille ».
  test("les récipients gardent leur taille", () => {
    expect(outilDe(foyer, etape(["simmer"]))!.texte).toMatch(/\d/);
    expect(outilDe(foyer, etape(["simmer-large"]))!.texte).toMatch(/\d/);
    expect(outilDe(foyer, etape(["pan-fry"]))!.texte).toMatch(/\d/);
  });
});

/* ─────────────────────────────────────────────────── T85 — le pourquoi du geste */

describe("l'astuce", () => {
  const steps = catalogue.plats.flatMap((p) => p.steps);

  test("le corpus en porte, et elles traversent le chargeur", () => {
    const avec = steps.filter((e) => e.astuce !== null);
    expect(avec.length).toBeGreaterThan(0);
    for (const e of avec) expect(e.astuce!.length).toBeGreaterThan(0);
  });

  // LA PROMESSE DU TICKET, ET ELLE EST VÉRIFIABLE : une astuce est le POURQUOI,
  // pas une seconde copie du geste. Si elle répétait l'action, elle ne ferait
  // qu'allonger l'écran — c'est exactement l'état d'avant, avec une ligne de
  // plus au lieu d'une phrase soudée.
  test("elle ne répète jamais l'action", () => {
    for (const e of steps) if (e.astuce) expect(e.astuce).not.toBe(e.action);
  });

  // Le geste doit tenir en un coup d'œil : c'est ce que `MAX_ACTION` tient
  // côté corpus, et ce test est son écho côté app — si l'export laissait
  // repasser une action-fleuve, le titre redeviendrait un paragraphe.
  test("aucune action du corpus ne redevient un paragraphe", () => {
    const longues = steps.filter((e) => e.action.length > 160);
    expect(longues.map((e) => e.action.slice(0, 60))).toEqual([]);
  });
});


/* ──────────────────────────────────────── T91 — lire une recette, ou la faire */

describe("lire, ou cuisiner", () => {
  // La fiche du créneau : personne n'a nommé de plat dans l'URL, c'est celui
  // que le créneau porte, et on vient le cuisiner.
  test("« En cuisine » ne nomme pas de plat, et ouvre le guide", () => {
    expect(pourLire(undefined, "sauce-bolognaise")).toBe(false);
    expect(pourLire(undefined, null)).toBe(false);
  });

  test("le bouton « Fiche » d'une carte ouvre une lecture", () => {
    // Le créneau est libre, ou porte autre chose : dans les deux cas on lit un
    // plat qu'on n'a pas posé.
    expect(pourLire("dahl-de-lentilles", null)).toBe(true);
    expect(pourLire("dahl-de-lentilles", "sauce-bolognaise")).toBe(true);
    expect(pourLire("dahl-de-lentilles", SAUTE)).toBe(true);
  });

  // LE CAS QUI A MOTIVÉ LA FONCTION, ET LE SEUL QUI NE SOIT PAS ÉVIDENT. Un
  // lien profond vers le plat qu'on a DÉJÀ posé n'est pas une lecture : c'est
  // la même fiche que « En cuisine », écrite autrement. La traiter en lecture
  // retirerait « Terminer » au cuisinier qui s'y rend par son historique.
  test("le plat que le créneau porte déjà se cuisine, même nommé dans l'URL", () => {
    expect(pourLire("sauce-bolognaise", "sauce-bolognaise")).toBe(false);
  });
});

describe("le temps d'un plat, et ce qu'il demande de présence", () => {
  const surveillee = (minutes: number) => etape([], minutes);
  const libre = (minutes: number) => ({ ...etape([], minutes), surveille: false });

  test("le total est celui de l'avancement, pas une seconde addition", () => {
    const steps = [surveillee(10), libre(45), surveillee(5)];
    expect(tempsDuPlat(steps).total).toBe(avancement(steps, 0).total);
  });

  // « 1 h, dont 45 min sans surveiller » est une autre phrase que « 1 h », et
  // c'est elle qui fait poser un plat un mardi soir.
  test("la part sans surveillance se compte à part", () => {
    expect(tempsDuPlat([surveillee(10), libre(45), surveillee(5)])).toEqual({
      total: 60,
      libre: 45,
    });
  });

  test("un plat où l'on reste devant du début à la fin ne promet rien", () => {
    expect(tempsDuPlat([surveillee(10), surveillee(5)]).libre).toBe(0);
  });

  test("un plat sans étapes ne compte ni l'un ni l'autre", () => {
    expect(tempsDuPlat([])).toEqual({ total: 0, libre: 0 });
  });

  // Le corpus, et pas un plat fabriqué : `libre` est une somme de minutes
  // d'étapes réelles, et elle ne peut jamais dépasser le temps du plat.
  test("sur tout le catalogue, la part libre tient dans le total", () => {
    for (const p of catalogue.plats) {
      const t = tempsDuPlat(p.steps);
      expect(t.libre, p.id).toBeLessThanOrEqual(t.total);
    }
  });
});
