// Ce qui reste une fois la table servie — T108.
//
// LE CATALOGUE DÉCLARE LE RESTE DU FOYER, PAS CELUI DU LOT. « Sur 4 parts,
// c'est ce qui reste une fois le dîner servi » (`ratatouille-minute`), « le
// dîner familial en prend le gros, c'est ce reste-là qui est chiffré »
// (`mitonnee-lentilles`) : un `emit` est ce que laisse UN lot de `portions`
// quand `Foyer.parts` est à table. La sortie le multipliait par le facteur
// d'échelle comme si les invités ne mangeaient rien — la Toussaint à 8 rangeait
// 150 g au frigo et 450 g au congélateur d'une mitonnée cuisinée pour 8.
//
// LA RÈGLE, EN UNE LIGNE : le reste suit les portions qui restent.
//
//            portions × f − parts          ce qui reste dans la cocotte ce soir
//     r  =  ──────────────────────   =   ──────────────────────────────────────
//             portions − Foyer.parts       ce qui restait quand l'emit a été écrit
//
// et l'emit se multiplie par `r` au lieu de `f`. Pour le foyer seul à l'échelle
// 1, r = 1 : RIEN NE CHANGE pour le cas que le catalogue décrit. Pour deux
// parts au lieu de 2,5, r > 1 : il en reste plus. Pour huit sur un lot de huit,
// r = 0 : tout part dans les assiettes — et c'est la vérité, quoi qu'en dise
// le ticket (voir BACKLOG.md, T108).
//
// DEUX CAS OÙ LA RÈGLE NE S'APPLIQUE PAS, ET ILS RETOMBENT SUR `f`.
//
// - CE QUE LA TABLE NE MANGE PAS (`horsTable`, plus les `parure` et la
//   `portion-bebe`) : un invité de plus ne retire rien à une carcasse, à un
//   bouillon ou à une pâte à pizza. Le lot en fait plus, c'est tout.
// - UN LOT QUE LE FOYER VIDE À LUI SEUL (`portions ≤ Foyer.parts`, 29 plats
//   du corpus — les salades-lunchbox d'une portion, les recettes pour deux) :
//   le dénominateur est nul ou négatif, c'est-à-dire que l'emit déclaré NE PEUT
//   PAS être un reste de la table. On ne lui invente pas un autre sens ; il
//   garde l'ancien calcul, et le trou est nommé dans le backlog.

import { bandRepas } from "./depot";
import type { Emit, Foyer, Plat } from "./types";

/** Ce qu'un emit laisse ce soir, avant toute question de frigo ou de boîte. */
export interface Reste {
  /** Le rang de l'emit dans `plat.emits`. */
  emit: number;
  /** En repas, arrondi, jamais moins d'un. */
  repas: number;
  qty: number | null;
}

/** La table en mange-t-elle ? Les invités ne retranchent que ce qu'elle mange. */
export const mangeALaTable = (e: Emit): boolean =>
  !e.horsTable && e.kind !== "parure" && e.kind !== "portion-bebe";

/**
 * Le multiplicateur d'un emit — `f` pour ce que la table ne touche pas, la
 * part des portions qui restent pour le reste.
 */
export function multiplicateur(p: Plat, e: Emit, f: number, parts: number, foyerParts: number): number {
  if (!mangeALaTable(e)) return f;
  const avant = p.portions - foyerParts;
  if (avant <= 0) return f;
  return Math.max(0, p.portions * f - parts) / avant;
}

/**
 * Ce que chaque emit laisse une fois la table servie.
 *
 * MOINS QUE LA PLUS PETITE PART DU FOYER, C'EST DANS LES ASSIETTES. Le foyer
 * déclare son plus petit mangeur à 0,25 part ; un reste plus petit qu'une
 * cuillère de bébé ne se range pas dans une boîte, il se finit. Sans ce seuil,
 * 3,75 parts sur une ratatouille pour 4 rangeraient « 1 repas » de 83 g.
 *
 * Au-dessus, ARRONDI ET JAMAIS EN DESSOUS D'UN — la règle de `bandRepas` : un
 * emit qui existe occupe au moins une place.
 */
export function restesApresTable(
  p: Plat,
  f: number,
  parts: number,
  foyer: Pick<Foyer, "parts" | "mangeurs">,
): Reste[] {
  const seuil = foyer.mangeurs.reduce((m, x) => (x.parts > 0 ? Math.min(m, x.parts) : m), Infinity);
  const out: Reste[] = [];
  p.emits.forEach((e, emit) => {
    const r = multiplicateur(p, e, f, parts, foyer.parts);
    const bruts = bandRepas(e.band) * r;
    if (r <= 0 || (mangeALaTable(e) && Number.isFinite(seuil) && bruts < seuil)) return;
    out.push({
      emit,
      repas: Math.max(1, Math.round(bruts)),
      qty: e.qty ? e.qty.amount * r : null,
    });
  });
  return out;
}
