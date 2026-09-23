// Le mode guidé, sans son écran : la chauffe, le minuteur, la provenance.
//
// Trois choses vivent ici parce que ce sont des RÈGLES, et qu'une règle se
// vérifie sans monter un DOM : ce que `needs` dit du feu, ce qu'un minuteur
// doit faire quand le téléphone se verrouille, et d'où sort un ingrédient.
//
// Port de `apps/proto-shell/comptoir.js` (`CHAUFFE`, `ecranCuisine`).

import { commeIngredient, echelleTexte } from "../model/calcul";
import { ROLES, type Choix, type Jeu } from "../model/jeu";
import type { Etape, Foyer, Ingredient, Outil, Plat } from "../model/types";

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
  // Le gril est une résistance de voûte, pas la chaleur tournante — `rules.yaml`
  // en fait une capacité distincte et l'écran doit suivre. Il tombait ici en
  // « Sans feu », ce qui est faux devant un plat qui colore sous 240 °C.
  { quand: ["grill"], chauffe: { nom: "Gril", niveau: 4 } },
  { quand: ["boil", "simmer-large"], chauffe: { nom: "Feu vif", niveau: 4 } },
  { quand: ["pan-fry"], chauffe: { nom: "Feu moyen", niveau: 3 } },
  { quand: ["simmer"], chauffe: { nom: "Feu doux", niveau: 2 } },
  { quand: ["steam"], chauffe: { nom: "Vapeur", niveau: 2 } },
  { quand: ["reheat"], chauffe: { nom: "Réchauffe", niveau: 1 } },
  // Un gaufrier chauffe, même si ce foyer n'en a pas : l'étape reste une
  // cuisson, et c'est à `outilDe` de dire qu'aucun outil ne la porte.
  { quand: ["gaufrier"], chauffe: { nom: "Gaufrier", niveau: 3 } },
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

/**
 * L'échéance à laquelle une alarme doit être armée — ou rien.
 *
 * LA RÈGLE EST ICI ET LE BRUIT EST DANS `pwa/alarme.ts`. Ce qui décide qu'il y
 * a quelque chose à annoncer appartient au minuteur ; ce qui sait comment un
 * téléphone fait du bruit appartient à la plateforme. Séparées, la première se
 * teste sans haut-parleur — et c'est elle qui se trompe.
 *
 * UNE ÉCHÉANCE DÉJÀ PASSÉE N'ARME RIEN, et ce n'est pas une garde défensive :
 * c'est le cas de tous les jours. On revient sur une fiche dont le minuteur a
 * sonné pendant qu'on était ailleurs ; le rouvrir ne doit pas faire sonner la
 * cuisine pour un événement d'il y a une heure.
 *
 * UN MINUTEUR EN PAUSE NON PLUS. Une pause n'a pas d'échéance du tout — c'est
 * exactement ce que dit la forme `{ reste }` — et lui en inventer une
 * réintroduirait le compteur que T12 a refusé.
 */
export function aArmer(etat: EtatMinuteur, maintenant: number): number | null {
  return etat && "fin" in etat && etat.fin > maintenant ? etat.fin : null;
}

/**
 * Est-ce que CETTE étape mérite un minuteur ?
 *
 * DEMANDÉ LE 15/09/2026, DEVANT LA BOLOGNAISE : « tu mets en permanence un
 * timer alors que je n'ai pas besoin de timer pour couper des légumes ». Le
 * guide en posait un dès que `minutes > 0`, c'est-à-dire sur 692 étapes sur
 * 692 — et le rendait donc invisible là où il compte.
 *
 * LA RÈGLE EST « LE TEMPS AGIT-IL SUR LE PLAT ? », PAS « Y A-T-IL DES MINUTES ? »
 * Les 8 minutes d'un émincé sont une ESTIMATION, celle qui sert à dire à quelle
 * heure s'y mettre ; les 40 minutes d'un mijotage sont une CUISSON, et la
 * dépasser change le plat. Un minuteur ne sait mesurer que la seconde. Les
 * minutes restent écrites sous le geste dans les deux cas : on ne cache pas la
 * durée, on cache le chronomètre.
 *
 * Trois façons pour le temps d'agir, et elles se lisent toutes dans le modèle :
 *
 * - **la chauffe** — quelque chose est sur le feu ou au four ;
 * - **l'attente** — la seconde horloge, un trempage, une pousse, une prise au
 *   frais. Le plat travaille tout seul, et `attenteSouple: false` dit même que
 *   le dépassement l'abîme ;
 * - **`surveille: false`** — on s'en va. C'est précisément le cas où il faut
 *   être rappelé, et le seul champ qui le déclare.
 *
 * Mesuré sur le corpus : 317 étapes sur 692 gardent un minuteur, 375 le
 * perdent. Aucune des 375 n'est une cuisson — ce sont des tailles, des
 * façonnages, des montages, des assaisonnements de fin.
 */
export function minuteurUtile(e: Etape): boolean {
  return chauffeDe(e).niveau > 0 || e.attente !== null || !e.surveille;
}

/* ────────────────────────────────────────────────────────── l'outil de l'étape */

export interface OutilEtape {
  /** Ce qui s'affiche. */
  texte: string;
  /** Vrai quand `texte` est une MANIÈRE DE FAIRE et non un nom d'ustensile —
   *  l'écran ne met en gras que les noms. */
  methode: boolean;
}

/**
 * Quel ustensile, pour cette étape-ci.
 *
 * DEMANDÉ LE MÊME JOUR, SUR L'ÉTAPE 2 DE LA BOLOGNAISE : « il me manquerait la
 * casserole à utiliser ». T74 avait posé la vaisselle DU PLAT en tête de fiche,
 * en laissant ouvert l'outil par étape (Workspace#59) faute d'une règle de
 * résolution. La règle existait déjà — elle vivait juste du mauvais côté du
 * mur : `compile.py` l'applique depuis toujours et l'imprime sur le plan texte
 * (« Chauffer l'huile — cocotte 7,5 L »), `export_json.py` en publie la table
 * dans `foyer.outils`, et le chargeur la jetait.
 *
 * LE RÉCIPIENT L'EMPORTE SUR L'APPAREIL quand l'étape déclare deux capacités.
 * `bake` + `gratin-vessel` résout sur le four ET sur les plats à gratin ; le
 * four est le moins utile des deux, parce que la ligne d'à côté dit déjà
 * « Chauffe : Four ». Les deux lignes sont complémentaires — l'une dit la
 * source de chaleur, l'autre dit dans quoi on met. Sans cette préférence le
 * premier besoin gagnerait, comme pour la chauffe, et nommerait deux fois la
 * même chose. Quatre étapes du corpus déclarent plusieurs besoins ; c'est peu,
 * mais la règle qui les départage doit se dire, pas se subir.
 *
 * LA RÉÉCRITURE L'EMPORTE SUR LE LIBELLÉ, parce qu'un repli ne se résume pas à
 * son nom : « au petit blender, en 2–3 fois, par impulsions courtes » est
 * l'instruction, « petit blender du mixeur plongeur » n'en est que le sujet.
 * 44 étapes sont dans ce cas.
 *
 * SILENCE SUR 374 ÉTAPES, ET C'EST LE MÊME SILENCE DÉLIBÉRÉ QUE T74 : 370
 * n'ont aucun `needs` — un montage, un assaisonnement —, et 4 en ont un que ce
 * foyer ne porte pas (le gaufrier, la machine à pain). Nommer un ustensile
 * qu'on n'a pas serait pire que se taire, et `compile.py` marque déjà ces
 * étapes « aucune solution avec l'équipement du foyer ».
 */
export function outilDe(foyer: Foyer, e: Etape): OutilEtape | null {
  const dits = e.needs
    .map((n) => foyer.outils[n])
    .filter((o): o is Outil => o !== undefined && (o.label !== null || o.reecrit !== null));
  const recipient = dits.find((o) => foyer.vaisselle.some((v) => v.id === o.id));
  const o = recipient ?? dits[0];
  if (!o) return null;
  if (o.reecrit) return { texte: o.reecrit, methode: true };
  return { texte: o.label as string, methode: false };
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
 *
 * ELLE PREND LE JEU, ET PLUS LE CATALOGUE. Le garde-manger de la fiche était le
 * JUMEAU du bug de `calcul.provenance` : les deux interrogeaient la liste figée
 * de l'export, donc la fiche écrivait « au garde-manger » en face d'un
 * ingrédient dont l'utilisateur venait de constater qu'il n'en restait rien.
 * Réparer la liste de courses sans réparer la fiche aurait laissé les deux
 * écrans se contredire — et c'est la fiche qu'on lit au moment de cuisiner.
 */
export function provenanceIngredient(jeu: Jeu, ing: Ingredient): Provenance {
  const { catalogue } = jeu;
  if (ing.base) return { label: "base", acheter: true };
  const cid = catalogue.rayons.aliases[ing.id] ?? ing.id;
  if (catalogue.rayons.placard.includes(cid)) return { label: "placard", acheter: false };
  // Le relevé dit qu'il en reste. La fiche ne promet pas la quantité — elle ne
  // la connaît pas —, elle dit seulement d'aller voir avant de partir acheter.
  if (jeu.gardeManger.includes(cid)) return { label: "au garde-manger", acheter: false };
  return { label: "à acheter", acheter: true };
}

/* ────────────────────────────────────────────────────────────────── le rôle */

/**
 * Ce que la fiche dit du rôle, ou rien.
 *
 * `portions_eq` EST UN NOMBRE DONT LE SENS DÉPEND DU RÔLE, et c'était déjà
 * écrit six fois dans le corpus avant que le champ existe : « 4 en plat
 * principal, 6 à 8 en entrée » (p. 29), « 6 samoussas par personne en plat, 3
 * en entrée », « en entrée d'après le livre ; doubler pour un plat » (p. 45).
 * La fiche affiche « on en cuisine 6 » : sans cette phrase, ces six parts se
 * lisent comme six dîners.
 *
 * MUETTE SUR UN `plat`, qui est 121 recettes sur 138 : répéter « c'est un
 * plat » sous chaque fiche apprendrait à ne plus lire la ligne, et c'est
 * justement le jour où elle dit autre chose qu'elle doit se voir.
 */
export function phraseDuRole(p: Plat): string | null {
  if (p.role === "plat") return null;
  if (p.role === "base") return "C’est une base : elle entre dans un autre plat.";
  if (p.role === "boisson") return "C’est une boisson, pas un repas.";
  return `Ces parts se comptent en ${ROLES[p.role].nom}.`;
}

/* ──────────────────────────────────────────────────────────────── à table */

export interface LigneATable {
  id: string;
  nom: string;
  /** Déjà mis à l'échelle, prêt à afficher — « 125 g ». */
  quantite: string;
  prov: Provenance;
}

/**
 * Ce qui se sert À CÔTÉ, pour que le plat fasse un repas.
 *
 * DEMANDÉ LE 22/09/2026 : « il manque toujours les accompagnements, je n'ai pas
 * un repas complet ». La fiche s'arrêtait à la dernière étape — pour les
 * escalopes, « enfourner 10 min » — alors que le livre, lui, finit par
 * « servir avec une salade verte et du riz ».
 *
 * L'ÉCHELLE N'EST PAS CELLE DU PLAT, et c'est la même règle qu'au panier. Un
 * plat qui se garde se cuisine en LOT ENTIER (`facteur`), six escalopes pour un
 * foyer de deux et demi ; le riz, lui, se fait pour ceux qui sont à table ce
 * soir. Passer `f` ici afficherait « 300 g de riz » sous une assiette qui en
 * demande 125.
 */
export function aTable(jeu: Jeu, p: Plat, parts: number): LigneATable[] {
  const f = parts / p.portions;
  return p.avec.map((a) => {
    const ing = commeIngredient(a);
    return { id: a.id, nom: a.nom, quantite: echelleTexte(ing, f), prov: provenanceIngredient(jeu, ing) };
  });
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
/* ────────────────────────────────────────────────────────── lire, ou cuisiner */

/**
 * La fiche est-elle ouverte pour LIRE une recette, ou pour cuisiner ce que le
 * créneau porte ? — T91.
 *
 * DEUX GESTES QUI N'ONT QUE L'ÉCRAN EN COMMUN. Depuis une carte de « Proposer »
 * ou du fil, on ouvre une recette pour DÉCIDER de la poser : on veut les
 * quantités, le temps et la suite des gestes d'un coup d'œil, et on repart
 * choisir. Depuis « Aujourd'hui », on l'ouvre les mains dans la farine : une
 * étape par écran, un minuteur, et le stock qui descend à la fin. Servir le
 * mode guidé au lecteur lui demandait de feuilleter neuf écrans pour savoir ce
 * qu'il y a dans le plat.
 *
 * C'EST L'URL QUI PORTE LA DIFFÉRENCE, ET ELLE LA PORTAIT DÉJÀ. Le bouton
 * « Fiche » des cartes nomme le plat parce que le créneau porte peut-être
 * encore autre chose (T11) ; « En cuisine », lui, ne nomme rien et laisse le
 * créneau répondre. Un plat nommé qui n'est pas celui du créneau est donc, par
 * construction, un plat qu'on lit sans l'avoir posé — aucun champ nouveau, et
 * rien à garder d'accord entre deux endroits.
 *
 * `pose` VAUT `null` HORS SEMAINE, et c'est le bon défaut : un créneau sorti de
 * la fenêtre glissante ne porte rien qu'on puisse cuisiner, donc tout ce qu'on
 * peut y faire est lire.
 */
export function pourLire(platUrl: string | undefined, pose: Choix): boolean {
  return platUrl !== undefined && platUrl !== pose;
}

/**
 * Le temps d'un plat, et la part qui ne demande à personne d'être là.
 *
 * `libre` EST LA MOITIÉ DE LA DÉCISION, pas un ornement. « 1 h 10 » se lit
 * comme un refus un mardi soir ; « 1 h 10, dont 55 min sans surveiller » se lit
 * comme un plat qu'on lance et qu'on oublie. Le guide le dit déjà, mais étape
 * par étape (« Sans surveiller. ») et donc trop tard : au moment de choisir, on
 * n'a pas ouvert les neuf écrans. Le résumé doit le dire d'un coup, sinon il
 * cache exactement ce qui fait poser ou non.
 *
 * `total` PASSE PAR `avancement` plutôt que de refaire la somme : deux
 * additions du même temps finiraient par ne plus dire le même chiffre le jour
 * où l'une des deux apprendrait quelque chose (un repos, une attente).
 */
export function tempsDuPlat(steps: Etape[]): { total: number; libre: number } {
  return {
    total: avancement(steps, 0).total,
    libre: steps.reduce((a, x) => a + (x.surveille ? 0 : x.minutes), 0),
  };
}
