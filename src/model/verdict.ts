// Le verdict de cellule — pour UNE cellule, à UNE date, un verdict par culture.
//
// ════════════════════════════════════════════════════════════════════════════
// CE N'EST PAS UN ARBRE, ET LE MOT « ARBRE » A ÉTÉ RETIRÉ EXPRÈS.
//
// Le mécanisme dont l'app est née s'appelait « l'arbre de plantation ». Ce
// n'en est pas un : il n'y a aucune arête autorée, aucun nœud qu'on débloque.
// C'est une FONCTION — (cellule, date) → un verdict par culture — et tout ce
// qui ressemble à un enchaînement en sort par accident de calcul, jamais
// parce que quelqu'un l'a dessiné (Workspace#9).
//
// RIEN N'EST JAMAIS BLOQUÉ. La règle CLASSE, elle n'interdit pas : le journal
// accepterait n'importe quelle plantation réelle, y compris absurde. Une
// culture « jamais ici » s'affiche donc avec ses conditions au lieu de
// disparaître — c'est la doctrine du dépôt, déjà écrite pour les plats sans
// recette (T78) et pour les paris de T33 : ON NE RETIRE PAS UNE PROPOSITION
// POUR UNE LACUNE, ON L'ANNONCE.
//
// DEUX AXES ORTHOGONAUX, et les confondre est l'erreur que le ticket nommait :
//   — CE QUI MANQUE, nommé par ce qui le lèverait ;
//   — CE QU'ON ATTEND, une bande grossière.
// Une culture peut être PRÊTE et attendue MAIGRE. C'est exactement les trois
// tomates du bac 2, et c'est le cas qui a fait écrire le modèle.
//
// LE COMPAGNONNAGE EST HORS SUJET — ~625 paires à inventer, aucune source
// réutilisable. Ne restent que les interactions PHYSIQUES : hauteur et ombre
// portée, profondeur de racine, occupation.
// ════════════════════════════════════════════════════════════════════════════

import { CULTURES, NOM_FAMILLE, PERSEPHONE, ROTATION, nomDe, type Culture, type Forme } from "./cultures";
import { voisinesDuBac, type Cellule } from "./terrasse";

/** CE QUI MANQUE, nommé par ce qui le lèverait. */
export type Statut =
  /** Rien ne manque. */
  | "prete"
  /** Il manque du TEMPS. La raison porte une date. */
  | "attendre"
  /** Il manque un GESTE, et il est faisable aujourd'hui. */
  | "agir"
  /** Un fait sur CETTE cellule. Aucun geste, aucune date ne le lève. */
  | "jamais-ici";

/** CE QU'ON ATTEND — grossier volontairement. Un rendement au gramme serait
 *  une précision qu'aucune donnée de ce dépôt ne soutient. */
export type Bande = "belle" | "correcte" | "maigre" | "echec";

export type Axe = "attendre" | "agir" | "jamais-ici" | "bande" | "observer";

export interface Raison {
  axe: Axe;
  texte: string;
}

export interface Verdict {
  culture: Culture;
  statut: Statut;
  bande: Bande;
  /**
   * La forme d'achat qui tient encore le calendrier — `null` quand aucune ne
   * le tient. C'EST LA RÉPONSE LA PLUS UTILE DE TOUT LE VERDICT un 24
   * septembre : entre un sachet de graines et un godet il y a six semaines
   * d'avance, et six semaines est exactement ce qui sépare de Perséphone.
   */
  forme: Forme | null;
  /**
   * Ce que vaut la bande. `a-observer` n'est pas une nuance de politesse :
   * c'est une DEMANDE D'OBSERVATION, la réponse prévue par Workspace#9 quand
   * la confiance sur le critère décisif est faible. Affirmer à sa place
   * ferait disparaître la mesure qui la lèverait.
   */
  confiance: "estimation" | "a-observer";
  /** TOUTES les raisons actives, jamais distillées une par une. */
  raisons: Raison[];
}

// ── Le calendrier, en `MM-JJ` ───────────────────────────────────────────────
// Aucune fenêtre de la table ne passe le 31 décembre, donc la comparaison de
// chaînes suffit et se lit. Le jour où une fenêtre enjambe l'année (les semis
// de décembre sous abri), il faudra la couper en deux — pas ruser ici.

const mmjj = (d: Date): string =>
  `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const JOUR_MS = 86_400_000;

/** La prochaine occurrence d'un `MM-JJ`, à partir de `d` inclus. */
function prochaine(d: Date, cible: string): Date {
  const [m, j] = cible.split("-").map(Number) as [number, number];
  const cetteAnnee = new Date(d.getFullYear(), m - 1, j);
  return cetteAnnee >= aMinuit(d) ? cetteAnnee : new Date(d.getFullYear() + 1, m - 1, j);
}

const aMinuit = (d: Date): Date => new Date(d.getFullYear(), d.getMonth(), d.getDate());

const joursEntre = (a: Date, b: Date): number =>
  Math.round((aMinuit(b).getTime() - aMinuit(a).getTime()) / JOUR_MS);

/** Une date en toutes lettres. LE PREMIER DU MOIS S'ÉCRIT « 1er » en français,
 *  et `toLocaleDateString` ne le sait pas — « le 1 octobre » se lit comme une
 *  date fabriquée par une machine, ce qu'elle est. */
const enFrancais = (d: Date): string => {
  const mois = d.toLocaleDateString("fr-FR", { month: "long" });
  return `${d.getDate() === 1 ? "1er" : d.getDate()} ${mois}`;
};

const dansFenetre = (jour: string, du: string, au: string): boolean => jour >= du && jour <= au;

// ── Les bandes ──────────────────────────────────────────────────────────────

const ORDRE: Bande[] = ["belle", "correcte", "maigre", "echec"];

/** La pire des deux. Une bande ne remonte jamais : chaque règle ne peut que
 *  rabaisser ce que la précédente promettait. */
const pire = (a: Bande, b: Bande): Bande =>
  ORDRE.indexOf(a) >= ORDRE.indexOf(b) ? a : b;

/** Ce que rend une fraction de la lumière demandée. Les seuils sont grossiers
 *  et assumés : c'est une bande, pas un rendement. */
function bandeDeLumiere(dispo: number, demande: number): Bande {
  const part = dispo / demande;
  if (part >= 1) return "belle";
  if (part >= 0.75) return "correcte";
  if (part >= 0.5) return "maigre";
  return "echec";
}

// ── Le verdict ──────────────────────────────────────────────────────────────

export function verdict(c: Cellule, cu: Culture, aujourdhui: Date): Verdict {
  const raisons: Raison[] = [];
  let bande: Bande = "belle";
  let confiance: Verdict["confiance"] = "estimation";
  const jour = mmjj(aujourdhui);

  // ── 1. LA PROFONDEUR. Un fait sur la cellule, que rien ne lève : c'est
  // l'archétype du « jamais ici », et c'est aussi ce qui rend l'échappatoire
  // du pot honnête dans les deux sens — un pot bas FERME des cultures que le
  // bac de 70 cm ouvre.
  if (cu.profondeurCm > c.profondeur)
    raisons.push({
      axe: "jamais-ici",
      texte: `${cu.profondeurCm} cm de racine pour ${c.profondeur} cm de terre.`,
    });

  // ── 2. LE MOBILIER. Un lilas, un laurier, un citronnier ne libèrent jamais
  // rien : ce ne sont pas des plantations, ce sont des meubles (Workspace#13).
  const meubles = c.occupants.filter((o) => o.jusqu === null);
  if (meubles.length)
    raisons.push({
      axe: "jamais-ici",
      texte: `Occupée en permanence par ${liste(meubles.map((o) => nomDe(o.culture)))}.`,
    });

  // ── 3. LA FENÊTRE DE MISE EN PLACE.
  const ouverte = dansFenetre(jour, cu.fenetre.du, cu.fenetre.au);
  if (!ouverte) {
    const ouverture = prochaine(aujourdhui, cu.fenetre.du);
    const dans = joursEntre(aujourdhui, ouverture);
    raisons.push({
      axe: "attendre",
      texte:
        dans <= 31
          ? `La fenêtre s'ouvre le ${enFrancais(ouverture)} — dans ${dans} jours.`
          : `Se met en place du ${jolieFenetre(cu.fenetre.du)} au ${jolieFenetre(cu.fenetre.au)}.`,
    });
  }

  // ── 4. LA ROTATION. Elle ne s'applique QU'AUX BACS : le substrat d'un pot
  // se renouvelle, son état repart à neuf, et c'est exactement pourquoi le pot
  // est l'échappatoire. La même culture peut donc être « attendre 2029 » dans
  // un carré et « prête » dans un pot posé à côté.
  if (c.nature === "bac") {
    const delai = ROTATION[cu.famille];
    const debout = c.occupants.filter((o) => o.jusqu !== null && familleDe(o.culture) === cu.famille);
    const passe = c.passages.filter((p) => p.famille === cu.famille);
    const derniere = Math.max(
      ...debout.map((o) => new Date(o.jusqu!).getFullYear()),
      ...passe.map((p) => p.annee),
      -Infinity,
    );
    if (derniere > -Infinity) {
      const retour = derniere + delai;
      if (aujourdhui.getFullYear() < retour)
        raisons.push({
          axe: "attendre",
          texte: `Même famille ici en ${derniere} — les ${NOM_FAMILLE[cu.famille]} ne reviennent pas avant ${retour}.`,
        });
    }
  } else {
    // Le dire, plutôt que de laisser croire à un oubli. Un pot sans ligne de
    // rotation ressemble à un pot dont on n'a pas l'historique.
    raisons.push({ axe: "bande", texte: "En pot : substrat renouvelable, la rotation ne s'applique pas." });
  }

  // ── 5. L'OCCUPATION, ET L'ARBITRAGE QU'ELLE FABRIQUE.
  //
  // C'EST LA RÈGLE QUI JUSTIFIE TOUT LE FICHIER. Une cellule tenue jusqu'au
  // 15 octobre par des tomates n'est pas simplement « à attendre » pour un
  // kale dont la fenêtre ferme le 5 : attendre la libère TROP TARD. Le manque
  // cesse d'être du temps et devient un GESTE — arracher — et le verdict doit
  // basculer de « attendre » à « agir », sinon il conseille poliment de rater
  // la saison.
  const tenue = c.occupants.filter((o) => o.jusqu !== null && o.jusqu > iso(aujourdhui));
  if (tenue.length) {
    const fin = tenue.map((o) => o.jusqu!).sort().at(-1)!;
    const finDate = new Date(`${fin}T12:00:00`);
    const quoi = liste(tenue.map((o) => nomDe(o.culture)));
    const tropTard = mmjj(finDate) > cu.fenetre.au && ouverte;
    if (tropTard)
      raisons.push({
        axe: "agir",
        texte: `${quoi} ${tenue.length > 1 ? "tiennent" : "tient"} la cellule jusqu'au ${enFrancais(finDate)}, la fenêtre ferme le ${jolieFenetre(cu.fenetre.au)} : c'est l'un ou l'autre.`,
      });
    else
      raisons.push({
        axe: "attendre",
        texte: `${quoi} jusqu'au ${enFrancais(finDate)}.`,
      });
  }

  // ── 6. LA LUMIÈRE, ET CE QU'ON N'EN SAIT PAS.
  const dispo = c.lumiere[cu.saisonDeLaDemande];
  if (dispo === null) {
    // Viable à 1 h : la recherche est formelle, mâche, poireau et ail passent
    // quel que soit l'arc sud. Rien à observer, la mesure ne changerait rien.
    if (cu.soleilH <= 1) {
      raisons.push({ axe: "bande", texte: "Viable à 1 h de soleil direct : l'arc sud ne la décide pas." });
    } else {
      confiance = "a-observer";
      bande = pire(bande, "correcte");
      raisons.push({
        axe: "observer",
        texte: `Demande ${cu.soleilH} h en hiver, et l'arc sud (135°→225°) n'a jamais été relevé. Sept mesures au téléphone, dix minutes, et cette bande devient un fait.`,
      });
    }
  } else if (dispo < cu.soleilH) {
    bande = pire(bande, bandeDeLumiere(dispo, cu.soleilH));
    raisons.push({
      axe: "bande",
      texte: `${dispo} h de soleil direct pour ${cu.soleilH} h demandées ${quand(cu)}.`,
    });
  }

  // ── 7. L'ÉCHÉANCE DE PERSÉPHONE, ET LA FORME D'ACHAT QUI EN DÉCOULE.
  //
  // Le 4 novembre, le jour passe sous 10 h et la croissance s'arrête. Une
  // culture d'hiver ne se juge donc pas sur « la fenêtre est-elle ouverte »
  // mais sur « reste-t-il assez de jours pour qu'elle soit FAITE avant ».
  // C'est ce calcul, et lui seul, qui répond à « graines ou godets ? » —
  // la question qu'on se pose devant le rayon, pas devant le bac.
  let forme: Forme | null = cu.formes[0] ?? null;
  if (cu.saisonDeLaDemande === "hiver") {
    const echeance = prochaine(aujourdhui, PERSEPHONE.debut);
    const reste = joursEntre(aujourdhui, echeance);
    const tenables = cu.formes.filter((f) => joursDe(cu, f) <= reste);
    forme = tenables[0] ?? null;
    if (!forme) {
      bande = pire(bande, "echec");
      raisons.push({
        axe: "bande",
        texte: `${reste} jours avant le 4 novembre : même en godet elle n'y sera pas. L'hiver se tient, il ne se rattrape pas.`,
      });
    } else if (forme !== cu.formes[0]) {
      raisons.push({
        axe: "agir",
        texte: `En ${forme}, pas en ${cu.formes[0]} : ${reste} jours avant le 4 novembre, et un semis en demande ${joursDe(cu, cu.formes[0]!)}.`,
      });
    }
  }

  // ── 8. L'OMBRE PORTÉE — la seule interaction de voisinage qui reste une
  // fois le compagnonnage écarté. Ce n'est PAS une dégradation : c'est une
  // consigne de placement, et elle ne vaut qu'entre carrés d'un même bac.
  if (cu.hauteurCm >= 40 && voisinesDuBac(c).length)
    raisons.push({
      axe: "bande",
      texte: `${cu.hauteurCm} cm de haut : à mettre au carré le plus éloigné du sud, sinon son ombre traverse les ${voisinesDuBac(c).length} autres.`,
    });

  return { culture: cu, statut: statutDe(raisons), bande, forme, confiance, raisons };
}

/**
 * Ce qui manque, quand plusieurs choses manquent.
 *
 * L'ORDRE N'EST PAS UNE PRIORITÉ D'AFFICHAGE, C'EST UNE VÉRITÉ : un fait que
 * rien ne lève écrase une date, et une date qu'on ne peut pas devancer écrase
 * un geste. Toutes les raisons restent affichées — seul le mot de tête change.
 */
function statutDe(raisons: Raison[]): Statut {
  if (raisons.some((r) => r.axe === "jamais-ici")) return "jamais-ici";
  if (raisons.some((r) => r.axe === "attendre")) return "attendre";
  if (raisons.some((r) => r.axe === "agir")) return "agir";
  return "prete";
}

const joursDe = (cu: Culture, f: Forme): number =>
  f === "godet" ? cu.joursPourEtrePrete.godet : cu.joursPourEtrePrete.graine;

const familleDe = (id: string): string | undefined => CULTURES.find((c) => c.id === id)?.famille;

const quand = (cu: Culture): string =>
  cu.saisonDeLaDemande === "hiver" ? "en hiver" : cu.saisonDeLaDemande === "ete" ? "en été" : "au printemps";

const jolieFenetre = (s: string): string => {
  const [m, j] = s.split("-").map(Number) as [number, number];
  return enFrancais(new Date(2000, m - 1, j));
};

const liste = (noms: string[]): string =>
  noms.length <= 1 ? (noms[0] ?? "") : `${noms.slice(0, -1).join(", ")} et ${noms.at(-1)}`;

const iso = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Tous les verdicts d'une cellule. C'est l'entrée du modèle : on n'interroge
 *  jamais une culture seule depuis un écran, parce qu'un écran qui choisit ses
 *  cultures devient le second endroit à savoir lesquelles existent. */
export const verdictsDe = (c: Cellule, aujourdhui: Date): Verdict[] =>
  CULTURES.map((cu) => verdict(c, cu, aujourdhui));
