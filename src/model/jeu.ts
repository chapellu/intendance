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
import type { Catalogue, NatureCreneau, Plat, RepasId } from "./types";

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

/** Un plat réellement cuisiné, et sur quel créneau. `principal` sépare le plat
 *  qui DÉCIDE du repas des briques posées à côté — les deux se cuisinent, se
 *  paient et s'achètent pareil, mais une seule répond à « qu'est-ce qu'on
 *  mange ». */
export interface Pose {
  i: number;
  plat: Plat;
  principal: boolean;
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
  /** Les plats par identifiant — `catalogue.plats` est une liste, et l'écran
   *  fait des lookups par id à chaque rendu. */
  plats: Record<string, Plat>;
  jours: JourSemaine[];
  creneaux: CreneauSemaine[];
  equilibreSur: RepasId[];
  /** LE PLAT QUI DÉCIDE DU REPAS, un par créneau. Il n'est pas devenu « le
   *  premier d'une liste » quand le créneau s'est mis à en porter plusieurs, et
   *  c'est délibéré : « qu'est-ce qu'on mange ce soir ? » a une seule réponse,
   *  et c'est elle que le score, la couverture et la gamelle regardent. */
  choix: Choix[];
  /**
   * LES BRIQUES POSÉES À CÔTÉ — le riz sous le rôti, le pain avec la soupe.
   *
   * Un tableau par créneau, vide presque partout. C'est ce qui manquait pour
   * répondre à l'objectif de l'utilisateur : « définir un repas complet et
   * équilibré… ce sont simplement des briques qu'il faut assembler. » T26 savait
   * dire « il manque un féculent » et ne savait rien en faire.
   *
   * ILS NE SONT PAS DE SECONDE CLASSE. Un accompagnement se cuisine (il compte
   * dans les minutes du jour), s'achète (il entre au panier), pèse sur la
   * couverture (du riz quatre soirs de suite EST une répétition) et vide le
   * placard. La seule chose qu'il ne fait pas, c'est décider du repas.
   */
  accompagnements: string[][];
  /** Les parts se règlent PAR REPAS, pas une fois pour la semaine. Un dîner
   *  avec des amis, un midi tout seul et une gamelle à prévoir n'ont pas la
   *  même taille, et c'est la taille qui commande le panier et les restes. */
  parts: number[];
  slot: number;
  repioches: number[];
}

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
    plats: Object.fromEntries(catalogue.plats.map((p) => [p.id, p])),
    jours,
    creneaux,
    equilibreSur: cfg.equilibre_sur.length ? cfg.equilibre_sur : ["dejeuner", "diner"],
    choix: Array<Choix>(creneaux.length).fill(null),
    // `.map()` et non `.fill([])` : `fill` poserait LE MÊME tableau sur les
    // vingt-et-un créneaux, et poser du riz mardi en mettrait partout.
    accompagnements: creneaux.map(() => []),
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

/** Les plats posés à côté du plat principal d'un créneau, résolus. Un id que le
 *  catalogue ne connaît plus est sauté : une décision peut être plus vieille que
 *  le corpus, et une base ne se réécrit pas toute seule. */
export function accompagnementsDe(
  jeu: Jeu,
  i: number,
  accompagnements: string[][] = jeu.accompagnements,
): Plat[] {
  return (accompagnements[i] ?? []).map((id) => jeu.plats[id]).filter((p): p is Plat => !!p);
}

/**
 * L'ASSIETTE D'UN CRÉNEAU : le plat qui décide, puis ce qu'on a mis à côté.
 *
 * C'est l'unité que la complétude regarde. Un rôti seul manque d'un féculent ;
 * le même rôti avec du riz n'en manque plus — et aucune des deux phrases ne se
 * lit sur un plat isolé. Le principal vient toujours en tête : c'est l'ordre
 * dans lequel on nomme un repas, et l'ordre dans lequel on le cuisine.
 */
export function assiette(
  jeu: Jeu,
  i: number,
  choix: Choix[] = jeu.choix,
  accompagnements: string[][] = jeu.accompagnements,
): Plat[] {
  const rid = choix[i] ?? null;
  const principal = joue(rid) ? jeu.plats[rid] : null;
  return [...(principal ? [principal] : []), ...accompagnementsDe(jeu, i, accompagnements)];
}

/**
 * Tout ce que la semaine cuisine, dans l'ordre où ça se cuisine.
 *
 * LE PIVOT DE CE TICKET. `calculer` itérait `choix.forEach` — un créneau, un
 * plat — et cette boucle était la seule raison pour laquelle un créneau ne
 * pouvait pas en porter deux. Elle itère maintenant des POSES, et tout le reste
 * du modèle a suivi sans changer de sens : un accompagnement s'achète, se
 * cuisine et occupe une place comme n'importe quel plat.
 *
 * L'ORDRE EST CELUI DU TEMPS, et il n'est pas décoratif : le dépôt sert les
 * chaînages dans l'ordre où les créneaux arrivent, si bien qu'un midi ne peut
 * prendre que ce qui existait avant lui. Le principal passe avant ses
 * accompagnements sur un même créneau — à ce grain-là, le repas est simultané.
 */
export function poses(
  jeu: Jeu,
  choix: Choix[] = jeu.choix,
  accompagnements: string[][] = jeu.accompagnements,
): Pose[] {
  const out: Pose[] = [];
  jeu.creneaux.forEach((_, i) => {
    const rid = choix[i] ?? null;
    const p = joue(rid) ? jeu.plats[rid] : null;
    if (p) out.push({ i, plat: p, principal: true });
    for (const a of accompagnementsDe(jeu, i, accompagnements))
      out.push({ i, plat: a, principal: false });
  });
  return out;
}

/** Un plat déclare les créneaux qui lui vont ; le silence vaut « repas
 *  principal ». */
export function convient(jeu: Jeu, plat: Plat, i: number): boolean {
  const c = jeu.creneaux[i];
  if (!c) return false;
  const ok = plat.creneaux.length ? plat.creneaux : ["dejeuner", "diner"];
  return ok.includes(c.repas);
}
