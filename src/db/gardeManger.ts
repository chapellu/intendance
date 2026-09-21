// Le niveau réel du garde-manger, reposé sur le jeu.
//
// PENDANT DE `db/stock.ts`, ET LA MÊME BASCULE. Le catalogue porte un relevé,
// mais c'est une AMORCE : l'instantané du placard au moment de l'export. Dès
// qu'un œil relève une zone ou qu'une cuisson traverse un ingrédient, c'est le
// journal qui fait foi — et `model/journal.ts` sait déjà le rejouer.
//
// LA DIFFÉRENCE AVEC LE STOCK TIENT EN UN MOT : IL N'Y A RIEN À LIRE. Le stock
// du dépôt est une table ; le niveau du placard n'est stocké nulle part, c'est
// tout T25. On ne recopie donc pas une table dans le jeu, on y repose le
// résultat d'un rejeu — l'amorce du catalogue plus le journal.

import type { Rejeu } from "../model/journal";
import type { Jeu } from "../model/jeu";

/**
 * Retire du garde-manger du jeu les denrées dont il ne reste rien. MUTE `jeu` et
 * le rend, comme `hydraterStock` — le modèle mute son état, et un second style
 * ici ne rendrait pas le premier meilleur.
 *
 * ON FILTRE L'AMORCE, ON NE LA REMPLACE PAS, ET C'EST LA DÉCISION CENTRALE DE CE
 * CORRECTIF. Deux questions vivent ici, et les confondre casse quelque chose des
 * deux côtés :
 *
 *   — **ce que le placard EST** : les 45 denrées relevées le 26/08 dans les six
 *     zones. C'est le catalogue qui le dit, et c'est une définition, pas une
 *     mesure. Elle ne bouge qu'au prochain relevé complet.
 *   — **ce qu'il en RESTE** : le rejeu, et lui seul.
 *
 * Le bug lisait la première pour répondre à la seconde. Prendre `parIngredient`
 * tel quel aurait fait l'erreur symétrique : le journal porte AUSSI ce qui rentre
 * des courses (T27 referme la boucle dans `db/courses.ts`), donc un saumon
 * rangé en rentrant serait devenu une denrée de placard, et sa ligne aurait
 * disparu de la liste sous le doigt de quelqu'un en train de ranger ses courses.
 * Le parcours e2e « cocher un article, le rentrer, et le retrouver rentré » l'a
 * attrapé en une minute — c'est exactement ce qu'il est là pour tenir.
 *
 * D'OÙ L'INTERSECTION, et la propriété qu'elle donne : **ce filtre ne peut
 * qu'AJOUTER des lignes à la liste de courses, jamais en retirer.** Un correctif
 * dont on sait dire le sens est un correctif qu'on peut relire.
 *
 * `parIngredient` SEUL, ET `vus` SURTOUT PAS. Les deux cartes du rejeu disent
 * deux choses : `parIngredient` liste ce qui EST LÀ, `vus` ce dont on a des
 * nouvelles sans qu'il en reste — « j'ai regardé, il n'y a plus de pâtes ».
 * C'est précisément la connaissance qui doit produire une ligne de courses,
 * donc réunir les deux cartes remettrait le bug qu'on vient de retirer.
 *
 * UN REJEU À FROID NE RETIRE RIEN, et c'est ce qui rend ce filtre sûr : mesuré
 * sur le relevé du 26/08, `rejouer(catalogue, [])` rend les 45 ids de l'amorce,
 * ni plus ni moins. Une base vide calcule donc exactement ce qu'elle calculait
 * avant ce correctif.
 */
export function hydraterGardeManger(jeu: Jeu, rejeu: Rejeu): Jeu {
  jeu.gardeManger = jeu.gardeManger.filter((id) => rejeu.parIngredient.has(id));
  return jeu;
}
