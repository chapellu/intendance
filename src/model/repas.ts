// Les trois autres repas — T142 (décision du foyer, 2026-10-21).
//
// L'APP NE PLANIFIAIT QUE LE DÎNER. « Ce soir », à la pause de 15 h, décide et
// lance le repas de 18 h ; les trois autres se faisaient sans elle, et ce
// qu'ils consomment (le lait, les flocons, les yaourts, les goûters du
// congélateur) n'existait pour personne — le placard et le fond mentaient d'un
// petit-déjeuner par jour.
//
// LA DÉCISION, DANS L'ESPRIT DE MARIE CHIOCA ET LE MOINS D'INDUSTRIEL POSSIBLE :
//   — le DÉJEUNER des quatre est le dîner de la veille, cuisiné plus grand,
//     tant que les boîtes le permettent (`midiDeDemain`) ;
//   — le PETIT-DÉJEUNER et le GOÛTER des enfants sont des ROUTINES : on ne les
//     choisit pas, on les COMPTE (`evenementsDesRoutines`, `prisesDesRoutines`)
//     et on les dit en une ligne (`lignesDesRoutines`) ;
//   — le goûter vient d'une FOURNÉE hebdomadaire, congelée en sachets, que la
//     pause de 15 h propose quand le congélateur s'en vide ou que les fruits
//     passent (`fourneeAProposer`).
//
// PAS DE SEMAINE PLANIFIÉE. Le foyer la refuse (#66) : chaque fonction ici
// répond à « aujourd'hui » ou à « demain midi », jamais à « mardi prochain ».

import { bandRepas, type LotInitial } from "./depot";
import { joue, type Jeu } from "./jeu";
import type { Rejeu } from "./journal";
import { ceQuiManque } from "./ici";
import { deSaison } from "./saisons";
import type { Catalogue, Contenant, Foyer, Plat, Routine } from "./types";

/** La carte qui finit un reste au midi — `catalogue/recipes/reste-de-la-veille.yaml`. */
export const RESTE_DE_LA_VEILLE = "reste-de-la-veille";

/* ═══════════════════════════════════════════ le déjeuner sur le dîner */

/**
 * Les parts d'un déjeuner du foyer : chaque adulte à sa part, chaque enfant à
 * UNE DEMI AU MOINS.
 *
 * DIT LE 21/10 : « environ trois portions adultes de plus, les enfants font
 * une demi ». Le foyer déclare le petit à 0,25 (`household.yaml`), ce qui est
 * sa part d'un dîner servi à table ; au midi on ne prélève pas une cuillère de
 * bébé, on remplit une boîte — d'où le plancher à la demi.
 */
export const partsDuMidi = (foyer: Pick<Foyer, "mangeurs">): number =>
  foyer.mangeurs.reduce((n, m) => (m.parts > 0 ? n + Math.max(m.parts, 0.5) : n), 0);

/** Ce que demain midi peut prendre au dîner de ce soir. */
export type MidiDeDemain =
  /** Le dîner s'agrandit de `parts`, rangées dans `boites` boîtes. */
  | { etat: "oui"; midi: number; parts: number; boites: number; label: string }
  /** Il y aurait un midi à prendre, mais pas assez de boîtes propres. */
  | { etat: "boites-pleines"; midi: number; parts: number; libres: number }
  /** Demain midi porte déjà un plat : on n'y touche pas. */
  | { etat: "deja-pose"; midi: number }
  /** Rien à dire : pas de midi demain, ou ce plat ne s'y prête pas. */
  | { etat: "non" };

/**
 * Ce plat peut-il nourrir demain midi, et dans combien de boîtes ?
 *
 * LES BOÎTES DÉCIDENT, PAS LE PLAT. Quatre boîtes IKEA de 0,8 L, c'est tout ce
 * que le foyer a pour les restes (16/10) ; une boîte pleine du curry de lundi
 * n'est pas libre. `libres` est le pool après ce que le dépôt occupe
 * (`ecrans/sortie.vue.contenantsLibres`) ; absent, tout ce qui est déclaré est
 * supposé propre. On ne compte que les boîtes qui vont AU FRIGO et se lavent :
 * un sac de congélation ne porte pas un déjeuner de demain.
 *
 * TOUT OU RIEN. Un midi pour deux sur trois laisserait un enfant sans
 * déjeuner ; quand les boîtes ne suffisent pas, la carte le dit et le dîner
 * reste à sa taille.
 */
export function midiDeDemain(
  jeu: Pick<Jeu, "catalogue" | "creneaux" | "choix" | "parts" | "plats" | "midi" | "deLaVeille">,
  plat: Plat,
  libres?: ReadonlyMap<string, number>,
): MidiDeDemain {
  const foyer = jeu.catalogue.foyer;
  const midi = jeu.creneaux.findIndex((c) => c.jour === 1 && c.repas === "dejeuner");
  if (midi < 0 || !jeu.plats[RESTE_DE_LA_VEILLE]) return { etat: "non" };
  if (!seGardeJusquADemain(plat)) return { etat: "non" };
  // UN MIDI POSÉ PAR UN « JE LANCE ÇA » PRÉCÉDENT N'EST PAS PRIS : relancer ce
  // soir le réécrit (`poserCeSoir`).
  const pose = jeu.choix[midi] ?? null;
  if (joue(pose) && !(pose === RESTE_DE_LA_VEILLE && jeu.deLaVeille?.[midi])) return { etat: "deja-pose", midi };

  const parts = partsDuMidi(foyer);
  // LA MARMITE AUSSI EST FINIE : un lot agrandi qui déborde de la cocotte ne se
  // cuisine pas, quoi qu'en disent les boîtes (même règle que `gamelles`).
  const soir = jeu.creneaux.findIndex((c) => c.jour === 0 && c.repas === "diner");
  const total = (jeu.parts[soir] ?? foyer.parts) - (jeu.midi?.[soir] ?? 0) + parts;
  if (plat.vaisselle && total / plat.portions > plat.vaisselle.facteurMax + 1e-9) return { etat: "non" };

  const boites = boitesDuMidi(foyer.contenants, parts, libres);
  if (!boites) {
    const dispo = foyer.contenants
      .filter(pourLeMidi)
      .reduce((n, c) => n + (libres?.get(c.id) ?? c.nombre), 0);
    return { etat: "boites-pleines", midi, parts, libres: dispo };
  }
  return { etat: "oui", midi, parts, ...boites };
}

const pourLeMidi = (c: Contenant): boolean => c.portions > 0 && !c.consommable && c.espaces.includes("frigo");

/** Le moins de boîtes qui portent `parts`, les plus grandes d'abord. `null`
 *  quand le pool libre n'y suffit pas. */
function boitesDuMidi(
  contenants: readonly Contenant[],
  parts: number,
  libres?: ReadonlyMap<string, number>,
): { boites: number; label: string } | null {
  const familles = contenants.filter(pourLeMidi).sort((a, b) => b.portions - a.portions);
  let reste = parts;
  let n = 0;
  for (const c of familles) {
    const dispo = libres?.get(c.id) ?? c.nombre;
    const prises = Math.min(dispo, Math.ceil(reste / c.portions - 1e-9));
    n += prises;
    reste -= prises * c.portions;
    if (reste <= 1e-9) return { boites: n, label: familles[0]!.label };
  }
  return null;
}

/**
 * Un plat qui ne finit pas un reste, qui est un plat, et dont le reste tient
 * jusqu'à demain midi au frigo. `frigo_days: 0` dit « ne passe pas la nuit » :
 * une salade composée, des muffins qu'il faut congeler.
 */
function seGardeJusquADemain(p: Plat): boolean {
  if (p.role !== "plat" || !p.creneaux.includes("diner")) return false;
  if (p.accepts.some((a) => a.kind === "reste-plat")) return false;
  return !p.emits.some((e) => e.kind === "reste-plat" && e.gardeFrigo < 1 && !e.congelo);
}

// `resteDuMidi` et `platDuSoir` vivent dans `restes.ts` : le calcul de la
// semaine les lit, et ce fichier dépend de `ici.ts`, qui dépend du calcul.
export { platDuSoir, resteDuMidi } from "./restes";

/* ═══════════════════════════════════════════════════ les routines */

const JOUR_MS = 86_400_000;

// `evenementsDesRoutines` et `joursDe` vivent dans `journal.ts` : le rejeu les
// appelle, et `ici.ts` (que ce fichier lit) dépend déjà du journal.
export { evenementsDesRoutines, joursDe } from "./journal";

/** Un lot du dépôt tel que la routine le lit — `LotStock` en a plus. */
export interface LotDeRoutine {
  id?: number;
  type: string;
  band: string;
  born: string;
  location?: string;
  espace?: string;
}

/** Ce qu'une routine fait d'un lot : le réduire, ou le finir. */
export interface Prise {
  id: number;
  /** La nouvelle bande, ou `null` quand le lot est fini. */
  band: string | null;
}

/**
 * Ce que les routines prennent au DÉPÔT, jour après jour — le pain maison du
 * congélateur le matin, une part de la fournée ou de la compote au goûter.
 *
 * LE PLUS ANCIEN D'ABORD, parmi les types que la routine nomme ; `parts` repas
 * par jour. Un jour sans lot ne prend rien : le goûter s'est fait d'un fruit
 * et d'un yaourt, et la ration du placard l'a déjà compté.
 *
 * PURE : rend les prises, ne touche à rien. `db/routines.ts` les écrit.
 */
export function prisesDesRoutines(
  routines: readonly Routine[],
  lots: readonly LotDeRoutine[],
  jours: readonly string[],
): Prise[] {
  const reste = new Map<number, number>();
  const ordre = lots
    .filter((l): l is LotDeRoutine & { id: number } => l.id != null)
    .sort((a, b) => a.born.localeCompare(b.born) || a.id - b.id);
  for (const l of ordre) reste.set(l.id, bandRepas(l.band));
  const touches = new Set<number>();
  for (let j = 0; j < jours.length; j++)
    for (const r of routines) {
      if (!r.duDepot) continue;
      let besoin = r.duDepot.parts;
      for (const l of ordre) {
        if (besoin <= 1e-9) break;
        if (!r.duDepot.types.includes(l.type) || (l.born > jours[j]!)) continue;
        const n = reste.get(l.id)!;
        if (n <= 1e-9) continue;
        const pris = Math.min(n, besoin);
        reste.set(l.id, n - pris);
        besoin -= pris;
        touches.add(l.id);
      }
    }
  return [...touches].map((id) => {
    const n = reste.get(id)!;
    return { id, band: n > 1e-9 ? `${Math.round(n * 100) / 100}-repas` : null };
  });
}

/** Les types que le goûter prend au dépôt — ceux d'une fournée ou d'une compote. */
export const typesDuGouter = (catalogue: Catalogue): ReadonlySet<string> =>
  new Set(catalogue.creneaux.routines?.liste.find((r) => r.repas === "gouter")?.duDepot?.types ?? []);

/* ═════════════════════════════════════════════════════ la fournée */

/** Sous ce nombre de goûters au congélateur, la pause propose une fournée. */
export const SEUIL_FOURNEE = 3;

/** Une fournée : une recette dont une sortie part au congélateur et que le
 *  goûter sait prendre. Les rations des routines n'en sont pas. */
export function estUneFournee(catalogue: Catalogue, p: Plat): boolean {
  const types = typesDuGouter(catalogue);
  return p.emits.some((e) => e.congelo && types.has(e.type));
}

/** Combien de goûters attendent au congélateur, et le premier à sortir. */
export function gouterAuCongelo(
  catalogue: Catalogue,
  stock: readonly Pick<LotInitial, "type" | "qty_band" | "location" | "born">[],
): { restants: number; premier: string | null } {
  const types = typesDuGouter(catalogue);
  const lots = stock
    .filter((l) => l.location === "congelo" && types.has(l.type))
    .sort((a, b) => a.born.localeCompare(b.born));
  return { restants: lots.reduce((n, l) => n + bandRepas(l.qty_band), 0), premier: lots[0]?.type ?? null };
}

export interface Fournee {
  plat: Plat;
  /** Pourquoi maintenant : le congélateur se vide, ou des fruits passent. */
  raison: "stock-bas" | "fruits-murs";
  /** Goûters restants au congélateur. */
  restants: number;
  /** Les fruits mûrs que la recette finit, quand c'est eux la raison. */
  fruits: string[];
  /** Ce qu'il faut acheter pour la lancer. */
  manque: string[];
}

/** Les fruits qu'une fournée sait finir. */
const FRUITS = ["banane", "poires", "pommes"];

/**
 * Les fruits qui passent : rentrés depuis plus de la moitié de la vie de leur
 * famille de garde (`conservation.yaml:familles`), et toujours au rejeu.
 */
export function fruitsMurs(catalogue: Catalogue, rejeu: Pick<Rejeu, "parIngredient" | "rentres">, aujourdhui: string): string[] {
  const out: string[] = [];
  for (const id of FRUITS) {
    const rentre = rejeu.rentres?.get(id);
    const f = (catalogue.garde ?? []).find((x) => x.ids.includes(id));
    if (!rentre || !f || !rejeu.parIngredient.has(id)) continue;
    const age = Math.round((Date.parse(aujourdhui) - Date.parse(rentre)) / JOUR_MS);
    if (age >= f.fenetreJours / 2) out.push(id);
  }
  return out;
}

/**
 * La fournée de la semaine, quand il en faut une — proposée à la pause de 15 h.
 *
 * DEUX RAISONS, ET UNE SEULE RECETTE. Le congélateur n'a plus que
 * `SEUIL_FOURNEE` goûters, ou des fruits passent. La recette : celle qui finit
 * les fruits mûrs d'abord (la banane tachée fait le banana bread), puis zéro
 * achat, un achat, davantage — et à achats égaux, celles de Marie Chioca.
 */
export function fourneeAProposer(
  catalogue: Catalogue,
  stock: readonly Pick<LotInitial, "type" | "qty_band" | "location" | "born">[],
  murs: readonly string[],
  ici: ReadonlySet<string>,
): Fournee | null {
  const { restants } = gouterAuCongelo(catalogue, stock);
  if (restants >= SEUIL_FOURNEE && murs.length === 0) return null;
  const candidats = catalogue.plats
    .filter((p) => estUneFournee(catalogue, p))
    .map((p) => {
      const fruits = murs.filter((f) => p.ingredients.some((i) => i.id === f));
      return {
        p,
        fruits,
        chioca: /chioca/i.test(p.source?.auteur ?? ""),
        manque: ceQuiManque(catalogue, p, ici).ingredients.map((a) => a.nom),
      };
    })
    // CHIOCA D'ABORD, À ACHATS ÉGAUX : une fournée à six articles n'est pas
    // une fournée de la pause, quel que soit le livre. Zéro, un, puis le reste.
    .sort(
      (a, b) =>
        b.fruits.length - a.fruits.length ||
        Math.min(a.manque.length, 2) - Math.min(b.manque.length, 2) ||
        Number(b.chioca) - Number(a.chioca) ||
        a.manque.length - b.manque.length ||
        a.p.titre.localeCompare(b.p.titre, "fr"),
    );
  const c = candidats[0];
  if (!c) return null;
  const raison = c.fruits.length ? "fruits-murs" : restants < SEUIL_FOURNEE ? "stock-bas" : null;
  if (!raison) return null;
  return { plat: c.p, raison, restants, fruits: c.fruits, manque: c.manque };
}

/* ═════════════════════════════════════════════════ les lignes calmes */

/**
 * Le déjeuner de Chioca, quand le dîner d'hier n'a rien laissé.
 *
 * « Même au boulot » est le livre du midi : ses recettes `dejeuner` d'abord,
 * puis les autres du créneau ; le moins d'achats gagne, puis le titre.
 */
export function dejeunerDeChioca(
  catalogue: Catalogue,
  ici: ReadonlySet<string>,
  mois: number,
): { plat: Plat; manque: number } | null {
  const c = catalogue.plats
    .filter(
      (p) =>
        p.role === "plat" &&
        p.creneaux.includes("dejeuner") &&
        p.accepts.every((a) => !a.requis) &&
        /chioca/i.test(p.source?.auteur ?? ""),
    )
    .map((p) => {
      const m = ceQuiManque(catalogue, p, ici).ingredients;
      return {
        plat: p,
        boulot: /boulot/i.test(p.source?.ouvrage ?? ""),
        manque: m.length,
        // Des orties en octobre ne s'achètent pas (T131) : ce midi-là sort.
        horsSaison: m.some((a) => deSaison(catalogue, a.id, mois) === false),
      };
    })
    .filter((x) => !x.horsSaison)
    .sort(
      (a, b) =>
        a.manque - b.manque || Number(b.boulot) - Number(a.boulot) || a.plat.titre.localeCompare(b.plat.titre, "fr"),
    )[0];
  return c ? { plat: c.plat, manque: c.manque } : null;
}
