// Le ticket photographié, côté base — T138.
//
// DEUX ÉCRITURES, ET C'EST TOUT. La table apprise retient ce que le doigt a
// choisi pour un libellé ; l'entrée au stock passe par `journaliserEntree`,
// LE MÊME CHEMIN que « Tout rentrer » de la liste — donc placard, planchers,
// fin de garde (T137) et « Ce soir » voient l'achat sans rien savoir du ticket.
//
// La photo, elle, n'arrive jamais ici : elle ne quitte pas l'écran.

import { cleArticle, type Base } from "./schema";
import { journaliserEntree } from "./journal";
import type { LigneEntree } from "../model/journal";
import type { Appris } from "../model/ticketCorrespondance";

export async function lireAppris(base: Base): Promise<Map<string, Appris>> {
  return new Map((await base.libelles.toArray()).map((a) => [a.cle, a]));
}

/** Retenir des choix : `ingredient: null` = « pas pour la cuisine ». */
export async function apprendre(
  base: Base,
  choix: readonly { cle: string; ingredient: string | null }[],
): Promise<void> {
  const maj = Date.now();
  await base.libelles.bulkPut(choix.map((c) => ({ ...c, maj })));
}

export interface LigneDuTicket {
  cle: string;
  ingredient: string | null;
  unites: number;
  parUnite: LigneEntree["parUnite"];
  prixTTC: number;
}

/**
 * Tout rentrer d'un ticket : la table apprise, l'entrée datée du jour de
 * l'ACHAT, et les lignes de la liste de courses que le ticket a couvertes.
 *
 * `jour` est obligatoire et c'est le point : un ticket sans date ne rentre pas
 * (T66). L'écran la réclame avant d'appeler ici.
 */
export async function rentrerUnTicket(
  base: Base,
  jour: string,
  lignes: readonly LigneDuTicket[],
  /** Les articles de la liste en cours : id d'ingrédient → unités possibles. */
  liste: ReadonlyMap<string, readonly string[]> = new Map(),
  aujourdhui = new Date(),
): Promise<{ rentrees: number; cochees: number }> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(jour)) throw new Error(`ticket sans date : « ${jour} »`);
  const achat = new Date(`${jour}T12:00:00`);
  const pourLaCuisine = lignes.filter((l): l is LigneDuTicket & { ingredient: string } => !!l.ingredient);

  return base.transaction("rw", base.libelles, base.evenements, base.courses, async () => {
    await apprendre(base, lignes.map((l) => ({ cle: l.cle, ingredient: l.ingredient })));
    if (pourLaCuisine.length) {
      await journaliserEntree(
        base,
        pourLaCuisine.map((l) => ({
          ingredient: l.ingredient,
          unites: l.unites,
          parUnite: l.parUnite,
          zone: null,
          // Même état que la liste (`entrerAuStock`) : la garde se lit sur
          // la famille de l'ingrédient, pas sur ce champ.
          etat: "sec" as const,
          prixTTC: l.prixTTC,
        })),
        achat > aujourdhui ? aujourdhui : achat,
        aujourdhui,
      );
    }
    // LA LISTE SE COCHE TOUTE SEULE : l'article est acheté ET rangé. Pas de
    // seconde entrée au stock — elle vient d'être faite, avec le vrai poids.
    const maj = Date.now();
    const cles = [...new Set(pourLaCuisine.flatMap((l) => (liste.get(l.ingredient) ?? []).map((u) => cleArticle(l.ingredient, u))))];
    await base.courses.bulkPut(cles.map((cle) => ({ cle, coche: false, rentre: true, maj })));
    return { rentrees: pourLaCuisine.length, cochees: cles.length };
  });
}

