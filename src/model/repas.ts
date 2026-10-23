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

import { bandRepas, Depot, horlogesDu, type LotInitial } from "./depot";
import { HEURE } from "./heures";
import { joue, type Jeu } from "./jeu";
import type { Rejeu } from "./journal";
import { ceQuiManque } from "./ici";
import { deSaison, saisonDuPlat } from "./saisons";
import { enUniteDeCompte } from "./unites";
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
  | { etat: "oui"; midi: number; parts: number; boites: number; label: string; auFrigo?: number }
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
  /** T155 — les parts que le frigo tiendra encore demain midi
   *  (`partsAuFrigoDemain`) : le dîner ne s'agrandit que du reste. */
  auFrigo = 0,
): MidiDeDemain {
  const foyer = jeu.catalogue.foyer;
  const midi = jeu.creneaux.findIndex((c) => c.jour === 1 && c.repas === "dejeuner");
  if (midi < 0 || !jeu.plats[RESTE_DE_LA_VEILLE]) return { etat: "non" };
  if (!seGardeJusquADemain(plat)) return { etat: "non" };
  // UN MIDI POSÉ PAR UN « JE LANCE ÇA » PRÉCÉDENT N'EST PAS PRIS : relancer ce
  // soir le réécrit (`poserCeSoir`).
  const pose = jeu.choix[midi] ?? null;
  if (joue(pose) && !(pose === RESTE_DE_LA_VEILLE && jeu.deLaVeille?.[midi])) return { etat: "deja-pose", midi };

  // T155 — LE FRIGO D'ABORD. L'année simulée n° 11 : 46 restes jetés (8 la
  // n° 10). Le dîner s'agrandissait des trois parts du midi, le midi prenait
  // ce lot-là, et la part que le dîner de la veille laissait (« Frigo · 1
  // repas ») n'avait plus de preneur. Le dîner ne s'agrandit plus que de ce
  // qui manque au midi une fois le frigo compté ; le midi prend les deux
  // (`midisDuFrigo`). Le frigo suffit : rien à agrandir.
  const parts = Math.round((partsDuMidi(foyer) - auFrigo) * 100) / 100;
  if (parts < 0.5 - 1e-9) return { etat: "non" };
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
  return { etat: "oui", midi, parts, ...boites, ...(auFrigo > 1e-9 ? { auFrigo } : {}) };
}

/**
 * Les parts de reste que le frigo tiendra encore demain midi — T155.
 *
 * Ce que le midi sans geste prendra (`midisDuFrigo`) : les restes de plat du
 * frigo, hors routines et hors midi déjà prévu, encore bons demain à midi.
 */
export function partsAuFrigoDemain(catalogue: Catalogue, stock: readonly LotInitial[], maintenant: Date): number {
  const demain = new Date(maintenant.getFullYear(), maintenant.getMonth(), maintenant.getDate() + 1, 12);
  const ok = auMidi(typesDesRoutines(catalogue), isoDuJour(demain));
  const depot = new Depot(horlogesDu(catalogue), stock);
  return stock.reduce((n, l, i) => (ok(l) && !depot.perime(depot.initiales[i]!, demain) ? n + bandRepas(l.qty_band) : n), 0);
}

const pourLeMidi = (c: Contenant): boolean => c.portions > 0 && !c.consommable && c.espaces.includes("frigo");

/** Ce qu'occupe UNE part adulte d'un plat dans une boîte — T145. */
export const PORTION_ADULTE_ML = 400;

/**
 * Combien de parts adultes une boîte porte — T145.
 *
 * LE VOLUME DÉCIDE, PAS L'ÉTIQUETTE. `household.yaml` déclarait « 1 portion »
 * par boîte IKEA de 0,8 L : le midi des quatre (trois parts adultes) prenait
 * trois boîtes, quand deux le portent — une boîte de 0,8 L tient deux parts
 * d'un curry. L'année simulée (run8) : 196 cartes « Boîtes pleines (2 libres) »
 * pour un seul jour de boîtes vraiment pleines. Sans volume (les sacs), la
 * portion déclarée reste la règle.
 */
export const portionsParBoite = (c: Pick<Contenant, "portions" | "volumeMl">): number =>
  c.volumeMl != null && c.volumeMl > 0 ? Math.max(c.portions, Math.floor(c.volumeMl / PORTION_ADULTE_ML)) : c.portions;

/** Le moins de boîtes qui portent `parts`, les plus grandes d'abord. `null`
 *  quand le pool libre n'y suffit pas. */
function boitesDuMidi(
  contenants: readonly Contenant[],
  parts: number,
  libres?: ReadonlyMap<string, number>,
): { boites: number; label: string } | null {
  const familles = contenants.filter(pourLeMidi).sort((a, b) => portionsParBoite(b) - portionsParBoite(a));
  let reste = parts;
  let n = 0;
  for (const c of familles) {
    const dispo = libres?.get(c.id) ?? c.nombre;
    const prises = Math.min(dispo, Math.ceil(reste / portionsParBoite(c) - 1e-9));
    n += prises;
    reste -= prises * portionsParBoite(c);
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

/* ═══════════════════════════════════════════ les boîtes qui sont pleines */

/** Passé cette heure (le déjeuner plus une heure), le midi est mangé. */
const MIDI_FINI = (HEURE.dejeuner ?? 12 * 60 + 30) + 60;

const midiPasse = (midiLe: string, maintenant: Date): boolean => {
  const auj = isoDuJour(maintenant);
  return midiLe < auj || (midiLe === auj && maintenant.getHours() * 60 + maintenant.getMinutes() >= MIDI_FINI);
};

const isoDuJour = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/**
 * Ce que les midis passés ont pris aux lots qui les portaient — T144.
 *
 * L'ANNÉE SIMULÉE L'A VU : le dîner agrandi range demain midi dans trois
 * boîtes, le midi les vide à table, et personne ne tape « je n'en ai plus »
 * sur des boîtes qu'on vient de laver. Le lot restait, et avec lui trois
 * boîtes « pleines » : 19 cartes « Boîtes pleines », dont 14 avec les quatre
 * boîtes libres. Le lot porte maintenant la date de son midi
 * (`LotStock.midiLe`) ; ce midi passé, il perd ses parts — fini s'il n'avait
 * que celles-là.
 *
 * PURE : rend les prises (`band: null` = lot fini), ne touche à rien.
 */
export function midisPasses(
  lots: readonly { id?: number; band: string; midiLe?: string; midi?: number }[],
  maintenant: Date,
): Prise[] {
  const out: Prise[] = [];
  for (const l of lots) {
    if (l.id == null || !l.midiLe || !midiPasse(l.midiLe, maintenant)) continue;
    const reste = bandRepas(l.band) - (l.midi ?? bandRepas(l.band));
    out.push({ id: l.id, band: reste > 1e-9 ? `${Math.round(reste * 100) / 100}-repas` : null });
  }
  return out;
}

/**
 * Ce que les midis SANS GESTE ont pris au frigo — T146.
 *
 * LE MIDI MANGE LE RESTE DU FRIGO, ET PERSONNE NE LE TAPE. Le cockpit le dit
 * (« Midi : le reste au frigo — … ») ; à table, les boîtes se vident, et le
 * lot restait entier dans l'app : un reste entamé gardait toutes ses boîtes,
 * et la carte de 15 h disait « Boîtes pleines (1 libre) » devant trois
 * boîtes lavées (T145 ouvert, run 9 le 30/10).
 *
 * Pour chaque jour de `jours` : un midi cuisiné (`cuits`) ou prévu au dîner
 * de la veille (`prevus`, que `midisPasses` règle) ne prend rien ; sinon le
 * PLUS ANCIEN reste du frigo né avant ce jour perd les parts du midi — au
 * prorata, donc ses boîtes aussi (`rangerDans` relit la bande).
 *
 * PURE : rend les prises, ne touche à rien.
 */
/** Un lot que le midi sans geste peut prendre le jour `jour` : un reste du
 *  frigo, né avant, qui n'est ni une routine ni un midi déjà prévu. */
const auMidi = (routine: ReadonlySet<string>, jour: string) =>
  (l: { type: string; kind?: string; born: string; location?: string; midiLe?: string }): boolean =>
    l.location === "frigo" && (l.kind ?? "reste-plat") === "reste-plat" && !routine.has(l.type) && !l.midiLe && l.born < jour;

const typesDesRoutines = (catalogue: Catalogue): ReadonlySet<string> =>
  new Set(catalogue.creneaux.routines?.liste.flatMap((r) => r.duDepot?.types ?? []) ?? []);

/** Le reste que le midi de `jour` prendra au frigo — le plus ancien. Ce que
 *  la ligne « Midi » du cockpit nomme, et ce que `midisDuFrigo` retire. */
export function resteDuFrigoAuMidi<L extends { type: string; kind?: string; born: string; location?: string; midiLe?: string }>(
  catalogue: Catalogue,
  stock: readonly L[],
  jour: string,
): L | null {
  const ok = auMidi(typesDesRoutines(catalogue), jour);
  return [...stock].filter(ok).sort((a, b) => a.born.localeCompare(b.born))[0] ?? null;
}

export function midisDuFrigo(
  catalogue: Catalogue,
  lots: readonly { id?: number; type: string; kind?: string; band: string; born: string; location?: string; midiLe?: string }[],
  jours: readonly string[],
  cuits: ReadonlySet<string>,
  /** Les midis prévus au dîner de la veille, et leurs parts — T155 : un midi
   *  prévu plus petit que le midi des quatre prend le reste au frigo. Un
   *  `Set` (T146) les dit complets. */
  prevus: ReadonlySet<string> | ReadonlyMap<string, number>,
): Prise[] {
  const routine = typesDesRoutines(catalogue);
  const parts = partsDuMidi(catalogue.foyer);
  const reste = new Map<number, number>();
  const frigo = lots
    .filter((l): l is typeof l & { id: number } => l.id != null)
    .sort((a, b) => a.born.localeCompare(b.born) || a.id - b.id);
  for (const l of frigo) reste.set(l.id, bandRepas(l.band));
  const touches = new Set<number>();
  for (const j of jours) {
    if (cuits.has(j)) continue;
    const prevu = prevus instanceof Map ? prevus.get(j) : prevus.has(j) ? parts : undefined;
    // T155 — PLUSIEURS LOTS S'IL LE FAUT, le plus ancien d'abord : une part
    // d'hier et deux d'avant-hier font le midi des quatre.
    let besoin = parts - (prevu ?? 0);
    const ok = auMidi(routine, j);
    for (const l of frigo) {
      if (besoin <= 1e-9) break;
      if (!ok(l) || reste.get(l.id)! <= 1e-9) continue;
      const pris = Math.min(besoin, reste.get(l.id)!);
      reste.set(l.id, reste.get(l.id)! - pris);
      besoin -= pris;
      touches.add(l.id);
    }
  }
  return [...touches].map((id) => {
    const n = reste.get(id)!;
    return { id, band: n > 1e-9 ? `${Math.round(n * 100) / 100}-repas` : null };
  });
}

/** Le dernier jour dont le midi est passé à `maintenant` : aujourd'hui après
 *  le déjeuner, hier avant. */
export const dernierMidiPasse = (maintenant: Date): string => {
  const auj = isoDuJour(maintenant);
  if (midiPasse(auj, maintenant)) return auj;
  const hier = new Date(maintenant.getFullYear(), maintenant.getMonth(), maintenant.getDate() - 1, 12);
  return isoDuJour(hier);
};

/**
 * Les lots qui tiennent une boîte IKEA MAINTENANT — ce que `contenantsLibres`
 * doit lire, et rien d'autre. T144.
 *
 * TROIS SORTES DE LOTS N'EN TIENNENT PAS, ET LES TROIS PRENAIENT LES QUATRE :
 *   — les goûters de la fournée et le pain maison, en SACHETS au congélateur
 *     (les types que les routines prennent au dépôt) ; `rangerDans` les
 *     re-rangeait dans les boîtes lavables, qui passent devant les sacs ;
 *   — un reste PÉRIMÉ : il est sorti du jeu (`Depot.perime`), et la tâche
 *     « à jeter » le dit — on ne réserve pas une boîte pour lui ;
 *   — le midi déjà MANGÉ (`midisPasses`), même avant que la base le sache.
 */
export function lotsEnBoites(
  catalogue: Catalogue,
  stock: readonly LotInitial[],
  maintenant: Date,
): LotInitial[] {
  const routine = new Set(catalogue.creneaux.routines?.liste.flatMap((r) => r.duDepot?.types ?? []) ?? []);
  const depot = new Depot(horlogesDu(catalogue), stock);
  const out: LotInitial[] = [];
  stock.forEach((l, i) => {
    if (routine.has(l.type) || depot.perime(depot.initiales[i]!, maintenant)) return;
    if (l.midiLe && midiPasse(l.midiLe, maintenant)) {
      const reste = bandRepas(l.qty_band) - (l.midi ?? bandRepas(l.qty_band));
      if (reste <= 1e-9) return;
      out.push({ ...l, qty_band: `${Math.round(reste * 100) / 100}-repas`, qty: null });
      return;
    }
    out.push(l);
  });
  return out;
}

/** Les types que le goûter prend au dépôt — ceux d'une fournée ou d'une compote. */
export const typesDuGouter = (catalogue: Catalogue): ReadonlySet<string> =>
  new Set(catalogue.creneaux.routines?.liste.find((r) => r.repas === "gouter")?.duDepot?.types ?? []);

/* ═════════════════════════════════════════════════════ la fournée */

/** Sous ce nombre de goûters au congélateur, la pause propose une fournée. */
export const SEUIL_FOURNEE = 3;

/** Sous ce nombre de matins de pain maison, la pause propose le pain — T144. */
export const SEUIL_PAIN = 3;

/** Les types que le petit-déjeuner prend au dépôt — le pain maison. */
export const typesDuPain = (catalogue: Catalogue): ReadonlySet<string> =>
  new Set(catalogue.creneaux.routines?.liste.find((r) => r.repas === "petit-dejeuner")?.duDepot?.types ?? []);

/** La routine qu'une recette nourrit au dépôt : une sortie qui part au
 *  congélateur, d'un type que la routine prend, et le créneau de la routine. */
function routineNourrie(catalogue: Catalogue, p: Plat): "gouter" | "petit-dejeuner" | null {
  for (const repas of ["gouter", "petit-dejeuner"] as const) {
    const types = repas === "gouter" ? typesDuGouter(catalogue) : typesDuPain(catalogue);
    if (p.creneaux.includes(repas) && p.emits.some((e) => e.congelo && types.has(e.type))) return repas;
  }
  return null;
}

/** Une fournée : une recette dont une sortie part au congélateur et qu'une
 *  routine sait prendre — les goûters, et depuis T144 le pain du matin. Les
 *  rations des routines n'en sont pas. */
export const estUneFournee = (catalogue: Catalogue, p: Plat): boolean => routineNourrie(catalogue, p) !== null;

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

/** Combien de matins de pain maison il reste, où qu'il soit. COMPTÉ À PART
 *  des goûters : douze tranches ne sont pas « quatre goûters ». */
export const matinsDePain = (
  catalogue: Catalogue,
  stock: readonly Pick<LotInitial, "type" | "qty_band">[],
): number => {
  const types = typesDuPain(catalogue);
  return stock.filter((l) => types.has(l.type)).reduce((n, l) => n + bandRepas(l.qty_band), 0);
};

export interface Fournee {
  plat: Plat;
  /** Pourquoi maintenant : le congélateur se vide de goûters ou de pain, ou
   *  des fruits passent. */
  raison: "stock-bas" | "fruits-murs" | "pain-bas";
  /** Goûters restants au congélateur — matins de pain pour `pain-bas`. */
  restants: number;
  /** Les fruits mûrs que la recette finit, quand c'est eux la raison. */
  fruits: string[];
  /** Ce qu'il faut acheter pour la lancer, en mots — « pommes ou poires ». */
  manque: string[];
}

/** Un fruit passe dans ses deux derniers jours de garde — T146. */
const DERNIERS_JOURS = 2;

/** Les fruits qu'une fournée sait finir. */
const FRUITS = ["banane", "poires", "pommes"];

/** Les fruits qu'une même recette prend l'un pour l'autre : une compote se fait
 *  de pommes, de poires, ou des deux. */
const FRUITS_DE_COMPOTE = ["pommes", "poires"];

/**
 * Les fruits qui passent : rentrés depuis les deux derniers jours de la vie de
 * leur famille de garde (`conservation.yaml:familles`), sans achat depuis, et
 * toujours au rejeu.
 *
 * T146 — PAS À MI-VIE. Les poires s'achètent chaque semaine : à mi-vie
 * (3,5 jours sur 7), elles étaient « mûres » la moitié de chaque semaine, et
 * l'année simulée (run 9) a lancé la compote presque tous les jours. Un fruit
 * qu'on rachète avant qu'il passe ne passe pas ; seul celui qui reste dans la
 * coupe au-delà de sa semaine ordinaire réclame une fournée.
 */
export function fruitsMurs(catalogue: Catalogue, rejeu: Pick<Rejeu, "parIngredient" | "rentres">, aujourdhui: string): string[] {
  const out: string[] = [];
  for (const id of FRUITS) {
    const rentre = rejeu.rentres?.get(id);
    const f = (catalogue.garde ?? []).find((x) => x.ids.includes(id));
    if (!rentre || !f || !rejeu.parIngredient.has(id)) continue;
    const age = Math.round((Date.parse(aujourdhui) - Date.parse(rentre)) / JOUR_MS);
    if (age >= Math.max(f.fenetreJours / 2, f.fenetreJours - DERNIERS_JOURS)) out.push(id);
  }
  return out;
}

/**
 * Ce qu'il faut acheter pour une fournée, en mots — T144.
 *
 * LA COMPOTE SE FAIT DE CE QU'ON A. Elle demande pommes ET poires ; T142
 * disait « il manque : poires » quand le placard avait des pommes, et c'est
 * de pommes qu'il manquait. Un fruit de compote là suffit ; aucun là, la
 * ligne dit le choix — « pommes ou poires » — au lieu d'en inventer un.
 */
/**
 * Ce qui reste d'un fruit une fois les goûters servis jusqu'aux prochaines
 * courses, en grammes — T149.
 *
 * LA POMME DU GOÛTER PASSE AVANT LA COMPOTE. L'année simulée n° 10 : 143
 * goûters sans pomme. La compote (1 kg de pommes) se proposait dès qu'il y
 * avait UNE pomme au placard (`ici` ne dit que la présence) ; on la faisait le
 * mercredi, et le sachet de la semaine n'allait pas jusqu'au samedi. La routine
 * du goûter dit ce qu'un goûter prend (`gouter-des-enfants` : une pomme) ;
 * multipliée par les goûters d'ici les prochaines courses, c'est une réserve.
 * Seul ce qui la dépasse nourrit une fournée.
 *
 * Seuls les fruits que le rejeu pèse sont rendus : un fruit compté à la pièce
 * sans poids garde la règle de présence, faute de mieux.
 */
export function fruitsAuDelaDuGouter(
  catalogue: Catalogue,
  rejeu: Pick<Rejeu, "parIngredient">,
  goutersAvantCourses: number,
): Map<string, number> {
  const out = new Map<string, number>();
  const r = catalogue.creneaux?.routines?.liste.find((x) => x.repas === "gouter");
  const recette = r ? catalogue.plats.find((p) => p.id === r.recette) : undefined;
  for (const i of recette?.ingredients ?? []) {
    const id = catalogue.rayons.aliases[i.id] ?? i.id;
    if (!FRUITS.includes(id)) continue;
    const u = enUniteDeCompte(id, i.qty, i.unit);
    const g = rejeu.parIngredient.get(id)?.grammes;
    if (u.unit !== "g" || g == null) continue;
    out.set(id, g - u.qty * goutersAvantCourses);
  }
  return out;
}

/** Les grammes d'un fruit que demande une fournée, à sa taille de recette. */
const grammesDe = (catalogue: Catalogue, p: Plat, fruit: string): number =>
  p.ingredients
    .filter((i) => (catalogue.rayons.aliases[i.id] ?? i.id) === fruit)
    .reduce((n, i) => {
      const u = enUniteDeCompte(fruit, i.qty, i.unit);
      return n + (u.unit === "g" ? u.qty : 0);
    }, 0);

/** `ici` pour une fournée : sans les fruits que la réserve du goûter retient. */
const iciPourLaFournee = (
  catalogue: Catalogue,
  p: Plat,
  ici: ReadonlySet<string>,
  auDela: ReadonlyMap<string, number>,
): ReadonlySet<string> => {
  const retenus = [...auDela].filter(([f, g]) => ici.has(f) && g + 1e-9 < grammesDe(catalogue, p, f));
  if (!retenus.length) return ici;
  const out = new Set(ici);
  for (const [f] of retenus) out.delete(f);
  return out;
};

function manqueDeLaFournee(catalogue: Catalogue, p: Plat, ici: ReadonlySet<string>): { nom: string; ids: string[] }[] {
  const m = ceQuiManque(catalogue, p, ici).ingredients;
  const compote = FRUITS_DE_COMPOTE.filter((f) => p.ingredients.some((i) => (catalogue.rayons.aliases[i.id] ?? i.id) === f));
  if (compote.length < 2) return m.map((a) => ({ nom: a.nom, ids: [a.id] }));
  const unLa = compote.some((f) => ici.has(f));
  const out: { nom: string; ids: string[] }[] = [];
  let dit = false;
  for (const a of m) {
    if (!compote.includes(a.id)) out.push({ nom: a.nom, ids: [a.id] });
    else if (!unLa && !dit) {
      out.push({ nom: compote.join(" ou "), ids: compote });
      dit = true;
    }
  }
  return out;
}

/**
 * La fournée de la semaine, quand il en faut une — proposée à la pause de 15 h.
 *
 * DEUX BESOINS, COMPTÉS À PART, ET UNE SEULE RECETTE. Le pain du matin
 * (`matinsDePain` sous `SEUIL_PAIN`) et les goûters (`SEUIL_FOURNEE`, ou des
 * fruits qui passent). Depuis T145, LE PAIN D'ABORD dès qu'il en manque — il se
 * mange tous les matins.
 *
 * LES GOÛTERS TOURNENT (T144). T142 classait d'abord par fruits mûrs COMPTÉS :
 * la compote en finit deux, elle gagnait toujours — quatre fournées sur quatre,
 * et dix-huit jours sans goûter. Seules les fournées CUISINABLES concourent
 * (T145 : zéro achat, ou un seul pris au frais de la semaine — T146 : ou un
 * seul, quel qu'il soit, un jour de courses) ; puis celle qu'on n'a pas faite
 * ces jours-ci (`recentes`, T146 : avant le compte d'achats) ; puis zéro achat
 * avant un ; puis CE QUE LE CONGÉLATEUR N'A PAS ; puis un fruit mûr ; Chioca à
 * égalité.
 */
export function fourneeAProposer(
  catalogue: Catalogue,
  stock: readonly Pick<LotInitial, "type" | "qty_band" | "location" | "born">[],
  murs: readonly string[],
  ici: ReadonlySet<string>,
  recentes: ReadonlySet<string> = new Set(),
  /** T146 — un jour de courses, l'article qui manque se prend au magasin. */
  jourDeCourses = false,
  /** T149 — ce qui reste des fruits après les goûters d'ici les prochaines
   *  courses (`fruitsAuDelaDuGouter`) ; absent, la seule présence compte. */
  auDelaDuGouter: ReadonlyMap<string, number> = new Map(),
): Fournee | null {
  const { restants } = gouterAuCongelo(catalogue, stock);
  const matins = matinsDePain(catalogue, stock);
  const enSachets = new Map<string, number>();
  for (const l of stock) enSachets.set(l.type, (enSachets.get(l.type) ?? 0) + bandRepas(l.qty_band));
  // T145 — LE FRAIS DE LA SEMAINE s'achète de toute façon : un article qui en
  // est ne coûte pas une course de plus.
  const frais = new Set(
    (catalogue.fond?.denrees ?? []).filter((d) => d.hebdo).map((d) => catalogue.rayons.aliases[d.ingredient] ?? d.ingredient),
  );

  const candidats = (repas: "gouter" | "petit-dejeuner") =>
    catalogue.plats
      .filter((p) => routineNourrie(catalogue, p) === repas)
      .map((p) => {
        const manque = manqueDeLaFournee(catalogue, p, iciPourLaFournee(catalogue, p, ici, auDelaDuGouter));
        return {
          p,
          fruits: murs.filter((f) => p.ingredients.some((i) => i.id === f)),
          chioca: /chioca/i.test(p.source?.auteur ?? ""),
          deja: p.emits.some((e) => e.congelo && (enSachets.get(e.type) ?? 0) > 0),
          recente: recentes.has(p.id),
          // T145 — SEULE UNE FOURNÉE QU'ON PEUT LANCER : rien à acheter, ou un
          // seul article, et du frais de la semaine. L'année simulée : 90
          // propositions sur 223 sans le stock pour les faire.
          // T146 — UN JOUR DE COURSES, un article, quel qu'il soit : le foyer
          // le prend avec la liste. La compote était la seule fournée sans
          // achat, et la seule proposée (run 9 : trente sur trente-deux).
          cuisinable: manque.length === 0 || (manque.length === 1 && (jourDeCourses || manque[0]!.ids.some((id) => frais.has(id)))),
          manque: manque.map((m) => m.nom),
        };
      })
      .filter((c) => c.cuisinable)
      .sort(
        (a, b) =>
          // T146 — CELLE DE CES JOURS-CI PASSE APRÈS, avant même le compte
          // d'achats : sinon la fournée sans achat revient tous les jours.
          Number(a.recente) - Number(b.recente) ||
          a.manque.length - b.manque.length ||
          Number(a.deja) - Number(b.deja) ||
          Number(b.fruits.length > 0) - Number(a.fruits.length > 0) ||
          Number(b.chioca) - Number(a.chioca) ||
          a.p.titre.localeCompare(b.p.titre, "fr"),
      );

  // T145 — LE PAIN GAGNE LA FOURNÉE dès qu'il en reste moins de trois matins :
  // il se mange tous les matins, et l'année simulée a vu 316 matins sans pain
  // pour deux fournées de pain sur 127.
  const pain = matins < SEUIL_PAIN ? candidats("petit-dejeuner")[0] : undefined;
  if (pain) return { plat: pain.p, raison: "pain-bas", restants: matins, fruits: [], manque: pain.manque };
  const bas = restants < SEUIL_FOURNEE;
  // SANS BESOIN DE GOÛTERS, seule une recette qui finit les fruits mûrs a sa
  // place — et pas celle que le congélateur a déjà, ni celle de ces derniers
  // jours (T146 : la compote relancée six jours sur sept, le congélo plein).
  const gouter = bas || murs.length
    ? candidats("gouter").find((c) => bas || (c.fruits.length > 0 && !c.deja && !c.recente))
    : undefined;
  if (!gouter) return null;
  // T146 — LE MANQUE DU CONGÉLATEUR D'ABORD, dans la raison aussi : la ligne
  // disait « les poires sont mûres » quand c'était le goûter qui manquait.
  return { plat: gouter.p, raison: bas ? "stock-bas" : "fruits-murs", restants, fruits: gouter.fruits, manque: gouter.manque };
}

/* ═════════════════════════════════════════════════ les lignes calmes */

/** Le déjeuner proposé : une recette faisable, ou le constat qu'aucune ne l'est. */
export type DejeunerDuStock =
  | { plat: Plat; manque: number; chioca: boolean }
  /** Rien ne se fait sans deux achats ou plus : on le dit, sans recette. */
  | { plat: null };

/**
 * Le déjeuner, quand le dîner d'hier n'a rien laissé — T144.
 *
 * LE STOCK D'ABORD, COMME « CE SOIR ». T142 ne cherchait que chez Chioca, et
 * l'année simulée n'a jamais pu cuisiner sa ligne : elle demandait toujours
 * « N articles à acheter ». L'ordre est maintenant celui du dîner : zéro
 * article, puis un ; à égalité, la saison (plus d'ingrédients de saison, et
 * jamais un hors saison) ; Marie Chioca (« Même au boulot » d'abord) ne fait
 * que départager. Au-delà d'un achat, rien n'est proposé : un midi à six
 * articles n'est pas un midi de la pause, c'est une course.
 */
export function dejeunerDuStock(
  catalogue: Catalogue,
  ici: ReadonlySet<string>,
  mois: number,
): DejeunerDuStock | null {
  const c = catalogue.plats
    .filter(
      (p) =>
        p.role === "plat" &&
        p.creneaux.includes("dejeuner") &&
        p.id !== RESTE_DE_LA_VEILLE &&
        p.accepts.every((a) => !a.requis),
    )
    .map((p) => {
      const m = ceQuiManque(catalogue, p, ici).ingredients;
      const s = saisonDuPlat(catalogue, p, mois);
      return {
        plat: p,
        chioca: /chioca/i.test(p.source?.auteur ?? ""),
        boulot: /boulot/i.test(p.source?.ouvrage ?? ""),
        manque: m.length,
        saison: s.deSaison.length,
        // Des orties en octobre ne s'achètent pas (T131) : ce midi-là sort.
        horsSaison: m.some((a) => deSaison(catalogue, a.id, mois) === false),
      };
    })
    .filter((x) => !x.horsSaison)
    .sort(
      (a, b) =>
        a.manque - b.manque ||
        b.saison - a.saison ||
        Number(b.chioca) - Number(a.chioca) ||
        Number(b.boulot) - Number(a.boulot) ||
        a.plat.titre.localeCompare(b.plat.titre, "fr"),
    )[0];
  if (!c) return null;
  if (c.manque > 1) return { plat: null };
  return { plat: c.plat, manque: c.manque, chioca: c.chioca };
}
