// Les courses : cocher, puis rentrer.
//
// DEUX GESTES, DEUX LIEUX. Cocher se fait dans le magasin, l'article part dans
// le caddie ; rentrer se fait à la maison, et c'est seulement là que le stock
// change. Le proto les avait d'abord confondus, et la liste s'effaçait sous le
// doigt au milieu d'un rayon parce qu'un re-rendu passait par là.
//
// La liste elle-même n'est pas stockée : elle est recalculée par `calculer()` à
// partir de la semaine posée. Ce qui est stocké, c'est l'ÉTAT d'un article —
// coché, rentré — parce que ça, aucun calcul ne peut le retrouver.

import { journaliserEntree } from "./journal";
import { cleArticle, type Base, type EtatCourse } from "./schema";
import type { LignePanier } from "../model/calcul";

export const cleDeLArticle = (a: LignePanier): string => cleArticle(a.id, a.unit);

export async function lireCourses(base: Base): Promise<Map<string, EtatCourse>> {
  const lignes = await base.courses.toArray();
  return new Map(lignes.map((l) => [l.cle, l]));
}

async function majEtat(base: Base, cle: string, patch: Partial<EtatCourse>): Promise<void> {
  const e = await base.courses.get(cle);
  await base.courses.put({
    cle,
    coche: patch.coche ?? e?.coche ?? false,
    rentre: patch.rentre ?? e?.rentre ?? false,
    maj: Date.now(),
  });
}

export const cocher = (base: Base, cle: string, coche: boolean): Promise<void> =>
  majEtat(base, cle, { coche });

/**
 * Rentrer un article : il quitte le caddie ET la liste. Décocher au retour
 * serait un geste de plus pour rien — on ne le remet pas dans le caddie.
 *
 * ET IL ENTRE AU STOCK — T27. Ce fichier disait déjà « rentrer se fait à la
 * maison, et c'est seulement là que le stock change », mais rien ne changeait
 * : la boucle était coupée aux deux bouts, ici et à la cuisson. `panier`
 * fournit ce que la liste sait de l'article ; sans lui (dérentrer, ou un appel
 * qui ne l'a pas sous la main), on se contente de l'état, comme avant.
 */
export async function rentrer(
  base: Base,
  cle: string,
  rentre: boolean,
  panier?: Map<string, LignePanier>,
): Promise<void> {
  await majEtat(base, cle, rentre ? { rentre: true, coche: false } : { rentre: false });
  if (!rentre || !panier) return;
  const ligne = panier.get(cle);
  if (ligne) await entrerAuStock(base, [ligne]);
}

/** Rentre d'un coup tout ce qui est coché : le geste de vider le sac. */
export async function rentrerLesCoches(
  base: Base,
  panier?: Map<string, LignePanier>,
): Promise<number> {
  const coches = await base.courses.filter((e) => e.coche && !e.rentre).toArray();
  const maj = Date.now();
  await base.courses.bulkPut(coches.map((e) => ({ ...e, coche: false, rentre: true, maj })));
  if (panier) {
    const lignes = coches.map((e) => panier.get(e.cle)).filter((l): l is LignePanier => !!l);
    if (lignes.length) await entrerAuStock(base, lignes);
  }
  return coches.length;
}

/**
 * Une ligne de liste devient un lot du placard.
 *
 * LE POIDS QUE PORTE LE LOT EST CELUI QUE LA LISTE A CALCULÉ, pas un défaut par
 * ingrédient : `thon-boite` existe en 140 g ET 160 g, `petits-pois-carottes` en
 * 465 g et 530 g. Une liste porte déjà ses quantités, donc ça ne coûte rien —
 * et c'est ce qui évite d'avoir à remplir les 61 ids d'épicerie à la main.
 *
 * `unites: 1` et le poids entier sur l'unité : la liste dit « 500 g de pâtes »,
 * elle ne dit pas « un paquet de 500 g ». Prétendre compter des paquets ici
 * serait inventer un conditionnement que personne n'a vu — et le mode non
 * chiffré de T28 est fait exactement pour ce genre d'honnêteté.
 */
async function entrerAuStock(base: Base, lignes: readonly LignePanier[]): Promise<void> {
  await journaliserEntree(
    base,
    lignes.map((l) => ({
      ingredient: l.id,
      unites: 1,
      parUnite: EN_MASSE.has(l.unit) ? { amount: l.qty, unit: l.unit } : null,
      zone: null,
      etat: "sec" as const,
    })),
  );
}

/** Les unités dont le modèle sait faire une masse. « 2 gousses » n'en est pas
 *  une, et l'écrire comme telle fabriquerait un faux chiffre. */
const EN_MASSE = new Set(["g", "ml"]);

/**
 * Efface l'état des courses. À faire quand la semaine change — sinon un article
 * rentré la semaine dernière rendrait invisible le même article cette semaine,
 * et la liste mentirait par omission, ce qui est la pire façon de mentir pour
 * une liste de courses.
 */
export const viderCourses = (base: Base): Promise<void> => base.courses.clear();
