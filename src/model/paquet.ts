// La boîte entière — T140.
//
// DIT PAR L'UTILISATEUR LE 2026-10-20 : « je préfère utiliser la boîte entière
// plutôt que les trois quarts et gérer un petit reste ». Une boîte de maïs,
// une brique, un bocal ouverts ne se gardent pas : un reste de 85 g est un
// pot de plus au frigo, à finir dans les trois jours, et c'est exactement le
// genre de petit reste que ce foyer refuse de gérer. Le plat prend donc la
// boîte ENTIÈRE, et l'app compte comme le foyer cuisine — au rejeu, à la
// liste, au fond, et sur la fiche, où elle le dit.
//
// CE N'EST PAS UNE RÈGLE DU SEC. Pâtes, lentilles, farine, riz se gardent
// ouverts : un paquet entamé reste au placard, et ils se comptent toujours à
// la quantité (T135). La frontière se lit dans `conservation.yaml:familles`
// (`entame_se_finit`), pas dans une liste d'ids ici.

import type { Catalogue, Quantite } from "./types";

/**
 * À partir de quelle part de la DERNIÈRE boîte la recette la prend entière.
 *
 * UN TIERS. La recette demande au moins le tiers de la boîte qu'elle ouvre :
 * elle la vide. 200 g sur une boîte de 285 g (70 %), une boîte ; 400 g, deux
 * boîtes — 115 g de la seconde (40 %) laisseraient 170 g de maïs au frigo, le
 * petit reste dont l'utilisateur ne veut pas. En dessous, c'est un VRAI usage
 * partiel : 50 g de crème sur 200, une cuillère de concentré — le reste reste
 * ouvert, et le rejeu le garde (T29, `SEUIL_RESTE`).
 *
 * Plus haut (la moitié), deux boîtes de thon de 140 g pour une recette de
 * 200 g se seraient comptées « une boîte et 60 g de la seconde » : personne ne
 * garde 80 g de thon.
 */
export const PART_POUR_BOITE_ENTIERE = 1 / 3;

/** Ce qu'un plat prend en boîtes entières. */
export interface BoitesEntieres {
  /** Combien de boîtes partent — toutes vidées. */
  boites: number;
  /** Ce que ça fait, dans l'unité de la boîte (`boites × contenu`). */
  quantite: number;
}

/**
 * Le besoin d'une recette, arrondi aux boîtes entières — ou `null` quand c'est
 * un usage partiel qui laisse une boîte ouverte.
 *
 * `null` AUSSI QUAND LE BESOIN TOMBE JUSTE : rien n'est arrondi, la quantité
 * de la recette est déjà la bonne et il n'y a rien à dire de plus.
 */
export function boitesEntieres(besoin: number, contenu: number): BoitesEntieres | null {
  if (!(besoin > 0) || !(contenu > 0)) return null;
  const q = besoin / contenu;
  const pleines = Math.floor(q + 1e-9);
  const derniere = q - pleines;
  if (derniere <= 1e-9) return null;
  if (derniere < PART_POUR_BOITE_ENTIERE) return null;
  return { boites: pleines + 1, quantite: (pleines + 1) * contenu };
}

/** Ce qu'est une boîte pour un ingrédient : son contenu, et son nom d'usage. */
export interface Boite {
  contenu: Quantite;
  /** « boîte », « brique », « bocal », « sachet » — le premier mot de
   *  `fond.yaml:unite`. */
  nom: string;
}

/** Les unités de recette qui se comparent au contenu d'une boîte. */
const EN_MASSE = new Set(["g", "ml"]);

/**
 * Ce que contient une unité d'achat, lu dans les mots du fond — T135.
 *
 * « sachet de 500 g » → 500 g ; « paquet de 1 kg » → 1000 g ; « boîte de 6 »,
 * « pack de 4 » → 6, 4 pièces. Rien d'autre : « sachet », « tube », « filet de
 * 1 kg » d'oignons (que les recettes comptent en pièces) ne se soustraient pas,
 * ou pas dans la même unité, et `retirer` garde alors son mode non chiffré.
 */
export function contenuDUnite(unite: string): Quantite | null {
  const nombre = (x: string): number => Number(x.replace(",", "."));
  const kg = /(\d+(?:[.,]\d+)?)\s*kg\b/i.exec(unite);
  if (kg) return { amount: nombre(kg[1]!) * 1000, unit: "g" };
  const g = /(\d+(?:[.,]\d+)?)\s*g\b/i.exec(unite);
  if (g) return { amount: nombre(g[1]!), unit: "g" };
  // T142 — « brique de 1 L » (le lait de croissance) : des millilitres, que le
  // rejeu soustrait comme des grammes (`journal.EN_GRAMMES`).
  const l = /(\d+(?:[.,]\d+)?)\s*l\b/i.exec(unite);
  if (l) return { amount: nombre(l[1]!) * 1000, unit: "ml" };
  // T157 — « brique de 40 cl » (le lait de coco), « 400 ml ».
  const cl = /(\d+(?:[.,]\d+)?)\s*cl\b/i.exec(unite);
  if (cl) return { amount: nombre(cl[1]!) * 10, unit: "ml" };
  const ml = /(\d+(?:[.,]\d+)?)\s*ml\b/i.exec(unite);
  if (ml) return { amount: nombre(ml[1]!), unit: "ml" };
  const pieces = /\bde\s+(\d+)\s*$/i.exec(unite);
  if (pieces) return { amount: nombre(pieces[1]!), unit: "pièce" };
  return null;
}

/**
 * La boîte d'un ingrédient, quand la règle s'y applique : sa famille de garde
 * dit qu'une boîte entamée se finit, ET le fond dit combien elle pèse. Une
 * seule des deux, et l'app ne sait pas arrondir — elle compte à la quantité,
 * comme avant.
 *
 * `?? []`, `?? false` : les catalogues fabriqués à la main des tests datent
 * d'avant le fond et le champ.
 */
export function boitesDuCatalogue(
  catalogue: Catalogue,
  alias: (id: string) => string = (id) => catalogue.rayons.aliases[id] ?? id,
): (id: string) => Boite | null {
  const seFinit = new Set(
    (catalogue.garde ?? []).filter((f) => f.entameSeFinit).flatMap((f) => f.ids.map(alias)),
  );
  const par = new Map<string, Boite>();
  for (const d of catalogue.fond?.denrees ?? []) {
    const id = alias(d.ingredient);
    const contenu = contenuDUnite(d.unite);
    if (!seFinit.has(id) || !contenu || !EN_MASSE.has(contenu.unit)) continue;
    par.set(id, { contenu, nom: d.unite.trim().split(/\s+/)[0]!.toLowerCase() });
  }
  return (id) => par.get(alias(id)) ?? null;
}

/** Le besoin d'une ligne de recette, en boîtes entières si la règle mord. */
export function boitesDeLaLigne(
  boite: Boite | null,
  qty: number,
  unit: string,
): BoitesEntieres | null {
  if (!boite || !EN_MASSE.has(unit) || unit !== boite.contenu.unit) return null;
  return boitesEntieres(qty, boite.contenu.amount);
}

const FEMININ = new Set(["boîte", "brique", "conserve", "bouteille"]);

/** « boîte » → « boîtes », « bocal » → « bocaux ». */
export const pluriel = (nom: string, n: number): string =>
  n > 1 ? (nom.endsWith("al") ? `${nom.slice(0, -2)}aux` : `${nom}s`) : nom;

/** « 1 boîte entière », « 2 bocaux entiers ». */
export function phraseBoites(nom: string, n: number): string {
  const entier = FEMININ.has(nom) ? "entière" : "entier";
  return `${n} ${pluriel(nom, n)} ${entier}${n > 1 ? "s" : ""}`;
}
