// Une seule unité par denrée là où l'on additionne — T145.
//
// L'ANNÉE SIMULÉE A COMPTÉ 497 KG DE POMMES DE TERRE. Onze recettes les
// comptent à la pièce, sept au gramme, deux au kilo : la liste additionnait
// par `id|unité` (trois lignes pour un seul sac) et le placard ne savait pas
// retirer « 3 pièces » d'un sac d'un kilo. Là où des quantités se somment
// (`calcul.auPanier`, `journal.demandes`), elles passent d'abord par ici. La
// fiche, elle, garde l'unité de la recette : « 4 pommes de terre » se lit.

/** Le poids d'une pièce, pour les denrées qui s'achètent au poids et que des
 *  recettes comptent à la pièce. */
export const POIDS_PIECE: Readonly<Record<string, number>> = {
  "pomme-de-terre": 150,
  "pommes-de-terre": 150,
  // T149 — LA POMME DU GOÛTER EST UNE PIÈCE, LE SACHET SE PÈSE. Retirée « à la
  // pièce » d'un sachet de 1,5 kg chiffré en grammes, la pomme passait par le
  // mode non chiffré : le sachet s'entamait au premier goûter et disparaissait
  // au second. L'app croyait la semaine finie le lundi soir. 150 g, la pomme
  // moyenne ; la poire, à l'avenant.
  pommes: 150,
  poires: 150,
  // T156 — LA CAROTTE ET L'OIGNON, MÊME PIÈGE. T154 a mis la carotte au
  // demi-kilo pesé ; les recettes la comptent à la pièce (« 3 carottes »),
  // donc `retirer` passait au mode non chiffré : un demi-kilo servait deux
  // plats quel que soit le nombre de carottes. L'app croyait des carottes au
  // bac quand la cuisine n'en avait plus — 60 dîners de l'année n° 11, surtout
  // les lentilles vertes (quatre carottes). L'oignon (filet de 1 kg, compté à
  // la pièce) dérivait de même, dans l'autre sens. 150 g, comme le harnais.
  carottes: 150,
  oignon: 150,
};

/** `qty unit` dans l'unité où l'on additionne : le kilo en grammes, le litre
 *  en millilitres, la pièce en grammes quand son poids est connu. */
export function enUniteDeCompte(id: string, qty: number, unit: string): { qty: number; unit: string } {
  if (unit === "kg") return { qty: qty * 1000, unit: "g" };
  if (unit === "l" || unit === "L") return { qty: qty * 1000, unit: "ml" };
  const piece = POIDS_PIECE[id];
  if (piece != null && (unit === "pièce" || unit === "piece")) return { qty: qty * piece, unit: "g" };
  return { qty, unit };
}
