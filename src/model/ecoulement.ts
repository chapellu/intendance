// UNE SEULE ÉCHELLE : LA VIE QUI RESTE — T47.
//
// C'est le terme qui paie « ce plat mange quelque chose qui court ». Il y en
// avait trois, et ils ne se parlaient pas : `ecoule_frigo: 5` pour un reste du
// frigo, `ecoule_congelo: 3` de plus pour un bocal du congélateur, et le couple
// `ecoule_placard_urgent` / `ecoule_placard_entame` pour le garde-manger (fondu
// dans `ecoule` par T57–T59). Trois barèmes, trois vocabulaires, et l'urgence
// classée par ENDROIT — alors que l'endroit ne dit rien de l'âge.
//
// Il n'en reste qu'un : `ecoule × la fraction de vie consommée`, sommée sur les
// articles que le plat écoule, plafonnée à trois. La fraction vient de `axe.ts`,
// c'est-à-dire de `Vie.fraction` pour un lot du dépôt et de la projection des
// urgences pour le garde-manger. UN BOCAL EST UN BOCAL : d'où il sort ne change
// plus ce qu'il vaut, seul son âge le fait.
//
// ────────────────────────────────────────────────────────────────────────────
// CE QUE LA MESURE A CORRIGÉ DU TICKET, ET IL FAUT LE LIRE AVANT DE LE CROIRE.
//
// T47 reproche à la paire de classer par endroit et l'illustre ainsi : « si j'ai
// une bolognaise un peu vieille au congélateur c'est plus urgent qu'un truc
// frais au frigo ». Le grief est juste, l'exemple vise à côté — et de deux
// façons.
//
//  — LA PAIRE NE FAISAIT PAS CE QUE SES PROPRES COMMENTAIRES DISENT. Lue dans
//    `equilibre.yaml`, elle se lit « 5 au frigo, 3 au congélo », donc le frigo
//    gagne. Lue dans le code de référence (`semaine_model._score`), les deux
//    tests sont INDÉPENDANTS : `ecoule_frigo` tombe sur n'importe quel lot
//    préexistant et `ecoule_congelo` s'AJOUTE quand ce lot est au congélateur.
//    Le congélo valait donc 8 contre 5, l'inverse de ce que le fichier annonce.
//    Le foyer avait déjà ce qu'il demandait ; personne ne pouvait le savoir en
//    lisant le catalogue.
//  — CE QUE LA PAIRE NE SAVAIT VRAIMENT PAS FAIRE EST DANS L'ADJECTIF, PAS DANS
//    LE LIEU : « un peu VIEILLE ». Un bocal congelé hier touchait les mêmes 8
//    points qu'un bocal de quatre mois, et un reste du frigo à son dernier jour
//    les mêmes 5 qu'un reste de la veille. Le défaut n'est pas que l'endroit
//    soit mal classé, c'est que l'ÂGE n'entrait nulle part. C'est très
//    exactement ce que la fraction répare.
//
// ────────────────────────────────────────────────────────────────────────────
// L'ARBITRAGE CESSE D'ÊTRE UNE RÈGLE, ET LE POINT DE BASCULE EST MESURÉ.
//
// Reconstituer est un forfait — `plancher_congelo: 4`, `plancher_type: 3` —,
// écouler est une rampe. Avec `ecoule: 5`, écouler passe devant :
//
//     plancher_type (3) ....... quand la fraction dépasse 0,60
//     plancher_congelo (4) .... quand la fraction dépasse 0,80
//     chaine_couverte (4) ..... quand la fraction dépasse 0,80
//     proteine_manquante (6) .. jamais seul (il faudrait 1,20)
//
// 0,80 EST `SEUIL_URGENT`, ET CE N'EST PAS UNE COÏNCIDENCE CONSTRUITE : les
// quatre nombres ont été posés à vue, à des mois d'écart, sans que personne ne
// vise cet alignement. Il tombe donc comme un CONSTAT sur les valeurs
// d'aujourd'hui, pas comme un invariant à défendre — et si `plancher_congelo`
// bouge, il faudra relire cette phrase plutôt que la recopier. Ce qu'elle dit
// aujourd'hui : le plat qui recharge le tiroir d'urgence gagne, jusqu'au jour où
// le bocal qu'on remplacerait franchit la ligne « urgent ». Après quoi c'est le
// vieux bocal qui gagne — et c'est le comportement que le ticket décrivait sans
// pouvoir le chiffrer.

import { marque, type Marque } from "./axe";

/**
 * Un article que ce plat écoulerait.
 *
 * `ou` NE COMMANDE PLUS LE SCORE — c'est tout le ticket — MAIS IL COMMANDE
 * ENCORE LA PHRASE. Un paquet de pâtes ouvert et un bocal de bolognaise ne sont
 * pas le même objet, et l'app ne peut pas dire « finit des paquets entamés :
 * sauce bolognaise ». L'unification porte sur ce qu'on PAIE, pas sur ce qu'on
 * DIT : deux choses également pressées appellent le même score et deux gestes
 * différents.
 */
export interface Ecoulable {
  /** L'identifiant, tirets compris — `nom()` les ôte pour l'écran. */
  id: string;
  /** Sur l'axe 0–1 de `axe.ts`. */
  fraction: number;
  ou: "placard" | "depot";
}

/** Au-delà, le plat ne gagne plus rien — T59. Trois articles sauvés valent trois
 *  fois un article ; le quatrième ne dit plus rien de neuf sur ce plat-là, il
 *  dit qu'il a une longue liste d'ingrédients, ce que `article_marginal` fait
 *  déjà payer. Le plafond n'est PAS une dégressivité : les trois premiers
 *  comptent plein, ce qui était la demande explicite du ticket. */
export const PLAFOND_ARTICLES = 3;

export interface Ecoulement {
  /** Ce que ça vaut au score. Zéro quand le plat n'écoule rien. */
  score: number;
  /**
   * Les articles, du plus pressé au moins, TOUS — même ceux que le plafond n'a
   * pas payés. La phrase dit ce que le plat écoule, le score dit ce que ça vaut ;
   * n'en nommer que trois ferait mentir la première pour justifier le second.
   */
  articles: Ecoulable[];
  /** Combien ont réellement compté. `articles.length` moins ce nombre est ce que
   *  le plafond a coupé — la seule façon de savoir, sur le corpus, s'il mord. */
  payes: number;
  /** Le mot de l'axe pour le plus pressé, `""` quand il n'y a rien à dire. */
  marque: Marque;
}

/** L'écran ne montre pas d'identifiants. */
export const nom = (a: Ecoulable): string => a.id.replace(/-/g, " ");

/**
 * Ce qu'un plat écoule, tous stocks confondus.
 *
 * UN ARTICLE COMPTE UNE FOIS, ET C'EST LE PLAFOND QUI L'EXIGE. Le placard et le
 * dépôt ne partagent aucun vocabulaire aujourd'hui — l'un nomme des ingrédients
 * d'achat (`pates`, `oignon`), l'autre des sorties cuisinées
 * (`sauce-bolognaise`, `reste-roti`) — donc la collision est impossible sur le
 * corpus actuel. Elle est traitée quand même : le jour où un type porterait le
 * nom d'un ingrédient, un plat gagnerait deux places sur trois pour un seul
 * objet, et rien ne le dirait.
 *
 * LES PLUS PRESSÉS D'ABORD, quand il y en a plus de trois : le plafond doit
 * couper la queue de la liste, pas un article au hasard de l'ordre où les
 * sources ont été empilées. À égalité on tranche par nom, pour que deux rendus
 * de la même semaine donnent le même score.
 */
export function ecoulement(
  articles: readonly Ecoulable[],
  poids: Record<string, number>,
): Ecoulement {
  const vus = new Map<string, Ecoulable>();
  for (const a of articles) {
    const vu = vus.get(a.id);
    if (!vu || a.fraction > vu.fraction) vus.set(a.id, a);
  }

  const classes = [...vus.values()].sort(
    (x, y) => y.fraction - x.fraction || x.id.localeCompare(y.id, "fr"),
  );
  const payes = classes.slice(0, PLAFOND_ARTICLES);
  const score = (poids["ecoule"] ?? 0) * payes.reduce((s, a) => s + a.fraction, 0);

  return {
    // Arrondi au dixième comme le score entier : 5 × 0,4 doit donner 2 et non
    // 2,0000000000000004, sans quoi un test de non-régression deviendrait un
    // test de virgule flottante.
    score: Math.round(score * 10) / 10,
    articles: classes,
    payes: payes.length,
    marque: marque(classes[0]?.fraction ?? null),
  };
}
