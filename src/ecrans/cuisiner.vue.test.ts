import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { lireCatalogue } from "../model/catalogue";
import type { Catalogue, Etape } from "../model/types";
import {
  aArmer,
  aSortir,
  avancement,
  basculerMinuteur,
  chauffeDe,
  credit,
  minuteur,
  minuteurUtile,
  outilDe,
  provenanceIngredient,
  SANS_FEU,
  sansRecette,
  type EtatMinuteur,
} from "./cuisiner.vue";

const catalogue: Catalogue = lireCatalogue(
  JSON.parse(readFileSync("public/cuisine-data.json", "utf8")) as unknown,
);

// `uses: null` et non `[]` : ce helper ne dit rien des ingrédients, il ne
// prétend pas qu'il n'y en a aucun. Voir `Etape.uses`.
const etape = (needs: string[], minutes = 0): Etape => ({
  id: "e", action: "", minutes, needs, surveille: true,
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

describe("la provenance vue de la fiche", () => {
  const ing = (id: string, base = false) =>
    ({ id, nom: id, qty: null, base, assaisonnement: false }) as never;

  test("ce qui dort au placard ne part pas aux courses", () => {
    const p = catalogue.plats.find((x) => x.id === "sauce-bolognaise")!;
    const huile = p.ingredients.find((x) => x.id === "huile-olive")!;
    expect(provenanceIngredient(catalogue, huile)).toEqual({ label: "placard", acheter: false });
  });

  test("une base vient d'un autre plat, et se marque comme telle", () => {
    const p = catalogue.plats.find((x) => x.id === "pates-bolognaise")!;
    const base = p.ingredients.find((x) => x.base)!;
    expect(provenanceIngredient(catalogue, base).label).toBe("base");
    // Une base « s'achète » au sens de la fiche : elle n'est pas au placard. La
    // semaine, elle, sait qu'on ne l'achète pas — voir `calcul.provenance`.
    expect(provenanceIngredient(catalogue, base).acheter).toBe(true);
  });

  test("un alias de rayon désigne la même chose que sa cible", () => {
    // « oignons » et « oignon » ne doivent pas tomber dans deux rayons
    // différents, sinon la moitié d'une liste se dédouble.
    const [id, cible] = Object.entries(catalogue.rayons.aliases)[0]!;
    expect(provenanceIngredient(catalogue, ing(id))).toEqual(
      provenanceIngredient(catalogue, ing(cible)),
    );
  });

  test("ce dont le relevé dit qu'il en reste ne s'achète pas les yeux fermés", () => {
    // CE TEST DISAIT « les pâtes partent aux courses », ET C'ÉTAIT VRAI. Depuis
    // que le garde-manger est branché sur `provenance`, ce n'est plus la bonne
    // réponse : il traîne trois fonds de paquets en demi-lune haute. La fiche ne
    // promet pas la quantité — personne ne la suit —, elle dit d'aller voir.
    expect(provenanceIngredient(catalogue, ing("pates"))).toEqual({
      label: "au garde-manger",
      acheter: false,
    });
  });

  test("ce qui n'est ni au placard ni au relevé part aux courses", () => {
    expect(provenanceIngredient(catalogue, ing("saumon"))).toEqual({
      label: "à acheter",
      acheter: true,
    });
  });

  test("le fond de placard l'emporte sur le relevé", () => {
    // Les deux mènent à « ne pas acheter », mais ne disent pas la même chose :
    // on a TOUJOURS du sel, tandis qu'on a QUATRE BOÎTES de maïs. Pour le sel,
    // « combien m'en reste-t-il » n'est pas une question qui se pose.
    const fond = catalogue.rayons.placard[0]!;
    expect(provenanceIngredient(catalogue, ing(fond)).label).toBe("placard");
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
