// La terrasse — les cellules du jardin, et ce qu'on sait d'elles.
//
// PREMIÈRE FACETTE QUI N'EST PAS LA CUISINE. Le modèle du jardin ne partage
// rien avec celui de la semaine : pas de créneau, pas de plat, pas de panier.
// C'est la décision de Workspace#36 prise au sérieux — les facettes se
// touchent par la coquille et par un drapeau de récolte, jamais par un type.
//
// ────────────────────────────────────────────────────────────────────────────
// CE FICHIER EST UNE AMORCE, PAS UNE BASE, ET C'EST DÉLIBÉRÉ.
//
// Workspace#13 — « comment la ligne de base année-0 du jardin est capturée » —
// n'est PAS tranché : on ne sait pas encore si une cellule démarre à zéro, si
// le jardinier l'estime, ou si l'app l'infère de ce qui y pousse. Persister un
// état de sol avant cette décision, c'est écrire en base une réponse qu'on
// n'a pas, et la retrouver dans six mois sans savoir qui l'a mise là.
//
// Donc : la terrasse se LIT, elle ne s'écrit pas. Aucune table Dexie, aucune
// version de schéma. Le jour où #13 tranche, cette amorce devient la valeur
// par défaut d'une table, et rien d'autre ne bouge.
// ────────────────────────────────────────────────────────────────────────────

/** La famille botanique — c'est elle, et pas l'espèce, que la rotation compte. */
export type Famille =
  | "solanacees"
  | "brassicacees"
  | "chenopodiacees"
  | "alliacees"
  | "fabacees"
  | "asteracees"
  | "apiacees"
  | "valerianacees"
  | "lamiacees";

/**
 * Deux natures de cellule, et l'écart entre elles est MÉCANIQUE.
 *
 * Un `bac` est fixe : sa terre est permanente, elle accumule la fertilité et
 * les pathogènes, donc la rotation s'y applique et l'état du sol y persiste.
 * Un `pot` est mobile : son substrat se renouvelle, l'état repart à neuf au
 * rempotage, la rotation NE S'Y APPLIQUE PAS — et il peut courir après la
 * lumière. C'est l'échappatoire à la rotation, et c'est pour ça qu'une carotte
 * est « jamais ici » dans un bac épuisé et « agir » dans un pot.
 */
export type NatureCellule = "bac" | "pot";

/**
 * La saison où la demande de lumière d'une culture se paie.
 *
 * ELLE N'EST PAS TOUJOURS CELLE OÙ LA CULTURE EST EN PLACE, et c'est tout
 * l'intérêt du champ. L'ail est en terre d'octobre à juin ; pendant l'hiver il
 * s'enracine et vernalise sans rien demander, sa lumière se joue en mars-juin.
 * Le juger sur le soleil de décembre le condamnerait à tort.
 */
export type Saison = "hiver" | "printemps" | "ete";

/**
 * Ce qu'on sait du soleil qui tombe sur une cellule, en heures de soleil
 * DIRECT autour de midi.
 *
 * ────────────────────────────────────────────────────────────────────────
 * `hiver: null` N'EST PAS UN TROU DE SAISIE, C'EST LE FAIT LE PLUS IMPORTANT
 * DU SITE.
 *
 * La recherche de Workspace#3 a tranché que les cèdres à l'OUEST ne peuvent
 * pas bloquer le soleil d'hiver : entre le 1er novembre et le 28 février, le
 * soleil ne dépasse jamais l'azimut 259,6°, il n'atteint donc jamais l'ouest
 * vrai. Ce qui décide, c'est l'arc SUD (SE 135° → SO 225°), où arrivent 97 %
 * du rayonnement direct d'hiver et où le soleil plafonne à 20,9° au solstice.
 *
 * Cet arc n'a JAMAIS ÉTÉ RELEVÉ — c'est Workspace#18, sept mesures au
 * téléphone, dix minutes, toujours ouvert. Tant qu'il l'est, toute culture qui
 * réclame 2 h d'hiver est un PARI, et le verdict doit le dire au lieu de
 * l'affirmer. Écrire ici un 2 plausible ferait disparaître la seule question
 * du jardin qu'un doigt peut fermer aujourd'hui.
 * ────────────────────────────────────────────────────────────────────────
 */
export interface Lumiere {
  /** Rapporté par l'habitant, pas mesuré : 3 à 4 h autour de midi, puis
   *  l'ombre des arbres. On retient la borne basse. */
  ete: number;
  printemps: number;
  /** `null` = l'arc sud n'est pas relevé. Voir Workspace#18. */
  hiver: number | null;
}

/** Ce qui pousse déjà dans une cellule, et jusqu'à quand ça la tient. */
export interface Occupant {
  culture: string;
  /** `AAAA-MM-JJ`. */
  depuis: string;
  /**
   * `AAAA-MM-JJ` : le jour où la cellule se libère.
   *
   * `null` pour du MOBILIER — un lilas, un laurier, un citronnier ne libèrent
   * jamais rien. Les modéliser comme des plantations les ferait entrer dans la
   * rotation et proposer à l'arrachage, ce qu'ils ne sont pas (Workspace#13).
   */
  jusqu: string | null;
}

/** Ce qui a poussé là avant, et que la rotation doit connaître. */
export interface Passage {
  famille: Famille;
  /** L'année de récolte. La rotation compte en années, pas en jours. */
  annee: number;
}

export interface Cellule {
  id: string;
  nom: string;
  nature: NatureCellule;
  /** Le bac dont la cellule est un carré, quand elle en est un. Deux carrés du
   *  même bac partagent la terre et l'ombre, pas l'historique de rotation. */
  bac?: string;
  /** cm. `profondeur` est la hauteur de terre disponible, pas celle du bac. */
  largeur: number;
  profondeur: number;
  lumiere: Lumiere;
  occupants: Occupant[];
  /**
   * L'historique connu. VIDE PARTOUT, et c'est un fait, pas un oubli : rien
   * n'a été consigné avant l'app. Le problème de l'année 0 (Workspace#13)
   * n'est pas tranché — assumer le pire condamnerait le bac entier, assumer
   * rien laisserait la rotation muette. En attendant, les occupants en place
   * suffisent : une tomate DEBOUT dit déjà qu'on est en solanacées.
   */
  passages: Passage[];
  /** La place de la cellule sur la carte, en colonnes/lignes de la grille. */
  carte: { x: number; y: number; w: number; h: number };
}

/**
 * La terrasse de Francheville, telle que Workspace#2 la décrit.
 *
 * LE BAC 2 EST TROIS CELLULES, PAS UNE, et c'est la décision la plus chargée
 * du fichier. 100 × 40 cm fait « à peu près trois carrés de 33 × 40 » — et la
 * granularité est le seul actif du site : avec un bac d'un seul tenant, une
 * solanacée plantée quelque part contamine toute la surface potagère pour
 * quatre ans (Workspace#12). En trois carrés, elle en coûte un.
 *
 * C'est aussi ce qui rend l'échappatoire du pot lisible : trois carrés pris
 * et un pot libre, ça se voit sur la carte.
 */
export const TERRASSE: Cellule[] = [
  {
    id: "bac1",
    nom: "Bac 1",
    nature: "bac",
    largeur: 100,
    profondeur: 40,
    lumiere: { ete: 3, printemps: 3, hiver: null },
    occupants: [
      { culture: "lilas", depuis: "2023-01-01", jusqu: null },
      { culture: "succulente", depuis: "2023-01-01", jusqu: null },
      { culture: "lavande", depuis: "2023-01-01", jusqu: null },
    ],
    passages: [],
    carte: { x: 1, y: 1, w: 2, h: 1 },
  },
  ...["a", "b", "c"].map((lettre, i) => ({
    id: `bac2-${lettre}`,
    nom: `Bac 2 · carré ${lettre.toUpperCase()}`,
    nature: "bac" as const,
    bac: "bac2",
    largeur: 33,
    // LES 70 cm SONT LE MEILLEUR ATOUT DU SITE et le seul chiffre du tableau
    // qui ouvre des cultures au lieu d'en fermer : ~280 L, de quoi loger une
    // racine et bien plus indulgent à l'arrosage qu'une jardinière de balcon.
    profondeur: 70,
    lumiere: { ete: 3, printemps: 3, hiver: null },
    occupants: [
      { culture: "tomate", depuis: "2026-05-15", jusqu: "2026-10-15" },
      ...(i === 2 ? [{ culture: "basilic", depuis: "2026-05-15", jusqu: "2026-10-15" }] : []),
      ...(i === 0 ? [{ culture: "basilic", depuis: "2026-05-15", jusqu: "2026-10-15" }] : []),
    ],
    passages: [],
    carte: { x: 1 + i, y: 2, w: 1, h: 1 },
  })),
  {
    id: "bac3",
    nom: "Bac 3",
    nature: "bac",
    largeur: 100,
    profondeur: 40,
    lumiere: { ete: 3, printemps: 3, hiver: null },
    occupants: [
      { culture: "lavande", depuis: "2023-01-01", jusqu: null },
      { culture: "thym", depuis: "2023-01-01", jusqu: null },
      { culture: "fraisier", depuis: "2024-03-01", jusqu: null },
      { culture: "framboisier", depuis: "2024-03-01", jusqu: null },
    ],
    passages: [],
    carte: { x: 1, y: 3, w: 2, h: 1 },
  },
  {
    id: "bac4",
    nom: "Bac 4",
    nature: "bac",
    largeur: 100,
    profondeur: 40,
    lumiere: { ete: 3, printemps: 3, hiver: null },
    occupants: [{ culture: "laurier-palme", depuis: "2023-01-01", jusqu: null }],
    passages: [],
    carte: { x: 3, y: 3, w: 1, h: 1 },
  },
  {
    id: "pot-citron",
    nom: "Pot du citronnier",
    nature: "pot",
    largeur: 40,
    profondeur: 60,
    lumiere: { ete: 3, printemps: 3, hiver: null },
    occupants: [{ culture: "citronnier", depuis: "2023-01-01", jusqu: null }],
    passages: [],
    carte: { x: 3, y: 1, w: 1, h: 1 },
  },
  {
    id: "pot-1",
    nom: "Pot libre 1",
    nature: "pot",
    largeur: 30,
    profondeur: 25,
    lumiere: { ete: 3, printemps: 3, hiver: null },
    occupants: [],
    passages: [],
    carte: { x: 1, y: 4, w: 1, h: 1 },
  },
  {
    id: "pot-2",
    nom: "Pot libre 2",
    nature: "pot",
    largeur: 25,
    profondeur: 20,
    lumiere: { ete: 3, printemps: 3, hiver: null },
    occupants: [],
    passages: [],
    carte: { x: 2, y: 4, w: 1, h: 1 },
  },
];

export const cellule = (id: string): Cellule | undefined => TERRASSE.find((c) => c.id === id);

/** Les carrés voisins qui partagent le bac. Ils partagent la terre et l'ombre
 *  portée — jamais l'historique de rotation, qui est par carré. */
export const voisinesDuBac = (c: Cellule): Cellule[] =>
  c.bac ? TERRASSE.filter((v) => v.bac === c.bac && v.id !== c.id) : [];
