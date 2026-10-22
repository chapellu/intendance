// Les décisions de la semaine, entre la base et le modèle.
//
// Le modèle raisonne en index de créneau ; la base range par (jour, repas).
// Ce fichier est le seul endroit où les deux se rencontrent — c'est pour ça
// qu'il est petit et qu'il doit le rester : une seconde traduction ailleurs
// serait une seconde occasion de les désaligner.

import { cleCreneau, jourISO, type Base, type DecisionCreneau } from "./schema";
import { creerJeu, type Choix, type Jeu } from "../model/jeu";
import type { Catalogue } from "../model/types";
import { RESTE_DE_LA_VEILLE } from "../model/repas";

/** La clé de base d'un créneau du modèle. */
export function cleDuCreneau(jeu: Jeu, i: number): string | null {
  const c = jeu.creneaux[i];
  if (!c) return null;
  const j = jeu.jours[c.jour];
  if (!j) return null;
  return cleCreneau(jourISO(j.date), c.repas);
}

/** L'index, dans la semaine affichée, du créneau que l'URL désigne. `-1` quand
 *  il tombe hors de la fenêtre — un lien d'hier rouvert aujourd'hui. C'est la
 *  traduction inverse de `cleDuCreneau`, et elle vit ici pour la même raison :
 *  un seul endroit où les deux façons de nommer un créneau se rencontrent. */
export function indexDuCreneau(jeu: Jeu, jour: string, repas: string): number {
  return jeu.creneaux.findIndex((c, i) => {
    void c;
    return cleDuCreneau(jeu, i) === cleCreneau(jour, repas);
  });
}

/** Les décisions qui concernent la semaine affichée, par clé. */
export async function lireSemaine(base: Base, jeu: Jeu): Promise<Map<string, DecisionCreneau>> {
  const jours = jeu.jours.map((j) => jourISO(j.date));
  const debut = jours[0];
  const fin = jours.at(-1);
  if (!debut || !fin) return new Map();
  // Une plage plutôt qu'un `anyOf` : la semaine est contiguë par construction,
  // et l'index `jour` la sert d'un seul coup.
  const lignes = await base.creneaux.where("jour").between(debut, fin, true, true).toArray();
  return new Map(lignes.map((l) => [l.cle, l]));
}

/**
 * Repose les décisions sur la semaine du modèle. MUTE `jeu`, comme tout le
 * reste du modèle, et rend le jeu pour se laisser chaîner.
 *
 * Ce qui n'est pas dans la base reste ce que `creerJeu` a posé : créneau vide,
 * parts du foyer. Une décision qui vise un jour hors de la fenêtre est
 * simplement ignorée — elle n'est pas perdue, elle attend son tour de semaine.
 */
export function hydrater(jeu: Jeu, decisions: Map<string, DecisionCreneau>): Jeu {
  jeu.creneaux.forEach((_, i) => {
    const cle = cleDuCreneau(jeu, i);
    if (!cle) return;
    const d = decisions.get(cle);
    if (!d) return;
    jeu.choix[i] = d.plat as Choix;
    if (d.parts != null) jeu.parts[i] = d.parts;
    jeu.dejaLa[i] = d.ici && d.plat ? { plat: d.plat, ids: d.ici } : null;
    if (jeu.midi) jeu.midi[i] = d.midi ?? null;
    if (jeu.deLaVeille) jeu.deLaVeille[i] = d.de ?? null;
  });
  return jeu;
}

/** Écrit la décision d'un créneau. `plat` à `null` efface le choix sans oublier
 *  les parts : on peut avoir réglé « 4,5 parts » avant de changer d'avis sur le
 *  plat, et retaper le chiffre serait une punition.
 *
 *  `ici` : ce que la carte de 15 h disait déjà là (`DecisionCreneau.ici`).
 *  Absent, l'instantané précédent tombe avec l'ancien plat. */
export async function poser(base: Base, jeu: Jeu, i: number, plat: Choix, ici?: readonly string[]): Promise<void> {
  const c = jeu.creneaux[i];
  const cle = cleDuCreneau(jeu, i);
  if (!c || !cle) throw new RangeError(`créneau ${i} hors de la semaine`);
  const [jour] = cle.split("|");
  const existant = await base.creneaux.get(cle);
  await base.creneaux.put({
    cle,
    jour: jour!,
    repas: c.repas,
    plat,
    parts: existant?.parts ?? null,
    ...(ici && plat ? { ici: [...ici] } : {}),
    maj: Date.now(),
  });
  jeu.choix[i] = plat;
  jeu.dejaLa[i] = ici && plat ? { plat, ids: [...ici] } : null;
  if (jeu.midi) jeu.midi[i] = null;
  if (jeu.deLaVeille) jeu.deLaVeille[i] = null;
}

/**
 * « Je lance ça » — pose le plat sur le dîner de CE SOIR, ce soir étant lu sur
 * l'horloge AU MOMENT DU DOIGT. Rend la clé du créneau écrit.
 *
 * T134 — PAS SUR LA FENÊTRE EN CACHE. Après trois jours sans geste, l'onglet
 * resté ouvert, `useLiveQuery` rend encore l'ancienne fenêtre (voir
 * `db/hooks.ts`) : `soirDe(jeu)` y désignait le dîner d'AVANT-HIER, le plat s'y
 * posait, et la fiche ouvrait sur « ce créneau n'est plus là ». Le squelette de
 * la semaine se reconstruit donc ici depuis `maintenant` ; seul le catalogue
 * vient du jeu de l'écran, et il ne vieillit pas avec la date.
 */
export async function poserCeSoir(
  base: Base,
  catalogue: Catalogue,
  plat: string,
  ici?: readonly string[],
  maintenant: Date = new Date(),
  midi?: number,
): Promise<{ jour: string; repas: "diner" }> {
  const frais = creerJeu(catalogue, 7, maintenant);
  const i = frais.creneaux.findIndex((c) => c.jour === 0 && c.repas === "diner");
  const cle = cleDuCreneau(frais, i);
  if (i < 0 || !cle) throw new RangeError("pas de dîner ce soir dans la fenêtre");
  const j = frais.creneaux.findIndex((c) => c.jour === 1 && c.repas === "dejeuner");
  const cleMidi = cleDuCreneau(frais, j);
  // T142 — LE DÎNER ET LE MIDI DE DEMAIN, OU NI L'UN NI L'AUTRE : une
  // transaction, pour la raison de `prevoirGamelle`. Le midi n'est écrit que
  // s'il est vide AU MOMENT DU DOIGT — la carte a pu le lire libre, un autre
  // écran l'a peut-être pris depuis.
  await base.transaction("rw", base.creneaux, async () => {
    // Les parts réglées À LA MAIN, sans le midi d'un « Je lance ça » précédent :
    // relancer ce soir ne doit pas empiler deux déjeuners sur le même dîner.
    const avant = await base.creneaux.get(cle);
    // Un midi posé sur « les parts du foyer » (`null`) y revient : retrancher le
    // midi retombe pile sur le foyer, et c'est ce `null` qu'on réécrit.
    const brut = avant?.parts != null ? avant.parts - (avant.midi ?? 0) : null;
    const reglees = brut != null && Math.abs(brut - catalogue.foyer.parts) < 1e-9 ? null : brut;
    await poser(base, frais, i, plat, ici);
    const existant = (await base.creneaux.get(cle))!;
    if (avant?.midi) await base.creneaux.put({ ...existant, parts: reglees });
    if (!midi || midi <= 0 || !cleMidi || !catalogue.plats.some((p) => p.id === RESTE_DE_LA_VEILLE)) return;
    const pris = await base.creneaux.get(cleMidi);
    if (pris?.plat && !(pris.plat === RESTE_DE_LA_VEILLE && pris.de)) return;
    await base.creneaux.put({ ...existant, parts: (reglees ?? catalogue.foyer.parts) + midi, midi, maj: Date.now() });
    await base.creneaux.put({
      cle: cleMidi,
      jour: cleMidi.split("|")[0]!,
      repas: "dejeuner",
      plat: RESTE_DE_LA_VEILLE,
      parts: pris?.parts ?? null,
      de: plat,
      maj: Date.now(),
    });
  });
  return { jour: cle.split("|")[0]!, repas: "diner" };
}

/** Règle les parts d'un créneau. `null` remet le créneau aux parts du foyer —
 *  ce n'est pas « zéro part », c'est « comme d'habitude ». */
export async function reglerParts(
  base: Base,
  jeu: Jeu,
  i: number,
  parts: number | null,
): Promise<void> {
  const c = jeu.creneaux[i];
  const cle = cleDuCreneau(jeu, i);
  if (!c || !cle) throw new RangeError(`créneau ${i} hors de la semaine`);
  if (parts != null && parts <= 0)
    throw new RangeError("des parts valent au moins un demi — « personne ne mange » se dit en sautant le repas");
  const [jour] = cle.split("|");
  const existant = await base.creneaux.get(cle);
  await base.creneaux.put({
    cle,
    jour: jour!,
    repas: c.repas,
    plat: existant?.plat ?? null,
    parts,
    // Régler les parts ne change pas ce que la carte disait là.
    ...(existant?.ici ? { ici: existant.ici } : {}),
    // Ni le midi mis de côté (T142) : il reste compris dans les parts réglées.
    ...(existant?.midi ? { midi: existant.midi } : {}),
    ...(existant?.de ? { de: existant.de } : {}),
    maj: Date.now(),
  });
  jeu.parts[i] = parts ?? jeu.catalogue.foyer.parts;
}

/**
 * La gamelle : le dîner de la veille grossit, et le midi du lendemain part sur
 * le reste.
 *
 * DEUX ÉCRITURES QUI N'ONT DE SENS QU'ENSEMBLE, donc une transaction. Un
 * rechargement entre les deux laisserait un dîner cuisiné pour six sans
 * personne pour manger la moitié — l'inverse exact de ce qu'on a promis en
 * proposant l'enchaînement.
 */
export async function prevoirGamelle(
  base: Base,
  jeu: Jeu,
  midi: number,
  veille: number,
  parts: number,
  plat: string,
): Promise<void> {
  await base.transaction("rw", base.creneaux, async () => {
    await reglerParts(base, jeu, veille, parts);
    await poser(base, jeu, midi, plat);
  });
}

/** Oublie tout ce qui concerne un créneau — le plat ET les parts. C'est le
 *  geste « je n'ai rien décidé ici », distinct de « je saute ce repas ». */
export async function oublier(base: Base, jeu: Jeu, i: number): Promise<void> {
  const cle = cleDuCreneau(jeu, i);
  if (!cle) throw new RangeError(`créneau ${i} hors de la semaine`);
  await base.creneaux.delete(cle);
  jeu.choix[i] = null;
  jeu.parts[i] = jeu.catalogue.foyer.parts;
  jeu.dejaLa[i] = null;
}

/**
 * « J'AI FINI » — le seul geste qui efface en gros, et il est demandé.
 *
 * DEMANDÉ LE 23/09/2026, dans la même phrase que le report : « Only clean
 * recipes when I say I'm done. » Le report (`db/report.ts`) tient la première
 * moitié — rien ne disparaît tout seul ; celui-ci tient la seconde, sans quoi
 * la liste ne ferait que grossir et on aurait échangé une perte silencieuse
 * contre un encombrement définitif.
 *
 * TOUTE LA TABLE, PAS LA SEULE FENÊTRE. Ce qui est resté en amont faute de
 * place libre (voir `Report.bloquees`) est justement ce qu'on ne voit pas :
 * l'épargner ici le ferait revenir demain, après qu'on a dit avoir fini. Un
 * geste qui laisse derrière lui ce qu'il promettait d'effacer est pire que pas
 * de geste.
 *
 * Rend le nombre de lignes effacées — l'écran s'en sert pour dire ce qu'il
 * vient de faire, et c'est la seule confirmation qu'un geste irréversible
 * puisse donner après coup.
 */
export async function toutOublier(base: Base, jeu: Jeu): Promise<number> {
  const n = await base.creneaux.count();
  await base.creneaux.clear();
  jeu.choix.fill(null);
  jeu.dejaLa.fill(null);
  jeu.parts.fill(jeu.catalogue.foyer.parts);
  return n;
}

/** Les décisions posées en amont de la fenêtre. Rien ne les efface
 *  automatiquement : `db/report.ts` les RAMÈNE, et c'est au foyer de dire
 *  quand il a fini. */
export const decisionsAvant = (base: Base, jour: string): Promise<DecisionCreneau[]> =>
  base.creneaux.where("jour").below(jour).toArray();
