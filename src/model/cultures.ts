// Les cultures — ce qu'on peut mettre dans une cellule, et ce que ça réclame.
//
// ────────────────────────────────────────────────────────────────────────────
// CETTE TABLE EST DU TRAVAIL ORIGINAL, ET ELLE N'AVAIT PAS LE CHOIX.
//
// Workspace#4 a cherché une source agronomique réutilisable et n'en a trouvé
// aucune : USDA PLANTS a le schéma mais pas les légumes (1 espèce sur 15),
// OpenFarm est mort, et la presse jardin française est fermée par le DROIT SUI
// GENERIS des bases de données (CPI L.342-1) — qui protège le CONTENU d'un
// catalogue indépendamment du droit d'auteur, donc « les dates de semis sont
// des faits » n'autorise pas à les recopier.
//
// Conséquence directe sur ce fichier : les chiffres ci-dessous viennent des
// notes de recherche du dépôt Workspace (#3 pour la lumière et l'échéance,
// #24 pour le substrat) ou d'un raisonnement écrit ici. Aucun n'est copié
// d'un catalogue de semencier. Les noms français, eux, sont libres —
// TAXREF en publie 82 000 sous CC BY 4.0 (Workspace#22).
//
// DIX CULTURES, PAS CENT. C'est une amorce : de quoi faire tourner le verdict
// sur l'automne qui vient et sur l'été qu'on vient de vivre. Une table
// complète est ~80-100 h de travail (Workspace#4) et n'apprend rien de plus
// sur la MÉCANIQUE, qui est ce qu'on cherche à voir ici.
// ────────────────────────────────────────────────────────────────────────────

import type { Famille, Saison } from "./terrasse";

/** Ce qu'on achète pour mettre une culture en place. L'écart n'est pas une
 *  préférence : entre un semis et un godet il y a six semaines d'avance, et
 *  c'est exactement ce qui manque fin septembre. */
export type Forme = "graine" | "godet" | "bulbe";

export interface Culture {
  id: string;
  nom: string;
  famille: Famille;
  /** Les formes possibles, de la moins chère à la plus avancée. */
  formes: Forme[];
  /** Heures de soleil direct réclamées pendant `saisonDeLaDemande`. */
  soleilH: number;
  /** LA SAISON OÙ LA DEMANDE SE PAIE, qui n'est pas forcément celle où la
   *  culture est en terre. Voir `Saison` dans `terrasse.ts`. */
  saisonDeLaDemande: Saison;
  /** cm de terre sous les pieds. Au-dessous, c'est « jamais ici ». */
  profondeurCm: number;
  /** cm de haut, une fois faite. C'est l'ombre qu'elle porte sur ses voisines. */
  hauteurCm: number;
  /** La fenêtre de mise en place, `MM-JJ` inclus. */
  fenetre: { du: string; au: string };
  /**
   * CE QUE LA CULTURE DOIT AVOIR ATTEINT AU 4 NOVEMBRE, et en combien de jours
   * selon la forme achetée.
   *
   * ────────────────────────────────────────────────────────────────────────
   * DEUX SEUILS, PARCE QU'IL Y A DEUX FAÇONS DE PASSER L'HIVER — et les
   * confondre était le défaut de la première version de ce fichier.
   *
   * `faite` : on la MANGE pendant la fenêtre noire, donc elle doit être à
   * ~75 % de sa taille avant que la croissance s'arrête. La mâche, le kale.
   *
   * `installee` : on la mange AU PRINTEMPS ; l'hiver, elle a seulement besoin
   * d'être enracinée et de survivre. Un plant de poireau, une échalote, une
   * laitue d'hiver qui pommera en avril n'ont aucune raison d'être « faits »
   * en novembre — leur seuil est bien plus bas, et le leur appliquer celui de
   * la mâche les déclarerait hors délai à tort.
   *
   * `parForme` est partiel : un bulbe n'est ni une graine ni un godet.
   * ────────────────────────────────────────────────────────────────────────
   */
  seuil: { cible: "faite" | "installee"; parForme: Partial<Record<Forme, number>> };
  /** Le mois-jour où la cellule se libère, l'année suivante si `anneeSuivante`. */
  libere: { le: string; anneeSuivante: boolean };
  /** Une phrase, quand la culture a une raison d'exister que les chiffres ne
   *  disent pas. Elle s'affiche et ne pilote rien — no-op déclaré. */
  note?: string;
}

/**
 * LE 4 NOVEMBRE EST LA DATE LA PLUS IMPORTANTE DU MODÈLE.
 *
 * Le jour où la durée du jour passe sous 10 h à Francheville. C'est la
 * « période de Perséphone » d'Eliot Coleman, reprise par Workspace#3 : en
 * dessous, la croissance s'arrête quasiment pour la plupart des cultures,
 * quelle que soit la lumière. L'hiver ici se TIENT, il ne se pousse pas — le
 * modèle est la récolte sur pied constitué.
 *
 * Ce que ça veut dire pour le verdict : une culture d'hiver n'est pas jugée
 * sur « est-ce que la fenêtre de semis est ouverte », mais sur « reste-t-il
 * assez de jours pour qu'elle soit faite avant cette date ». Un pied qui n'y
 * est pas ne sera pas rattrapé par une heure de soleil en plus.
 */
export const PERSEPHONE = { debut: "11-04", fin: "02-07" } as const;

/** Combien d'années avant qu'une famille puisse revenir dans un BAC. Sans
 *  objet dans un pot, dont le substrat se renouvelle. */
export const ROTATION: Record<Famille, number> = {
  solanacees: 4,
  brassicacees: 3,
  chenopodiacees: 3,
  apiacees: 3,
  alliacees: 3,
  fabacees: 2,
  asteracees: 2,
  // Deux familles que la rotation ne retient guère : un an suffit.
  valerianacees: 1,
  lamiacees: 1,
};

/** Le nom d'une famille tel qu'une phrase le porte. `solanacees` est une CLÉ ;
 *  l'écrire à l'écran donne « les solanacees ne reviennent pas avant 2030 »,
 *  qui est du code qui a fui. */
export const NOM_FAMILLE: Record<Famille, string> = {
  solanacees: "solanacées",
  brassicacees: "brassicacées",
  chenopodiacees: "chénopodiacées",
  apiacees: "apiacées",
  alliacees: "alliacées",
  fabacees: "fabacées",
  asteracees: "astéracées",
  valerianacees: "valérianacées",
  lamiacees: "lamiacées",
};

export const CULTURES: Culture[] = [
  {
    id: "mache",
    nom: "Mâche",
    famille: "valerianacees",
    formes: ["graine"],
    // LA SEULE DE LA TABLE VIABLE À 1 h. Rosette plaquée au sol, respiration
    // d'entretien quasi nulle, rustique bien au-dessous de −10 °C — et c'est
    // LA salade d'hiver lyonnaise. Voir Workspace#3, §7.
    soleilH: 1,
    saisonDeLaDemande: "hiver",
    profondeurCm: 15,
    hauteurCm: 8,
    // LA FENÊTRE VA JUSQU'EN OCTOBRE, et c'est le seuil qui porte le coût —
    // pas la fenêtre. Une mâche semée le 10 octobre pousse très bien ; elle
    // n'est simplement pas FAITE pour le 4 novembre, donc elle se mange à la
    // sortie de l'hiver au lieu de décembre. Fermer la fenêtre au 30 septembre
    // confondait « trop tard pour manger en décembre » avec « trop tard », et
    // fabriquait un arbitrage avec les tomates qui n'existe pas.
    fenetre: { du: "08-15", au: "10-20" },
    seuil: { cible: "faite", parForme: { graine: 40 } },
    libere: { le: "02-28", anneeSuivante: true },
    note: "Se sème à la volée, dense : c'est un tapis par nature, on ne l'éclaircit pas.",
  },
  {
    id: "ail",
    nom: "Ail d'automne",
    famille: "alliacees",
    formes: ["bulbe"],
    // Sa lumière se joue AU PRINTEMPS : l'hiver il s'enracine et vernalise
    // sans rien demander. En mars-juin le soleil culmine à 44°→68° et a
    // dépassé l'ouest — un tout autre régime que décembre (Workspace#3).
    soleilH: 3,
    saisonDeLaDemande: "printemps",
    profondeurCm: 20,
    hauteurCm: 30,
    fenetre: { du: "10-01", au: "11-30" },
    seuil: { cible: "installee", parForme: { bulbe: 25 } },
    libere: { le: "06-30", anneeSuivante: true },
    note: "Les caïeux s'achètent dès maintenant ; ils se plantent à partir d'octobre. De l'ail de semence, pas celui du supermarché.",
  },
  {
    id: "kale",
    nom: "Chou kale",
    famille: "brassicacees",
    formes: ["graine", "godet"],
    soleilH: 2,
    saisonDeLaDemande: "hiver",
    profondeurCm: 30,
    hauteurCm: 55,
    fenetre: { du: "08-01", au: "10-05" },
    seuil: { cible: "faite", parForme: { graine: 75, godet: 40 } },
    libere: { le: "03-31", anneeSuivante: true },
    note: "Aucune feuille neuve avant février : on récolte avec parcimonie pendant la fenêtre noire, puis ça repart.",
  },
  {
    id: "blette",
    nom: "Blette",
    famille: "chenopodiacees",
    formes: ["graine", "godet"],
    soleilH: 2,
    saisonDeLaDemande: "hiver",
    profondeurCm: 30,
    hauteurCm: 40,
    fenetre: { du: "08-01", au: "10-05" },
    seuil: { cible: "faite", parForme: { graine: 70, godet: 40 } },
    libere: { le: "05-31", anneeSuivante: true },
    note: "Le RHS la cite pour les sites ombragés. Elle disparaît sous une forte gelée et repart de la souche en février-mars.",
  },
  {
    id: "epinard-hiver",
    nom: "Épinard d'hiver",
    famille: "chenopodiacees",
    formes: ["graine", "godet"],
    soleilH: 2,
    saisonDeLaDemande: "hiver",
    profondeurCm: 20,
    hauteurCm: 25,
    fenetre: { du: "08-15", au: "10-05" },
    seuil: { cible: "faite", parForme: { graine: 60, godet: 35 } },
    libere: { le: "04-30", anneeSuivante: true },
    note: "Doit avoir 4 à 6 vraies feuilles début novembre, sinon il ne s'installe pas.",
  },
  {
    id: "laitue-hiver",
    nom: "Laitue d'hiver",
    famille: "asteracees",
    formes: ["graine", "godet"],
    soleilH: 2,
    saisonDeLaDemande: "hiver",
    profondeurCm: 20,
    hauteurCm: 20,
    fenetre: { du: "08-15", au: "10-10" },
    seuil: { cible: "installee", parForme: { graine: 45, godet: 25 } },
    libere: { le: "04-15", anneeSuivante: true },
    note: "Une laitue d'hiver ne se mange pas en hiver : elle passe la fenêtre noire en rosette et pomme en avril.",
  },
  {
    id: "feve",
    nom: "Fève",
    famille: "fabacees",
    formes: ["graine"],
    // LA SEULE CULTURE DE LA TABLE DONT LE SORT DÉPEND DES ARBRES ET NON DE LA
    // SAISON. Elle passe l'hiver à très peu de lumière — on VEUT qu'elle reste
    // petite. Mais il lui faut 4 à 6 h à partir de mars pour fleurir et nouer,
    // et mars-mai est précisément le moment où le soleil recommence à basculer
    // vers l'ouest, dans les cèdres (Workspace#3, §7).
    soleilH: 4,
    saisonDeLaDemande: "printemps",
    profondeurCm: 30,
    hauteurCm: 80,
    fenetre: { du: "10-15", au: "11-15" },
    seuil: { cible: "installee", parForme: { graine: 25 } },
    libere: { le: "06-15", anneeSuivante: true },
  },
  {
    id: "carotte",
    nom: "Carotte",
    famille: "apiacees",
    formes: ["graine"],
    soleilH: 3,
    saisonDeLaDemande: "ete",
    // CE CHIFFRE EST CELUI QUI FAIT EXISTER L'ÉCHAPPATOIRE DU POT À L'ENVERS :
    // 40 cm passent dans les 70 cm du bac 2 et pas dans un pot de 20. Une
    // carotte est « jamais ici » dans un pot bas, et le pot n'y peut rien —
    // c'est un fait sur LA CELLULE, pas un manque du jardinier.
    profondeurCm: 40,
    hauteurCm: 25,
    fenetre: { du: "03-15", au: "07-15" },
    seuil: { cible: "faite", parForme: { graine: 100 } },
    libere: { le: "10-31", anneeSuivante: false },
  },
  {
    id: "tomate",
    nom: "Tomate",
    famille: "solanacees",
    // 6 h SUR UN SITE QUI EN DONNE 3. C'est le cas d'école de Workspace#9 :
    // une culture peut être PRÊTE et attendue MAIGRE. Le verdict ne la retire
    // pas — il la propose en le disant, ce qui est la doctrine du dépôt.
    formes: ["godet"],
    soleilH: 6,
    saisonDeLaDemande: "ete",
    profondeurCm: 40,
    hauteurCm: 150,
    fenetre: { du: "05-11", au: "06-15" },
    seuil: { cible: "faite", parForme: { godet: 70 } },
    libere: { le: "10-15", anneeSuivante: false },
    note: "La fenêtre s'ouvre aux saints de glace (11-13 mai), pas avant : la dernière gelée tombe mi-avril.",
  },
  {
    id: "basilic",
    nom: "Basilic",
    famille: "lamiacees",
    formes: ["graine", "godet"],
    soleilH: 5,
    saisonDeLaDemande: "ete",
    profondeurCm: 20,
    hauteurCm: 40,
    fenetre: { du: "05-11", au: "07-15" },
    seuil: { cible: "faite", parForme: { graine: 60, godet: 25 } },
    libere: { le: "10-15", anneeSuivante: false },
  },
];

export const culture = (id: string): Culture | undefined => CULTURES.find((c) => c.id === id);

/** Le nom d'une culture, y compris celles qui ne sont que du mobilier et
 *  n'ont pas de fiche — un bac qui affiche « laurier-palme » est illisible. */
const MOBILIER: Record<string, string> = {
  lilas: "Lilas",
  succulente: "Succulente",
  lavande: "Lavande",
  thym: "Thym",
  fraisier: "Fraisier",
  framboisier: "Framboisier",
  "laurier-palme": "Laurier-palme",
  citronnier: "Citronnier",
};

export const nomDe = (id: string): string => culture(id)?.nom ?? MOBILIER[id] ?? id;
