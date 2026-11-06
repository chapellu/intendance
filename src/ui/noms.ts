// Le nom lisible d'un ingrédient — voir `retenirLesNoms`.

export { nomDeLaDenree as nomLisibleDe, sansAccents as pourChercher } from "../model/plancherGardeManger";
import { nomDeLaDenree } from "../model/plancherGardeManger";
import type { Catalogue } from "../model/types";

/** Le nom à afficher pour un id d'ingrédient. */
export const nomLisible = (_catalogue: Catalogue, id: string): string => nomDeLaDenree(id);
