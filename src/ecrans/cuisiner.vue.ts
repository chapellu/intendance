// Le mode guidé, sans son écran : la chauffe, le minuteur, la provenance.
//
// Trois choses vivent ici parce que ce sont des RÈGLES, et qu'une règle se
// vérifie sans monter un DOM : ce que `needs` dit du feu, ce qu'un minuteur
// doit faire quand le téléphone se verrouille, et d'où sort un ingrédient.
//
// Port de `apps/proto-shell/comptoir.js` (`CHAUFFE`, `ecranCuisine`).

import type { Catalogue, Etape, Ingredient, Plat } from "../model/types";

/* ───────────────────────────────────────────────────────────────── la chauffe */

export interface Chauffe {
  nom: string;
  /** 0 à 4 — les quatre barres de l'écran. Zéro veut dire « pas de feu », et
   *  c'est une information : on peut faire cette étape n'importe quand. */
  niveau: number;
}

// Le vocabulaire de `needs` appartient au compilateur de recettes ; cette table
// est la seule chose qui le traduise en quelque chose qu'une main comprenne.
const TABLE: { quand: string[]; chauffe: Chauffe }[] = [
  { quand: ["bake", "gratin"], chauffe: { nom: "Four", niveau: 3 } },
  { quand: ["boil", "simmer-large"], chauffe: { nom: "Feu vif", niveau: 4 } },
  { quand: ["pan-fry"], chauffe: { nom: "Feu moyen", niveau: 3 } },
  { quand: ["simmer"], chauffe: { nom: "Feu doux", niveau: 2 } },
  { quand: ["steam"], chauffe: { nom: "Vapeur", niveau: 2 } },
  { quand: ["reheat"], chauffe: { nom: "Réchauffe", niveau: 1 } },
];

export const SANS_FEU: Chauffe = { nom: "Sans feu", niveau: 0 };

/** La chauffe d'une étape. Le PREMIER besoin reconnu gagne : une étape qui
 *  mijote ET remue est une étape qui mijote. */
export function chauffeDe(e: Etape): Chauffe {
  return TABLE.find((t) => e.needs.some((n) => t.quand.includes(n)))?.chauffe ?? SANS_FEU;
}

/* ──────────────────────────────────────────────────────────────── le minuteur */

/**
 * L'état d'un minuteur, tel qu'il se range.
 *
 * UNE ÉCHÉANCE, PAS UN COMPTEUR. Le proto décrémentait une seconde par
 * `setInterval` ; c'est faux dès que l'onglet passe en arrière-plan, où les
 * navigateurs mobiles ralentissent les timers à un battement par minute — le
 * minuteur d'une cuisine, précisément quand on repose le téléphone. Une date de
 * fin ne se trompe jamais : elle ne compte rien, elle se compare.
 */
export type EtatMinuteur = { fin: number } | { reste: number } | null;

export interface Minuteur {
  /** En secondes. */
  reste: number;
  actif: boolean;
  sonne: boolean;
}

export function minuteur(etat: EtatMinuteur, minutes: number, maintenant: number): Minuteur {
  if (etat && "fin" in etat) {
    const reste = Math.max(0, Math.ceil((etat.fin - maintenant) / 1000));
    return { reste, actif: reste > 0, sonne: reste === 0 };
  }
  if (etat) return { reste: etat.reste, actif: false, sonne: false };
  return { reste: minutes * 60, actif: false, sonne: false };
}

/** Ce que fait le doigt : lancer, mettre en pause, reprendre, relancer. Un
 *  minuteur qui a sonné se relance depuis le début — c'est la seule chose
 *  qu'on puisse vouloir d'un minuteur terminé. */
export function basculerMinuteur(
  etat: EtatMinuteur,
  minutes: number,
  maintenant: number,
): EtatMinuteur {
  const m = minuteur(etat, minutes, maintenant);
  if (m.actif) return { reste: m.reste };
  if (etat && "reste" in etat) return { fin: maintenant + etat.reste * 1000 };
  return { fin: maintenant + minutes * 60 * 1000 };
}

/* ─────────────────────────────────────────────────────────── les ingrédients */

export interface Provenance {
  label: string;
  /** Vrai quand la ligne finit sur la liste de courses. */
  acheter: boolean;
}

/**
 * D'où sort un ingrédient, vu de la fiche.
 *
 * Version courte de `calcul.provenance` : ici on n'a pas le dépôt sous la main,
 * et on ne prétend pas savoir si le lot existe. « base » veut dire « ça vient
 * d'un autre plat » — la fiche dit quoi acheter, la semaine dit si c'est là.
 */
export function provenanceIngredient(catalogue: Catalogue, ing: Ingredient): Provenance {
  if (ing.base) return { label: "base", acheter: true };
  const cid = catalogue.rayons.aliases[ing.id] ?? ing.id;
  if (catalogue.rayons.placard.includes(cid)) return { label: "placard", acheter: false };
  // Le relevé dit qu'il en reste. La fiche ne promet pas la quantité — elle ne
  // la connaît pas —, elle dit seulement d'aller voir avant de partir acheter.
  if (catalogue.gardeManger.denrees.some((d) => (catalogue.rayons.aliases[d.ingredient] ?? d.ingredient) === cid))
    return { label: "au garde-manger", acheter: false };
  return { label: "à acheter", acheter: true };
}

/* ─────────────────────────────────────────────────────────────────── le crédit */

export interface Credit {
  texte: string;
  /** L'adresse où la prose est restée, quand il y en a une. 5 sources sur 117. */
  url: string | null;
}

/**
 * D'où vient la recette, en une phrase.
 *
 * LE MOT « PROVENANCE » ÉTAIT DÉJÀ PRIS par `provenanceIngredient`, qui répond à
 * une tout autre question — d'où sort un ingrédient, du placard ou des courses.
 * L'utilisateur dit « provenance » pour l'auteur et l'ouvrage ; le code dit
 * `credit`, parce que deux sens du même mot dans un même fichier finissent
 * toujours par se confondre à la relecture.
 *
 * PAS DE GABARIT À COMPOSER : `ouvrage` est déjà une phrase affichable, page
 * comprise — « La cuisine bio du quotidien, Terre vivante, p. 116 ». `page`
 * existe en structuré dans le corpus et reste hors de l'export, parce que deux
 * orthographes du même nombre finissent par diverger.
 *
 * LES 21 PLATS DU FOYER DISENT QUELQUE CHOSE, ILS NE SE TAISENT PAS. Le silence
 * se lirait comme une donnée manquante alors que c'est une réponse : ces plats
 * n'ont pas de source parce qu'ils sont à nous. (Retenu contre l'autre option —
 * ne rien afficher — parce qu'un champ vide sur un quart du catalogue ressemble
 * à un bug.)
 */
export function credit(plat: Plat): Credit {
  const s = plat.source;
  if (!s) return { texte: "Recette du foyer", url: null };
  return { texte: `${s.auteur} — ${s.ouvrage}`, url: s.url };
}

/* ────────────────────────────────────────────────────────────── la vaisselle */

/**
 * L'ustensile à sortir avant de commencer, taille comprise — ou rien.
 *
 * `plat.vaisselle` est résolu par le compilateur sur 66 des 138 plats, et la
 * taille est DANS le libellé : « sauteuse 28 cm » (49), « cocotte 7,5 L » (15),
 * « casseroles 2,6 L / 1,6 L » (2). On l'affiche, on ne le calcule pas.
 *
 * LES 72 PLATS SANS VAISSELLE NE MONTRENT RIEN. Silence délibéré : le
 * compilateur n'a pas trouvé d'ustensile à nommer, et en inventer un serait
 * pire que se taire.
 *
 * AUCUN AVERTISSEMENT DE DÉBORDEMENT ICI, ET C'EST UNE MESURE, PAS UN OUBLI.
 * Le ticket demandait de chercher qui lit déjà `facteurMax` avant d'ajouter une
 * phrase. Réponse : trois endroits le lisent, et deux l'ÉCRIVENT déjà —
 * `parts.vue.cuisson()` dit « ⚠ Ça ne tient pas dans {label} — ×N au plus » et
 * `offres.reserves()` dit « il faut deux tournées ». Le répéter en tête de fiche
 * serait le troisième libellé du même fait. Ce qui manquait n'était pas
 * l'alerte — elle existe depuis les offres — c'était le nom de l'ustensile
 * quand tout va bien.
 *
 * Ça ne préjuge pas de Workspace#57 ni de #59 : l'outil PAR ÉTAPE demande une
 * règle de résolution qui n'est pas tranchée. Le `vaisselle` du plat, lui, est
 * déjà résolu.
 */
export function aSortir(plat: Plat): string | null {
  return plat.vaisselle?.label ?? null;
}

/* ──────────────────────────────────────────────────────────────── l'avancement */

/** Ce qu'il reste à faire, et sur combien. Les minutes des étapes DÉJÀ faites
 *  ne comptent plus : c'est la seule façon que « reste 25 min sur 50 » veuille
 *  dire quelque chose devant une casserole. */
export function avancement(steps: Etape[], etape: number): { reste: number; total: number } {
  return {
    reste: steps.slice(etape).reduce((a, x) => a + x.minutes, 0),
    total: steps.reduce((a, x) => a + x.minutes, 0),
  };
}

/* ────────────────────────────────────────────────── le plat qu'on n'a pas écrit */

export interface SansRecette {
  /** L'étiquette de la carte, courte : elle partage la ligne avec le reste. */
  court: string;
  /** Ce que la fiche en dit, en entier. */
  long: string;
}

/**
 * Ce qu'on dit d'un plat entré « niveau plan » — titre, temps, ingrédients,
 * apports, et pas d'étapes.
 *
 * TROISIÈME CHEMIN, CHOISI PAR L'UTILISATEUR LE 15/09/2026. Il y en avait trois
 * devant un plat sans étapes : lui en écrire (T76, fait pour les quinze du
 * répertoire), ne pas le proposer (T77, qui filtrait), ou **le proposer en le
 * disant**. Le filtre est retiré ; cette fonction est ce qui le remplace.
 *
 * ET C'EST LE RAISONNEMENT DES PARIS DE T33, APPLIQUÉ AUX ÉTAPES. Le dépôt
 * l'avait déjà écrit pour le placard : « retirer ces plats ferait rétrécir les
 * propositions à mesure que la confiance vieillit ; substituer en silence
 * produirait un plat qu'on ne peut pas contredire. On parie donc, et on
 * l'écrit. » Un plat sans recette est le même cas : le retirer rétrécit la
 * semaine pour une lacune de saisie, et le servir muet est ce qui a produit la
 * plainte du 14/09.
 *
 * CE QUI MANQUE EST LA RECETTE, PAS LE PLAT — et la phrase doit le dire dans cet
 * ordre. Le temps, les quantités et les apports sont justes : ils viennent du
 * même catalogue que les autres, ils ont passé le même `verifier.py`. Une
 * formule du genre « plat incomplet » salirait des données qui ne le sont pas.
 * Ce sont d'ailleurs des plats du foyer, que la maison sait déjà faire ; le
 * guide pas-à-pas est un confort, pas une condition.
 *
 * ELLE S'APPUIE SUR `cuisinable` ET PAS SUR `steps.length`, alors que l'export
 * dérive le premier du second. Deux raisons : c'est le champ que le catalogue
 * DÉCLARE — `est_cuisinable()` porte la définition, et la dupliquer ici la
 * ferait diverger le jour où elle bougera —, et le chargeur refuse désormais un
 * export où les deux se contredisent, ce qui fait qu'il n'y a qu'une vérité.
 */
export function sansRecette(plat: Plat): SansRecette | null {
  if (plat.cuisinable) return null;
  return {
    court: "sans recette écrite",
    long:
      "Ce plat n’a pas encore ses étapes. Les ingrédients, les quantités et le " +
      "temps sont justes — c’est le pas-à-pas qui manque.",
  };
}
