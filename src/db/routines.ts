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
import { joursDe, prisesDesRoutines } from "../model/repas";
import type { Catalogue } from "../model/types";

export const CLE_ROUTINES = "routines|fait";

const veille = (iso: string): string =>
  new Date(Date.parse(`${iso}T12:00:00Z`) - 86_400_000).toISOString().slice(0, 10);

/** Retire du dépôt ce que les routines ont pris depuis le dernier passage,
 *  jusqu'à aujourd'hui inclus. Rend le nombre de lots touchés. */
export async function consommerLesRoutines(base: Base, catalogue: Catalogue, aujourdhui = new Date()): Promise<number> {
  const r = catalogue.creneaux.routines;
  if (!r) return 0;
  const jour = jourISO(aujourdhui);
  return base.transaction("rw", base.stock, base.reglages, async () => {
    const fait = (await base.reglages.get(CLE_ROUTINES))?.valeur;
    const depuis = typeof fait === "string" && fait >= veille(r.depuis) ? fait : veille(r.depuis);
    if (depuis >= jour) return 0;
    const jours = joursDe(depuis, jour).slice(1);
    const lots = await base.stock.toArray();
    const prises = prisesDesRoutines(r.liste, lots, jours);
    const maj = Date.now();
    for (const p of prises)
      if (p.band === null) await base.stock.delete(p.id);
      else await base.stock.update(p.id, { band: p.band, maj });
    await base.reglages.put({ cle: CLE_ROUTINES, valeur: jour, maj });
    return prises.length;
  });
}
