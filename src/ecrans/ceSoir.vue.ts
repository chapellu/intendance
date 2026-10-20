// Ce que la proposition de 15 h DIT — T128 et T129.
//
// Le modèle (`model/pause.ts`) rend des rangs, des lots et des articles ; ici on
// écrit les phrases, une fois, pour les deux écrans qui les montrent : « Ce
// soir » (et l'ouverture du fil, qui l'embarque) et la ligne du cockpit. Une
// phrase écrite deux fois finit par dire deux choses (en-tête de
// `ui/phrases.ts`), et le cockpit qui annonce « rien à acheter » au-dessus d'une
// carte qui dit « il manque : crème » serait exactement ce mensonge-là.

import {
  FORMATS_FAMILIERS,
  heureDuDiner,
  type ASortir,
  type CarteDuSoir,
  type LotMange,
  type PropositionDuSoir,
} from "../model/pause";
import { nomDuType } from "../model/plancher";
import { duree, hhmm } from "../ui/format";
import { bandeEnMots } from "../ui/phrases";

/** Un type émis, dit en français — même trou de libellé que partout ailleurs
 *  (noté au backlog depuis T15) : les tirets tombent, l'accent ne vient pas.
 *  UNE SEULE DÉFINITION, celle du plancher : deux copies finiraient par dire
 *  deux noms pour le même bocal. */
export { nomDuType };

/** « de lentilles », « d'escalopes » — l'élision que l'œil attend. */
export const de = (nom: string): string => (/^[aeiouyéèêàâîôûœ]/i.test(nom) ? `d’${nom}` : `de ${nom}`);

/** Quand un lot doit être fini, en mots du calendrier. */
const quand = (jours: number): string =>
  jours <= 0 ? "aujourd’hui" : jours === 1 ? "demain" : `d’ici ${jours} jours`;

/**
 * Un lot du dépôt, dit comme on le dirait en ouvrant le frigo.
 *
 * LE CONGÉLATEUR SE DIT EN REPAS, LE FRIGO EN DÉLAI. « 3 repas d'escalopes au
 * congélo » répond à « qu'est-ce qu'il y a » ; « le reste de lentilles est à
 * finir demain » répond à « qu'est-ce qui presse ». Ce sont les deux phrases
 * que le foyer a besoin d'entendre — « si je mets des choses là, je compte sur
 * toi pour t'en souvenir ».
 *
 * AUCUNE PHRASE NE DIT « À JETER ». Les fenêtres sont des ordres de grandeur ;
 * elles ordonnent, elles ne condamnent pas. Ce qui est passé se dit ailleurs, par
 * la tâche de T103, qui ne parle que des restes de frigo.
 */
export function phraseDuLot(l: LotMange): string {
  const nom = nomDuType(l.type);
  if (l.location === "congelo") return `${bandeEnMots(l.band)} ${de(nom)} au congélo`;
  if (l.kind === "reste-plat") return `le reste ${de(nom)} est à finir ${quand(l.joursRestants)}`;
  return `${nom} au frigo, à finir ${quand(l.joursRestants)}`;
}

/** Les mots qui désignent une PARTIE de la plante, pas la plante : « pointes
 *  d'orties », « jeunes pousses d'épinards ». Une ligne courte garde la plante. */
const PARTIE = /^(?:pointes|jeunes pousses|pousses|feuilles|tiges et feuilles|tiges|brins) d(?:e |’|')/i;

/** Au-delà, un nom d'article déborde la pastille sur un téléphone (capture du
 *  19/10 : trois lignes pour un seul article). */
const LONG = 40;

/**
 * Un nom d'article qui tient sur une ligne — « orties (ou fanes, épinards…) ».
 *
 * LE CORPUS ÉCRIT LES ALTERNATIVES DANS LE NOM, et c'est juste sur la fiche : on
 * y lit la recette. Sur la carte de 15 h, « pointes d'orties (ou fanes de navets
 * ou de radis, ou jeunes pousses d'épinards, ou roquette) » prend trois lignes
 * pour dire un article. On garde la plante, puis les deux premières
 * alternatives par leur nom de tête ; le reste se dit d'un « … ». Ce qui est
 * court reste tel quel : la règle ne touche que ce qui déborde.
 */
export function nomCourt(nom: string): string {
  if (nom.length <= LONG) return nom;
  const sansGlose = (x: string): string => x.split(/\s+—\s+/)[0]!.trim();
  const m = /^(.*?)\s*\(ou\s+(.*)\)\s*$/.exec(sansGlose(nom)) ?? /^(.*?)\s*\(ou\s+(.*)$/.exec(sansGlose(nom));
  if (!m) return sansGlose(nom);
  const tete = m[1]!.replace(PARTIE, "");
  const alternatives = m[2]!
    .replace(/\)\s*$/, "")
    .split(/\s*,\s*(?:ou\s+)?|\s+ou\s+/)
    .map(sansGlose)
    // « fanes de navets OU DE RADIS » : la seconde moitié complète la première.
    .filter((x) => x && !/^d(?:e |’|')/i.test(x))
    .map((x) => {
      const plante = x.replace(PARTIE, "");
      return plante !== x ? plante : x.split(/\s+(?:de |d’|d')/)[0]!;
    });
  if (!alternatives.length) return tete;
  return `${tete} (ou ${alternatives.slice(0, 2).join(", ")}${alternatives.length > 2 ? "…" : ""})`;
}

/** Ce qu'il faut acheter, en une ligne — la ligne qui décide à 15 h. */
export function ligneAchats(c: CarteDuSoir): string {
  const n = c.manque.length;
  if (n === 0) return "Rien à acheter";
  const noms = c.manque.map((a) => nomCourt(a.nom));
  // HORS SAISON SE DIT : la carte est descendue sous les autres pour ça, et une
  // ligne qui le tairait ferait croire à un oubli du classement.
  if (c.horsSaison.length) {
    const hors = c.horsSaison.map((a) => nomCourt(a.nom));
    const autres = n - hors.length;
    return `il manque : ${hors.join(", ")}, hors saison${autres > 0 ? ` (et ${autres} autre${autres > 1 ? "s" : ""})` : ""}`;
  }
  if (n === 1) return `il manque : ${noms[0]}`;
  if (n <= 3) return `il manque : ${noms.slice(0, -1).join(", ")} et ${noms.at(-1)}`;
  return `il manque : ${noms.slice(0, 2).join(", ")} et ${n - 2} autres`;
}

/** La classe de la ligne d'achats, pour que l'œil la lise avant les mots. */
export const classeAchats = (c: CarteDuSoir): "zero" | "un" | "plusieurs" =>
  c.horsSaison.length ? "plusieurs" : c.manque.length === 0 ? "zero" : c.manque.length === 1 ? "un" : "plusieurs";

/**
 * Quand le lancer, et ce que ça coûte devant le feu.
 *
 * L'HEURE DE DÉBUT, PAS LA DURÉE. À la pause, « 1 h 10 » oblige à compter ;
 * « à lancer avant 16h50 » est la réponse. Et le temps DEVANT LE FEU, parce
 * qu'une pause dure dix à quinze minutes : un plat de deux heures dont un quart
 * d'heure actif se lance très bien.
 */
export function ligneHeure(c: CarteDuSoir): string {
  const devant = `${duree(c.horaire.actif)} devant le feu`;
  if (!c.tient) return `prêt vers ${hhmm(c.pret)} · ${devant}`;
  const total = c.parRattrapage ? c.horaire.rattrape : c.horaire.total;
  const avant = `à lancer avant ${hhmm(heureDuDiner() - total)}`;
  return c.parRattrapage ? `${avant}, trempage rattrapé · ${devant}` : `${avant} · ${devant}`;
}

const FORMAT_EN_MOTS: Record<string, string> = { quiche: "une quiche", soupe: "une soupe", gratin: "un gratin" };

/**
 * UNE raison, la première vraie — la règle de la carte du fil (« les empiler
 * transformerait un argument en plaidoirie »). L'ordre est celui du rang.
 */
export function raison(c: CarteDuSoir): string | null {
  if (c.presse) return "placard" in c.presse ? `sauve ${nomDuType(c.presse.placard)}, qui se perd` : `finit ${phraseDuLot(c.presse)}`;
  if (c.attend) return `mange ${phraseDuLot(c.attend)}`;
  if (c.recent) return "déjà mangé ces trois derniers jours";
  const a = c.plat.apports;
  if (a.proteine === "legumineuse" || a.feculent === "legumineuse") return "aux légumineuses";
  if (c.plat.format && FORMATS_FAMILIERS.has(c.plat.format)) return `${FORMAT_EN_MOTS[c.plat.format]}, comme d’habitude`;
  return null;
}

/** L'accompagnement qui n'est pas là, dit sans compter (voir `ici.ceQuiManque`). */
export const ligneACote = (c: CarteDuSoir): string =>
  c.aCote.length ? `à côté : ${c.aCote.map((a) => a.nom).join(", ")} — ou ce que vous avez` : "";

/** La phrase sous le titre de « Ce soir ». */
export function chapeau(p: PropositionDuSoir): string {
  return p.jourDeCourses
    ? "Jour de courses : ce qui demande des achats est permis."
    : "Ce qui se fait avec ce qui est là, d’abord.";
}

/**
 * Ce qui attend, en une ligne — deux lots au plus, le plus pressé d'abord.
 *
 * DEUX, PARCE QUE LA LIGNE TIENT SUR UN TÉLÉPHONE ; l'inventaire porte le reste.
 */
export function ceQuiAttend(lots: readonly LotMange[]): string {
  return lots.slice(0, 2).map(phraseDuLot).join(" · ");
}

/**
 * Ce qui se sort ce soir pour demain — « 3 repas de gratin pates au congélo,
 * pour Reste réchauffé ».
 *
 * LE PLAT EST NOMMÉ QUAND UN PLAT LE PREND EXPRESSÉMENT : sortir un poulet cuit
 * sans dire pour quoi laisse la question entière à demain. Un reste se
 * réchauffe tel quel, et se dit sans plat.
 */
export function phraseASortir(a: ASortir): string {
  const lot = `${bandeEnMots(a.lot.band)} ${de(nomDuType(a.lot.type))}`;
  return a.plat ? `${lot}, pour ${a.plat.titre}` : `${lot}, à réchauffer demain`;
}

/** La ligne « à sortir ce soir pour demain » de l'écran — deux lots au plus,
 *  comme « en attente ». */
export const ligneASortir = (p: PropositionDuSoir): string =>
  p.aSortir.length ? `À sortir ce soir pour demain : ${p.aSortir.slice(0, 2).map(phraseASortir).join(" · ")}.` : "";

/** Ce qui attend, moins ce qui se sort ce soir — la ligne à côté le dit déjà. */
export const attendSansASortir = (p: PropositionDuSoir): LotMange[] => {
  const sortir = new Set(p.aSortir.map((a) => a.lot.type));
  return p.attend.filter((l) => !sortir.has(l.type));
};

/**
 * La ligne « Ce soir » du cockpit, quand rien n'est posé — T129.
 *
 * ELLE NOMME LE PLAT, ET CE QUI ATTEND. « Rien n'est posé — Poser un plat » a
 * été la tâche de tête 364 jours sur 364 de l'année simulée, sans jamais
 * mentionner les trois portions d'escalopes au congélateur. Une tâche qui dit
 * la même chose tous les jours apprend à ne plus lire le cockpit (T16) ; celle-
 * ci dit ce soir, et ce qu'il y a.
 *
 * `null` quand la proposition est vide — le cockpit retombe alors sur sa phrase
 * d'avant, qui reste vraie.
 */
export function ligneDuCockpit(p: PropositionDuSoir): { titre: string; detail: string } | null {
  const c = p.cartes[0];
  if (!c) return null;
  // CE QUE LA CARTE DIT DÉJÀ NE SE RÉPÈTE PAS : si le plat finit le lot en tête
  // de ce qui attend, la raison le dit, et la queue de ligne passe au suivant.
  const dit = c.presse && "type" in c.presse ? c.presse.type : c.attend?.type;
  const attend = ceQuiAttend(attendSansASortir(p).filter((l) => l.type !== dit));
  const pourquoi = raison(c);
  return {
    titre: `Ce soir : ${c.plat.titre}`,
    detail: [ligneAchats(c), ligneHeure(c), pourquoi, attend].filter(Boolean).join(" · "),
  };
}
