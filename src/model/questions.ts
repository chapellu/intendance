// Le déclencheur de la question — T33 du backlog, tranché par Workspace#42.
//
// UNE SEULE POSITION EST LA BONNE : AU MOMENT OÙ L'APP PROPOSE. Découvrir en
// cuisinant qu'il n'y a plus de lentilles ne change aucune décision — ça
// constate un échec. Posée à la proposition, la même question retire ou
// substitue le plat AVANT qu'il soit proposé. Corollaire direct : une question
// ne porte jamais sur ce qu'on vient de cuisiner.
//
// LA RÈGLE TIENT EN UNE LIGNE :
//
//   central + confiance basse  → on demande, toujours.
//   secondaire                 → on parie, et on le DIT.
//
// IL N'Y A PLUS DE PLAFOND, ET C'EST DÉLIBÉRÉ. Le ~5 de #34 défendait contre un
// rituel qui balayait la semaine entière ; Workspace#41 a supprimé le rituel, et
// l'utilisateur a supprimé le plafond (31/08/2026) : « Si l'ingrédient est
// central pose la question. […] Les questions ne sont pas gênantes dans l'absolu
// car elles demandent juste de savoir s'il faut acheter ou si le stock est
// suffisant. »
//
// LE GOUVERNAIL N'EST DONC PLUS UN COMPTEUR, C'EST LA QUALITÉ DES PROPOSITIONS
// — et ça en fait une promesse RÉFUTABLE. Une question n'irrite que si elle
// porte sur ce qu'on n'aurait pas dû proposer, et la boucle est auto-limitante :
// chaque réponse est une observation, qui restaure la confiance, qui supprime
// les questions suivantes. Le volume doit donc DÉCROÎTRE à l'usage. S'il ne
// décroît pas, ce design est faux, et c'est ce fichier qu'il faut rouvrir.
//
// CE QUI N'EST PAS ICI, ET POURQUOI. La question ne se pose pas elle-même : elle
// est décrite, ordonnée, et rendue à l'écran, qui la montre AVANT la main — car
// répondre change la main qui suit, donc montrer les cartes pendant qu'on
// demande, c'est montrer une main qu'on sait fausse (Workspace#45). Le jour où
// le fil de T49 existera, c'est lui qui les servira, sans que ce modèle bouge.

import type { Confiance, Contexte, Evenement, Rejeu } from "./journal";
import type { Catalogue, Ingredient, Plat } from "./types";

/* ═══════════════════════════════════════════════════════════ la centralité */

/**
 * Ce dont un plat ne se fait pas.
 *
 * LA CENTRALITÉ VIENT DU RAYON, et c'est un choix contre un autre qui semblait
 * plus juste. La dériver des `apports` — « ce plat apporte de la viande rouge,
 * donc son bœuf haché est central » — demanderait une table
 * `viande-rouge → boeuf-hache` que personne n'a : c'est du jugement, donc de la
 * saisie déguisée. Le rayon, lui, est déjà écrit, déjà vérifié, et il dit
 * presque la même chose : on ne fait pas une bolognaise sans viande, on la fait
 * très bien sans persil.
 *
 * La surcharge de ligne l'emporte, et ne coûte rien là où elle ne sert pas.
 */
export function centralite(catalogue: Catalogue, ctx: Contexte) {
  const { rayons, ids } = catalogue.rayons.centraux;
  const rayonsCentraux = new Set(rayons);
  const idsCentraux = new Set(ids);

  return (ligne: Pick<Ingredient, "id" | "central">): boolean => {
    if (ligne.central) return true;
    const id = ctx.alias(ligne.id);
    if (idsCentraux.has(id)) return true;
    const rayon = ctx.rayonDe(id);
    return rayon !== null && rayonsCentraux.has(rayon);
  };
}

/**
 * Les lignes d'un plat sur lesquelles une question peut porter.
 *
 * Les deux mêmes exclusions que `demandes()`, pour les mêmes raisons : une
 * `base` va au dépôt et se répare en cuisinant l'amont, jamais en achetant ; un
 * assaisonnement ne manque jamais assez pour annuler un dîner. S'y ajoute le
 * fond de placard, où « combien m'en reste-t-il » ne se pose pas — c'est déjà
 * l'arbitrage que `classeDe` rend en tête.
 */
export function lignesInterrogeables(ctx: Contexte, plat: Plat): Ingredient[] {
  return plat.ingredients.filter(
    (i) => !i.base && !i.assaisonnement && !ctx.placard.has(ctx.alias(i.id)),
  );
}

/* ══════════════════════════════════════════════════════════════ la question */

/** Le signalement à trois états. Une quantité par défaut obligerait à peser pour
 *  répondre, donc on ne répondrait pas, donc l'app cesserait de demander. */
export type Reste = "oui" | "peu" | "non";

export interface Question {
  /** L'id d'ACHAT, alias résolus — celui sur lequel l'observation s'écrira. */
  ingredient: string;
  /** Ce qu'on en dit à l'écran. */
  nom: string;
  /** Pourquoi on demande. Jamais `sur` : sur, on ne demande pas. */
  confiance: Confiance;
  /** Le jour de la dernière observation, `null` quand on ne l'a jamais vu. */
  vuLe: string | null;
  /** Les plats de la main qui l'attendent — ce que la réponse débloque ICI. */
  plats: string[];
  /**
   * Combien de plats CANDIDATS en dépendent.
   *
   * C'EST LE CRITÈRE D'ORDRE, ET IL N'EST PAS « LA PLUS INCERTAINE D'ABORD ».
   * Trier sur l'ignorance trie sur ce qu'on ne sait pas plutôt que sur ce que ça
   * rapporte : la denrée la plus incertaine du placard peut n'être réclamée par
   * aucun plat proposé. On trie donc sur l'utilité — celle qui débloque le plus.
   */
  debloque: number;
}

/**
 * La confiance d'un ingrédient, LOTS OU PAS.
 *
 * LES DEUX CARTES SE LISENT, ET DANS CET ORDRE. `parIngredient` dit ce qui est
 * là ; `vus` dit ce dont on a des nouvelles sans que ça ait laissé un lot — « il
 * n'y a plus de bœuf », qui est une connaissance et non un trou. La viande et le
 * poisson vivent entièrement dans la seconde, et ce sont eux que T33 demande.
 *
 * Ni l'une ni l'autre : `inconnu`, sans date. C'est le démarrage à froid, et
 * c'est la bonne réponse — on n'a jamais rien vu.
 */
function etat(rejeu: Rejeu, id: string): { confiance: Confiance; vuLe: string | null } {
  const e = rejeu.parIngredient.get(id) ?? rejeu.vus.get(id);
  return e ? { confiance: e.confiance, vuLe: e.vuLe } : { confiance: "inconnu", vuLe: null };
}

export interface EntreeQuestions {
  catalogue: Catalogue;
  ctx: Contexte;
  rejeu: Rejeu;
  /** Les plats sur le point d'être proposés. C'est eux qui font l'ENSEMBLE. */
  proposes: readonly Plat[];
  /** Tous les plats jouables sur ce créneau. C'est eux qui font l'ORDRE. */
  candidats: readonly Plat[];
  /** Ce à quoi cette passe a déjà répondu — on ne redemande pas. */
  repondu: ReadonlyMap<string, Reste>;
}

/**
 * Les questions que cette proposition lève, de la plus utile à la moins.
 *
 * L'ENSEMBLE VIENT DE CE QU'ON PROPOSE, L'ORDRE DE CE QU'ON POURRAIT PROPOSER.
 * Les deux ne sont pas le même ensemble et les confondre casse l'un ou l'autre :
 * questionner tout le vivier lèverait quarante questions pour quatre cartes,
 * ordonner sur les seules cartes tirées ferait dépendre l'ordre du hasard du
 * tirage. Mesuré sur le journal de démonstration, une passe de trois créneaux
 * lève une à deux questions (Workspace#45) — c'est ce chiffre-là qui doit
 * décroître à l'usage.
 *
 * LE DÉMARRAGE À FROID EST PROTÉGÉ PAR LE CRESCENDO, pas par un plafond : la
 * semaine 1 pose trois dîners, donc trois plats de central à interroger. La
 * première passe EST le relevé, par un autre chemin.
 */
export function questions({
  catalogue,
  ctx,
  rejeu,
  proposes,
  candidats,
  repondu,
}: EntreeQuestions): Question[] {
  const central = centralite(catalogue, ctx);

  // Le poids d'ordre, mesuré sur le vivier entier et une seule fois : un
  // ingrédient vaut ce que sa réponse débloque, pas ce qu'elle éclaircit.
  const parCandidat = new Map<string, number>();
  for (const p of candidats)
    for (const id of new Set(lignesInterrogeables(ctx, p).filter(central).map((i) => ctx.alias(i.id))))
      parCandidat.set(id, (parCandidat.get(id) ?? 0) + 1);

  const par = new Map<string, Question>();
  for (const p of proposes) {
    for (const ligne of lignesInterrogeables(ctx, p)) {
      if (!central(ligne)) continue;
      const id = ctx.alias(ligne.id);
      if (repondu.has(id)) continue;
      const { confiance, vuLe } = etat(rejeu, id);
      if (confiance === "sur") continue;
      const vue = par.get(id);
      if (vue) {
        if (!vue.plats.includes(p.id)) vue.plats.push(p.id);
        continue;
      }
      par.set(id, {
        ingredient: id,
        nom: id.replace(/-/g, " "),
        confiance,
        vuLe,
        plats: [p.id],
        debloque: parCandidat.get(id) ?? 0,
      });
    }
  }

  return [...par.values()].sort(
    (a, b) => b.debloque - a.debloque || a.nom.localeCompare(b.nom, "fr"),
  );
}

/* ═══════════════════════════════════════════════════════════════ le budget */

/**
 * Ce qu'une réponse laisse comme droit de tirage sur la passe.
 *
 * `peu` EST LE SEUL DES TROIS QUI GAGNE SA PLACE, et il la gagne ici. « Il en
 * reste peu » n'interdit pas le dahl : il interdit d'y COMPTER DESSUS DEUX FOIS
 * dans la même passe. Un booléen aurait dû choisir entre les deux erreurs —
 * refuser le dahl qu'on peut faire, ou poser deux plats sur un fond de paquet.
 *
 * `non` n'est pas un mécanisme de plus, c'est le même avec un budget nul : le
 * plat quitte les propositions de cette passe. Il n'est pas banni pour autant —
 * la passe suivante le repropose si le placard a changé, et acheter reste
 * possible en le posant. Retirer DÉFINITIVEMENT ferait rétrécir les
 * propositions à mesure que la confiance vieillit, ce qui est la pire façon
 * d'échouer pour un outil dont le travail est que le dîner ait lieu.
 */
const BUDGET: Record<Reste, number> = { oui: Infinity, peu: 1, non: 0 };

export interface Passe {
  /** Ce à quoi on a répondu, et donc ce qu'on ne redemande pas. */
  repondu: ReadonlyMap<string, Reste>;
  /** Ce que les créneaux déjà posés ont consommé de ces réponses. */
  depense: ReadonlyMap<string, number>;
}

export const PASSE_VIDE: Passe = { repondu: new Map(), depense: new Map() };

/**
 * Un plat est-il hors-jeu pour cette passe ?
 *
 * Vrai dès qu'un de ses ingrédients centraux a épuisé son budget. C'est le
 * « retire ou substitue AVANT qu'il soit proposé » de T33 : le plat ne descend
 * pas dans le classement, il ne descend nulle part — il n'est pas montré, et la
 * carte tirée à sa place l'est sur un placard qu'on vient de vérifier.
 */
export function bloque(catalogue: Catalogue, ctx: Contexte, passe: Passe) {
  // Rien répondu, rien à bloquer : le prédicat constant évite de reconstruire
  // les tables de centralité pour les 86 plats d'une proposition ordinaire, qui
  // est le cas de très loin le plus fréquent.
  if (!passe.repondu.size) return () => false;
  const central = centralite(catalogue, ctx);
  return (plat: Plat): boolean =>
    lignesInterrogeables(ctx, plat)
      .filter(central)
      .some((ligne) => {
        const id = ctx.alias(ligne.id);
        const reponse = passe.repondu.get(id);
        return reponse !== undefined && (passe.depense.get(id) ?? 0) >= BUDGET[reponse];
      });
}

/**
 * Ce que les créneaux déjà posés ont dépensé des réponses de la passe.
 *
 * UN PLAT POSÉ COMPTE UNE FOIS PAR INGRÉDIENT, jamais par ligne : une recette
 * qui cite le riz deux fois n'en mange pas deux paquets, et payer la façon dont
 * elle est écrite est l'erreur que `bonusPlacard` a déjà eu à corriger.
 */
export function depenses(
  catalogue: Catalogue,
  ctx: Contexte,
  poses: readonly Plat[],
): Map<string, number> {
  const central = centralite(catalogue, ctx);
  const par = new Map<string, number>();
  for (const p of poses) {
    const ids = new Set(
      lignesInterrogeables(ctx, p).filter(central).map((i) => ctx.alias(i.id)),
    );
    for (const id of ids) par.set(id, (par.get(id) ?? 0) + 1);
  }
  return par;
}

/**
 * La passe en cours, reconstruite du journal et de ce qui est posé.
 *
 * « LA MÊME PASSE » N'A PAS ENCORE D'OBJET, ET C'EST ASSUMÉ. Le fil de T49
 * apportera une passe qui commence et qui finit ; en attendant, la meilleure
 * approximation est le JOUR : les réponses saisies aujourd'hui gouvernent les
 * propositions d'aujourd'hui, et demain repart d'un placard qui a bougé. C'est
 * `saisi` et non `jour` qui décide, parce que la question porte sur ce qu'un œil
 * a vu au moment où il a répondu.
 *
 * Une seule réponse par ingrédient — la dernière. Répondre deux fois, c'est se
 * corriger, pas s'ajouter.
 */
export function passeDuJour(
  catalogue: Catalogue,
  ctx: Contexte,
  evenements: readonly Evenement[],
  poses: readonly Plat[],
  aujourdhui: string,
): Passe {
  const repondu = new Map<string, Reste>();
  for (const e of evenements) {
    if (e.sorte !== "observation" || e.saisi !== aujourdhui) continue;
    for (const c of e.constats) if (c.reste) repondu.set(ctx.alias(c.ingredient), c.reste);
  }
  return { repondu, depense: depenses(catalogue, ctx, poses) };
}

/* ═════════════════════════════════════════════════════════════════ le pari */

/**
 * Ce que la carte parie, dit à voix haute.
 *
 * LES TROIS ISSUES ONT ÉTÉ PESÉES ET DEUX SONT MAUVAISES. Retirer les plats
 * ferait rétrécir les propositions à mesure que la confiance vieillit.
 * Substituer en silence produit un plat qu'on ne peut pas contredire. Parier à
 * voix haute garde la règle de #34 — l'estimation doit être VISIBLE et
 * CONTREDISABLE — et un pari raté tombe sur le plan B, à parité d'effort avec
 * des nouilles, filet que #30 a déjà payé.
 *
 * Sur les secondaires uniquement : les centraux, eux, ont eu leur question.
 *
 * ET SEULEMENT SUR CE QUE LE MODÈLE PRÉTEND AVOIR. Un pari est la phrase « je
 * crois qu'il t'en reste » ; sur un persil qui n'est dans aucun relevé, l'app ne
 * croit rien du tout — elle l'achète, et la carte le dit déjà avec son « +N
 * articles ». Annoncer un pari là serait promettre une surveillance qui
 * n'existe pas, et noyer les vrais paris : l'oignon est dans 42 % des 86 plats,
 * une ligne qui le nomme toujours ne départage rien.
 */
export function paris(
  catalogue: Catalogue,
  ctx: Contexte,
  rejeu: Rejeu,
  plat: Plat,
): string[] {
  const central = centralite(catalogue, ctx);
  const vus = new Set<string>();
  for (const ligne of lignesInterrogeables(ctx, plat)) {
    if (central(ligne)) continue;
    const id = ctx.alias(ligne.id);
    // `parIngredient` SEUL, sciemment : un pari est la phrase « je crois qu'il
    // t'en reste », et elle n'a de sens que sur ce que le modèle prétend avoir.
    // `vus` porte aussi les absences constatées, sur lesquelles il n'y a rien à
    // parier — il n'y en a pas, et la carte le dit déjà avec son « +N articles ».
    const e = rejeu.parIngredient.get(id);
    if (!e || e.classe === "non-suivi" || e.confiance === "sur") continue;
    vus.add(id);
  }
  return [...vus].map((id) => id.replace(/-/g, " ")).sort((a, b) => a.localeCompare(b, "fr"));
}
