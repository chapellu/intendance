// Ce que « Le répertoire » montre — T81.
//
// LE PREMIER ÉCRAN DE L'APP QUI NE SERT AUCUNE DÉCISION DE LA SEMAINE. Il se
// lit, il ne pose rien : « voir ce que la maison sait faire », ou relire une
// recette un dimanche après-midi sans rien planifier. Demandé le 15/09
// (« il me faudrait les deux ») et redemandé le 16/10 — « I would also like a
// summary view of recipes » —, ce qui a tranché où il vit : dans la
// sous-navigation de la cuisine.
//
// AUCUN SCORE ICI, ET C'EST LA DÉCISION QUI COMMANDE TOUTES LES AUTRES. Même
// famille que la règle de T80 (« une recherche n'est pas triée par score ») :
// une note dépend du créneau, du stock, du journal — elle dirait autre chose
// demain pour la même liste. Un répertoire qui se réordonne d'un jour à l'autre
// est un répertoire où l'on ne retrouve pas le plat qu'on avait vu hier, et il
// répondrait en douce à « qu'est-ce qu'on mange », la question à laquelle le
// fil répond déjà, mieux. Ce que le plat vaut CETTE semaine reste sur sa carte.
//
// Rien ici ne lit le stock, le journal ni les posés — sauf pour choisir sur
// quel créneau ouvrir la fiche, et c'est justement pour l'ÉVITER (voir
// `creneauDeLecture`).

import { jourISO } from "../db";
import { convient, joue, type Jeu } from "../model/jeu";
import type { Accept, Emit, Plat } from "../model/types";
import type { CleCreneau } from "../nav/routes";
import { sansRecette, tempsDuPlat } from "./cuisiner.vue";
import { normaliser, REQUETE_MIN, trouver } from "./poser.vue";

/* ─────────────────────────────────────────────────────────────── les groupes */

export type CleGroupe = "repas" | "autres-moments" | "accompagnement" | "entree" | "base" | "boisson";

/**
 * Les groupes du répertoire, dans l'ordre où ils s'affichent.
 *
 * PAR LA PLACE DANS LE REPAS, PAS PAR PROTÉINE NI PAR TEMPS. Le rôle (T93) est
 * la seule question qui sépare des choses qu'on ne cherche jamais au même
 * moment : une pâte à pizza n'est le dîner de personne, et la ranger entre la
 * pissaladière et le poulet rôti ferait lire une base comme un repas — l'erreur
 * exacte du 22/09 (« je n'ai pas un repas complet »). La protéine et le temps,
 * eux, sont écrits sur chaque ligne : on les lit en passant, on n'y range rien.
 *
 * « LES REPAS » ET « LES AUTRES MOMENTS » SONT DEUX GROUPES D'UN MÊME RÔLE.
 * `dessert` n'est pas un rôle (voir `Role`) : un clafoutis est un `plat` dont
 * `creneaux` dit goûter ou dessert. Le laisser parmi les 102 repas mettrait le
 * cake entre le chili et le croque-monsieur ; c'est `convient`, la même règle
 * que la main, qui fait la frontière — un plat qui va au déjeuner ou au dîner
 * est un repas.
 */
export const GROUPES: readonly { cle: CleGroupe; nom: string }[] = [
  { cle: "repas", nom: "Les repas" },
  { cle: "autres-moments", nom: "Goûters, desserts, petits-déjeuners" },
  { cle: "accompagnement", nom: "Accompagnements" },
  { cle: "entree", nom: "Entrées" },
  { cle: "base", nom: "Bases" },
  { cle: "boisson", nom: "Boissons" },
];

export function groupeDe(p: Plat): CleGroupe {
  if (p.role !== "plat") return p.role;
  const ok = p.creneaux.length ? p.creneaux : ["dejeuner", "diner"];
  return ok.includes("dejeuner") || ok.includes("diner") ? "repas" : "autres-moments";
}

/* ─────────────────────────────────────────────────────────────── les apports */

// LE CATALOGUE PORTE DES CLÉS, PAS DES MOTS — `viande-rouge`, `crucifere`.
// Une table fermée plutôt qu'un `replace(/-/g, " ")` : « legumineuse » sans
// accent, « oeuf » sans ligature et « crucifere » au singulier se liraient
// comme une faute de frappe sous chaque plat. Une clé que la table ne connaît
// pas retombe sur la clé elle-même, et le test du corpus dit laquelle.
const PROTEINES: Record<string, string | null> = {
  "viande-rouge": "viande rouge",
  "viande-blanche": "viande blanche",
  poisson: "poisson",
  oeuf: "œuf",
  fromage: "fromage",
  legumineuse: "légumineuses",
  "tofu-soja": "tofu, soja",
  // « aucune » est une réponse, mais l'écrire sous 44 plats apprendrait à ne
  // plus lire la ligne : c'est le même silence que `phraseDuRole` sur un plat.
  aucune: null,
};

const LEGUMES: Record<string, string> = {
  allium: "alliums",
  champignon: "champignons",
  crucifere: "crucifères",
  cucurbitacee: "cucurbitacées",
  feuille: "feuilles",
  legumineuse: "légumineuses",
  racine: "racines",
  solanacee: "solanacées",
};

/** Les clés que les deux tables savent dire — pour que le test du corpus
 *  puisse dire laquelle manque, plutôt que de laisser passer « crucifere ». */
export const proteineConnue = (k: string): boolean => k in PROTEINES;
export const legumeConnu = (k: string): boolean => k in LEGUMES;

/** « viande rouge · solanacées, alliums », ou rien quand le plat n'a ni
 *  protéine nommée ni légume. */
export function phraseDesApports(p: Plat): string | null {
  const prot = p.apports.proteine in PROTEINES ? PROTEINES[p.apports.proteine] : p.apports.proteine;
  const leg = p.apports.legumes.map((l) => LEGUMES[l] ?? l).join(", ");
  const bouts = [prot, leg].filter((x): x is string => !!x);
  return bouts.length ? bouts.join(" · ") : null;
}

/* ───────────────────────────────────────────── ce qu'il donne, ce qu'il prend */

/** Un type d'export lisible : `sauce-bolognaise` → « sauce bolognaise ». Même
 *  geste que `nomDuType` du plancher, sans en dépendre. */
const nomDu = (type: string): string => type.replace(/-/g, " ");

/**
 * Ce que le plat laisse derrière lui.
 *
 * UN RESTE DE PLAT NE SE NOMME PAS, IL SE DIT. 91 sorties sur 126 sont
 * `reste-plat`, et leur type est presque toujours le plat lui-même : écrire
 * « donne : lasagnes » sous « Lasagnes » ne dit rien. « des restes » dit la
 * seule chose qui compte en feuilletant — ça se garde, ça refera un repas.
 * Une base ou une parure, elle, se nomme : c'est ce qu'un AUTRE plat attend.
 *
 * LA PORTION BÉBÉ EST TUE ICI : la carte et la fiche la disent déjà, et c'est
 * un service rendu à table, pas une production qu'un autre plat consomme.
 */
export function ceQuIlDonne(emits: readonly Emit[]): string[] {
  const dit = emits.flatMap((e) =>
    e.kind === "reste-plat" ? ["des restes"] : e.kind === "portion-bebe" ? [] : [nomDu(e.type)],
  );
  return [...new Set(dit)];
}

export interface Prise {
  texte: string;
  /** Faux : le plat se fait aussi sans — `sansReste` dit ce que ça coûte. */
  requis: boolean;
}

/** Ce que le plat attend d'un autre. Un `accepts` qui vise toute une classe
 *  (« Reste réchauffé ») se dit par sa classe. */
export function ceQuIlPrend(accepts: readonly Accept[]): Prise[] {
  return accepts.map((a) => ({
    texte: a.type ? nomDu(a.type) : a.kind === "reste-plat" ? "un reste" : (a.kind ?? "un reste"),
    requis: a.requis,
  }));
}

/* ────────────────────────────────────────────────────────────────── le temps */

export interface TempsRepertoire {
  total: number;
  /** Ce qui demande quelqu'un devant — `null` quand c'est tout le temps, ou
   *  quand il n'y a pas d'étapes pour le savoir. */
  actif: number | null;
}

/**
 * Le temps d'une ligne : LE MÊME QUE CELUI DE LA FICHE QU'ELLE OUVRE.
 *
 * TROIS CHIFFRES DU MÊME TEMPS EXISTENT, ET ILS NE S'ACCORDENT PAS. Mesuré le
 * 16/10 sur les 138 plats : `plat.minutes` (ce que la carte affiche) diffère
 * de la somme des étapes sur 110 plats — 15 min annoncées, 23 de gestes pour
 * les pâtes bolognaise —, et `actifMin`, que rien ne lisait, ne tombe sur
 * « total moins sans surveiller » que 18 fois sur 122. Le répertoire ouvre la
 * fiche de T91 : il prend donc ses chiffres, ceux de `tempsDuPlat`, pour qu'un
 * doigt ne lise jamais « 15 min » sur la ligne et « 23 min » une seconde plus
 * tard. Réconcilier les trois est un ticket de corpus, pas d'écran.
 *
 * UN PLAT SANS ÉTAPES retombe sur `plat.minutes` : c'est le seul temps qu'il
 * ait, et le catalogue l'a vérifié comme les autres (T78).
 */
export function tempsDuRepertoire(p: Plat): TempsRepertoire {
  if (!p.steps.length) return { total: p.minutes, actif: null };
  const t = tempsDuPlat(p.steps);
  return { total: t.total, actif: t.libre ? t.total - t.libre : null };
}

/* ──────────────────────────────────────────────────────────────── la ligne */

export interface LigneRepertoire {
  plat: Plat;
  temps: TempsRepertoire;
  /** Les parts que la recette fait, telles qu'elle les compte. */
  portions: number;
  apports: string | null;
  donne: string[];
  prend: Prise[];
  ustensile: string | null;
  /** L'étiquette courte de T78, ou rien. */
  sansRecette: string | null;
}

export function ligneDe(p: Plat): LigneRepertoire {
  return {
    plat: p,
    temps: tempsDuRepertoire(p),
    portions: p.portions,
    apports: phraseDesApports(p),
    donne: ceQuIlDonne(p.emits),
    prend: ceQuIlPrend(p.accepts),
    ustensile: p.vaisselle?.label ?? null,
    sansRecette: sansRecette(p)?.court ?? null,
  };
}

export interface GroupeVue {
  cle: CleGroupe;
  nom: string;
  lignes: LigneRepertoire[];
}

export interface RepertoireVue {
  groupes: GroupeVue[];
  /** Combien de plats la vue montre — tous, ou ceux que la frappe garde. */
  montres: number;
  total: number;
}

/**
 * Le répertoire, éventuellement réduit à ce qu'on a tapé.
 *
 * DANS UN GROUPE, L'ORDRE ALPHABÉTIQUE — celui d'un index de livre. C'est le
 * seul ordre qu'un pouce sait prédire et qui ne bouge pas d'un jour à l'autre.
 *
 * LA RECHERCHE EST CELLE DE T80, MOT POUR MOT : `trouver()`, donc début de mot,
 * sans accent, deux caractères au moins. Mais elle FILTRE et ne réordonne pas :
 * dans « Proposer », T80 trie par ce que dit la frappe parce qu'on y cherche un
 * plat et un seul ; ici on parcourt, et une liste qui se réorganise sous le
 * doigt à chaque lettre fait perdre la ligne qu'on regardait. Elle s'amincit,
 * elle garde ses groupes. Et pas de plafond `TROUVAILLES_MAX` : il existe parce
 * qu'une carte coûte un écran, une ligne en coûte un huitième.
 */
/**
 * La clé de tri d'un titre : sa forme normalisée, celle de la recherche.
 *
 * MESURÉ SUR LA PREMIÈRE CAPTURE : trié sur le titre brut, « « Courgettes
 * farcies » des fainéants », « « Jambon-beurre » revisité » et « « Pissaladière »
 * » ouvraient la liste avant les A, parce qu'un guillemet passe devant toutes
 * les lettres. Un index de livre range la pissaladière aux P.
 */
const cleDeTri = (p: Plat): string => normaliser(p.titre);

export function vueDuRepertoire(plats: readonly Plat[], requete = ""): RepertoireVue {
  const cherche = normaliser(requete).length >= REQUETE_MIN;
  const gardes = cherche ? new Set(trouver(plats, requete).map((p) => p.id)) : null;
  const visibles = gardes ? plats.filter((p) => gardes.has(p.id)) : [...plats];

  const groupes = GROUPES.map(({ cle, nom }) => ({
    cle,
    nom,
    lignes: visibles
      .filter((p) => groupeDe(p) === cle)
      .sort((a, b) => cleDeTri(a).localeCompare(cleDeTri(b), "fr"))
      .map(ligneDe),
  })).filter((g) => g.lignes.length);

  return { groupes, montres: visibles.length, total: plats.length };
}

/* ─────────────────────────────────────────────── ouvrir la fiche, pour lire */

/**
 * Le créneau sur lequel ouvrir la fiche d'un plat — pour qu'elle s'ouvre en
 * RÉSUMÉ, jamais sur le guide.
 *
 * LA FICHE N'A PAS D'URL SANS CRÉNEAU, et on ne lui en donne pas une. La route
 * `cuisiner` porte (jour, repas, plat) et `pourLire()` décide seule : un plat
 * nommé qui n'est pas celui du créneau est un plat qu'on lit. Il suffit donc de
 * viser un créneau QUI NE LE PORTE PAS. Une route « fiche sans créneau » aurait
 * été un second chemin vers le même écran, et T91 a payé six parcours rouges
 * pour avoir appris qu'une URL portait deux usages.
 *
 * DE PRÉFÉRENCE UN CRÉNEAU VIDE, et ce n'est pas qu'esthétique. La fiche lit
 * les parts et le facteur du créneau ; un créneau qui porte un AUTRE plat lui
 * prêterait le facteur de cet autre plat (`calc.facteurs[i]`), et « on en
 * cuisine 9 » se lirait sous une recette qui en fait 4. Un créneau vide a le
 * facteur 1 et les parts du foyer : la recette telle qu'elle s'écrit. Parmi les
 * vides, d'abord un repas qui lui convient, pour que les parts soient celles
 * d'un repas où l'on mangerait ce plat.
 *
 * `null` SEULEMENT SI TOUS LES CRÉNEAUX PORTENT CE PLAT — l'écran ne fait alors
 * pas de lien plutôt que d'ouvrir le guide de quelqu'un qui venait lire.
 */
export function creneauDeLecture(jeu: Jeu, platId: string): CleCreneau | null {
  const p = jeu.plats[platId];
  const indices = jeu.creneaux.map((_, i) => i);
  const vide = (i: number) => !joue(jeu.choix[i] ?? null);
  const i =
    indices.find((i) => vide(i) && !!p && convient(jeu, p, i)) ??
    indices.find(vide) ??
    indices.find((i) => jeu.choix[i] !== platId);
  if (i === undefined) return null;
  const c = jeu.creneaux[i]!;
  return { jour: jourISO(jeu.jours[c.jour]!.date), repas: c.repas };
}
