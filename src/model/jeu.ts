// La semaine, et ce qu'un doigt y a posé.
//
// LA SEMAINE EST FAITE DE CRÉNEAUX, PAS DE JOURS.
// Un créneau = (jour, repas). Les trois repas sont planifiés, une vingtaine par
// semaine. L'ordre chronologique porte la sémantique : le midi du jour 3 est
// calculé AVANT le soir du jour 3, donc il ne peut voir que ce que le jour 2 a
// laissé derrière lui.
//
// Port de `apps/proto-shell/semaine.js` (`creerJeu`, `SAUTE`, `joue`), lui-même
// transcrit du modèle Python de référence (Workspace, recipe-compiler). Le
// comportement ne change pas ici — c'est un port, pas une refonte. Ce que le
// port ajoute, ce sont les types, et deux ou trois endroits où le JS se
// reposait sur `undefined` là où TypeScript demande une décision.

import type { LotInitial } from "./depot";
import type { Catalogue, NatureCreneau, Plat, RepasId, Role } from "./types";

const JOURS = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"] as const;

/** UN REPAS SAUTÉ N'EST PAS UN REPAS VIDE. « On ne mange pas là » (restaurant,
 *  chez des amis, week-end nomade) est une DÉCISION ; un créneau vide est une
 *  décision qui n'a pas encore été prise. Les confondre laissait la semaine se
 *  plaindre de trous qu'on avait choisis. */
export const SAUTE = "__saute";

/** Ce qu'un créneau porte : un identifiant de plat, la décision de sauter, ou
 *  rien encore. */
export type Choix = string | typeof SAUTE | null;

/** Vrai seulement pour un plat réellement joué — ni vide, ni sauté. */
export const joue = (rid: Choix): rid is string => !!rid && rid !== SAUTE;

/** Les créneaux où un plat se POSE — donc où des cartes se distribuent et où
 *  l'écran doit montrer une place. `choisi` et `optionnel` en sont ; `routine`
 *  non, elle se compte dans les apports sans jamais se piocher.
 *
 *  À ne pas confondre avec « ce qui compte comme un manque », qui reste
 *  `nature === "choisi"` seul — c'est ce que testent `prochainVide` et le
 *  créneau de démarrage, et c'est pour ça qu'ils ne passent pas par ici. */
export const sePioche = (n: NatureCreneau): boolean => n !== "routine";

export interface JourSemaine {
  nom: string;
  date: Date;
}

export interface CreneauSemaine {
  /** Index dans `jeu.jours`. */
  jour: number;
  repas: RepasId;
  label: string;
  nature: NatureCreneau;
  /** Ce repas part en gamelle : il doit voyager, et il se cuisine la veille. */
  emporte: boolean;
}

export interface Jeu {
  catalogue: Catalogue;
  /**
   * CE QUE LA CUISINE PORTE DÉJÀ — et pas ce que le catalogue en disait le jour
   * de l'export.
   *
   * `creerJeu` l'amorce avec `catalogue.stock`, parce qu'un jeu construit sans
   * base doit rester calculable : c'est ce que font les tests du modèle et
   * `npm run parite`, et c'est ce qui garde le port comparable au proto. Mais
   * dès qu'il y a une base, c'est elle qui l'écrase (voir `db/stock.ts`) : un
   * lot qu'on a fini n'existe plus, quoi qu'en dise l'export.
   */
  stock: LotInitial[];
  /**
   * LES IDS DU GARDE-MANGER QUI ONT ENCORE QUELQUE CHOSE — et pas ceux que le
   * relevé nommait le jour de l'export.
   *
   * MÊME BASCULE QUE `stock` CI-DESSUS, À UNE NUANCE PRÈS. `creerJeu` l'amorce
   * avec les denrées du catalogue, pour qu'un jeu construit sans base reste
   * calculable ; dès qu'il y a une base, le rejeu du journal le FILTRE — il ne
   * le remplace pas (voir `db/gardeManger.ts`, qui dit pourquoi). Le niveau du
   * placard n'est stocké nulle part, c'est tout T25 : le catalogue dit ce que
   * le placard EST, le rejeu dit ce qu'il en RESTE.
   *
   * CE QUE ÇA RÉPARE. `provenance()` demandait « cet id est-il au garde-manger ? »
   * à `catalogue.gardeManger.denrees`, une liste figée à l'export : un id qui y
   * figure n'en sortait JAMAIS. Relever la zone à zéro ne changeait rien, et la
   * ligne restait dans « Vous en avez — vérifiez la quantité » alors qu'il n'y
   * avait plus rien à vérifier. Mesuré sur le relevé du 26/08 : 45 ids, dont 18
   * qu'une recette peut citer, et un seul relevé à vide de `demi-lune-haute` en
   * vide 12 — `pates`, `vermicelles`, `lentilles-seches` parmi ceux que le
   * corpus cite — sans qu'une seule ligne de courses bouge.
   *
   * L'APPARTENANCE DIT « IL EN RESTE », ELLE NE DIT PLUS « IL EN A EXISTÉ ».
   */
  gardeManger: string[];
  /** Les plats par identifiant — `catalogue.plats` est une liste, et l'écran
   *  fait des lookups par id à chaque rendu. */
  plats: Record<string, Plat>;
  jours: JourSemaine[];
  creneaux: CreneauSemaine[];
  equilibreSur: RepasId[];
  choix: Choix[];
  /** Les parts se règlent PAR REPAS, pas une fois pour la semaine. Un dîner
   *  avec des amis, un midi tout seul et une gamelle à prévoir n'ont pas la
   *  même taille, et c'est la taille qui commande le panier et les restes. */
  parts: number[];
  slot: number;
  repioches: number[];
}

/**
 * L'amorce du garde-manger : les ids que le relevé de l'export portait.
 *
 * ALIAS RÉSOLUS ICI, parce que c'est le vocabulaire des RECETTES qui
 * interrogera cet ensemble — `oignons` au relevé, `oignon` à la recette. Sans ce
 * passage le rapprochement échoue en silence, ce que `gardeManger.ts` paie déjà
 * ailleurs. `journal.amorce()` applique le même alias sur les mêmes denrées :
 * les deux ensembles vivent donc dans le même espace de clés, et c'est ce qui
 * permet au rejeu de remplacer cette amorce sans traduction.
 */
export const idsDuReleve = (catalogue: Catalogue): string[] => [
  ...new Set(
    catalogue.gardeManger.denrees.map(
      (d) => catalogue.rayons.aliases[d.ingredient] ?? d.ingredient,
    ),
  ),
];

export function creerJeu(catalogue: Catalogue, nJours = 7, aujourdhui = new Date()): Jeu {
  const cfg = catalogue.creneaux;
  const ordre = Object.keys(cfg.repas);
  const jours: JourSemaine[] = Array.from({ length: nJours }, (_, i) => {
    const d = new Date(aujourdhui);
    d.setDate(d.getDate() + i);
    // `getDay()` compte à partir du dimanche ; la semaine commence lundi ici.
    return { nom: JOURS[(d.getDay() + 6) % 7] as string, date: d };
  });

  const creneaux: CreneauSemaine[] = [];
  jours.forEach((j, i) => {
    const duJour = cfg.jours.exceptions?.[j.nom] ?? cfg.jours.defaut;
    [...duJour]
      .sort((a, b) => ordre.indexOf(a) - ordre.indexOf(b))
      .forEach((repas) => {
        const r = cfg.repas[repas];
        // Un jour qui réclame un repas absent de la configuration : le JS
        // produisait un créneau sans label ni nature, qui traversait tout le
        // modèle. On l'ignore, parce qu'un créneau sans repas n'est pas un
        // créneau — et le chargeur a déjà validé les repas qui existent.
        if (!r) return;
        creneaux.push({
          jour: i,
          repas,
          label: r.label,
          nature: r.nature,
          emporte: (cfg.emporte[repas] ?? []).includes(j.nom),
        });
      });
  });

  return {
    catalogue,
    stock: [...catalogue.stock],
    gardeManger: idsDuReleve(catalogue),
    plats: Object.fromEntries(catalogue.plats.map((p) => [p.id, p])),
    jours,
    creneaux,
    equilibreSur: cfg.equilibre_sur.length ? cfg.equilibre_sur : ["dejeuner", "diner"],
    choix: Array<Choix>(creneaux.length).fill(null),
    parts: Array<number>(creneaux.length).fill(catalogue.foyer.parts),
    // On démarre sur le premier créneau réellement choisi : personne ne pioche
    // une carte pour son petit-déjeuner.
    slot: Math.max(0, creneaux.findIndex((c) => c.nature === "choisi")),
    repioches: Array<number>(creneaux.length).fill(0),
  };
}

/** La date du créneau `i`. Le chaînage en dépend : un reste ne se propose que
 *  dans sa fenêtre de fraîcheur, comptée depuis le jour où il est né. */
export function dateDe(jeu: Jeu, i: number): Date {
  const c = jeu.creneaux[i];
  if (!c) throw new RangeError(`créneau ${i} hors de la semaine`);
  const j = jeu.jours[c.jour];
  if (!j) throw new RangeError(`jour ${c.jour} hors de la semaine`);
  return j.date;
}

/** Le plat d'un créneau, ou `null` s'il est vide ou sauté. */
export function platDe(jeu: Jeu, i: number): Plat | null {
  const rid = jeu.choix[i];
  return joue(rid ?? null) ? (jeu.plats[rid as string] ?? null) : null;
}

/**
 * Le rôle en toutes lettres — le nom, et son article.
 *
 * ICI ET PAS DANS `ui/phrases.ts` parce que le modèle écrit la phrase le
 * premier : c'est `comptoir()` qui dit « c'est un accompagnement, pas un
 * dîner », et un écran qui referait le mot pour sa propre étiquette finirait
 * par en dire un autre. Même raison que l'en-tête de `phrases.ts`, appliquée
 * dans l'autre sens.
 */
export const ROLES: Record<Role, { nom: string; un: string }> = {
  plat: { nom: "plat", un: "un" },
  accompagnement: { nom: "accompagnement", un: "un" },
  entree: { nom: "entrée", un: "une" },
  base: { nom: "base", un: "une" },
  boisson: { nom: "boisson", un: "une" },
};

/**
 * Ce plat fait-il un repas à soi seul ?
 *
 * LA QUESTION QUE `creneaux:` NE POUVAIT PAS POSER. Un créneau dit une HEURE —
 * déjeuner, dîner, goûter — et une pâte brisée n'en a aucune : elle n'est pas
 * « prévue pour le goûter », elle n'est le repas de personne. `creneaux: []`
 * ne l'aurait pas dit non plus, puisque le silence y vaut « déjeuner et
 * dîner ». Il fallait un second champ, et c'est celui-ci.
 */
export const faitUnRepas = (plat: Plat): boolean => plat.role === "plat";

/** Un plat déclare les créneaux qui lui vont ; le silence vaut « repas
 *  principal ». */
export function convient(jeu: Jeu, plat: Plat, i: number): boolean {
  const c = jeu.creneaux[i];
  if (!c) return false;
  // UN PLAT SANS ÉTAPES EST PROPOSÉ, ET L'ÉCRAN LE DIT. Il y avait trois
  // chemins devant la plainte du 14/09 (« tu m'as encore fourni une recette
  // sans étapes ») : écrire les étapes (T76), filtrer le plat (T77), ou le
  // proposer en le disant. L'utilisateur a tranché pour le troisième le
  // 15/09 — le filtre de T77 vivait ici, il est retiré, et `sansRecette()`
  // dans `cuisiner.vue.ts` est ce qui le remplace.
  //
  // POURQUOI LE FILTRE ÉTAIT LE MAUVAIS OUTIL, alors qu'il citait T33 pour se
  // justifier : T33 dit qu'on ne montre pas un plat qu'on ne peut pas
  // EXÉCUTER. Un plat sans recette écrite s'exécute très bien — ce sont les
  // plats du foyer, la maison sait les faire. Ce qui manque est le pas-à-pas,
  // pas le dîner. Filtrer rétrécissait donc la semaine pour une lacune de
  // saisie, ce que T33 refuse par ailleurs explicitement sur les paris :
  // « retirer ces plats ferait rétrécir les propositions à mesure que la
  // confiance vieillit ».
  //
  // Ce qui reste vrai de T77 : `cuisinable` ne doit plus JAMAIS être un champ
  // que personne ne lit. Il est lu — par la carte et par la fiche — et le
  // chargeur refuse maintenant un export où il contredit `steps`.
  const ok = plat.creneaux.length ? plat.creneaux : ["dejeuner", "diner"];
  return ok.includes(c.repas);
}
