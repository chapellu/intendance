// CE QU'UN PLAT PRODUIT, DIT EN FRANÇAIS — T193.
//
// Un type émis (`lentilles-vertes-cuites`) sert à chaîner, jamais à être lu.
// Les écrans le dé-tiretisaient : « pate vegetal », « puree lentilles
// carottes », sans accents. `export_json.py` publie maintenant un nom par type
// (`typesLisibles` : le titre du plat, ou le libellé de `types.yaml`), et
// `lireCatalogue` le retient ici.
//
// UN REGISTRE ET PAS UN ARGUMENT, parce que `nomDuType` est appelé depuis une
// douzaine d'endroits qui n'ont pas le catalogue sous la main (une offre, une
// phrase du cockpit), et que ce nom ne dépend que du catalogue chargé. Sans
// catalogue — un test qui fabrique ses lots —, on retombe sur l'ancien
// comportement.

const LISIBLES = new Map<string, string>();

export function retenirTypesLisibles(noms: Readonly<Record<string, string>>): void {
  LISIBLES.clear();
  for (const [type, nom] of Object.entries(noms)) LISIBLES.set(type, nom);
}

export const nomDuType = (type: string): string => LISIBLES.get(type) ?? type.replace(/-/g, " ");
