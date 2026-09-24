// Ce que la facette jardin montre — la carte, puis le verdict d'une cellule.
//
// LA THÈSE DE L'ÉCRAN : le jardin ne se lit pas en liste, il se lit en PLAN.
// Une terrasse de huit cellules est un objet SPATIAL — « le carré du milieu »,
// « le pot du bout » sont les noms qu'on lui donne vraiment. Le prototype de
// Workspace#16 avait tranché la coquille (variante Facettes) mais laissé
// l'intérieur du jardin ouvert, en notant que la carte spatiale de la
// variante B était le candidat sérieux. C'est ce collage-là qu'on essaie.
//
// LE JARDIN NE PRODUIT TOUJOURS AUCUNE TÂCHE DE COCKPIT, et ce n'est pas un
// oubli de ce ticket. Un verdict est une RÉPONSE À UNE QUESTION POSÉE, pas une
// échéance : « le kale est en arbitrage avec les tomates » est vrai tous les
// jours de septembre, et une tâche vraie tous les jours apprend à ne plus lire
// le cockpit (T16). Le jour où une échéance existe — la dernière fenêtre de
// semis, la gelée annoncée — elle sera calculée, datée, et cochable.

import { nomDe } from "../model/cultures";
import type { Cellule } from "../model/terrasse";
import { TERRASSE } from "../model/terrasse";
import { verdictsDe, type Bande, type Statut, type Verdict } from "../model/verdict";

/**
 * L'ORDRE DES VERDICTS EST LE CŒUR DE L'ÉCRAN, ET IL NE SE TRIE PAS PAR BANDE.
 *
 * On ouvre une cellule avec une question — « qu'est-ce que je peux y mettre
 * aujourd'hui ? ». Ce qui y répond OUI passe devant, quelle que soit la
 * récolte attendue : une mâche « prête, belle récolte » et une tomate
 * « attendre mai, maigre » ne sont pas deux degrés d'une même échelle. Trier
 * par bande mettrait la carotte de mars — belle, et impossible aujourd'hui —
 * au-dessus du kale qu'on peut planter cet après-midi.
 */
const RANG_STATUT: Record<Statut, number> = { prete: 0, agir: 1, attendre: 2, "jamais-ici": 3 };
const RANG_BANDE: Record<Bande, number> = { belle: 0, correcte: 1, maigre: 2, echec: 3 };

export interface VueCellule {
  cellule: Cellule;
  /** Ce qui occupe la cellule, dit en une ligne. */
  occupation: string;
  /** Le mot d'état de la carte. Court : il tient dans une case de 33 cm. */
  etat: string;
  /** Ce qui répond OUI aujourd'hui — c'est le chiffre de la case. */
  ouvertes: number;
  verdicts: Verdict[];
}

export function vueDeLaCellule(c: Cellule, aujourdhui: Date): VueCellule {
  const verdicts = verdictsDe(c, aujourdhui).sort(
    (a, b) =>
      RANG_STATUT[a.statut] - RANG_STATUT[b.statut] ||
      RANG_BANDE[a.bande] - RANG_BANDE[b.bande] ||
      a.culture.nom.localeCompare(b.culture.nom, "fr"),
  );
  const ouvertes = verdicts.filter((v) => v.statut === "prete" || v.statut === "agir").length;
  const meubles = c.occupants.filter((o) => o.jusqu === null);
  const annuelles = c.occupants.filter((o) => o.jusqu !== null);

  return {
    cellule: c,
    occupation: c.occupants.length
      ? c.occupants.map((o) => nomDe(o.culture)).join(", ")
      : "vide",
    // UN MEUBLE N'EST PAS UNE OCCUPATION TEMPORAIRE, et la carte doit le dire
    // d'un coup d'œil : un bac de lilas ne se libérera pas en octobre, il ne
    // se libérera jamais. Les confondre ferait espérer le bac 1.
    etat: meubles.length ? "permanent" : annuelles.length ? "occupée" : "libre",
    ouvertes,
    verdicts,
  };
}

export const vueDeLaTerrasse = (aujourdhui: Date): VueCellule[] =>
  TERRASSE.map((c) => vueDeLaCellule(c, aujourdhui));

/**
 * La phrase d'accueil de la facette. Elle compte les cellules où quelque chose
 * peut entrer AUJOURD'HUI — pas les cultures, pas les cellules : un jardinier
 * devant sa terrasse compte des emplacements.
 */
export function entree(vues: VueCellule[]): string {
  const n = vues.filter((v) => v.ouvertes > 0).length;
  if (n === 0) return "Rien ne peut entrer dans la terrasse aujourd'hui.";
  if (n === 1) return "Une cellule peut recevoir quelque chose aujourd'hui.";
  return `${n} cellules peuvent recevoir quelque chose aujourd'hui.`;
}

/** Le mot de tête d'un verdict. Il nomme CE QUI LÈVERAIT le manque, pas le
 *  manque — c'est la règle de Workspace#9, et c'est ce qui rend « agir »
 *  utile : il dit qu'un geste suffit, aujourd'hui. */
export const motDuStatut = (s: Statut): string =>
  s === "prete" ? "prête" : s === "agir" ? "agir" : s === "attendre" ? "attendre" : "jamais ici";

/** La bande, en toutes lettres. Grossière, et elle l'annonce. */
export const motDeLaBande = (b: Bande): string =>
  b === "belle" ? "belle récolte" : b === "correcte" ? "récolte correcte" : b === "maigre" ? "maigre" : "échec probable";

/** Ce qu'on achète. `null` = aucune forme ne tient le calendrier — et ça se
 *  dit, parce que c'est une réponse au rayon. */
export const motDeLaForme = (f: Verdict["forme"]): string =>
  f === null ? "rien qui tienne la saison" : f === "godet" ? "en godet" : f === "bulbe" ? "en bulbe" : "en graine";

/**
 * LES HORIZONS DE LA SAISON DE PLANIFICATION.
 *
 * L'hiver est la saison où l'app a le plus à faire (Workspace#2) : il ne fait
 * rien pousser, il sert à préparer l'année. Mais la planification est un MODE,
 * jamais une compétence — c'est du temps d'app qui ne sort personne sur la
 * terrasse, et il ne se récompense pas. Ici, ça tient en un curseur : la même
 * cellule, à une autre date, avec les verdicts recalculés.
 */
export const HORIZONS: { nom: string; jours: number }[] = [
  { nom: "aujourd'hui", jours: 0 },
  { nom: "dans 2 semaines", jours: 14 },
  { nom: "dans 1 mois", jours: 30 },
  { nom: "au printemps", jours: 180 },
];

export const decale = (d: Date, jours: number): Date =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate() + jours);
