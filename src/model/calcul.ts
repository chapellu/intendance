// Le cœur : panier, chaînage, plein tarif, provenance et rangement, pour une
// semaine partielle.
//
// Port de `apps/proto-shell/semaine.js` (`provenance`, `facteur`, `echelle`,
// `calculer`, `bilanStockage`). Le comportement est celui du proto, qui est
// celui du modèle Python de référence — les tests de `calcul.test.ts` épinglent
// chaque règle, y compris celles qu'on aimerait peut-être changer un jour.
//
// CE QUE `calculer` NE FAIT PAS : les offres de surproduction. Elles vivent en
// T5, avec le reste de ce qui NOTE une semaine plutôt que de la mesurer. La
// frontière n'est pas arbitraire : ici on mesure ce qu'une semaine coûte, là
// on juge ce qu'elle vaut, et le second appelle le premier — jamais l'inverse.

import { bandRepas, Depot, horlogesDu, qteDe, type LigneDepot, type Prise } from "./depot";
import { dateDe, joue, type Jeu } from "./jeu";
import type {
  Accept, Accompagnement, Catalogue, CauseLimite, Espace, Ingredient, Plat, Provenance,
} from "./types";

/* ────────────────────────────────────────────────────────────── provenance */

// D'où sort une ligne d'ingrédient. Ces cas existaient déjà avant le modèle,
// mais éclatés en trois encodages sans rapport — une liste placard globale, un
// booléen par ligne, un état du stock : chaque lecteur redécidait dans son coin.
//
// `absent` ne produit PAS de ligne de courses, et c'est contre-intuitif : une
// base manquante se rattrape en cuisinant, jamais en achetant la base. On
// n'achète nulle part 250 g de lentilles *cuites*.
//
// `placard` ET `garde-manger` FINISSENT TOUS DEUX « à vérifier », ET NE DISENT
// PAS LA MÊME CHOSE. `placard` est une appartenance — le sel, l'huile : on en a
// toujours, sans quantité et sans fin. `garde-manger` est un stock relevé —
// quatre boîtes de maïs, un filet d'oignons : ça existe, ça s'épuise, et rien ne
// suit sa consommation. Dire « tu en as assez » serait un mensonge ; dire « tu en
// as, va voir » est exactement vrai. C'est ce qui permet de brancher le
// garde-manger sans modèle de consommation.
//
// L'ordre les départage : ce qu'on a TOUJOURS l'emporte sur ce qu'on a EN CE
// MOMENT. Le jour où un paquet de sel entre au relevé, « placard » reste la
// bonne réponse, parce que « combien m'en reste-t-il » ne se pose pas pour lui.
//
// ────────────────────────────────────────────────────────────────────────────
// `gardeManger` DIT « IL EN RESTE », PAS « IL EN A EXISTÉ ».
//
// C'est la moitié que T24 n'avait pas branchée. Il a fait passer `provenance()`
// du rayon au RELEVÉ, et la phrase du dessus est devenue vraie — mais le relevé
// qu'il lisait était `catalogue.gardeManger.denrees`, c'est-à-dire l'instantané
// de l'export, qui ne bouge plus jamais. Un id entré là n'en sortait pas : on
// pouvait relever la zone à vide et lire quand même « Vous en avez — vérifiez la
// quantité » sur un placard qu'on venait de constater vide. Le commentaire
// ci-dessous promettait « dont le relevé dit qu'il en reste quelque chose »
// depuis T24, au-dessus d'un code qui ne le faisait pas — le motif du dépôt : un
// commentaire juste au-dessus d'un code faux ne se lit pas.
//
// L'ensemble vient donc de `jeu.gardeManger`, que le rejeu du journal écrase dès
// qu'il y a une base (voir `model/jeu.ts` et `db/gardeManger.ts`). Un id épuisé
// retombe sur `courses`, et la semaine l'achète.
//
// ÉCARTÉ : GATER SUR LA CONFIANCE. `journal.confiance()` sait dire qu'un niveau
// a vieilli, et on pouvait n'acheter que sur un zéro « sûr ». Mais la confiance
// mesure l'ÂGE du compte, pas la présence de la chose — et surtout les deux
// erreurs ne se valent pas : un deuxième paquet de pâtes coûte un euro et se
// range, un dîner sans pâtes ne se rattrape pas au magasin fermé. `db/courses.ts`
// tranche déjà dans ce sens — « la liste mentirait par omission, ce qui est la
// pire façon de mentir pour une liste de courses ».
// ────────────────────────────────────────────────────────────────────────────
function provenance(
  catalogue: Catalogue,
  ing: Ingredient,
  cid: string,
  prises: Prise[],
  gardeManger: ReadonlySet<string>,
): Provenance {
  if (ing.base) {
    const pr = prises.find((p) => p.trouve);
    if (!pr) return "absent";
    return pr.out?.from ? "chaine" : "frigo";
  }
  if (catalogue.rayons.placard.includes(cid)) return "placard";
  return gardeManger.has(cid) ? "garde-manger" : "courses";
}

const alias = (catalogue: Catalogue, id: string): string => catalogue.rayons.aliases[id] ?? id;

/* ──────────────────────────────────────────────────────── mise à l'échelle */

/** Ramène un facteur d'échelle à ce que la recette sait réellement produire.
 *  `besoin / rendement` donne 0,42 pour un foyer de 2,5 devant une recette
 *  pour 6. Pour une sauce, cuisiner 42 % du lot a un sens. Pour un plat bâti
 *  sur un objet entier, non : « faire 0,42 poulet rôti » n'est pas une
 *  quantité. */
const facteurLot = (plat: Plat, f: number): number =>
  plat.lotEntier ? Math.max(1, Math.ceil(f - 1e-9)) : f;

/** Le facteur d'échelle d'un plat pour un nombre de parts donné.
 *  Un plat qui SE GARDE se cuisine en lot entier même pour deux parts : couper
 *  un lot qui va au congélo ne fait pas gagner de place, seulement du travail. */
export function facteur(plat: Plat, besoin: number): number {
  const garde = plat.emits.some((e) => e.congelo || e.kind === "reste-plat");
  return facteurLot(plat, garde && besoin < plat.portions ? 1 : besoin / plat.portions);
}

/** Exposé pour la fiche recette : elle doit pouvoir montrer les vraies
 *  quantités d'un plat qui n'est pas encore joué. */
export const facteurAffiche = (plat: Plat, parts: number): number => facteur(plat, parts);

/** L'arrondi n'est pas cosmétique : une balance de cuisine pèse à 10 g près et
 *  personne ne compte 2,3 gousses d'ail. Une quantité qu'on ne peut pas
 *  exécuter est une quantité fausse. */
export function echelle(qty: number, unit: string, f: number): number {
  const v = qty * f;
  if (unit === "g") return Math.round(v / 10) * 10;
  if (["pièce", "gousse", "c. à s.", "c. à c.", "pincée"].includes(unit))
    return Math.round(v * 2) / 2;
  return Math.round(v * 10) / 10;
}

export const echelleTexte = (ing: Ingredient, f: number): string =>
  `${String(echelle(ing.qty, ing.unit, f)).replace(".", ",")} ${ing.unit}`;

/**
 * Un accompagnement sous la forme que lisent `provenance` et `echelleTexte`.
 *
 * LES QUATRE CHAMPS AJOUTÉS VALENT FAUX, TOUJOURS, et c'est pour ça qu'ils sont
 * ici et pas dans l'export : publier `base: false` sur chaque ligne de riz du
 * corpus serait publier une information qu'aucune donnée ne porte. Un
 * accompagnement ne sort d'aucune chaîne — on ne chaîne pas du riz, on le fait
 * cuire —, n'est visé par aucun `uses:` et ne franchit aucune porte de sel.
 */
export const commeIngredient = (a: Accompagnement): Ingredient => ({
  ...a,
  ref: a.id,
  base: false,
  assaisonnement: false,
  central: false,
});

/**
 * Où en sont, dans leur vie, les lots que cette prise a vidés — T47.
 *
 * ÇA SE LIT ICI ET NULLE PART AILLEURS, parce que c'est le seul endroit où l'on
 * sait à la fois QUELS lots ont été pris et à QUELLE DATE. Une fois `calculer`
 * rendu, le dépôt ne porte plus que des lignes `epuise: true` sans mémoire de
 * qui les a vidées ni quand — le score aurait dû redériver l'appariement, donc
 * le refaire faux.
 */
function fractionDeLaPrise(depot: Depot, pr: Prise, date: Date): number | null {
  let max: number | null = null;
  for (const s of pr.sources) {
    const v = depot.vie(s.ligne, date);
    if (v && (max == null || v.fraction > max)) max = v.fraction;
  }
  return max;
}

/* ─────────────────────────────────────────────────────────── les résultats */

export interface LigneChaine {
  creneau: number;
  type: string;
  depuis: string | null;
  age: number | null;
  /**
   * La part de vie consommée du lot le plus avancé où cette prise a puisé, sur
   * l'axe 0–1 de T57.
   *
   * `null` QUAND AUCUN LOT PRIS NE PORTE DE DATE — ce qu'aucun chemin de
   * `calculer` ne produit aujourd'hui : la table `stock` impose `born` et la
   * semaine date ce qu'elle range. Le cas est déclaré parce que `Depot.ajouter`
   * accepte un lot sans naissance, et un test le vérifie sur le corpus : si un
   * jour il tombe, il faudra décider ce que vaut un lot sans âge plutôt que le
   * laisser valoir zéro en silence.
   *
   * L'ÂGE SEUL NE DIT RIEN, ET C'EST POUR ÇA QUE CE CHAMP EXISTE — T47. « J-3 »
   * est une bonne nouvelle sur un bocal du congélateur et le dernier jour d'un
   * reste de poisson ; c'est la fenêtre qui tranche, et elle ne se lisait nulle
   * part sur cette ligne. Le score en avait besoin pour cesser de classer
   * l'urgence par ENDROIT.
   *
   * ON GARDE LE PLUS AVANCÉ, PAS LA MOYENNE. Une prise peut traverser deux
   * bocaux ; ce qui presse est le plus vieux des deux, et le moyenner
   * l'endormirait sous le neuf.
   */
  fraction: number | null;
  pris: number | null;
  unite: string | null;
  manque: number;
  recit: string;
}

export interface Manque {
  /** Le créneau qui réclame. */
  i: number;
  acc: Accept;
  manque: number;
  unite: string | null;
  titre: string;
  gainMin: number;
}

export interface PleinTarif {
  creneau: number;
  minutes: number;
}

/** Une ligne du panier — l'agrégat d'un ingrédient sur toute la semaine. */
export interface LignePanier {
  id: string;
  nom: string;
  qty: number;
  unit: string;
  /** Combien de plats la réclament. */
  n: number;
}

/** Le bilan d'un espace : ce qu'il portait, ce que la semaine y met, ce qu'elle
 *  y prend, et lequel de ses deux plafonds mord. */
export interface BilanEspace {
  places: number;
  contenants: number;
  limite: number;
  cause: CauseLimite;
  debut: number;
  entre: number;
  sort: number;
  fin: number;
  libre: number;
  deborde: boolean;
}

export interface Calcul {
  panier: Map<string, LignePanier>;
  /** Ce qu'on a déjà et qu'on vérifie au lieu de l'acheter.
   *
   *  `prov` sépare les deux raisons de ne pas acheter, qui n'appellent pas le
   *  même coup d'œil au rayon : `placard` (on en a toujours — le sel) et
   *  `garde-manger` (il en reste, quantité inconnue — quatre boîtes de maïs). */
  aVerifier: Map<string, { nom: string; prov: Provenance }>;
  chaine: LigneChaine[];
  pleinTarif: PleinTarif[];
  manques: Manque[];
  provenances: Partial<Record<Provenance, number>>;
  facteurs: number[];
  depot: Depot;
  stockage: Record<Espace, BilanEspace>;
}

/* ────────────────────────────────────────────────────────────── le calcul */

/**
 * LA COUTURE ENTRE LE FAIT ET LA PROJECTION — T26.
 *
 * Un créneau déjà cuisiné a **engagé ses effets pour de bon** : ses bocaux sont
 * dans la table `stock`, son prélèvement en est parti. Continuer à le projeter
 * ici compterait la sauce DEUX FOIS — une fois parce qu'on l'a faite, une fois
 * parce que la semaine prévoit de la faire — et le dépôt afficherait deux
 * bolognaises là où il y en a une.
 *
 * C'est la conséquence à construire de l'événement cuisiné, et elle n'est pas
 * cosmétique : sans elle, journaliser AGGRAVE le modèle au lieu de le réparer.
 *
 * On passe donc les créneaux cuisinés, en les nommant par leur clé
 * `(jour, repas)` — jamais par leur index, pour la raison que `db/schema.ts`
 * expose en tête : l'index d'un créneau change de sens d'un jour à l'autre.
 */
export function calculer(
  jeu: Jeu,
  choix = jeu.choix,
  jetes: string[] = [],
  parts = jeu.parts,
  cuisines: ReadonlySet<string> = new Set(),
): Calcul {
  const { catalogue } = jeu;
  // LE DÉPÔT PART DE `jeu.stock`, PAS DE `catalogue.stock`. L'export dit ce que
  // la cuisine portait le jour où il a été produit ; la base dit ce qu'elle
  // porte. Tant que le calcul lisait le catalogue, retirer un lot fini de
  // l'inventaire ne changeait rien — et l'app continuait de chaîner sur un
  // bocal que personne n'avait plus. Voir `Jeu.stock` et `db/stock.ts`.
  //
  // `jetes` reste ce qu'il était : le levier « ET SI je n'avais plus ça ? »,
  // une simulation qui ne touche à rien. Retirer un lot de la table, c'est le
  // constat. Les deux passent par le même filtre, et c'est normal — la
  // différence est dans qui s'en souvient demain.
  const depot = new Depot(
    horlogesDu(catalogue),
    jeu.stock.filter((o) => !jetes.includes(o.type)),
  );

  const panier = new Map<string, LignePanier>();
  // La valeur porte la PROVENANCE en plus du nom : l'écran doit pouvoir séparer
  // « on en a toujours » de « il t'en reste », qui n'appellent pas le même coup
  // d'œil au rayon.
  const aVerifier = new Map<string, { nom: string; prov: Provenance }>();
  // Construit une fois par calcul : `calculer` traverse jusqu'à vingt-et-un
  // plats, et refaire l'ensemble à chaque ligne serait le refaire quelques
  // centaines de fois pour rien.
  const gardeManger = new Set(jeu.gardeManger);
  const chaine: LigneChaine[] = [];
  const pleinTarif: PleinTarif[] = [];
  const manques: Manque[] = [];
  const provenances: Partial<Record<Provenance, number>> = {};
  const facteurs = choix.map(() => 1);

  choix.forEach((rid, i) => {
    if (!joue(rid)) return;
    // Déjà cuisiné : ses effets sont dans la base, pas dans cette projection.
    // Voir la couture, en tête de cette fonction.
    if (cuisines.has(cleDuCreneau(jeu, i))) return;
    const p = jeu.plats[rid];
    if (!p) return;
    const date = dateDe(jeu, i);
    let plein = false;
    const prises: Prise[] = [];

    // 7 Wonders : un `accepts` non couvert est un PRIX, pas une barrière.
    for (const acc of p.accepts) {
      const pr = depot.prelever(acc, date);
      prises.push(pr);
      if (pr.trouve)
        chaine.push({
          creneau: i,
          type: pr.out!.type,
          depuis: pr.out!.from,
          age: pr.age,
          fraction: fractionDeLaPrise(depot, pr, date),
          pris: pr.pris,
          unite: pr.unite,
          manque: pr.manque,
          recit: pr.raconte(),
        });
      // Ce qui manque EN GRANDEUR remonte : c'est ce qui rend la semaine
      // dimensionnable, un plat amont pouvant être cuisiné plus grand exprès.
      if (pr.manque > 1e-9)
        manques.push({
          i, acc, manque: pr.manque, unite: pr.unite,
          titre: p.titre, gainMin: p.gainChainage,
        });
      if (pr.couvert || (pr.trouve && pr.approximatif)) continue;
      if (p.sansReste) {
        plein = true;
        pleinTarif.push({ creneau: i, minutes: p.sansReste.minutes });
      }
    }

    const besoin = parts[i] ?? catalogue.foyer.parts;
    const f = facteur(p, besoin);
    facteurs[i] = f;
    const lignes = [...p.ingredients];
    if (plein && p.sansReste) lignes.push(...p.sansReste.ingredients);

    const auPanier = (ing: Ingredient, echelleLigne: number) => {
      const cid = alias(catalogue, ing.id);
      const prov = provenance(catalogue, ing, cid, prises, gardeManger);
      provenances[prov] = (provenances[prov] ?? 0) + 1;
      if (catalogue.horsCourses.includes(prov)) return;
      if (prov === "placard" || prov === "garde-manger") {
        aVerifier.set(cid, { nom: ing.nom, prov });
        return;
      }
      const cle = `${cid}|${ing.unit}`;
      const slot = panier.get(cle) ?? { nom: ing.nom, qty: 0, n: 0, id: cid, unit: ing.unit };
      slot.qty += echelle(ing.qty, ing.unit, echelleLigne);
      slot.n += 1;
      panier.set(cle, slot);
    };

    for (const ing of lignes) auPanier(ing, f);

    // L'ACCOMPAGNEMENT EST UNE COURSE COMME UNE AUTRE, et c'est la moitié du
    // service rendu : une recette qui dit « avec du riz » sans que le riz
    // n'arrive dans la liste laisse exactement le trou qu'elle prétend combler.
    //
    // MAIS IL NE SUIT PAS LE FACTEUR DU PLAT, ET C'EST LA SUBTILITÉ. `facteur`
    // arrondit au LOT — un plat qui se garde se cuisine en entier même pour
    // deux parts et demie, parce que couper un lot qui part au congélateur ne
    // fait gagner que du travail. Le riz, lui, se fait pour ceux qui sont à
    // table ce soir : le reste d'escalopes sera un autre repas, sur un autre
    // créneau, qui portera son propre accompagnement. Suivre `f` ferait acheter
    // du riz pour six un soir où l'on est deux et demi.
    for (const a of p.avec) auPanier(commeIngredient(a), besoin / p.portions);

    for (const e of p.emits) {
      const [amount, unit] = qteDe(e);
      depot.ajouter(
        { ...e, qty: amount == null ? null : { amount: amount * f, unit: unit! } },
        { born: date, source: rid, location: "frigo" },
      );
    }
  });

  return {
    panier, aVerifier, chaine, pleinTarif, manques, provenances, facteurs, depot,
    stockage: bilanStockage(jeu, choix, jetes, facteurs, depot, cuisines),
  };
}

/* ─────────────────────────────────────── la cuisine n'est pas infinie */

// DEUX PLAFONDS PAR ESPACE, tous deux réels : les ÉTAGÈRES et les CONTENANTS.
// Le plus bas commande, et savoir lequel mord change le geste — dégager une
// étagère, ou laver des boîtes. Dans une vraie cuisine, la contrainte n'est
// presque jamais « le congélateur est plein » : c'est « les six boîtes sont au
// frigo avec la ratatouille de mardi dedans ».
export function bilanStockage(
  jeu: Jeu,
  choix: Jeu["choix"],
  jetes: string[],
  facteurs: number[],
  depot: Depot,
  cuisines: ReadonlySet<string> = new Set(),
): Record<Espace, BilanEspace> {
  const { catalogue } = jeu;
  const debut: Partial<Record<Espace, number>> = {};
  const entre: Partial<Record<Espace, number>> = {};
  const sort: Partial<Record<Espace, number>> = {};
  const add = (acc: Partial<Record<Espace, number>>, e: Espace, n: number) => {
    acc[e] = (acc[e] ?? 0) + n;
  };

  for (const o of jeu.stock) {
    if (jetes.includes(o.type)) continue;
    add(debut, o.location, bandRepas(o.qty_band));
  }

  choix.forEach((rid, i) => {
    if (!joue(rid)) return;
    // Un créneau cuisiné a déjà rangé ses bocaux : ils sont dans `debut`, par
    // la table `stock`. Les compter aussi dans `entre` remplirait deux fois le
    // même tiroir, et le bilan annoncerait un débordement qui n'existe pas.
    if (cuisines.has(cleDuCreneau(jeu, i))) return;
    const p = jeu.plats[rid];
    if (!p) return;
    for (const e of p.emits) add(entre, e.espace, bandRepas(e.band) * (facteurs[i] ?? 1));
  });

  // Ce que la semaine MANGE rend sa place ET son contenant. Sans ce terme, le
  // rangement ne serait qu'un compteur qui monte — et un niveau qu'on ne mesure
  // qu'à la hausse n'est pas un niveau.
  for (const l of depot.lignes) {
    if (!l.epuise) continue;
    add(sort, espaceDe(l), bandRepas(l.band));
  }

  const bilan = {} as Record<Espace, BilanEspace>;
  for (const [espace, cfg] of Object.entries(catalogue.foyer.espaces) as [Espace, Catalogue["foyer"]["espaces"][Espace]][]) {
    const fin = (debut[espace] ?? 0) + (entre[espace] ?? 0) - (sort[espace] ?? 0);
    bilan[espace] = {
      ...cfg,
      debut: debut[espace] ?? 0,
      entre: entre[espace] ?? 0,
      sort: sort[espace] ?? 0,
      fin,
      libre: Math.max(0, cfg.limite - fin),
      deborde: fin > cfg.limite,
    };
  }
  return bilan;
}

/** Où une ligne du dépôt compte, pour le budget de rangement. */
export const espaceDe = (l: LigneDepot): Espace => l.espace;

/**
 * La clé `(jour, repas)` d'un créneau — la même que celle de la base.
 *
 * Elle est reconstruite ici plutôt qu'importée de `db/` parce que le modèle ne
 * dépend pas de la base ; mais c'est bien le même couple, et pour la même
 * raison : un index de créneau change de sens d'un jour sur l'autre.
 */
export function cleDuCreneau(jeu: Jeu, i: number): string {
  const c = jeu.creneaux[i];
  if (!c) return "";
  const j = jeu.jours[c.jour];
  if (!j) return "";
  const d = j.date;
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const jj = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${jj}|${c.repas}`;
}

/* ──────────────────────────────────────────────────────── lectures dérivées */

/** Le panier, prêt pour la liste de courses. Les unités qui ne se coupent pas
 *  s'arrondissent au-dessus : on n'achète pas 2,4 œufs. */
export function articles(panier: Map<string, LignePanier>): LignePanier[] {
  return [...panier.values()].map((s) => ({
    ...s,
    qty: ["pièce", "gousse"].includes(s.unit) ? Math.ceil(s.qty - 1e-9) : s.qty,
  }));
}

/** Minutes de cuisine par JOUR — pas par créneau. C'est la journée qui fatigue,
 *  pas le repas : trois plats qui tiennent chacun dans leur budget peuvent
 *  faire une journée intenable. */
export function minutesParJour(jeu: Jeu, choix = jeu.choix): number[] {
  const parJour = jeu.jours.map(() => 0);
  choix.forEach((rid, i) => {
    if (!joue(rid)) return;
    const p = jeu.plats[rid];
    const c = jeu.creneaux[i];
    if (!p || !c) return;
    parJour[c.jour] = (parJour[c.jour] ?? 0) + p.minutes;
  });
  return parJour;
}
