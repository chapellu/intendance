// Ce que les routines prennent au dépôt — T142.
//
// LE PLACARD SE REJOUE, LE DÉPÔT S'ÉCRIT. La ration du placard (lait, flocons,
// yaourts) se recalcule à chaque lecture (`journal.evenementsDesRoutines`) ;
// les lots du dépôt, eux, sont des lignes de la table `stock` qu'un doigt
// corrige — le pain du matin et la part de fournée du goûter en sont donc
// retirés pour de bon, une fois par jour, au démarrage.
//
// UNE SEULE FOIS PAR JOUR : le dernier jour appliqué est un réglage, et la
// transaction le lit et l'écrit avec les lots. Deux onglets ouverts ne
// retirent pas deux goûters.

import { jourISO, type Base } from "./schema";
import { dernierMidiPasse, joursDe, midisDuFrigo, midisPasses, prisesDesRoutines } from "../model/repas";
import { bandRepas } from "../model/depot";
import type { Catalogue } from "../model/types";

export const CLE_ROUTINES = "routines|fait";
/** T146 — le dernier midi dont `midisDuFrigo` a pris sa part. */
export const CLE_MIDIS = "routines|midis";

const veille = (iso: string): string =>
  new Date(Date.parse(`${iso}T12:00:00Z`) - 86_400_000).toISOString().slice(0, 10);

/** Retire du dépôt ce que les routines ont pris depuis le dernier passage,
 *  jusqu'à aujourd'hui inclus. Rend le nombre de lots touchés. */
export async function consommerLesRoutines(base: Base, catalogue: Catalogue, aujourdhui = new Date()): Promise<number> {
  const r = catalogue.creneaux.routines;
  if (!r) return 0;
  const jour = jourISO(aujourdhui);
  return base.transaction("rw", base.stock, base.reglages, base.evenements, async () => {
    // T146 — les midis prévus au dîner de la veille, lus AVANT que
    // `midisPasses` n'efface leur marque : ceux-là ne prennent rien au frigo.
    // T155 — avec leurs parts : un midi prévu plus petit prend le reste au frigo.
    const prevus = new Map<string, number>();
    for (const l of await base.stock.toArray())
      if (l.midiLe) prevus.set(l.midiLe, (prevus.get(l.midiLe) ?? 0) + (l.midi ?? bandRepas(l.band)));
    // T144 — LES MIDIS PASSÉS d'abord, à chaque ouverture : un lot mis de côté
    // pour un déjeuner mangé perd ses parts (`midisPasses`). Idempotent, la
    // marque `midiLe` part avec.
    let n = 0;
    const maj0 = Date.now();
    for (const p of midisPasses(await base.stock.toArray(), aujourdhui)) {
      n += 1;
      if (p.band === null) await base.stock.delete(p.id);
      else
        await base.stock.update(p.id, (l) => {
          l.band = p.band!;
          l.qty = null;
          l.maj = maj0;
          delete l.midiLe;
          delete l.midi;
        });
    }
    // T146 — LES MIDIS SANS GESTE : le plus ancien reste du frigo perd les
    // parts du midi, chaque jour dont le déjeuner est passé (`midisDuFrigo`).
    const dernier = dernierMidiPasse(aujourdhui);
    const faitsMidi = (await base.reglages.get(CLE_MIDIS))?.valeur;
    const depuisMidi = typeof faitsMidi === "string" && faitsMidi >= veille(r.depuis) ? faitsMidi : veille(r.depuis);
    if (depuisMidi < dernier) {
      const jours = joursDe(depuisMidi, dernier).slice(1);
      const cuits = new Set(
        (await base.evenements.where("jour").between(jours[0]!, dernier, true, true).toArray())
          .filter((e) => e.sorte === "cuisine" && "repas" in e && e.repas === "dejeuner")
          .map((e) => e.jour),
      );
      const majM = Date.now();
      for (const p of midisDuFrigo(catalogue, await base.stock.toArray(), jours, cuits, prevus)) {
        n += 1;
        if (p.band === null) await base.stock.delete(p.id);
        else await base.stock.update(p.id, { band: p.band, qty: null, maj: majM });
      }
      await base.reglages.put({ cle: CLE_MIDIS, valeur: dernier, maj: majM });
    }
    const fait = (await base.reglages.get(CLE_ROUTINES))?.valeur;
    const depuis = typeof fait === "string" && fait >= veille(r.depuis) ? fait : veille(r.depuis);
    if (depuis >= jour) return n;
    const jours = joursDe(depuis, jour).slice(1);
    const lots = await base.stock.toArray();
    const prises = prisesDesRoutines(r.liste, lots, jours);
    const maj = Date.now();
    for (const p of prises)
      if (p.band === null) await base.stock.delete(p.id);
      else await base.stock.update(p.id, { band: p.band, maj });
    await base.reglages.put({ cle: CLE_ROUTINES, valeur: jour, maj });
    return n + prises.length;
  });
}

/**
 * Les routines du jour, UNE FOIS PAR JOUR ET PAR ONGLET — T146.
 *
 * L'ONGLET RESTE OUVERT PLUSIEURS JOURS. `useAmorce` ne tourne qu'au
 * démarrage : l'année simulée (run 9) n'a jamais rechargé la page, et le pain
 * de la fournée du 17/10 restait « 6 matins » le 2 novembre — le pain ne
 * passait jamais sous `SEUIL_PAIN`, et la fournée de pain n'était plus
 * proposée (316 matins sans pain). Le report des posés roule déjà au
 * changement de jour (`useReport`) ; les routines passent avec lui.
 *
 * La promesse est gardée par jour : deux écrans montés le même jour ne
 * lancent qu'une transaction — qui, de toute façon, ne retire rien deux fois.
 */
const DU_JOUR = new Map<string, Promise<number>>();

export function routinesDuJour(base: Base, catalogue: Catalogue, maintenant = new Date()): Promise<number> {
  // Avant et après le déjeuner : le midi passé libère ses boîtes avant la
  // carte de 15 h (`dernierMidiPasse`).
  const cle = `${base.name}|${dernierMidiPasse(maintenant)}|${jourISO(maintenant)}`;
  let p = DU_JOUR.get(cle);
  if (!p) {
    p = consommerLesRoutines(base, catalogue, maintenant).catch(() => 0);
    DU_JOUR.set(cle, p);
  }
  return p;
}
