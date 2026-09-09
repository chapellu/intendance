// Ce qui NOTE une semaine, par-dessus ce qui la mesure.
//
// `calcul.ts` dit ce qu'une semaine coûte. Ici on dit ce qu'elle vaut, et donc
// ce que l'écran propose : la couverture (protéines, familles de légumes), le
// score d'un plat sur un créneau donné, et la main de cartes qu'on en tire.
//
// LE SCORE EST LE VRAI DESIGN DE L'ÉCRAN. Une carte n'est pas proposée parce
// qu'elle est bonne dans l'absolu, mais parce qu'elle est bonne ICI : elle
// apporte une protéine qui manque, elle mange un reste qui allait périmer, elle
// ne répète pas le féculent d'hier. Les poids viennent du catalogue, pas d'ici
// — les changer est une décision de modèle, pas de code.
//
// Port de `apps/proto-shell/semaine.js` (`couverture`, `categorie`, `offre`,
// `main`, `alea`, `parRayon`).

import { marque } from "./axe";
import { articles, calculer, type LignePanier } from "./calcul";
import { ecoulement, nom, type Ecoulable } from "./ecoulement";
import { aEcouler, placardDuPlat } from "./gardeManger";
import { convient, joue, type Choix, type Jeu } from "./jeu";
import { contexte, type Rejeu } from "./journal";
import { gamelles } from "./offres";
import { bonusPlancher, etatDuCongelo, type Plancher } from "./plancher";
import { bloque, paris, type Passe } from "./questions";
import type { Catalogue, Plat } from "./types";

/**
 * Ce que la proposition sait du placard et de la passe en cours — T33.
 *
 * OPTIONNEL, ET IL DOIT LE RESTER. `offre` est appelé par des écrans qui n'ont
 * pas le journal sous la main, et une proposition sans placard reste une
 * proposition juste : simplement, elle ne bloque rien et ne parie rien à voix
 * haute. Le rendre obligatoire aurait fait passer le journal par quatre
 * signatures pour un service que trois d'entre elles n'utilisent pas.
 */
export interface Savoir {
  rejeu: Rejeu;
  passe: Passe;
  /**
   * Les plats cuisinés dans les `cooldown_jours` derniers jours — T52.
   *
   * ILS SORTENT DU PAQUET, PAS DU CLASSEMENT. Un plat mangé mardi n'est pas
   * devenu mauvais, il est devenu prématuré — et un malus l'aurait laissé
   * remonter dès que la semaine se serre, c'est-à-dire exactement quand la
   * répétition se remarque. Vide quand le journal ne dit rien, ce qui rend le
   * terme inoffensif sur une base neuve.
   */
  cuisinesRecemment: ReadonlySet<string>;
  /**
   * Les planchers par type qu'un doigt a validés — T37.
   *
   * VIDE AU DÉMARRAGE À FROID, ET C'EST LA PROMESSE DU TICKET : aucun type n'a
   * de plancher tant qu'il n'a pas été cuisiné deux fois et que la proposition
   * n'a pas été acceptée. Donc aucun bonus par type en semaine 1, et une
   * proposition sans `savoir` — celle des écrans qui n'ont pas la base sous la
   * main — n'en invente aucun non plus.
   *
   * Le plancher de SECOURS, lui, n'est pas ici : il vient du catalogue et vaut
   * dès le premier jour. Ce n'est pas une hypothèse sur des habitudes, c'est une
   * propriété du foyer — dix-huit places et un soir qui peut s'effondrer.
   */
  planchers: readonly Plancher[];
}

/* ───────────────────────────────────────────────────────────── couverture */

export interface Couverture {
  servi: Record<string, number>;
  feculent: Record<string, number>;
  profil: Record<string, number>;
  familles: Set<string>;
  /** Protéines sous leur minimum, et de combien. */
  manques: Record<string, number>;
  /** Protéines qui ont atteint leur maximum ACHETÉ — un plat bâti sur un reste
   *  n'y compte pas, puisqu'il ne coûte rien de plus. */
  satures: Record<string, boolean>;
  famillesManquantes: number;
}

export function couverture(jeu: Jeu, choix: Choix[]): Couverture {
  const { catalogue } = jeu;
  const servi: Record<string, number> = {};
  const achete: Record<string, number> = {};
  const feculent: Record<string, number> = {};
  const profil: Record<string, number> = {};
  const familles = new Set<string>();

  choix.forEach((rid, i) => {
    if (!joue(rid)) return;
    // Les cibles se mesurent sur les repas principaux. Les plafonds ont été
    // posés contre six dîners ; les étaler sur vingt-et-un créneaux les
    // diviserait par deux sans que personne l'ait décidé.
    const c = jeu.creneaux[i];
    if (!c || !jeu.equilibreSur.includes(c.repas)) return;
    const p = jeu.plats[rid];
    if (!p) return;

    const a = p.apports;
    const surReste = p.ingredients.some((x) => x.base);
    if (a.proteine && a.proteine !== "aucune") {
      servi[a.proteine] = (servi[a.proteine] ?? 0) + 1;
      if (!surReste) achete[a.proteine] = (achete[a.proteine] ?? 0) + 1;
    }
    if (a.feculent && a.feculent !== "aucun")
      feculent[a.feculent] = (feculent[a.feculent] ?? 0) + 1;
    for (const x of a.legumes) familles.add(x);
    if (a.profil) profil[a.profil] = (profil[a.profil] ?? 0) + 1;
  });

  const cibles = catalogue.equilibre.cibles;
  const manques: Record<string, number> = {};
  const satures: Record<string, boolean> = {};
  for (const [p, c] of Object.entries(cibles.proteine)) {
    if (c.min != null && (servi[p] ?? 0) < c.min) manques[p] = c.min - (servi[p] ?? 0);
    if (c.max != null && (achete[p] ?? 0) >= c.max) satures[p] = true;
  }

  return {
    servi, feculent, profil, familles, manques, satures,
    famillesManquantes: Math.max(0, cibles.familles_legumes_min - familles.size),
  };
}

/* ─────────────────────────────────────────────────────────── la catégorie */

export type Categorie = "derive" | "souche" | "express" | "congelable" | "complet";

/** L'enseigne de la carte. DÉRIVÉE DES DONNÉES, jamais étiquetée à la main :
 *  un plat est « sur un reste » parce qu'il en accepte un, pas parce qu'on
 *  l'a rangé là. L'ordre compte — un plat peut cocher plusieurs cases, et
 *  c'est le premier trait vrai qui le nomme. */
export function categorie(p: Plat): Categorie {
  if (p.accepts.length) return "derive";
  if (p.emits.some((e) => e.kind === "base")) return "souche";
  if (p.minutes <= 25) return "express";
  if (p.emits.some((e) => e.congelo)) return "congelable";
  return "complet";
}

/* ────────────────────────────────────────────────────── noter les candidats */

export interface Carte {
  plat: Plat;
  categorie: Categorie;
  score: number;
  /** Articles que ce plat ajoute au panier de la semaine. Zéro = gratuit. */
  marginal: number;
  pourquoi: string[];
  malTransporte: boolean;
  /** Le plat exige un reste que rien ne couvre. */
  manque: boolean;
  minutes: number;
  chaine: boolean;
  depuis: string | null;
  recit: string | null;
  /** « Il y en a, mais pas assez » : le troisième cas que le booléen d'avant
   *  confondait avec « il y en a ». */
  partiel: boolean;
  plein: boolean;
  /**
   * Ce que ce plat écoulerait, du plus pressé au moins — placard ET dépôt
   * confondus depuis T47. Vide quand il n'écoule rien, ce qui est le cas le plus
   * fréquent, et normal.
   *
   * LE CHAMP S'APPELAIT `placard` ET NE POUVAIT PLUS. Il ne portait que le
   * garde-manger ; y verser un bocal du congélateur sous ce nom aurait fait
   * mentir chacun de ses lecteurs sans qu'aucun ne rougisse. Chaque article dit
   * d'où il vient (`ou`), parce que la PHRASE en dépend encore même si le SCORE
   * n'en dépend plus.
   */
  ecoule: Ecoulable[];
  /** L'un d'eux a-t-il franchi la ligne « urgent » de T57 ? `false` = seulement
   *  des paquets entamés et des bocaux jeunes, ce qui n'appelle pas le même
   *  geste. */
  sauve: boolean;
  /**
   * Les types que ce plat remonterait vers leur plancher — T34.
   *
   * Vide pour les 40 plats du corpus qui ne congèlent rien, vide aussi tant
   * qu'aucun plancher n'a été validé, et vide encore quand le congélateur est
   * plein : dans les trois cas il n'y a rien à reconstituer, et le score ne
   * paie rien. Le plancher de secours, lui, ne nomme aucun type — il porte sur
   * le tiroir entier — et se lit dans `pourquoi`.
   */
  plancher: string[];
  /**
   * Ce que cette carte PARIE — les secondaires que le modèle croit avoir sans
   * en être sûr (T33). Vide quand elle ne parie rien, ce qui est le cas normal.
   *
   * Une estimation doit être visible et contredisable ; c'est le seul endroit
   * de la carte où l'app dit « je crois », et l'écran en fait un geste.
   */
  paris: string[];
}

/**
 * Tous les plats jouables sur un créneau, notés et triés.
 *
 * `calculer` est rejoué pour CHAQUE plat candidat, parce que le coût marginal
 * d'une carte ne se lit nulle part ailleurs : il faut poser le plat et regarder
 * ce que le panier devient.
 *
 * ON A LONGTEMPS CRU QUE C'ÉTAIT CHER. Mesuré (T17, `npm run perf`) : un appel
 * coûte 1 ms pour 29 candidats, et poser les quatorze créneaux d'une semaine en
 * coûte 12. Rien à mémoïser — et surtout rien à mémoïser « au cas où », ce qui
 * aurait ajouté une invalidation à tenir juste pour un problème inexistant.
 */
export function offre(jeu: Jeu, choix: Choix[], slot: number, savoir?: Savoir): Carte[] {
  const base = calculer(jeu, choix);
  const nBase = base.panier.size;
  const deja = new Set(choix.filter(Boolean));
  const cov = couverture(jeu, choix);
  const poids = jeu.catalogue.equilibre.poids;
  const rep = jeu.catalogue.equilibre.cibles.repetition_max;
  const cr = jeu.creneaux[slot];
  if (!cr) return [];

  // Le placard ne change pas d'un plat à l'autre : on le lit une fois pour la
  // proposition entière, pas 86 fois. Même raison pour le contexte du journal.
  const pressees = aEcouler(jeu.catalogue);
  // LE CONGÉLATEUR SE LIT AVANT LA CARTE, ET UNE SEULE FOIS. Le lire par
  // candidat le mesurerait 86 fois pour un tiroir qui ne bouge pas d'un plat à
  // l'autre — et surtout, il doit être lu AVANT de poser la carte : un plat qui
  // remplit le congélateur ne doit pas s'éteindre son propre bonus. C'est le
  // même raisonnement que `cov`, qui se mesure sur `choix` et pas sur `essai`.
  const congelo = etatDuCongelo(jeu.catalogue, base.depot.lignes);
  const planchers = savoir?.planchers ?? [];
  const ctx = savoir ? contexte(jeu.catalogue) : null;
  const horsJeu = savoir && ctx ? bloque(jeu.catalogue, ctx, savoir.passe) : () => false;

  // Ce créneau est-il le dîner qui précède un déjeuner de coworking encore vide ?
  const gamelleDemain =
    cr.repas === "diner"
      ? (gamelles(jeu, choix).find((g) => g.veille === slot && !g.fait)?.jour ?? null)
      : null;

  return jeu.catalogue.plats
    // LE BLOCAGE EST UN FILTRE, PAS UN MALUS, et c'est le « retire ou substitue
    // AVANT qu'il soit proposé » de T33. Un plat dont un central vient d'être
    // dit absent ne mérite pas d'être classé dernier : il ne mérite pas d'être
    // montré, et la carte tirée à sa place l'est sur un placard vérifié.
    .filter((p) => !deja.has(p.id) && convient(jeu, p, slot) && !horsJeu(p))
    .map((p): Carte => {
      const essai = [...choix];
      essai[slot] = p.id;
      const apres = calculer(jeu, essai);
      const chaineIci = apres.chaine.filter((c) => c.creneau === slot);
      const pleinIci = apres.pleinTarif.filter((c) => c.creneau === slot);
      const a = p.apports;
      const surReste = p.ingredients.some((x) => x.base);
      const malTransporte = cr.emporte && p.transportable === false;

      let score = 0;
      const pourquoi: string[] = [];

      if (a.proteine && a.proteine !== "aucune") {
        if (cov.manques[a.proteine]) {
          score += poids["proteine_manquante"] ?? 0;
          pourquoi.push(`apporte ${a.proteine}, qui manque`);
        } else if (cov.satures[a.proteine] && !surReste) {
          score += poids["proteine_saturee"] ?? 0;
          pourquoi.push(`${a.proteine} déjà servi assez`);
        } else if (cov.satures[a.proteine]) {
          pourquoi.push(`${a.proteine} déjà pris, mais celle-ci est déjà payée`);
        }
      }

      const neuves = a.legumes.filter((f) => !cov.familles.has(f));
      if (neuves.length) {
        score += (poids["famille_legume_neuve"] ?? 0) * neuves.length;
        pourquoi.push("légumes nouveaux : " + neuves.join(", "));
      }

      if (a.feculent && (cov.feculent[a.feculent] ?? 0) >= (rep["feculent"] ?? Infinity))
        score += poids["repetition_feculent"] ?? 0;

      if (a.profil && (cov.profil[a.profil] ?? 0) >= (rep["profil"] ?? Infinity)) {
        score += poids["repetition_profil"] ?? 0;
        pourquoi.push(`encore du ${a.profil}`);
      }

      if (chaineIci.length) score += poids["chaine_couverte"] ?? 0;

      // Gamelle : un plat qui voyage mal n'est pas interdit, juste moins bon.
      if (malTransporte) {
        score += poids["mal_transporte"] ?? -6;
        pourquoi.push("voyage mal en gamelle");
      }

      // Le dîner de la veille d'un jour de coworking a un second métier : il
      // fabrique la gamelle. Un plat qui voyage et laisse un reste vaut mieux
      // là qu'ailleurs — même poids que le chaînage, parce que c'en est un.
      if (
        gamelleDemain &&
        p.transportable !== false &&
        p.emits.some((e) => e.kind === "reste-plat")
      ) {
        score += poids["chaine_couverte"] ?? 0;
        pourquoi.push(`laisse la gamelle de ${gamelleDemain}`);
      }

      // Un `accepts` requis que rien ne couvre reste une mauvaise idée.
      const requisNonCouvert =
        p.accepts.some((acc) => acc.requis) && !chaineIci.length && !p.sansReste;
      if (requisNonCouvert) {
        score += poids["chaine_manquante"] ?? 0;
        pourquoi.push(`demande ${p.accepts.map((acc) => acc.type ?? `un ${acc.kind}`).join(", ")}`);
      }

      // CE QUE LE PLAT ÉCOULE — placard ET dépôt, DANS LA MÊME SOMME (T47).
      //
      // Après les autres termes, parce qu'il départage deux plats également bons
      // plutôt qu'il ne rachète un mauvais plat : un plat qui sature une protéine
      // reste mauvais même s'il vide le bac à légumes.
      //
      // « DERNIER RECOURS » N'EST PLUS TOUT À FAIT VRAI DEPUIS T59, et il faut le
      // dire ici plutôt que de laisser la phrase vieillir. Le terme cumule
      // jusqu'à trois articles, donc jusqu'à +15 en théorie — au-dessus de
      // `proteine_manquante: 6`. C'est assumé et c'est le cahier des charges
      // (Workspace#41 : encourager « au maximum » l'utilisation des stocks) ; voir
      // l'objection d'équilibrage, soulevée et écartée, dans `ecoulement.ts`.
      //
      // UN SEUL PLAFOND POUR LES DEUX STOCKS, et c'est la vraie difficulté du
      // ticket. Laisser le placard plafonner de son côté et le dépôt du sien
      // aurait fait six articles là où la règle en promet trois, et le plafond
      // aurait cessé d'être un plafond sans qu'aucune ligne ne change de sens.
      // D'où `placardDuPlat`, qui a perdu sa notation en route.
      //
      // LES LOTS DE LA SEMAINE COMPTENT COMME LES AUTRES, et ce n'est pas un
      // oubli. `chaineIci` porte aussi bien le bocal de l'amorce que la sauce
      // qu'on a posée mardi ; leur appliquer deux barèmes ferait revenir par
      // l'ORIGINE exactement ce que T47 chasse par l'ENDROIT. Un lot cuisiné
      // hier vaut sa fraction, qui est petite, et personne n'a eu à l'écrire.
      const duDepot: Ecoulable[] = chaineIci
        .filter((c) => c.fraction != null)
        .map((c) => ({ id: c.type, fraction: c.fraction!, ou: "depot" }));
      const eco = ecoulement([...placardDuPlat(jeu.catalogue, p, pressees), ...duDepot], poids);
      if (eco.score) {
        score += eco.score;

        // DEUX PHRASES, PARCE QUE CE SONT DEUX GESTES — et le partage n'est plus
        // celui du stock, c'est celui de l'axe. « Se perdent » appelle à cuisiner
        // ce soir, quoi que ce soit et où que ce soit rangé ; « entamés » dit
        // seulement qu'un paquet est ouvert et qu'autant le finir.
        const presses = eco.articles.filter((a) => marque(a.fraction) === "urgent");
        if (presses.length) pourquoi.push(`sauve ce qui se perd : ${presses.map(nom).join(", ")}`);

        // Le reste du PLACARD se dit ; le reste du DÉPÔT se tait, parce qu'il est
        // déjà dit ailleurs et mieux. Un bocal jeune est annoncé par `recit` —
        // « 700 g du congélo », « du frigo (J-2) » — que la carte affiche en
        // toutes lettres depuis le prototype. Le répéter en « finit des paquets
        // entamés : sauce bolognaise » serait faux deux fois : ce n'est pas un
        // paquet, et ce n'est pas entamé.
        const entames = eco.articles.filter(
          (a) => a.ou === "placard" && marque(a.fraction) !== "urgent",
        );
        if (entames.length)
          pourquoi.push(`finit des paquets entamés : ${entames.map(nom).join(", ")}`);
      }

      // CE QUE LE PLAT REMET AU CONGÉLATEUR — T34 à T38. Après le placard,
      // parce que c'est le même registre : un argument qui départage deux plats
      // également bons, pas un argument qui rend bon un mauvais plat. Et avant
      // `article_marginal`, qui va faire payer à ce plat de reconstitution
      // chaque article qu'il ajoute au panier — c'est ainsi que reconstituer un
      // bouillon (qui n'exige rien) bat naturellement reconstituer une
      // bolognaise (qui exige de la viande), sans qu'aucune règle le dise.
      const plancher = bonusPlancher(p, congelo, planchers, poids);
      score += plancher.score;
      pourquoi.push(...plancher.raisons);

      const marginal = apres.panier.size - nBase;
      score += (poids["article_marginal"] ?? 0) * marginal;

      return {
        plat: p,
        categorie: categorie(p),
        score: Math.round(score * 10) / 10,
        marginal,
        pourquoi,
        ecoule: eco.articles,
        sauve: eco.marque === "urgent",
        plancher: plancher.types,
        paris: savoir && ctx ? paris(jeu.catalogue, ctx, savoir.rejeu, p) : [],
        malTransporte,
        manque: requisNonCouvert,
        minutes: p.minutes + (pleinIci[0]?.minutes ?? 0),
        chaine: chaineIci.length > 0,
        depuis: chaineIci[0]?.depuis ?? null,
        recit: chaineIci[0]?.recit ?? null,
        partiel: chaineIci.some((c) => c.manque > 1e-9),
        plein: pleinIci.length > 0,
      };
    })
    .sort((x, y) => y.score - x.score);
}

/* ──────────────────────────────────────────────────────── la main de cartes */

/** Tirage pondéré DÉTERMINISTE : la même main tant qu'on ne repioche pas. Une
 *  main qui change à chaque rendu n'est pas une main, c'est une loterie — et on
 *  ne choisit pas entre des cartes qui bougent. */
function alea(graine: string): () => number {
  let h = 2166136261;
  for (const c of graine) {
    h ^= c.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * La main : quelques cartes tirées parmi les jouables, avec une garantie de
 * variété. Les trois enseignes garanties d'abord — une express, une souche, une
 * dérivée — puis on complète. Sans elles, le score seul servirait cinq fois la
 * même famille de plats.
 *
 * LE CATALOGUE COMMANDE ENFIN — T52. `taille` valait 4 en dur alors que
 * `equilibre.main.taille` dit 5, et `garantir` était recopié dans le code à
 * l'identique : trois réglages lus, typés, et sans effet. La parité avec le
 * proto les gardait morts ; le proto est parti (T22), l'argument avec.
 *
 * LE COOLDOWN ÉCARTE, IL NE PÉNALISE PAS, et il s'efface plutôt que d'affamer
 * la main : si tout le paquet a été cuisiné dans les dix jours, on repioche
 * dedans. Un plat déjà vu vaut mieux que pas de dîner — c'est la même règle qui
 * interdit à T33 de retirer définitivement un plat.
 */
export function main(
  jeu: Jeu,
  taille = jeu.catalogue.equilibre.main.taille,
  savoir?: Savoir,
): Carte[] {
  const toutes = offre(jeu, jeu.choix, jeu.slot, savoir);
  const frais = savoir ? toutes.filter((l) => !savoir.cuisinesRecemment.has(l.plat.id)) : toutes;
  const lignes = frais.length ? frais : toutes;
  if (!lignes.length) return [];

  const rnd = alea(`${jeu.slot}:${jeu.repioches[jeu.slot] ?? 0}`);
  const pris = new Set<string>();
  const main: Carte[] = [];

  const tirer = (pool: Carte[]): Carte | null => {
    const libres = pool.filter((l) => !pris.has(l.plat.id));
    if (!libres.length) return null;
    // Le score peut être négatif ; le poids ne doit jamais l'être, sinon une
    // carte mal notée deviendrait plus probable qu'une bonne.
    const poids = libres.map((l) => Math.max(0.4, l.score + 12));
    let r = rnd() * poids.reduce((a, b) => a + b, 0);
    for (let i = 0; i < libres.length; i++) {
      r -= poids[i]!;
      if (r <= 0) return libres[i]!;
    }
    return libres[libres.length - 1]!;
  };

  for (const cat of jeu.catalogue.equilibre.main.garantir) {
    const c = tirer(lignes.filter((l) => l.categorie === cat));
    if (c) {
      pris.add(c.plat.id);
      main.push(c);
    }
  }
  while (main.length < taille) {
    const c = tirer(lignes);
    if (!c) break;
    pris.add(c.plat.id);
    main.push(c);
  }
  return main.sort((a, b) => b.score - a.score);
}

/* ──────────────────────────────────────────────────────────── les courses */

/** La liste de courses, dans l'ordre où on traverse le magasin. Un article
 *  qu'aucun rayon ne réclame finit dans « autre » plutôt que de disparaître. */
export function parRayon(
  catalogue: Catalogue,
  panier: Map<string, LignePanier>,
): [string, LignePanier[]][] {
  const arts = articles(panier);
  const groupes: [string, LignePanier[]][] = [];
  const vus = new Set<string>();

  for (const rayon of catalogue.rayons.ordre) {
    const ids = catalogue.rayons.rayons[rayon] ?? [];
    const dedans = arts.filter((a) => ids.includes(a.id));
    if (dedans.length) {
      dedans.forEach((a) => vus.add(a.id));
      groupes.push([rayon, dedans.sort((x, y) => x.nom.localeCompare(y.nom))]);
    }
  }

  const reste = arts.filter((a) => !vus.has(a.id));
  if (reste.length) groupes.push(["autre", reste]);
  return groupes;
}
